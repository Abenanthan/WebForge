<?php
declare(strict_types=1);

namespace WebForge\Experiments;

final class OperatorsExperiment extends Experiment
{
    public function slug(): string { return 'php-operators'; }
    public function title(): string { return 'Operators'; }
    public function description(): string
    {
        return 'Arithmetic, string concatenation (.), comparison (== vs ===), the spaceship operator (<=>) and null coalescing (??).';
    }

    public function inputs(): array
    {
        return [
            'a' => ['label' => 'Number a', 'type' => 'number', 'default' => '17', 'rules' => ['required', 'int', 'between:-1000,1000']],
            'b' => ['label' => 'Number b', 'type' => 'number', 'default' => '5', 'rules' => ['required', 'int', 'between:-1000,1000']],
        ];
    }

    public function run(array $in, Steps $show): mixed
    {
        $a = $in['a'];
        $b = $in['b'];

        $show->add('$a + $b', $a + $b);
        $show->add('$a - $b', $a - $b);
        $show->add('$a * $b', $a * $b);
        $show->add('$b !== 0 ? $a / $b : null', $b !== 0 ? $a / $b : null, 'division gives a float');
        $show->add('$b !== 0 ? intdiv($a, $b) : null', $b !== 0 ? intdiv($a, $b) : null);
        $show->add('$b !== 0 ? $a % $b : null', $b !== 0 ? $a % $b : null, 'remainder');
        $show->add('$a ** 2', $a ** 2);

        $show->add('$a . " and " . $b', $a . ' and ' . $b, 'the dot joins strings');
        $show->add('$a == "' . $a . '"', $a == (string) $a, 'loose: compares values after conversion');
        $show->add('$a === "' . $a . '"', $a === (string) $a, 'strict: types must match too');
        $show->add('$a <=> $b', $a <=> $b, '-1, 0 or 1');
        $show->add('$a > $b && $b > 0', $a > $b && $b > 0);

        $missing = null;
        $show->add('$missing ?? "default"', $missing ?? 'default');

        echo "{$a} + {$b} = " . ($a + $b) . "\n";
        echo "{$a} <=> {$b} = " . ($a <=> $b) . "\n";

        return ['sum' => $a + $b, 'compare' => $a <=> $b];
    }
}
