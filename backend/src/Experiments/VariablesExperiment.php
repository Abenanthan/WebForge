<?php
declare(strict_types=1);

namespace WebForge\Experiments;

final class VariablesExperiment extends Experiment
{
    public function slug(): string { return 'php-variables'; }
    public function title(): string { return 'Variables & types'; }
    public function description(): string
    {
        return 'Variables start with $, take the type of their value, and can be cast. String interpolation puts values into text.';
    }

    public function inputs(): array
    {
        return [
            'name'   => ['label' => 'Name', 'type' => 'text', 'default' => 'Asha', 'rules' => ['required', 'string', 'max:40']],
            'age'    => ['label' => 'Age', 'type' => 'text', 'default' => '19', 'rules' => ['required', 'string', 'max:10']],
            'height' => ['label' => 'Height (m)', 'type' => 'text', 'default' => '1.62', 'rules' => ['required', 'string', 'max:10']],
        ];
    }

    public function run(array $in, Steps $show): mixed
    {
        $name = $in['name'];
        $show->add('$name = $in["name"];', $name, gettype($name));

        $ageText = $in['age'];
        $show->add('$ageText = $in["age"];   // form input is always a string', $ageText, gettype($ageText));

        $age = (int) $ageText;
        $show->add('$age = (int) $ageText;', $age, gettype($age));

        $height = (float) $in['height'];
        $show->add('$height = (float) $in["height"];', $height, gettype($height));

        $isAdult = $age >= 18;
        $show->add('$isAdult = $age >= 18;', $isAdult, gettype($isAdult));

        $nothing = null;
        $show->add('$nothing = null;', $nothing, gettype($nothing));

        $show->add('is_numeric($ageText)', is_numeric($ageText));

        echo "Hello, {$name}! You are {$age} years old and {$height} m tall.\n";
        echo 'Adult: ' . ($isAdult ? 'yes' : 'no') . "\n";

        return compact('name', 'age', 'height', 'isAdult');
    }
}
