<?php
declare(strict_types=1);

namespace WebForge\Core;

/** Per-request service container handed to every route handler. */
final class App
{
    public readonly Db $db;

    public function __construct(
        public readonly array $config,
        public readonly ServerTracer $tracer,
    ) {
        $this->db = new Db($config['db'], $tracer);
    }

    public function isDev(): bool
    {
        return $this->config['env'] === 'development';
    }
}
