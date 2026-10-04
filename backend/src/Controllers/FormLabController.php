<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;

/**
 * Form Validation Lab: server-side counterpart of the browser checks.
 * Reports every rule for every field, including checks only the server can
 * perform (database uniqueness) and that the client cannot be trusted with.
 * Values are never echoed back; passwords are never logged.
 */
final class FormLabController
{
    private const RULES = [
        'name'     => ['required', 'string', 'min:2', 'max:80', 'name'],
        'email'    => ['required', 'string', 'email', 'max:190'],
        'password' => ['required', 'string', 'min:8', 'max:72', 'password'],
        'confirm'  => ['required', 'string'],
        'age'      => ['required', 'int', 'between:13,120'],
        'pincode'  => ['required', 'regex:/^[1-9][0-9]{5}$/'],
        'username' => ['required', 'string', 'regex:/^[a-z0-9_]{3,20}$/'],
    ];

    private const RESERVED_USERNAMES = ['admin', 'root', 'webforge', 'support', 'system', 'null', 'undefined'];

    public function __construct(private readonly App $app)
    {
    }

    /** POST /api/lab/forms/validate */
    public function validate(Request $req): Response
    {
        $tracer = $this->app->tracer;
        $input = $req->json();

        $report = $tracer->step('validation', 'Apply declarative rules (Validator::report)',
            static fn() => Validator::report($input, self::RULES),
            ['rules' => self::RULES]);

        // Custom rules that need context the browser does not have (or must not be trusted with).
        $tracer->step('validation', 'Custom rule: password confirmation matches', function () use ($input, &$report): void {
            $matches = is_string($input['password'] ?? null) && ($input['password'] ?? null) === ($input['confirm'] ?? null);
            $report['confirm'][] = ['rule' => 'same:password', 'passed' => $matches, 'message' => $matches ? null : 'Passwords do not match.'];
        });

        $tracer->step('validation', 'Custom rule: username is not reserved', function () use ($input, &$report): void {
            $reserved = in_array(strtolower(trim((string) ($input['username'] ?? ''))), self::RESERVED_USERNAMES, true);
            $report['username'][] = ['rule' => 'not_reserved', 'passed' => !$reserved, 'message' => $reserved ? 'This username is reserved.' : null];
        });

        $email = is_string($input['email'] ?? null) ? mb_strtolower(trim($input['email'])) : '';
        $emailFormatOk = !in_array(false, array_column($report['email'], 'passed'), true);
        if ($emailFormatOk && $email !== '') {
            $taken = $this->app->db->one('SELECT 1 AS taken FROM users WHERE email = ?', [$email], 'Custom rule: email is not already registered') !== null;
            $report['email'][] = ['rule' => 'unique:users,email', 'passed' => !$taken, 'message' => $taken ? 'An account with this email already exists.' : null];
        } else {
            $report['email'][] = ['rule' => 'unique:users,email', 'passed' => true, 'message' => null, 'skipped' => true];
        }

        $errors = [];
        foreach ($report as $field => $results) {
            foreach ($results as $r) {
                if (!$r['passed']) {
                    $errors[$field] = $r['message'];
                    break;
                }
            }
        }

        $tracer->note('server', 'Build validation response', [
            'fieldsChecked' => count($report),
            'rulesChecked'  => array_sum(array_map('count', $report)),
            'invalidFields' => array_keys($errors),
        ]);

        if ($errors !== []) {
            return Response::error(422, 'VALIDATION_FAILED', count($errors) . ' field(s) failed server-side validation.', $errors)
                ->withMeta('validation', $report);
        }
        return Response::ok([
            'valid'    => true,
            'message'  => 'All fields passed server-side validation. (Lab only: nothing was stored.)',
        ])->withMeta('validation', $report);
    }
}
