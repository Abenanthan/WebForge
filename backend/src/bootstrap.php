<?php
declare(strict_types=1);

// PSR-4 style autoloader: WebForge\Core\Db -> src/Core/Db.php
spl_autoload_register(static function (string $class): void {
    $prefix = 'WebForge\\';

    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $path = __DIR__ . '/'
        . str_replace('\\', '/', substr($class, strlen($prefix)))
        . '.php';

    if (is_file($path)) {
        require $path;
    }
});

return require dirname(__DIR__) . '/config/config.php';