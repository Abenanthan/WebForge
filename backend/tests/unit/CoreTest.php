<?php
declare(strict_types=1);

use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Router;
use WebForge\Core\ServerTracer;
use function WebForge\Tests\{eq, ok, throwsHttp};

/** The application's real route table. */
function webforgeRoutes(): Router
{
    $router = new Router();
    (require dirname(__DIR__, 2) . '/src/routes.php')($router);
    return $router;
}

return [
    'tracer keeps a valid incoming trace id (lower-cased)' => function () {
        eq('11111111-2222-4333-8444-555555555555', (new ServerTracer('11111111-2222-4333-8444-555555555555'))->traceId);
        eq('abcdef00-2222-4333-8444-555555555555', (new ServerTracer('ABCDEF00-2222-4333-8444-555555555555'))->traceId);
    },
    'tracer replaces an invalid trace id with a new v4 uuid' => function () {
        foreach ([null, '', 'x', "11111111-2222-4333-8444-555555555555\n<script>"] as $bad) {
            ok(preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', (new ServerTracer($bad))->traceId) === 1);
        }
    },
    'tracer records failing steps and rethrows' => function () {
        $t = new ServerTracer(null);
        eq(42, $t->step('server', 'ok', fn() => 42));
        try {
            $t->step('database', 'boom', fn() => throw new RuntimeException('down'));
            throw new LogicException('not rethrown');
        } catch (RuntimeException) {
        }
        $steps = $t->export()['trace'];
        eq(['success', 'error'], array_column($steps, 'status'));
        eq('down', $steps[1]['detail']->error);
    },
    'router extracts and url-decodes parameters' => function () {
        $req = Request::create('GET', '/api/lab/files/my%20notes.txt');
        webforgeRoutes()->match($req);
        eq('my notes.txt', $req->params['name']);
    },
    'router distinguishes 404 from 405' => function () {
        throwsHttp(fn() => webforgeRoutes()->match(Request::create('GET', '/api/nope')), 404, 'NOT_FOUND');
        throwsHttp(fn() => webforgeRoutes()->match(Request::create('DELETE', '/api/health')), 405, 'METHOD_NOT_ALLOWED');
    },
    'every route except the public ones requires login' => function () {
        $public = ['GET /api/health', 'GET /api/auth/csrf', 'GET /api/auth/me', 'POST /api/auth/register', 'POST /api/auth/login'];
        foreach (webforgeRoutes()->routes() as $r) {
            $key = "{$r['method']} {$r['pattern']}";
            if (!in_array($key, $public, true)) {
                ok(($r['options']['auth'] ?? false) === true, "$key must require auth");
            }
        }
    },
    'no route is registered twice' => function () {
        $keys = array_map(static fn($r) => "{$r['method']} {$r['pattern']}", webforgeRoutes()->routes());
        eq([], array_values(array_diff_assoc($keys, array_unique($keys))));
    },
    'HttpException carries status, code and fields' => function () {
        $e = new HttpException(422, 'VALIDATION_FAILED', 'Bad', ['x' => 'y']);
        eq([422, 'VALIDATION_FAILED', ['x' => 'y']], [$e->status, $e->errorCode, $e->fields]);
    },
];
