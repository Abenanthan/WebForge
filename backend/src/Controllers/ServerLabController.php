<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;
use WebForge\Experiments\ArraysExperiment;
use WebForge\Experiments\ConditionsExperiment;
use WebForge\Experiments\Experiment;
use WebForge\Experiments\FunctionsExperiment;
use WebForge\Experiments\LoopsExperiment;
use WebForge\Experiments\OperatorsExperiment;
use WebForge\Experiments\Steps;
use WebForge\Experiments\StringsExperiment;
use WebForge\Experiments\VariablesExperiment;
use WebForge\Services\ActivityService;

/**
 * Server Lab: controlled PHP demonstrations. There is no code input anywhere;
 * only whitelisted experiment classes run, with validated inputs.
 */
final class ServerLabController
{
    private const EXPERIMENTS = [
        VariablesExperiment::class, OperatorsExperiment::class, ConditionsExperiment::class,
        LoopsExperiment::class, ArraysExperiment::class, StringsExperiment::class, FunctionsExperiment::class,
    ];
    private const MAX_OUTPUT_BYTES = 8192;

    public function __construct(private readonly App $app)
    {
    }

    /** GET /api/lab/server/experiments */
    public function experiments(Request $req): Response
    {
        return Response::ok(array_map(static fn(string $class) => (new $class())->describe(), self::EXPERIMENTS));
    }

    /** POST /api/lab/server/run/{slug}  {input: {...}} */
    public function run(Request $req): Response
    {
        $experiment = $this->find((string) ($req->params['slug'] ?? ''));
        $tracer = $this->app->tracer;
        $input = Validator::check((array) ($req->json()['input'] ?? []), $experiment->rules(), $tracer);

        $steps = new Steps();
        $t0 = hrtime(true);
        ob_start();
        try {
            $result = $tracer->step('server', "Run {$experiment->title()} (PHP " . PHP_VERSION . ')', static fn() => $experiment->run($input, $steps));
        } finally {
            $stdout = (string) ob_get_clean();
        }
        $ms = (hrtime(true) - $t0) / 1e6;

        (new ActivityService($this->app))->recordRun($experiment->slug(), 'success', $input);

        return Response::ok([
            'experiment' => $experiment->slug(),
            'input'      => $input,
            'steps'      => $steps->all(),
            'droppedSteps' => $steps->dropped(),
            'stdout'     => strlen($stdout) > self::MAX_OUTPUT_BYTES ? substr($stdout, 0, self::MAX_OUTPUT_BYTES) . "\n…" : $stdout,
            'returned'   => Steps::show($result),
            'executionMs' => round($ms, 3),
            'memoryPeakKb' => round(memory_get_peak_usage() / 1024),
        ]);
    }

    /**
     * POST /api/lab/server/form: how PHP processes a submitted form:
     * receive → trim → validate (filter_var) → escape output (htmlspecialchars) → respond.
     */
    public function processForm(Request $req): Response
    {
        $tracer = $this->app->tracer;
        $raw = $req->json();
        $fields = ['name', 'email', 'age', 'message'];

        $received = $tracer->step('server', 'Read submitted fields', static function () use ($raw, $fields): array {
            $out = [];
            foreach ($fields as $f) {
                $out[$f] = is_scalar($raw[$f] ?? null) ? (string) $raw[$f] : '';
            }
            $out['newsletter'] = ($raw['newsletter'] ?? false) === true;
            return $out;
        });

        $trimmed = $tracer->step('server', 'Normalise: trim() every text field', static fn() => array_map(
            static fn($v) => is_string($v) ? trim($v) : $v, $received,
        ));

        $errors = [];
        $tracer->step('validation', 'Validate with filter_var() and length checks', static function () use ($trimmed, &$errors): void {
            if ($trimmed['name'] === '' || mb_strlen($trimmed['name']) > 60) {
                $errors['name'] = 'Name is required (max 60 characters).';
            }
            if (filter_var($trimmed['email'], FILTER_VALIDATE_EMAIL) === false) {
                $errors['email'] = 'filter_var(FILTER_VALIDATE_EMAIL) rejected this address.';
            }
            if ($trimmed['age'] !== '' && filter_var($trimmed['age'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 120]]) === false) {
                $errors['age'] = 'filter_var(FILTER_VALIDATE_INT, 1–120) rejected this value.';
            }
            if (mb_strlen($trimmed['message']) > 500) {
                $errors['message'] = 'Message must be at most 500 characters.';
            }
        });

        $escaped = $tracer->step('server', 'Escape for HTML output: htmlspecialchars()', static fn() => [
            'name'    => htmlspecialchars($trimmed['name'], ENT_QUOTES, 'UTF-8'),
            'message' => htmlspecialchars($trimmed['message'], ENT_QUOTES, 'UTF-8'),
        ]);

        // The page PHP would send back: safe version, and (for comparison only) the unsafe one.
        $safeHtml = "<h2>Thanks, {$escaped['name']}!</h2>\n<p>Your message:</p>\n<blockquote>{$escaped['message']}</blockquote>";
        $unsafeHtml = "<h2>Thanks, {$trimmed['name']}!</h2>\n<p>Your message:</p>\n<blockquote>{$trimmed['message']}</blockquote>";

        $processing = [
            'received'   => $received,
            'trimmed'    => $trimmed,
            'escaped'    => $escaped,
            'safeHtml'   => $safeHtml,
            'unsafeHtml' => $unsafeHtml,
            'errors'     => (object) $errors,
            'php'        => [
                'trim($_POST["name"])',
                'filter_var($email, FILTER_VALIDATE_EMAIL)',
                'filter_var($age, FILTER_VALIDATE_INT, ["options" => ["min_range" => 1, "max_range" => 120]])',
                'htmlspecialchars($name, ENT_QUOTES, "UTF-8")',
            ],
        ];

        (new ActivityService($this->app))->recordRun('php-form-processing', $errors ? 'error' : 'success', ['fields' => array_keys($received)]);

        if ($errors) {
            return Response::error(422, 'VALIDATION_FAILED', count($errors) . ' field(s) failed server-side checks.', $errors)
                ->withMeta('processing', $processing);
        }
        return Response::ok(['accepted' => true, 'newsletter' => $received['newsletter']])->withMeta('processing', $processing);
    }

    private function find(string $slug): Experiment
    {
        foreach (self::EXPERIMENTS as $class) {
            $experiment = new $class();
            if ($experiment->slug() === $slug) {
                return $experiment;
            }
        }
        throw new HttpException(404, 'EXPERIMENT_NOT_FOUND', 'No server experiment with that name.');
    }
}
