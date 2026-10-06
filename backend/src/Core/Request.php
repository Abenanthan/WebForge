<?php
declare(strict_types=1);

namespace WebForge\Core;

final class Request
{
    private const MAX_BODY_BYTES = 3_145_728; // 3 MB (canvas drawings are sent as PNG data URLs)

    /** @param array<string,string> $params route parameters, filled by the Router */
    private function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        private readonly string $rawBody,
        private readonly array $headers,
        public array $params = [],
    ) {
    }

    public static function fromGlobals(string $basePath): self
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        if ($basePath !== '' && str_starts_with($path, $basePath)) {
            $path = substr($path, strlen($basePath)) ?: '/';
        }
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = (string) $value;
            }
        }
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > self::MAX_BODY_BYTES) {
            throw new HttpException(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 3 MB.');
        }
        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            '/' . trim($path, '/'),
            $_GET,
            (string) file_get_contents('php://input', false, null, 0, self::MAX_BODY_BYTES),
            $headers,
        );
    }

    /** Build a request directly (used by the test suite; production uses fromGlobals). */
    public static function create(string $method, string $path, array $query = [], string $body = '', array $headers = []): self
    {
        return new self(strtoupper($method), '/' . trim($path, '/'), $query, $body, array_change_key_case($headers));
    }

    /** Client IP as seen by this server (no proxy headers trusted). */
    public function ip(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    public function isSafeMethod(): bool
    {
        return in_array($this->method, ['GET', 'HEAD', 'OPTIONS'], true);
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /** Decoded JSON body; empty array when there is no body. */
    public function json(): array
    {
        if (trim($this->rawBody) === '') {
            return [];
        }
        $data = json_decode($this->rawBody, true);
        if (!is_array($data)) {
            throw new HttpException(400, 'INVALID_JSON', 'Request body must be a JSON object.');
        }
        return $data;
    }
}
