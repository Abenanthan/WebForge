<?php
declare(strict_types=1);

namespace WebForge\Core;

use PDO;
use PDOStatement;

/**
 * Thin PDO wrapper. Native prepared statements only (emulation off).
 * Every query is reported to the ServerTracer as a "database" step so the
 * Execution Trace shows the real SQL template, bound parameters and timing.
 */
final class Db
{
    private ?PDO $pdo = null;

    public function __construct(private readonly array $config, private readonly ServerTracer $tracer)
    {
    }

    public function pdo(): PDO
    {
        if ($this->pdo === null) {
            $c = $this->config;
            $this->pdo = new PDO(
                "mysql:host={$c['host']};port={$c['port']};dbname={$c['name']};charset=utf8mb4",
                $c['user'],
                $c['pass'],
                [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                    PDO::ATTR_STRINGIFY_FETCHES  => false,
                ],
            );
        }
        return $this->pdo;
    }

    /** Execute a prepared statement and trace it. */
    public function run(string $sql, array $params = [], string $label = 'SQL query'): PDOStatement
    {
        return $this->tracer->step('database', $label, function () use ($sql, $params): PDOStatement {
            $stmt = $this->pdo()->prepare($sql);
            $stmt->execute($params);
            return $stmt;
        }, ['sql' => self::normalize($sql), 'params' => $params]);
    }

    public function all(string $sql, array $params = [], string $label = 'SELECT'): array
    {
        return $this->run($sql, $params, $label)->fetchAll();
    }

    public function one(string $sql, array $params = [], string $label = 'SELECT'): ?array
    {
        $row = $this->run($sql, $params, $label)->fetch();
        return $row === false ? null : $row;
    }

    public function lastInsertId(): int
    {
        return (int) $this->pdo()->lastInsertId();
    }

    /**
     * @template T
     * @param callable():T $fn
     * @return T
     */
    public function transaction(callable $fn): mixed
    {
        $pdo = $this->pdo();
        $pdo->beginTransaction();
        try {
            $result = $fn();
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    private static function normalize(string $sql): string
    {
        return trim((string) preg_replace('/\s+/', ' ', $sql));
    }
}
