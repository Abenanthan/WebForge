<?php
declare(strict_types=1);

namespace WebForge\Core;

/**
 * Minimal method + path router. Patterns use {name} placeholders,
 * e.g. "/api/projects/{id}". A placeholder matches one path segment.
 */
final class Router
{
    /** @var list<array{method:string, regex:string, handler:callable, options:array}> */
    private array $routes = [];

    /** @param array{auth?:bool} $options */
    public function add(string $method, string $pattern, callable $handler, array $options = []): void
    {
        $regex = '#^' . preg_replace('#\{([a-zA-Z_]+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        $this->routes[] = ['method' => $method, 'regex' => $regex, 'handler' => $handler, 'options' => $options];
    }

    public function get(string $p, callable $h, array $o = []): void    { $this->add('GET', $p, $h, $o); }
    public function post(string $p, callable $h, array $o = []): void   { $this->add('POST', $p, $h, $o); }
    public function put(string $p, callable $h, array $o = []): void    { $this->add('PUT', $p, $h, $o); }
    public function patch(string $p, callable $h, array $o = []): void  { $this->add('PATCH', $p, $h, $o); }
    public function delete(string $p, callable $h, array $o = []): void { $this->add('DELETE', $p, $h, $o); }

    /** @return array{handler:callable, options:array} */
    public function match(Request $request): array
    {
        $pathMatched = false;
        foreach ($this->routes as $route) {
            if (preg_match($route['regex'], $request->path, $m) !== 1) {
                continue;
            }
            $pathMatched = true;
            if ($route['method'] !== $request->method) {
                continue;
            }
            $request->params = array_map('urldecode', array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY));
            return ['handler' => $route['handler'], 'options' => $route['options']];
        }
        throw $pathMatched
            ? new HttpException(405, 'METHOD_NOT_ALLOWED', "Method {$request->method} is not allowed here.")
            : new HttpException(404, 'NOT_FOUND', "No endpoint matches {$request->path}.");
    }
}
