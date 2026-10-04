<?php
declare(strict_types=1);

/**
 * WebForge API front controller. The only PHP file reachable from the web;
 * everything else (config, src, storage) lives outside this directory.
 */

use WebForge\Core\App;
use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Router;
use WebForge\Core\ServerTracer;

$config = require dirname(__DIR__) . '/src/bootstrap.php';

ini_set('display_errors', '0');
error_reporting(E_ALL);
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

$tracer = new ServerTracer($_SERVER['HTTP_X_TRACE_ID'] ?? null);
$app = new App($config, $tracer);

try {
    $request = Request::fromGlobals($config['base_path']);
    $tracer->note('server', 'Request received', ['method' => $request->method, 'path' => $request->path]);

    $router = new Router();
    (require dirname(__DIR__) . '/src/routes.php')($router);
    $route = $router->match($request);

    $response = ($route['handler'])($request, $app);
} catch (HttpException $e) {
    $tracer->note('server', 'Request rejected', ['code' => $e->errorCode], null, 'error');
    $response = Response::error($e->status, $e->errorCode, $e->getMessage(), $e->fields);
} catch (PDOException $e) {
    error_log('[webforge] DB error: ' . $e->getMessage());
    $response = Response::error(503, 'DATABASE_UNAVAILABLE',
        $app->isDev() ? 'Database error: ' . $e->getMessage() : 'The database is currently unavailable.');
} catch (Throwable $e) {
    error_log('[webforge] Unhandled: ' . $e);
    $response = Response::error(500, 'INTERNAL_ERROR',
        $app->isDev() ? $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine() : 'Unexpected server error.');
}

$tracer->note('server', 'Response generated');
$response->send($tracer);
