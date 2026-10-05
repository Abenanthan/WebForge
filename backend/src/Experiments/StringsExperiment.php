<?php
declare(strict_types=1);

namespace WebForge\Experiments;

final class StringsExperiment extends Experiment
{
    public function slug(): string { return 'php-strings'; }
    public function title(): string { return 'Strings'; }
    public function description(): string
    {
        return 'Common string functions, and htmlspecialchars(): the function that makes user text safe to print in HTML.';
    }

    public function inputs(): array
    {
        return [
            'text'    => ['label' => 'Text', 'type' => 'textarea', 'default' => 'web programming is <b>fun</b>', 'rules' => ['required', 'string', 'max:200']],
            'find'    => ['label' => 'Find', 'type' => 'text', 'default' => 'fun', 'rules' => ['string', 'max:30']],
            'replace' => ['label' => 'Replace with', 'type' => 'text', 'default' => 'powerful', 'rules' => ['string', 'max:30']],
        ];
    }

    public function run(array $in, Steps $show): mixed
    {
        $text = $in['text'];
        $show->add('strlen($text)', strlen($text), 'bytes');
        $show->add('mb_strlen($text)', mb_strlen($text), 'characters (multibyte-safe)');
        $show->add('strtoupper($text)', strtoupper($text));
        $show->add('ucwords($text)', ucwords($text));
        $show->add('str_word_count(strip_tags($text))', str_word_count(strip_tags($text)));
        $show->add('substr($text, 0, 10)', substr($text, 0, 10));

        $find = $in['find'] ?? '';
        if ($find !== '') {
            $show->add("strpos(\$text, '{$find}')", strpos($text, $find), 'false when not found');
            $show->add('str_replace($find, $replace, $text)', str_replace($find, $in['replace'] ?? '', $text));
        }

        $show->add('strrev($text)', strrev($text));
        $show->add('sprintf("%05.2f", 3.14159)', sprintf('%05.2f', 3.14159));

        $safe = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
        $show->add('htmlspecialchars($text)', $safe, '< > & " become entities: safe to echo into a page');

        echo "Original: {$text}\n";
        echo "Escaped:  {$safe}\n";
        return ['length' => mb_strlen($text), 'escaped' => $safe];
    }
}
