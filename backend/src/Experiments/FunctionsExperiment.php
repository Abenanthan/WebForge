<?php
declare(strict_types=1);

namespace WebForge\Experiments;

final class FunctionsExperiment extends Experiment
{
    public function slug(): string { return 'php-functions'; }
    public function title(): string { return 'Functions'; }
    public function description(): string
    {
        return 'Typed parameters, default values, return values, recursion, arrow functions and closures that capture variables.';
    }

    public function inputs(): array
    {
        return [
            'amount' => ['label' => 'Principal (₹)', 'type' => 'number', 'default' => '10000', 'rules' => ['required', 'int', 'between:1,10000000']],
            'years'  => ['label' => 'Years', 'type' => 'number', 'default' => '3', 'rules' => ['required', 'int', 'between:1,30']],
            'n'      => ['label' => 'Factorial of', 'type' => 'number', 'default' => '5', 'rules' => ['required', 'int', 'between:0,15']],
        ];
    }

    public function run(array $in, Steps $show): mixed
    {
        // Typed parameters, a default value and a return type.
        $compound = function (float $principal, int $years, float $rate = 0.08) use ($show): float {
            $result = round($principal * (1 + $rate) ** $years, 2);
            $show->add("compound({$principal}, {$years}, rate: {$rate})", $result);
            return $result;
        };
        $total = $compound($in['amount'], $in['years']);
        $higher = $compound($in['amount'], $in['years'], 0.1);

        // Recursion: the function calls itself until the base case.
        $factorial = function (int $n) use (&$factorial, $show): int {
            $result = $n <= 1 ? 1 : $n * $factorial($n - 1);
            $show->add("factorial({$n})", $result);
            return $result;
        };
        $fact = $factorial($in['n']);

        // Arrow function: captures $taxRate automatically.
        $taxRate = 0.18;
        $withTax = fn(float $price): float => round($price * (1 + $taxRate), 2);
        $show->add('$withTax(999)  // fn($p) => $p * (1 + $taxRate)', $withTax(999));

        echo "₹{$in['amount']} after {$in['years']} years at 8%: ₹{$total} (at 10%: ₹{$higher})\n";
        echo "{$in['n']}! = {$fact}\n";
        return ['at8' => $total, 'at10' => $higher, 'factorial' => $fact];
    }
}
