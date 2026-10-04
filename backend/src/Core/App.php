<?php
declare(strict_types=1);

namespace WebForge\Core;

/** Per-request service container handed to every route handler. */
final class App
{
    public readonly Db $db;
    public readonly Session $session;

    public function __construct(
        public readonly array $config,
        public readonly ServerTracer $tracer,
    ) {
        $this->db = new Db($config['db'], $tracer);
        $this->session = new Session($config['session']);
    }

    public function isDev(): bool
    {
        return $this->config['env'] === 'development';
    }

    /** Id of the logged-in user; routes registered with ['auth' => true] are guaranteed one. */
    public function userId(): int
    {
        return $this->session->userId()
            ?? throw new HttpException(401, 'UNAUTHENTICATED', 'Please log in to continue.');
    }
}
