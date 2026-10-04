<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;

/**
 * Endpoints for the AJAX Monitor. Everything here really happens on the server:
 * the delay is a real sleep, failures are real error responses and searches are
 * real (prepared) SQL queries. Every step appears in the response's meta.trace.
 */
final class DemoController
{
    private const MAX_DELAY_MS = 3000;
    private const ALLOWED_STATUS = [
        200 => 'OK: the request succeeded.',
        201 => 'Created: a new resource was created.',
        400 => 'Bad Request: the request is malformed.',
        401 => 'Unauthorized: authentication is required.',
        403 => 'Forbidden: authenticated, but not allowed.',
        404 => 'Not Found: no resource at this URL.',
        409 => 'Conflict: the request conflicts with current state.',
        422 => 'Unprocessable Content: validation failed.',
        429 => 'Too Many Requests: slow down (rate limited).',
        500 => 'Internal Server Error: something broke on the server.',
        503 => 'Service Unavailable: the server is overloaded or down.',
    ];
    private const CATEGORIES = ['html', 'css', 'js', 'dom', 'ajax', 'php', 'sql', 'react', 'routing'];

    public function __construct(private readonly App $app)
    {
    }

    /** GET|POST|PUT|PATCH|DELETE /api/demo/echo: reflects what the server received. */
    public function echo(Request $req): Response
    {
        $this->simulate($req);
        $body = $req->isSafeMethod() ? null : $req->json();
        $received = $this->app->tracer->step('server', 'Read the incoming request', static fn() => [
            'method'  => $req->method,
            'path'    => $req->path,
            'query'   => (object) $req->query,
            'headers' => [
                'content-type' => $_SERVER['CONTENT_TYPE'] ?? null,
                'accept'       => $req->header('accept'),
                'x-trace-id'   => $req->header('x-trace-id'),
                'user-agent'   => mb_substr((string) $req->header('user-agent'), 0, 120),
            ],
            'body'    => $body === null ? null : (object) $body,
        ]);
        $status = $req->method === 'POST' ? 201 : 200;
        return Response::ok([
            'message'  => "The server received your {$req->method} request.",
            'received' => $received,
            'serverTime' => date(DATE_ATOM),
        ], $status);
    }

    /** GET /api/demo/concepts?search=&category=: a real database search. */
    public function concepts(Request $req): Response
    {
        $this->simulate($req);
        $q = Validator::check($req->query, [
            'search'   => ['string', 'max:60'],
            'category' => ['in:' . implode(',', self::CATEGORIES)],
            'limit'    => ['int', 'between:1,20'],
        ], $this->app->tracer);

        $where = [];
        $params = [];
        if ($q['search'] !== null) {
            $where[] = '(c.title LIKE ? OR c.slug LIKE ?)';
            $like = '%' . addcslashes($q['search'], '%_\\') . '%';
            array_push($params, $like, $like);
        }
        if ($q['category'] !== null) {
            $where[] = 'c.category = ?';
            $params[] = $q['category'];
        }
        $sql = 'SELECT c.id, c.slug, c.title, c.category, c.lab_path,
                       (SELECT COUNT(*) FROM experiments e WHERE e.concept_id = c.id) AS experiments
                FROM concepts c'
            . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
            . ' ORDER BY c.id LIMIT ' . ($q['limit'] ?? 10);
        $rows = $this->app->db->all($sql, $params, 'SELECT matching concepts');

        $items = $this->app->tracer->step('server', 'Shape rows into JSON', static fn() => array_map(static fn(array $r) => [
            'id' => (int) $r['id'], 'slug' => $r['slug'], 'title' => $r['title'],
            'category' => $r['category'], 'lab' => $r['lab_path'], 'experiments' => (int) $r['experiments'],
        ], $rows));

        return Response::ok(['count' => count($items), 'items' => $items]);
    }

    /** GET /api/demo/status/{code}: responds with the requested HTTP status. */
    public function status(Request $req): Response
    {
        $this->simulate($req);
        $code = (int) ($req->params['code'] ?? 0);
        if (!isset(self::ALLOWED_STATUS[$code])) {
            throw new HttpException(400, 'UNSUPPORTED_STATUS', 'Choose one of: ' . implode(', ', array_keys(self::ALLOWED_STATUS)) . '.');
        }
        $meaning = self::ALLOWED_STATUS[$code];
        $this->app->tracer->note('server', "Respond with HTTP $code", ['meaning' => $meaning]);
        if ($code >= 400) {
            return Response::error($code, 'DEMO_STATUS_' . $code, $meaning);
        }
        return Response::ok(['status' => $code, 'meaning' => $meaning], $code);
    }

    /** ?delay=ms sleeps for real; ?fail=1 throws a real server error. */
    private function simulate(Request $req): void
    {
        $delay = (int) ($req->query['delay'] ?? 0);
        if ($delay > 0) {
            $delay = min($delay, self::MAX_DELAY_MS);
            $this->app->tracer->step('server', "Simulated processing ({$delay} ms)", static fn() => usleep($delay * 1000), ['delayMs' => $delay]);
        }
        if (($req->query['fail'] ?? '') === '1') {
            $this->app->tracer->note('server', 'Simulated failure requested', [], null, 'error');
            throw new \RuntimeException('Simulated server failure (requested with ?fail=1).');
        }
    }
}
