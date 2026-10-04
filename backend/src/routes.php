<?php
declare(strict_types=1);

use WebForge\Controllers\AuthController;
use WebForge\Controllers\DemoController;
use WebForge\Controllers\ExperimentController;
use WebForge\Controllers\FormLabController;
use WebForge\Controllers\ProjectController;
use WebForge\Controllers\StatsController;
use WebForge\Core\App;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Router;

/**
 * Route table. Handlers are closures (Request, App) or [Controller, method].
 * Options: 'auth' => true requires a logged-in session;
 *          'session' => false makes the route stateless (no session cookie);
 *          'sessionWrite' => true keeps the session lock for the whole request (default: released
 *          right after authentication, so slow requests never block a user's other requests).
 * CSRF is enforced globally for every non-GET request (see public/index.php).
 */
return static function (Router $r): void {
    $auth = ['auth' => true];

    $r->get('/api/health', static function (Request $req, App $app): Response {
        $db = $app->tracer->step('server', 'Check database connection', static function () use ($app): array {
            return $app->db->one(
                'SELECT VERSION() AS version,
                        (SELECT COUNT(*) FROM concepts)       AS concepts,
                        (SELECT COUNT(*) FROM quiz_questions) AS questions',
                [],
                'SELECT server version and catalogue counts',
            );
        });
        return Response::ok([
            'service'   => 'webforge-api',
            'php'       => PHP_VERSION,
            'db'        => 'connected',
            'dbVersion' => $db['version'],
            'catalogue' => ['concepts' => (int) $db['concepts'], 'questions' => (int) $db['questions']],
        ]);
    }, ['session' => false]);

    // --- Authentication ---------------------------------------------------
    // These routes change session data (CSRF token, login state), so they keep the session open.
    $write = ['sessionWrite' => true];
    $r->get('/api/auth/csrf', [AuthController::class, 'csrf'], $write);
    $r->get('/api/auth/me', [AuthController::class, 'me'], $write);
    $r->post('/api/auth/register', [AuthController::class, 'register'], $write);
    $r->post('/api/auth/login', [AuthController::class, 'login'], $write);
    $r->post('/api/auth/logout', [AuthController::class, 'logout'], $auth + $write);

    // --- Dashboard ----------------------------------------------------------
    $r->get('/api/stats/dashboard', [StatsController::class, 'dashboard'], $auth);

    // --- Projects -----------------------------------------------------------
    $r->get('/api/projects', [ProjectController::class, 'index'], $auth);
    $r->post('/api/projects', [ProjectController::class, 'store'], $auth);
    $r->get('/api/projects/{id}', [ProjectController::class, 'show'], $auth);
    $r->put('/api/projects/{id}', [ProjectController::class, 'update'], $auth);
    $r->patch('/api/projects/{id}', [ProjectController::class, 'rename'], $auth);
    $r->delete('/api/projects/{id}', [ProjectController::class, 'destroy'], $auth);

    // --- AJAX Monitor demo endpoints ---------------------------------------
    foreach (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as $method) {
        $r->add($method, '/api/demo/echo', [DemoController::class, 'echo'], $auth);
    }
    $r->get('/api/demo/concepts', [DemoController::class, 'concepts'], $auth);
    $r->get('/api/demo/status/{code}', [DemoController::class, 'status'], $auth);

    // --- Labs -------------------------------------------------------------
    $r->post('/api/lab/forms/validate', [FormLabController::class, 'validate'], $auth);

    // --- Experiments (activity tracking) -----------------------------------
    $r->post('/api/experiments/{slug}/runs', [ExperimentController::class, 'recordRun'], $auth);
};
