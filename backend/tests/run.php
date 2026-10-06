<?php
declare(strict_types=1);

/**
 * Backend unit tests (no database or web server needed).
 *   php tests/run.php
 * Live API security tests (needs Apache + MySQL running): php tests/api-security.php
 */

require dirname(__DIR__) . '/src/bootstrap.php';
require __DIR__ . '/lib.php';

$suites = [];
foreach (glob(__DIR__ . '/unit/*Test.php') as $file) {
    $suites[basename($file, '.php')] = require $file;
}
exit(WebForge\Tests\run($suites));
