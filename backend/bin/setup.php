<?php
declare(strict_types=1);

/**
 * One-command database setup (CLI only):
 *   php backend/bin/setup.php            -> create schema, load seed, create demo user
 *   php backend/bin/setup.php --no-demo  -> skip the demo user
 *
 * WARNING: drops and recreates the `webforge` database.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('CLI only');
}

$config = require dirname(__DIR__) . '/src/bootstrap.php';
$db = $config['db'];
$root = dirname(__DIR__, 2);

// Connect without a database name: schema.sql creates it.
$pdo = new PDO(
    "mysql:host={$db['host']};port={$db['port']};charset=utf8mb4",
    $db['user'],
    $db['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::MYSQL_ATTR_MULTI_STATEMENTS => true],
);

foreach (['schema.sql', 'seed.sql'] as $file) {
    $sql = file_get_contents("$root/database/$file");
    if ($sql === false) {
        fwrite(STDERR, "Cannot read database/$file\n");
        exit(1);
    }
    $stmt = $pdo->query($sql);
    // Drain every result set so errors in later statements surface here.
    do {
        $stmt->closeCursor();
    } while ($stmt->nextRowset());
    echo "✔ Imported database/$file\n";
}

$pdo->exec("USE `{$db['name']}`");

if (!in_array('--no-demo', $argv, true)) {
    $stmt = $pdo->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    $stmt->execute(['Demo Student', 'demo@webforge.local', password_hash('Demo@1234', PASSWORD_DEFAULT), 'student']);
    echo "✔ Demo user: demo@webforge.local / Demo@1234\n";
}

$counts = $pdo->query(
    'SELECT (SELECT COUNT(*) FROM concepts) c, (SELECT COUNT(*) FROM experiments) e,
            (SELECT COUNT(*) FROM quizzes) q, (SELECT COUNT(*) FROM quiz_questions) qq,
            (SELECT COUNT(*) FROM question_options) o'
)->fetch(PDO::FETCH_ASSOC);
printf("✔ Catalogue: %d concepts, %d experiments, %d quizzes, %d questions, %d options\n",
    $counts['c'], $counts['e'], $counts['q'], $counts['qq'], $counts['o']);

foreach (['sandbox', 'logs'] as $dir) {
    $path = $config['storage_dir'] . '/' . $dir;
    if (!is_dir($path) && !mkdir($path, 0775, true)) {
        fwrite(STDERR, "Cannot create $path\n");
        exit(1);
    }
}
echo "✔ Storage directories ready\n";
