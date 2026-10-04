<?php
declare(strict_types=1);

namespace WebForge\Core;

/** Thrown anywhere in a request; converted to an error envelope by the front controller. */
final class HttpException extends \RuntimeException
{
    /** @param array<string,string> $fields per-field validation messages */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $fields = [],
    ) {
        parent::__construct($message, $status);
    }
}
