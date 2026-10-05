<?php
declare(strict_types=1);

namespace WebForge\Experiments;

/**
 * Records what an experiment does, line by line: the PHP statement and the
 * value it produced. Shown as "SERVER PROCESSING" in the Server Lab.
 */
final class Steps
{
    private const MAX_STEPS = 120;

    /** @var list<array{code:string, value:string, type:string, note:?string}> */
    private array $steps = [];
    private int $dropped = 0;

    /** Record a statement and the value it produced; returns the value for inline use. */
    public function add(string $code, mixed $value, ?string $note = null): mixed
    {
        if (count($this->steps) >= self::MAX_STEPS) {
            $this->dropped++;
            return $value;
        }
        $this->steps[] = [
            'code'  => $code,
            'value' => self::show($value),
            'type'  => get_debug_type($value),
            'note'  => $note,
        ];
        return $value;
    }

    public function all(): array
    {
        return $this->steps;
    }

    public function dropped(): int
    {
        return $this->dropped;
    }

    /** var_export-style rendering, kept short. */
    public static function show(mixed $value): string
    {
        $text = match (true) {
            is_string($value) => var_export($value, true),
            is_bool($value), is_null($value) => var_export($value, true),
            is_float($value) => rtrim(rtrim(sprintf('%.6F', $value), '0'), '.') ?: '0',
            is_array($value) => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[…]',
            $value instanceof \Closure => 'Closure',
            default => (string) $value,
        };
        return mb_strlen($text) > 300 ? mb_substr($text, 0, 300) . '…' : $text;
    }
}
