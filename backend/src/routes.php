<?php
declare(strict_types=1);

use WebForge\Controllers\AuthController;
use WebForge\Controllers\StatsController;
use WebForge\Core\App;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Router;

/**
 * Route table. Handlers are closures (Request, App) or [Controller, method].
 * Options: 'auth' => true requires a logged-in session;
 *          'session' => false makes the route stateless (no session cookie).
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
    $r->get('/api/auth/csrf', [AuthController::class, 'csrf']);
    $r->get('/api/auth/me', [AuthController::class, 'me']);
    $r->post('/api/auth/register', [AuthController::class, 'register']);
    $r->post('/api/auth/login', [AuthController::class, 'login']);
    $r->post('/api/auth/logout', [AuthController::class, 'logout'], $auth);

    // --- Dashboard ----------------------------------------------------------
    $r->get('/api/stats/dashboard', [StatsController::class, 'dashboard'], $auth);
};
