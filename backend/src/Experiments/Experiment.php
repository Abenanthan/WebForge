<?php
declare(strict_types=1);

namespace WebForge\Experiments;

/**
 * A fixed, server-side PHP demonstration. Users never send code: they send
 * validated inputs to a whitelisted experiment, which runs the method below.
 */
abstract class Experiment
{
    /** Slug in the experiments catalogue (database/seed.sql). */
    abstract public function slug(): string;

    abstract public function title(): string;

    abstract public function description(): string;

    /**
     * Input fields: name => [label, type (text|number|textarea), default, Validator rules]
     * @return array<string, array{label:string, type:string, default:mixed, rules:list<string>}>
     */
    abstract public function inputs(): array;

    /** The demonstration itself. echo output is captured; the return value is shown too. */
    abstract public function run(array $in, Steps $steps): mixed;

    /** The real source of run(): exactly what executes on the server. */
    public function source(): string
    {
        $method = new \ReflectionMethod($this, 'run');
        $lines = file($method->getFileName());
        $body = array_slice($lines, $method->getStartLine() - 1, $method->getEndLine() - $method->getStartLine() + 1);
        // Remove the common indentation so the snippet starts at column 0.
        $indent = min(array_map(static fn($l) => trim($l) === '' ? PHP_INT_MAX : strlen($l) - strlen(ltrim($l)), $body));
        return implode('', array_map(static fn($l) => trim($l) === '' ? "\n" : substr($l, $indent), $body));
    }

    public function describe(): array
    {
        return [
            'slug'        => $this->slug(),
            'title'       => $this->title(),
            'description' => $this->description(),
            'inputs'      => array_map(static fn(string $name, array $f) => [
                'name' => $name, 'label' => $f['label'], 'type' => $f['type'], 'default' => $f['default'],
            ], array_keys($this->inputs()), $this->inputs()),
            'source'      => $this->source(),
        ];
    }

    /** @return array<string, list<string>> Validator rules per input. */
    public function rules(): array
    {
        return array_map(static fn(array $f) => $f['rules'], $this->inputs());
    }
}
