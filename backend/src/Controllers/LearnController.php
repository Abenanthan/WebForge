<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;
use WebForge\Services\ProgressService;

/** Learning history (activity timeline) and concept progress. */
final class LearnController
{
    private const PAGE_SIZE = 25;

    public function __construct(private readonly App $app)
    {
    }

    /** GET /api/activity?kind=experiment|assessment|project|trace&page=1 */
    public function activity(Request $req): Response
    {
        $q = Validator::check($req->query, [
            'kind' => ['in:experiment,assessment,project,trace'],
            'page' => ['int', 'between:1,1000'],
        ], $this->app->tracer);
        $uid = $this->app->userId();
        $page = $q['page'] ?? 1;

        // Each source is a SELECT of the same shape (aliased, so any one can stand alone); only the requested ones are combined.
        $sources = [
            'experiment' => "SELECT 'experiment' AS kind, r.id AS ref, e.title AS title, e.module AS module, r.status AS status,
                                    NULL AS score, r.created_at AS at, NULL AS link
                             FROM experiment_runs r JOIN experiments e ON e.id = r.experiment_id WHERE r.user_id = ?",
            'assessment' => "SELECT 'assessment' AS kind, a.id AS ref, q.title AS title, 'learn' AS module, 'submitted' AS status,
                                    CONCAT(a.score, '/', a.max_score) AS score, a.submitted_at AS at, NULL AS link
                             FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id WHERE a.user_id = ?",
            'project'    => "SELECT 'project' AS kind, p.id AS ref, p.title AS title, p.type AS module, 'updated' AS status, NULL AS score, p.updated_at AS at, NULL AS link
                             FROM projects p WHERE p.user_id = ?",
            'trace'      => "SELECT 'trace' AS kind, t.id AS ref, t.label AS title, t.module AS module, t.status AS status, NULL AS score, t.created_at AS at, t.trace_uid AS link
                             FROM traces t WHERE t.user_id = ?",
        ];
        $chosen = $q['kind'] !== null ? [$q['kind'] => $sources[$q['kind']]] : $sources;
        $union = implode("\nUNION ALL\n", array_map(static fn(string $s) => "($s)", $chosen));
        $offset = ($page - 1) * self::PAGE_SIZE;

        // LIMIT/OFFSET are integers computed here, never user strings.
        $rows = $this->app->db->all(
            "{$union}\nORDER BY at DESC, ref DESC LIMIT " . (self::PAGE_SIZE + 1) . " OFFSET {$offset}",
            array_fill(0, count($chosen), $uid),
            'SELECT activity timeline (UNION ALL)',
        );
        $hasMore = count($rows) > self::PAGE_SIZE;

        return Response::ok([
            'items'   => array_map(static fn(array $r) => [
                'kind' => $r['kind'], 'ref' => (int) $r['ref'], 'title' => $r['title'], 'module' => $r['module'],
                'status' => $r['status'], 'score' => $r['score'], 'at' => $r['at'], 'link' => $r['link'],
            ], array_slice($rows, 0, self::PAGE_SIZE)),
            'page'    => $page,
            'hasMore' => $hasMore,
        ]);
    }

    /** GET /api/progress: mastery per concept (recomputed from the real data) */
    public function progress(Request $req): Response
    {
        $concepts = (new ProgressService($this->app))->recompute($this->app->userId());
        $overall = $concepts === [] ? 0 : (int) round(array_sum(array_column($concepts, 'mastery')) / count($concepts));
        return Response::ok(['overall' => $overall, 'concepts' => $concepts]);
    }
}
