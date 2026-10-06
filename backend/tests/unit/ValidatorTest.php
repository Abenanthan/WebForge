<?php
declare(strict_types=1);

use WebForge\Core\Validator;
use function WebForge\Tests\{eq, ok, throwsHttp};

$rules = [
    'name'  => ['required', 'string', 'min:2', 'max:80', 'name'],
    'email' => ['required', 'string', 'email', 'max:190'],
    'age'   => ['int', 'between:1,120'],
];

return [
    'trims values, casts ints and drops unknown keys' => function () use ($rules) {
        $clean = Validator::check(['name' => '  Asha Rao ', 'email' => 'a@b.co', 'age' => '21', 'isAdmin' => true], $rules);
        eq(['name' => 'Asha Rao', 'email' => 'a@b.co', 'age' => 21], $clean);
    },
    'optional empty fields become null' => function () use ($rules) {
        eq(null, Validator::check(['name' => 'Asha', 'email' => 'a@b.co', 'age' => ''], $rules)['age']);
    },
    'reports one message per invalid field (422)' => function () use ($rules) {
        $e = throwsHttp(fn() => Validator::check(['name' => 'A', 'email' => 'nope', 'age' => '200'], $rules), 422, 'VALIDATION_FAILED');
        eq('Name must be at least 2 characters.', $e->fields['name']);
        eq('Email must be a valid email address.', $e->fields['email']);
        eq('Age must be between 1 and 120.', $e->fields['age']);
    },
    'required fields must be present' => function () use ($rules) {
        $e = throwsHttp(fn() => Validator::check([], $rules), 422);
        eq('Name is required.', $e->fields['name']);
    },
    'non-scalar input is rejected, not coerced' => function () use ($rules) {
        $e = throwsHttp(fn() => Validator::check(['name' => ['Asha'], 'email' => 'a@b.co'], $rules), 422);
        eq('Name has an invalid type.', $e->fields['name']);
    },
    'name rule blocks markup and digits' => function () use ($rules) {
        $e = throwsHttp(fn() => Validator::check(['name' => '<script>', 'email' => 'a@b.co'], $rules), 422);
        ok(isset($e->fields['name']));
        eq("O'Brien-Smith Jr.", Validator::check(['name' => "O'Brien-Smith Jr.", 'email' => 'a@b.co'], $rules)['name']);
    },
    'password rule needs four character classes' => function () {
        $r = ['p' => ['password']];
        throwsHttp(fn() => Validator::check(['p' => 'alllowercase1!'], $r), 422);
        eq('Abcdef1!', Validator::check(['p' => 'Abcdef1!'], $r)['p']);
    },
    'in rule is an exact whitelist' => function () {
        throwsHttp(fn() => Validator::check(['dir' => 'asc; DROP TABLE users'], ['dir' => ['in:asc,desc']]), 422);
        eq('desc', Validator::check(['dir' => 'desc'], ['dir' => ['in:asc,desc']])['dir']);
    },
    'report() lists every rule outcome' => function () {
        $report = Validator::report(['email' => ''], ['email' => ['required', 'email']]);
        eq(false, $report['email'][0]['passed']);
        eq(true, $report['email'][1]['skipped'] ?? false);
    },
];
