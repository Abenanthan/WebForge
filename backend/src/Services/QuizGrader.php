<?php
declare(strict_types=1);

namespace WebForge\Services;

/**
 * Grades one answer against a question's answer key (see database/seed.sql):
 *   mcq | true_false | find_error : the chosen option id must be the option marked is_correct
 *   output                         : normalised text must equal one of payload.accepted
 *   match                          : list of right-hand indices, one per left item, equal to payload.answer
 * Pure logic, no database access, so it is easy to reason about and test.
 */
final class QuizGrader
{
    public const OPTION_TYPES = ['mcq', 'true_false', 'find_error'];

    /**
     * @param array $question {type, payload: ?array}
     * @param list<array{id:int,label:string,is_correct:bool}> $options
     * @return array{correct:bool, answer:mixed, yourAnswer:?string, correctAnswer:string}
     */
    public static function grade(array $question, array $options, mixed $answer): array
    {
        $type = $question['type'];
        $payload = $question['payload'] ?? [];

        if (in_array($type, self::OPTION_TYPES, true)) {
            $correctOption = null;
            $chosen = null;
            foreach ($options as $o) {
                if ($o['is_correct']) {
                    $correctOption = $o;
                }
                if (is_int($answer) && $o['id'] === $answer) {
                    $chosen = $o;
                }
            }
            return [
                'correct'       => $chosen !== null && $chosen['is_correct'],
                'answer'        => $chosen['id'] ?? null,
                'yourAnswer'    => $chosen['label'] ?? null,
                'correctAnswer' => $correctOption['label'] ?? '',
            ];
        }

        if ($type === 'output') {
            $text = is_string($answer) ? mb_substr($answer, 0, 200) : null;
            $accepted = array_map([self::class, 'normalize'], $payload['accepted'] ?? []);
            $given = $text === null ? null : self::normalize($text);
            return [
                'correct'       => $given !== null && $given !== '' && in_array($given, $accepted, true),
                'answer'        => $text,
                'yourAnswer'    => $text === null || trim($text) === '' ? null : trim($text),
                'correctAnswer' => (string) ($payload['accepted'][0] ?? ''),
            ];
        }

        if ($type === 'match') {
            $left = $payload['left'] ?? [];
            $right = $payload['right'] ?? [];
            $key = $payload['answer'] ?? [];
            $valid = is_array($answer) && array_is_list($answer) && count($answer) === count($left)
                && array_reduce($answer, static fn(bool $ok, $v) => $ok && is_int($v) && $v >= 0 && $v < count($right), true);
            $describe = static fn(array $map) => implode('; ', array_map(
                static fn($l, $r) => $l . ' → ' . ($right[$r] ?? '?'),
                $left,
                $map,
            ));
            return [
                'correct'       => $valid && $answer === $key,
                'answer'        => $valid ? $answer : null,
                'yourAnswer'    => $valid ? $describe($answer) : null,
                'correctAnswer' => $describe($key),
            ];
        }

        throw new \LogicException("Unknown question type '$type'");
    }

    /** Trim, collapse whitespace, lower-case and strip surrounding quotes. */
    public static function normalize(string $value): string
    {
        $v = mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $value)));
        return trim($v, "\"'` ");
    }
}
