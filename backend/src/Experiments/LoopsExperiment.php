<?php
declare(strict_types=1);

namespace WebForge\Experiments;

final class LoopsExperiment extends Experiment
{
    public function slug(): string { return 'php-loops'; }
    public function title(): string { return 'Loops'; }
    public function description(): string
    {
        return 'for counts with an index, while repeats until a condition fails, foreach walks an array (with keys).';
    }

    public function inputs(): array
    {
        return [
            'number' => ['label' => 'Times table for', 'type' => 'number', 'default' => '7', 'rules' => ['required', 'int', 'between:1,20']],
            'rows'   => ['label' => 'Rows', 'type' => 'number', 'default' => '5', 'rules' => ['required', 'int', 'between:1,12']],
        ];
    }

    public function run(array $in, Steps $show): mixed
    {
        $n = $in['number'];
        $table = [];
        for ($i = 1; $i <= $in['rows']; $i++) {
            $table[$i] = $n * $i;
            $show->add("for: \$i = {$i} → \$n * \$i", $table[$i]);
            echo "{$n} x {$i} = {$table[$i]}\n";
        }

        $countdown = 3;
        while ($countdown > 0) {
            $show->add('while ($countdown > 0)', $countdown);
            $countdown--;
        }
        $show->add('while ended: $countdown', $countdown);

        $total = 0;
        foreach ($table as $row => $value) {
            $total += $value;
        }
        $show->add('foreach ($table as $row => $value) $total += $value', $total);

        echo "Sum of the table: {$total}\n";
        return ['table' => $table, 'total' => $total];
    }
}
