<?php
declare(strict_types=1);

/**
 * Loads backend/config/.env (KEY=VALUE lines) and returns the typed app config.
 * Real environment variables take precedence over the file.
 */
return (static function (): array {
    $env = [];
    $file = __DIR__ . '/.env';
    if (is_readable($file)) {
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = array_map('trim', explode('=', $line, 2));
            $env[$key] = $value;
        }
    }
    $get = static fn(string $key, string $default = ''): string =>
        getenv($key) !== false ? (string) getenv($key) : ($env[$key] ?? $default);

    return [
        'env'       => $get('APP_ENV', 'production'),
        'base_path' => rtrim($get('APP_BASE_PATH', ''), '/'),
        'db' => [
            'host' => $get('DB_HOST', '127.0.0.1'),
            'port' => (int) $get('DB_PORT', '3306'),
            'name' => $get('DB_NAME', 'webforge'),
            'user' => $get('DB_USER', 'root'),
            'pass' => $get('DB_PASS', ''),
        ],
        'session' => [
            'name'         => $get('SESSION_NAME', 'WEBFORGE_SID'),
            'idle_minutes' => (int) $get('SESSION_IDLE_MINUTES', '60'),
        ],
        'storage_dir' => dirname(__DIR__) . '/storage',
    ];
})();
