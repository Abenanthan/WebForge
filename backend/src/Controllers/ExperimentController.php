<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;

/** Records that the user ran an experiment (feeds dashboard stats and activity history). */
final class ExperimentController
{
    private const MAX_INPUT_BYTES = 4096;

    public function __construct(private readonly App $app)
    {
    }

    /** POST /api/experiments/{slug}/runs  {status: success|error, input?: object} */
    public function recordRun(Request $req): Response
    {
        $body = $req->json();
        $data = Validator::check($body, ['status' => ['required', 'in:success,error']], $this->app->tracer);

        $experiment = $this->app->db->one(
            'SELECT id, slug, title FROM experiments WHERE slug = ?',
            [(string) ($req->params['slug'] ?? '')],
            'Find experiment by slug',
        ) ?? throw new HttpException(404, 'EXPERIMENT_NOT_FOUND', 'Unknown experiment.');

        $input = null;
        if (isset($body['input']) && is_array($body['input'])) {
            $input = json_encode($body['input'], JSON_UNESCAPED_UNICODE);
            if ($input === false || strlen($input) > self::MAX_INPUT_BYTES) {
                throw new HttpException(422, 'VALIDATION_FAILED', 'Run input is too large.', ['input' => 'Maximum 4 KB.']);
            }
        }

        $this->app->db->run(
            'INSERT INTO experiment_runs (user_id, experiment_id, status, input_json) VALUES (?, ?, ?, ?)',
            [$this->app->userId(), $experiment['id'], $data['status'], $input],
            'INSERT experiment run',
        );

        return Response::ok([
            'id'         => $this->app->db->lastInsertId(),
            'experiment' => $experiment['slug'],
            'title'      => $experiment['title'],
            'status'     => $data['status'],
        ], 201);
    }
}
