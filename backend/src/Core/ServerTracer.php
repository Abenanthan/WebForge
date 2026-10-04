<?php
declare(strict_types=1);

namespace WebForge\Core;

/**
 * Records the real server-side steps of a request (validation, processing,
 * SQL, response) with timings. Exported in every response under meta.trace
 * so the frontend Execution Trace can merge server spans with client spans.
 */
final class ServerTracer
{
    public readonly string $traceId;
    private readonly float $start;
    /** @var list<array> */
    private array $steps = [];

    public function __construct(?string $incomingTraceId)
    {
        $this->traceId = self::isValidUuid($incomingTraceId) ? strtolower($incomingTraceId) : self::uuid();
        $this->start = microtime(true);
    }

    /**
     * Run $fn as a named step and record its duration and outcome.
     * @template T
     * @param callable():T $fn
     * @return T
     */
    public function step(string $layer, string $name, callable $fn, array $detail = []): mixed
    {
        $t0 = microtime(true);
        try {
            $result = $fn();
            $this->record($layer, $name, $t0, 'success', $detail);
            return $result;
        } catch (\Throwable $e) {
            $this->record($layer, $name, $t0, 'error', $detail + ['error' => $e->getMessage()]);
            throw $e;
        }
    }

    /** Record an instantaneous step (or one whose start was measured elsewhere). */
    public function note(string $layer, string $name, array $detail = [], ?float $startedAt = null, string $status = 'success'): void
    {
        $this->record($layer, $name, $startedAt ?? microtime(true), $status, $detail);
    }

    public function export(): array
    {
        return [
            'traceId'    => $this->traceId,
            'durationMs' => round((microtime(true) - $this->start) * 1000, 2),
            'trace'      => $this->steps,
        ];
    }

    private function record(string $layer, string $name, float $t0, string $status, array $detail): void
    {
        $this->steps[] = [
            'layer'      => $layer,
            'name'       => $name,
            'startedMs'  => round(($t0 - $this->start) * 1000, 2),
            'durationMs' => round((microtime(true) - $t0) * 1000, 2),
            'status'     => $status,
            'detail'     => (object) $detail,
        ];
    }

    private static function isValidUuid(?string $value): bool
    {
        return $value !== null
            && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $value) === 1;
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
