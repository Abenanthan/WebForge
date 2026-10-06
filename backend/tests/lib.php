<?php
declare(strict_types=1);

/**
 * A tiny, dependency-free test harness (no Composer/PHPUnit needed).
 * A suite is a file returning ['test name' => fn() => ..., ...].
 * Assertions throw TestFailure; any other exception also fails the test.
 */

namespace WebForge\Tests;

use WebForge\Core\HttpException;

final class TestFailure extends \Exception
{
}

function ok(bool $condition, string $message = 'expected condition to be true'): void
{
    if (!$condition) {
        throw new TestFailure($message);
    }
}

function eq(mixed $expected, mixed $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        throw new TestFailure(($message ? "$message: " : '') . 'expected ' . export($expected) . ', got ' . export($actual));
    }
}

/** Run $fn and require it to throw HttpException with the given status (and code). */
function throwsHttp(callable $fn, int $status, ?string $code = null): HttpException
{
    try {
        $fn();
    } catch (HttpException $e) {
        eq($status, $e->status, 'HTTP status');
        if ($code !== null) {
            eq($code, $e->errorCode, 'error code');
        }
        return $e;
    }
    throw new TestFailure("expected HttpException $status" . ($code ? " ($code)" : '') . ', nothing was thrown');
}

function export(mixed $v): string
{
    $s = json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return $s === false ? var_export($v, true) : (strlen($s) > 200 ? substr($s, 0, 200) . '…' : $s);
}

/**
 * Run suites and print a report.
 * @param array<string, array<string, callable>> $suites
 * @return int process exit code (0 = all passed)
 */
function run(array $suites): int
{
    $passed = 0;
    $failed = [];
    $started = microtime(true);
    foreach ($suites as $suite => $tests) {
        echo "\n$suite\n";
        foreach ($tests as $name => $test) {
            try {
                $test();
                $passed++;
                echo "  \u{2714} $name\n";
            } catch (\Throwable $e) {
                $failed[] = "$suite › $name";
                $where = $e instanceof TestFailure ? '' : ' [' . get_class($e) . ' @ ' . basename($e->getFile()) . ':' . $e->getLine() . ']';
                echo "  \u{2718} $name\n      " . $e->getMessage() . "$where\n";
            }
        }
    }
    $ms = round((microtime(true) - $started) * 1000);
    echo "\n" . ($failed ? "\u{2718} " . count($failed) . ' failed, ' : "\u{2714} ") . "$passed passed ({$ms} ms)\n";
    foreach ($failed as $f) {
        echo "   - $f\n";
    }
    return $failed ? 1 : 0;
}
