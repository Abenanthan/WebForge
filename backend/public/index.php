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

    // Middleware: session -> CSRF (all mutating requests) -> authentication (protected routes)
    // Stateless routes ('session' => false) never create a session cookie.
    if ($route['options']['session'] ?? true) {
        $app->session->start();
    }
    if (!$request->isSafeMethod() && !$app->session->verifyCsrf($request->header('X-CSRF-Token'))) {
        throw new HttpException(403, 'CSRF_INVALID', 'Security token missing or expired. Refresh and try again.');
    }
    if (($route['options']['auth'] ?? false) && $app->session->userId() === null) {
        throw new HttpException(401, $app->session->wasExpired() ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED',
            $app->session->wasExpired() ? 'Your session expired. Please log in again.' : 'Please log in to continue.');
    }
    $tracer->note('server', 'Middleware passed', [
        'session' => ($route['options']['session'] ?? true) ? 'active' : 'not used (stateless route)',
        'csrf'    => $request->isSafeMethod() ? 'not required (safe method)' : 'verified',
        'auth'    => ($route['options']['auth'] ?? false) ? 'user #' . $app->session->userId() : 'public route',
    ]);

    // PHP locks the session file for the whole request; release it as soon as possible so one
    // slow request (e.g. a delayed AJAX demo) does not block the user's other requests.
    // Only routes that change session data ('sessionWrite' => true) keep it open.
    if (($route['options']['session'] ?? true) && !($route['options']['sessionWrite'] ?? false)) {
        $app->session->release();
    }

    $handler = $route['handler'];
    $response = is_array($handler)
        ? (new $handler[0]($app))->{$handler[1]}($request)
        : $handler($request, $app);
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
