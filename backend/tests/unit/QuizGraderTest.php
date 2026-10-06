<?php
declare(strict_types=1);

use WebForge\Services\QuizGrader;
use function WebForge\Tests\{eq, ok};

$options = [
    ['id' => 10, 'label' => '<section>', 'is_correct' => false],
    ['id' => 11, 'label' => '<main>', 'is_correct' => true],
];
$mcq = ['type' => 'mcq', 'payload' => []];
$output = ['type' => 'output', 'payload' => ['accepted' => ['230', '230px']]];
$match = ['type' => 'match', 'payload' => ['left' => ['a', 'b', 'c'], 'right' => ['X', 'Y', 'Z'], 'answer' => [2, 0, 1]]];

return [
    'option questions: right, wrong and missing answers' => function () use ($mcq, $options) {
        eq(true, QuizGrader::grade($mcq, $options, 11)['correct']);
        $wrong = QuizGrader::grade($mcq, $options, 10);
        eq(false, $wrong['correct']);
        eq('<section>', $wrong['yourAnswer']);
        eq('<main>', $wrong['correctAnswer']);
        eq(null, QuizGrader::grade($mcq, $options, null)['yourAnswer']);
    },
    'an option id from another question never counts' => function () use ($mcq, $options) {
        eq(false, QuizGrader::grade($mcq, $options, 999)['correct']);
        eq(false, QuizGrader::grade($mcq, $options, '11')['correct'], 'string id is not an int');
    },
    'output answers ignore case, spacing and quotes' => function () use ($output) {
        foreach (['230', ' 230PX ', '"230px"', "'230'"] as $answer) {
            eq(true, QuizGrader::grade($output, [], $answer)['correct'], "answer $answer");
        }
        eq(false, QuizGrader::grade($output, [], '2 30')['correct']);
        eq(false, QuizGrader::grade($output, [], '')['correct']);
        eq(false, QuizGrader::grade($output, [], ['230'])['correct'], 'arrays are not text');
    },
    'match answers must be the exact mapping' => function () use ($match) {
        $right = QuizGrader::grade($match, [], [2, 0, 1]);
        eq(true, $right['correct']);
        eq('a → Z; b → X; c → Y', $right['correctAnswer']);
        eq(false, QuizGrader::grade($match, [], [0, 1, 2])['correct']);
    },
    'malformed match answers are wrong, not errors' => function () use ($match) {
        foreach ([[2, 0], [2, 0, 9], [2, 0, '1'], 'abc', null, [-1, 0, 1]] as $bad) {
            $g = QuizGrader::grade($match, [], $bad);
            eq(false, $g['correct']);
            eq(null, $g['answer']);
        }
    },
    'normalize collapses whitespace and strips quotes' => function () {
        eq('a d c b', QuizGrader::normalize("  A   D\tC  B "));
        ok(QuizGrader::normalize('`[20, 40]`') === '[20, 40]');
    },
];
