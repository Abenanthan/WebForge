<?php
declare(strict_types=1);

namespace WebForge\Core;

/**
 * Declarative server-side validation.
 *
 *   $clean = Validator::check($input, [
 *       'email'    => ['required', 'email', 'max:190'],
 *       'password' => ['required', 'min:8', 'password'],
 *   ], $tracer);
 *
 * Returns trimmed, whitelisted values only (unknown keys are dropped).
 * On failure throws HttpException 422 with per-field messages.
 * Each check is recorded as a "validation" trace step.
 */
final class Validator
{
    public static function check(array $input, array $rules, ?ServerTracer $tracer = null): array
    {
        $t0 = microtime(true);
        $clean = [];
        $errors = [];

        foreach ($rules as $field => $fieldRules) {
            $raw = $input[$field] ?? null;
            $value = is_string($raw) ? trim($raw) : $raw;
            $label = ucfirst(str_replace('_', ' ', $field));
            $present = $value !== null && $value !== '';

            foreach ($fieldRules as $rule) {
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                if ($name !== 'required' && !$present) {
                    continue; // optional and empty: skip remaining rules
                }
                $error = self::apply($name, $arg, $value, $label, $present);
                if ($error !== null) {
                    $errors[$field] = $error;
                    break;
                }
            }
            if (!isset($errors[$field]) && $present) {
                $clean[$field] = in_array('int', $fieldRules, true) ? (int) $value : $value;
            } elseif (!isset($errors[$field])) {
                $clean[$field] = null;
            }
        }

        $tracer?->note('validation', 'Server-side validation', [
            'fields' => array_keys($rules),
            'rules'  => $rules,
            'errors' => (object) $errors,
            'passed' => $errors === [],
        ], $t0, $errors === [] ? 'success' : 'error');

        if ($errors !== []) {
            throw new HttpException(422, 'VALIDATION_FAILED', 'Some fields are invalid.', $errors);
        }
        return $clean;
    }

    /**
     * Evaluate every applicable rule (not just the first failure) and report each outcome.
     * Used by the Form Validation Lab to show rule-by-rule results.
     *
     * @return array<string, list<array{rule:string, passed:bool, message:?string}>>
     */
    public static function report(array $input, array $rules): array
    {
        $report = [];
        foreach ($rules as $field => $fieldRules) {
            $raw = $input[$field] ?? null;
            $value = is_string($raw) ? trim($raw) : $raw;
            $label = ucfirst(str_replace('_', ' ', $field));
            $present = $value !== null && $value !== '';
            $report[$field] = [];
            foreach ($fieldRules as $rule) {
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                if ($name !== 'required' && !$present) {
                    $report[$field][] = ['rule' => $rule, 'passed' => true, 'message' => null, 'skipped' => true];
                    continue;
                }
                $error = self::apply($name, $arg, $value, $label, $present);
                $report[$field][] = ['rule' => $rule, 'passed' => $error === null, 'message' => $error];
            }
        }
        return $report;
    }

    private static function apply(string $name, ?string $arg, mixed $value, string $label, bool $present): ?string
    {
        if ($name !== 'required' && !is_scalar($value)) {
            return "$label has an invalid type.";
        }
        $str = is_scalar($value) ? (string) $value : '';
        return match ($name) {
            'required' => $present ? null : "$label is required.",
            'string'   => is_string($value) ? null : "$label must be text.",
            'email'    => filter_var($str, FILTER_VALIDATE_EMAIL) !== false ? null : "$label must be a valid email address.",
            'min'      => mb_strlen($str) >= (int) $arg ? null : "$label must be at least $arg characters.",
            'max'      => mb_strlen($str) <= (int) $arg ? null : "$label must be at most $arg characters.",
            'int'      => filter_var($str, FILTER_VALIDATE_INT) !== false ? null : "$label must be a whole number.",
            'between'  => self::between($str, (string) $arg) ? null : "$label must be between " . str_replace(',', ' and ', (string) $arg) . '.',
            'in'       => in_array($str, explode(',', (string) $arg), true) ? null : "$label must be one of: $arg.",
            'regex'    => preg_match((string) $arg, $str) === 1 ? null : "$label has an invalid format.",
            'name'     => preg_match("/^[\\p{L}][\\p{L} .'-]*$/u", $str) === 1 ? null : "$label may only contain letters, spaces, dots, apostrophes and hyphens.",
            'password' => self::strongPassword($str) ? null : "$label needs upper- and lower-case letters, a number and a symbol.",
            default    => throw new \LogicException("Unknown validation rule '$name'"),
        };
    }

    private static function between(string $value, string $arg): bool
    {
        [$min, $max] = array_map('intval', explode(',', $arg));
        return filter_var($value, FILTER_VALIDATE_INT) !== false && (int) $value >= $min && (int) $value <= $max;
    }

    private static function strongPassword(string $value): bool
    {
        return preg_match('/[a-z]/', $value) && preg_match('/[A-Z]/', $value)
            && preg_match('/\d/', $value) && preg_match('/[^a-zA-Z\d]/', $value);
    }
}
