<?php
declare(strict_types=1);

namespace WebForge\Experiments;

final class ConditionsExperiment extends Experiment
{
    public function slug(): string { return 'php-conditions'; }
    public function title(): string { return 'Conditions'; }
    public function description(): string
    {
        return 'if / elseif / else picks the first true branch; switch compares one value; match (PHP 8) returns a value.';
    }

    public function inputs(): array
    {
        return [
            'marks' => ['label' => 'Marks (0–100)', 'type' => 'number', 'default' => '72', 'rules' => ['required', 'int', 'between:0,100']],
            'day'   => ['label' => 'Day number (1–7)', 'type' => 'number', 'default' => '6', 'rules' => ['required', 'int', 'between:1,7']],
        ];
    }

    public function run(array $in, Steps $show): mixed
    {
        $marks = $in['marks'];

        if ($show->add('$marks >= 90', $marks >= 90)) {
            $grade = 'A';
        } elseif ($show->add('$marks >= 75', $marks >= 75)) {
            $grade = 'B';
        } elseif ($show->add('$marks >= 60', $marks >= 60)) {
            $grade = 'C';
        } else {
            $grade = 'F';
        }
        $show->add('$grade', $grade);

        $day = $in['day'];
        switch ($day) {
            case 6:
            case 7:
                $type = 'weekend';
                break;
            default:
                $type = 'weekday';
        }
        $show->add('switch ($day) → $type', $type);

        $label = match (true) {
            $marks >= 75 => 'distinction',
            $marks >= 40 => 'pass',
            default => 'fail',
        };
        $show->add('match (true) { ... }', $label);

        echo "Marks {$marks}: grade {$grade} ({$label}).\n";
        echo "Day {$day} is a {$type}.\n";

        return compact('grade', 'type', 'label');
    }
}
