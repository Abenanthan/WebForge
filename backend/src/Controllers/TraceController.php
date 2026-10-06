<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;
use WebForge\Services\RateLimiter;

/**
 * Execution Trace storage. The browser records client spans (UI, events,
 * validation, state, render, network) and merges in the server spans it got
 * back in meta.trace; the finished trace is stored here for later inspection.
 * Every query is scoped to the logged-in user.
 */
final class TraceController
{
    public const LAYERS = ['ui', 'dom', 'event', 'validation', 'network', 'server', 'database', 'state', 'render', 'router'];
    private const MAX_STEPS = 80;
    private const MAX_DETAIL_BYTES = 16_384;
    private const MAX_MS = 600_000;
    /** Older traces beyond this are pruned so the table cannot grow without bound. */
    private const KEEP_PER_USER = 100;

    public function __construct(private readonly App $app)
    {
    }

    /** GET /api/traces?module= */
    public function index(Request $req): Response
    {
        $q = Validator::check($req->query, ['module' => ['string', 'max:40']], $this->app->tracer);
        $uid = $this->app->userId();

        $where = 't.user_id = ?';
        $params = [$uid];
        if ($q['module'] !== null) {
            $where .= ' AND t.module = ?';
            $params[] = $q['module'];
        }
        $rows = $this->app->db->all(
            "SELECT t.trace_uid, t.module, t.label, t.status, t.total_ms, t.created_at,
                    COUNT(s.id) AS steps, GROUP_CONCAT(DISTINCT s.layer ORDER BY s.layer) AS layers
             FROM traces t LEFT JOIN trace_steps s ON s.trace_id = t.id
             WHERE {$where}
             GROUP BY t.id
             ORDER BY t.created_at DESC, t.id DESC
             LIMIT 50",
            $params,
            'SELECT traces with step counts',
        );
        $modules = $this->app->db->all(
            'SELECT module, COUNT(*) AS n FROM traces WHERE user_id = ? GROUP BY module ORDER BY module',
            [$uid],
            'SELECT modules that have traces',
        );

        return Response::ok([
            'traces'  => array_map(static fn(array $r) => [
                'traceId'   => $r['trace_uid'],
                'module'    => $r['module'],
                'label'     => $r['label'],
                'status'    => $r['status'],
                'totalMs'   => (float) $r['total_ms'],
                'steps'     => (int) $r['steps'],
                'layers'    => $r['layers'] === null ? [] : explode(',', $r['layers']),
                'createdAt' => $r['created_at'],
            ], $rows),
            'modules' => array_map(static fn(array $m) => ['module' => $m['module'], 'count' => (int) $m['n']], $modules),
        ]);
    }

    /** GET /api/traces/{uid} */
    public function show(Request $req): Response
    {
        $trace = $this->find($this->uidParam($req));
        $steps = $this->app->db->all(
            'SELECT seq, layer, name, started_ms, duration_ms, status, detail_json
             FROM trace_steps WHERE trace_id = ? ORDER BY seq',
            [$trace['id']],
            'SELECT trace steps in order',
        );

        return Response::ok([
            'traceId'   => $trace['trace_uid'],
            'module'    => $trace['module'],
            'label'     => $trace['label'],
            'status'    => $trace['status'],
            'totalMs'   => (float) $trace['total_ms'],
            'createdAt' => $trace['created_at'],
            'steps'     => array_map(static fn(array $s) => [
                'seq'        => (int) $s['seq'],
                'layer'      => $s['layer'],
                'name'       => $s['name'],
                'startedMs'  => (float) $s['started_ms'],
                'durationMs' => (float) $s['duration_ms'],
                'status'     => $s['status'],
                'detail'     => $s['detail_json'] === null ? (object) [] : json_decode($s['detail_json'], false),
            ], $steps),
        ]);
    }

    /** POST /api/traces  { traceId, module, label, status, steps: [...] } */
    public function store(Request $req): Response
    {
        $body = $req->json();
        $head = Validator::check($body, [
            'traceId' => ['required', 'string', 'regex:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i'],
            'module'  => ['required', 'string', 'regex:/^[a-z0-9-]{2,40}$/'],
            'label'   => ['required', 'string', 'max:160'],
            'status'  => ['required', 'in:success,error'],
        ], $this->app->tracer);
        $steps = $this->app->tracer->step('validation', 'Validate trace steps', fn() => $this->validSteps($body['steps'] ?? null));

        $uid = strtolower($head['traceId']);
        $userId = $this->app->userId();
        (new RateLimiter($this->app))->hit('trace-save', 'user:' . $userId);
        $existing = $this->app->db->one('SELECT user_id FROM traces WHERE trace_uid = ?', [$uid], 'Check the trace id is new');
        if ($existing !== null) {
            // Same user: the trace was already saved (e.g. a request traced twice). Never reveal other users' ids.
            throw (int) $existing['user_id'] === $userId
                ? new HttpException(409, 'TRACE_EXISTS', 'This trace is already saved.')
                : new HttpException(422, 'VALIDATION_FAILED', 'Invalid trace id.', ['traceId' => 'Use a new trace id.']);
        }

        $totalMs = 0.0;
        foreach ($steps as $s) {
            $totalMs = max($totalMs, $s['startedMs'] + $s['durationMs']);
        }

        $this->app->db->transaction(function () use ($uid, $userId, $head, $steps, $totalMs): void {
            $this->app->db->run(
                'INSERT INTO traces (trace_uid, user_id, module, label, status, total_ms) VALUES (?, ?, ?, ?, ?, ?)',
                [$uid, $userId, $head['module'], $head['label'], $head['status'], round($totalMs, 2)],
                'INSERT trace',
            );
            $traceId = $this->app->db->lastInsertId();
            // One multi-row INSERT for all steps (still fully parameterised).
            $placeholders = implode(",\n", array_fill(0, count($steps), '(?, ?, ?, ?, ?, ?, ?, ?)'));
            $params = [];
            foreach ($steps as $i => $s) {
                array_push($params, $traceId, $i + 1, $s['layer'], $s['name'], $s['startedMs'], $s['durationMs'], $s['status'], $s['detail']);
            }
            $this->app->db->run(
                "INSERT INTO trace_steps (trace_id, seq, layer, name, started_ms, duration_ms, status, detail_json)\nVALUES {$placeholders}",
                $params,
                'INSERT ' . count($steps) . ' trace steps',
            );
        });
        $this->prune($userId);

        return Response::ok(['traceId' => $uid, 'steps' => count($steps), 'totalMs' => round($totalMs, 2)], 201);
    }

    /** DELETE /api/traces/{uid} */
    public function destroy(Request $req): Response
    {
        $trace = $this->find($this->uidParam($req));
        // trace_steps rows go with it (ON DELETE CASCADE).
        $this->app->db->run('DELETE FROM traces WHERE id = ? AND user_id = ?', [$trace['id'], $this->app->userId()], 'DELETE trace');
        return Response::ok(['traceId' => $trace['trace_uid'], 'deleted' => true]);
    }

    // ---------------------------------------------------------------------

    /** @return list<array{layer:string,name:string,startedMs:float,durationMs:float,status:string,detail:?string}> */
    private function validSteps(mixed $steps): array
    {
        if (!is_array($steps) || !array_is_list($steps) || $steps === [] || count($steps) > self::MAX_STEPS) {
            throw new HttpException(422, 'VALIDATION_FAILED', 'Some fields are invalid.', ['steps' => 'Send between 1 and ' . self::MAX_STEPS . ' steps.']);
        }
        $clean = [];
        foreach ($steps as $i => $s) {
            $n = $i + 1;
            $fail = static fn(string $msg) => new HttpException(422, 'VALIDATION_FAILED', 'Some fields are invalid.', ['steps' => "Step {$n}: {$msg}"]);
            if (!is_array($s)) {
                throw $fail('must be an object.');
            }
            $layer = $s['layer'] ?? null;
            $name = is_string($s['name'] ?? null) ? trim($s['name']) : '';
            $started = $s['startedMs'] ?? null;
            $duration = $s['durationMs'] ?? null;
            $status = $s['status'] ?? 'success';
            if (!in_array($layer, self::LAYERS, true)) {
                throw $fail('unknown layer.');
            }
            if ($name === '' || mb_strlen($name) > 120) {
                throw $fail('name must be 1–120 characters.');
            }
            if (!is_int($started) && !is_float($started) || $started < 0 || $started > self::MAX_MS
                || !is_int($duration) && !is_float($duration) || $duration < 0 || $duration > self::MAX_MS) {
                throw $fail('timings must be between 0 and ' . self::MAX_MS . ' ms.');
            }
            if (!in_array($status, ['success', 'error'], true)) {
                throw $fail('status must be success or error.');
            }
            $detail = null;
            if (isset($s['detail'])) {
                if (!is_array($s['detail'])) {
                    throw $fail('detail must be an object.');
                }
                $detail = json_encode($s['detail'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                if ($detail === false || strlen($detail) > self::MAX_DETAIL_BYTES) {
                    throw $fail('detail is larger than 16 KB.');
                }
            }
            $clean[] = ['layer' => $layer, 'name' => $name, 'startedMs' => round((float) $started, 2),
                'durationMs' => round((float) $duration, 2), 'status' => $status, 'detail' => $detail];
        }
        return $clean;
    }

    private function prune(int $userId): void
    {
        $old = $this->app->db->all(
            'SELECT id FROM traces WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1000 OFFSET ' . self::KEEP_PER_USER,
            [$userId],
            'Find traces beyond the newest ' . self::KEEP_PER_USER,
        );
        if ($old !== []) {
            $ids = array_map(static fn(array $r) => (int) $r['id'], $old);
            $this->app->db->run(
                'DELETE FROM traces WHERE user_id = ? AND id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')',
                [$userId, ...$ids],
                'DELETE oldest traces',
            );
        }
    }

    private function find(string $uid): array
    {
        return $this->app->db->one(
            'SELECT id, trace_uid, module, label, status, total_ms, created_at FROM traces WHERE trace_uid = ? AND user_id = ?',
            [$uid, $this->app->userId()],
            'SELECT trace by id',
        ) ?? throw new HttpException(404, 'TRACE_NOT_FOUND', 'No such trace in your history.');
    }

    private function uidParam(Request $req): string
    {
        $uid = strtolower((string) ($req->params['uid'] ?? ''));
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $uid) !== 1) {
            throw new HttpException(404, 'TRACE_NOT_FOUND', 'No such trace in your history.');
        }
        return $uid;
    }
}
