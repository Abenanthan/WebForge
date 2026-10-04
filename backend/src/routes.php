<?php
declare(strict_types=1);

use WebForge\Core\App;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Router;

/**
 * Route table. Handlers receive (Request, App) and return a Response.
 * Feature routes are registered here as each phase lands.
 */
return static function (Router $r): void {
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
            'service' => 'webforge-api',
            'php'     => PHP_VERSION,
            'db'      => 'connected',
            'dbVersion' => $db['version'],
            'catalogue' => ['concepts' => (int) $db['concepts'], 'questions' => (int) $db['questions']],
        ]);
    });
};
