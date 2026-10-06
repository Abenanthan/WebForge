<?php
declare(strict_types=1);

namespace WebForge\Core;

/**
 * Uniform JSON envelope used by every endpoint:
 *   { ok, data, error: {code, message, fields}, meta: {status, traceId, durationMs, trace, ...} }
 */
final class Response
{
    private array $meta = [];

    private function __construct(
        private readonly int $status,
        private readonly bool $ok,
        private readonly mixed $data,
        private readonly ?array $error,
    ) {
    }

    public static function ok(mixed $data = null, int $status = 200): self
    {
        return new self($status, true, $data, null);
    }

    public static function error(int $status, string $code, string $message, array $fields = []): self
    {
        return new self($status, false, null, [
            'code'    => $code,
            'message' => $message,
            'fields'  => (object) $fields,
        ]);
    }

    /** Attach extra metadata (e.g. the executed SQL in the Database Lab). */
    public function withMeta(string $key, mixed $value): self
    {
        $this->meta[$key] = $value;
        return $this;
    }

    public function send(ServerTracer $tracer): void
    {
        http_response_code($this->status);
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');
        header('X-Trace-Id: ' . $tracer->traceId);
        // JSON is data, never a document: forbid rendering, framing and cross-origin embedding.
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: same-origin');
        header('Cross-Origin-Resource-Policy: same-origin');
        if ($this->status === 429) {
            header('Retry-After: 60');
        }

        echo json_encode([
            'ok'    => $this->ok,
            'data'  => $this->data,
            'error' => $this->error,
            'meta'  => ['status' => $this->status] + $this->meta + $tracer->export(),
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }
}
