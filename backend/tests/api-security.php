<?php
declare(strict_types=1);

/**
 * Live security tests against the running API (Apache + MySQL must be up).
 *   php tests/api-security.php            (default: http://localhost/webforge/api)
 *   WEBFORGE_API=http://host/webforge/api php tests/api-security.php
 *
 * Uses the demo account plus a throw-away second account (deleted at the end)
 * to check authentication, CSRF, per-user isolation, injection and abuse limits.
 */

use WebForge\Core\Router;
use function WebForge\Tests\{eq, ok, run};

$config = require dirname(__DIR__) . '/src/bootstrap.php';
require __DIR__ . '/lib.php';

const DEMO_EMAIL = 'demo@webforge.local';
const DEMO_PASSWORD = 'Demo@1234';
$base = rtrim(getenv('WEBFORGE_API') ?: 'http://localhost/webforge/api', '/');

$pdo = new PDO(
    "mysql:host={$config['db']['host']};port={$config['db']['port']};dbname={$config['db']['name']};charset=utf8mb4",
    $config['db']['user'],
    $config['db']['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

/** A browser-like client: in-memory cookie jar, JSON in/out, optional CSRF token. */
final class Client
{
    private \CurlHandle $ch;
    public ?string $csrf = null;

    public function __construct(private readonly string $base)
    {
        $this->ch = curl_init();
        curl_setopt($this->ch, CURLOPT_COOKIEFILE, ''); // in-memory cookie engine (nothing written to disk)
    }

    /** @return array{status:int, json:?array, headers:array<string,list<string>>} */
    public function request(string $method, string $path, mixed $body = null, bool $withCsrf = true, ?string $raw = null): array
    {
        $headers = ['Accept: application/json'];
        if ($withCsrf && $this->csrf !== null && $method !== 'GET') {
            $headers[] = 'X-CSRF-Token: ' . $this->csrf;
        }
        $payload = $raw ?? ($body === null ? null : json_encode($body));
        if ($payload !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        $responseHeaders = [];
        curl_setopt_array($this->ch, [
            CURLOPT_URL            => $this->base . $path,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPGET        => $method === 'GET',
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$responseHeaders): int {
                if (str_contains($line, ':')) {
                    [$k, $v] = explode(':', $line, 2);
                    $responseHeaders[strtolower(trim($k))][] = trim($v);
                }
                return strlen($line);
            },
        ]);
        if ($method === 'GET') {
            curl_setopt($this->ch, CURLOPT_POSTFIELDS, null);
        }
        $text = curl_exec($this->ch);
        if ($text === false) {
            throw new RuntimeException('API unreachable: ' . curl_error($this->ch));
        }
        return ['status' => curl_getinfo($this->ch, CURLINFO_RESPONSE_CODE), 'json' => json_decode($text, true), 'headers' => $responseHeaders];
    }

    public function login(string $email, string $password): array
    {
        $this->csrf = $this->request('GET', '/auth/csrf')['json']['data']['csrfToken'];
        $r = $this->request('POST', '/auth/login', ['email' => $email, 'password' => $password]);
        $this->csrf = $r['json']['data']['csrfToken'] ?? $this->csrf;
        return $r;
    }
}

function data(array $r): mixed
{
    ok($r['json']['ok'] ?? false, 'expected ok:true, got HTTP ' . $r['status'] . ' ' . json_encode($r['json']['error'] ?? null));
    return $r['json']['data'];
}

// ---------------------------------------------------------------------------
// Fixtures: the demo user (A) and a fresh second user (B)

$pdo->exec("DELETE FROM login_attempts WHERE email IN ('" . DEMO_EMAIL . "')");
$a = new Client($base);
eq(200, $a->login(DEMO_EMAIL, DEMO_PASSWORD)['status'], 'demo login (is the demo account set up?)');

$bEmail = 'security.test.' . bin2hex(random_bytes(4)) . '@example.com';
$b = new Client($base);
$b->csrf = $b->request('GET', '/auth/csrf')['json']['data']['csrfToken'];
$registered = $b->request('POST', '/auth/register', ['name' => 'Security Test', 'email' => $bEmail, 'password' => 'Sec-Test-1!']);
$b->csrf = $registered['json']['data']['csrfToken'] ?? null;

$owned = []; // what user A creates, to try from user B and to clean up
$cleanup = function () use ($a, $pdo, $bEmail, &$owned): void {
    if (isset($owned['project'])) $a->request('DELETE', "/projects/{$owned['project']}");
    if (isset($owned['trace'])) $a->request('DELETE', "/traces/{$owned['trace']}");
    if (isset($owned['file'])) $a->request('DELETE', "/lab/files/{$owned['file']}");
    if (isset($owned['contact'])) $a->request('DELETE', "/lab/db/contacts/{$owned['contact']}");
    if (isset($owned['attempt'])) $pdo->prepare('DELETE FROM quiz_attempts WHERE id = ?')->execute([$owned['attempt']]);
    $pdo->prepare('DELETE FROM users WHERE email = ?')->execute([$bEmail]); // cascades to all of B's rows
    $pdo->exec("DELETE FROM login_attempts WHERE email LIKE 'nobody.%@example.com'");
    $pdo->exec("DELETE FROM rate_limit_hits WHERE bucket = 'register' AND hit_at > NOW() - INTERVAL 1 MINUTE");
};

$tests = [
    'second test account was created' => function () use ($registered) {
        eq(201, $registered['status'], 'register: ' . json_encode($registered['json']['error'] ?? null));
    },

    'API responses carry security headers' => function () use ($a) {
        $h = $a->request('GET', '/health')['headers'];
        eq("default-src 'none'; frame-ancestors 'none'", $h['content-security-policy'][0] ?? null);
        eq('DENY', $h['x-frame-options'][0] ?? null);
        eq('nosniff', $h['x-content-type-options'][0] ?? null);
        eq('same-origin', $h['cross-origin-resource-policy'][0] ?? null);
        eq('no-store', $h['cache-control'][0] ?? null);
    },

    'the session cookie is HttpOnly and SameSite=Lax' => function () use ($base) {
        $c = new Client($base);
        $cookie = implode("\n", $c->request('GET', '/auth/csrf')['headers']['set-cookie'] ?? []);
        ok(stripos($cookie, 'httponly') !== false, "HttpOnly missing: $cookie");
        ok(stripos($cookie, 'samesite=lax') !== false, "SameSite=Lax missing: $cookie");
    },

    'every protected route rejects anonymous requests' => function () use ($base) {
        $router = new Router();
        (require dirname(__DIR__) . '/src/routes.php')($router);
        $anon = new Client($base);
        $sample = ['id' => '1', 'uid' => '11111111-2222-4333-8444-555555555555', 'slug' => 'javascript-core',
            'name' => 'notes.txt', 'code' => '200'];
        $checked = 0;
        foreach ($router->routes() as $r) {
            if (!($r['options']['auth'] ?? false)) continue;
            $path = preg_replace_callback('/\{(\w+)\}/', static fn($m) => $sample[$m[1]] ?? 'x', substr($r['pattern'], 4));
            $res = $anon->request($r['method'], $path, $r['method'] === 'GET' ? null : []);
            // GET → 401 (no login). Writes are stopped even earlier by the CSRF check (403).
            $expected = $r['method'] === 'GET' ? [401] : [401, 403];
            ok(in_array($res['status'], $expected, true), "{$r['method']} {$r['pattern']} returned {$res['status']}");
            eq(null, $res['json']['data'] ?? null, "{$r['method']} {$r['pattern']} leaked data");
            $checked++;
        }
        ok($checked > 40, "only $checked protected routes found");
    },

    'logged-in writes without the CSRF token are refused' => function () use ($a) {
        $r = $a->request('POST', '/projects', ['title' => 'x', 'type' => 'web', 'files' => []], false);
        eq(403, $r['status']);
        eq('CSRF_INVALID', $r['json']['error']['code']);
        $r = $a->request('DELETE', '/traces/11111111-2222-4333-8444-555555555555', null, false);
        eq(403, $r['status']);
    },

    'user B cannot read, change or delete user A\'s data' => function () use ($a, $b, &$owned) {
        $owned['project'] = data($a->request('POST', '/projects', ['title' => 'Security test', 'type' => 'web',
            'files' => [['filename' => 'index.html', 'content' => '<p>secret</p>']]]))['id'];
        $owned['trace'] = data($a->request('POST', '/traces', ['traceId' => '9e0b8a1c-0000-4000-8000-' . bin2hex(random_bytes(6)),
            'module' => 'api', 'label' => 'Security test', 'status' => 'success',
            'steps' => [['layer' => 'ui', 'name' => 'x', 'startedMs' => 0, 'durationMs' => 1]]]))['traceId'];
        $owned['attempt'] = data($a->request('POST', '/quizzes/javascript-core/attempts', ['answers' => new stdClass()]))['id'];
        $owned['file'] = 'security-test.txt';
        $a->request('DELETE', '/lab/files/security-test.txt');
        data($a->request('POST', '/lab/files', ['name' => $owned['file'], 'content' => 'secret']));
        $owned['contact'] = data($a->request('POST', '/lab/db/contacts', ['name' => 'Security Test', 'email' => 'sec@example.com']))['id'];

        foreach ([
            ['GET', "/projects/{$owned['project']}"], ['PUT', "/projects/{$owned['project']}"], ['PATCH', "/projects/{$owned['project']}"],
            ['DELETE', "/projects/{$owned['project']}"], ['GET', "/traces/{$owned['trace']}"], ['DELETE', "/traces/{$owned['trace']}"],
            ['GET', "/attempts/{$owned['attempt']}"], ['PUT', "/lab/db/contacts/{$owned['contact']}"], ['DELETE', "/lab/db/contacts/{$owned['contact']}"],
            ['GET', "/lab/files/{$owned['file']}"],
        ] as [$method, $path]) {
            $body = in_array($method, ['PUT', 'PATCH'], true)
                ? ['title' => 'pwned', 'name' => 'Pwned Name', 'email' => 'p@example.com', 'files' => [['filename' => 'index.html', 'content' => 'x']]]
                : null;
            $r = $b->request($method, $path, $body);
            eq(404, $r['status'], "B: $method $path");
        }
        // Nothing of A's appears in B's lists, and A's data is untouched.
        ok(!in_array($owned['project'], array_column(data($b->request('GET', '/projects')), 'id'), true), 'project listed for B');
        eq([], data($b->request('GET', '/traces'))['traces'], 'B sees traces');
        eq([], data($b->request('GET', '/lab/files'))['files'] ?? data($b->request('GET', '/lab/files')), 'B sees files');
        eq('Security test', data($a->request('GET', "/projects/{$owned['project']}"))['title']);
        eq('secret', data($a->request('GET', "/lab/files/{$owned['file']}"))['content'] ?? null);
    },

    'SQL injection payloads are treated as plain data' => function () use ($a) {
        $rows = data($a->request('GET', '/lab/db/contacts?search=' . rawurlencode("' OR '1'='1")))['rows'];
        eq([], $rows, 'the quote payload matched rows');
        $r = $a->request('GET', '/lab/db/contacts?sort=' . rawurlencode('name; DROP TABLE users'));
        eq(422, $r['status'], 'ORDER BY column is whitelisted');
        $r = $a->request('GET', '/traces?module=' . rawurlencode("x' OR 1=1 -- "));
        eq([], data($r)['traces']);
    },

    'file names cannot escape the per-user sandbox' => function () use ($a) {
        foreach (['../escape.txt', '..\\escape.txt', 'escape.php', '.htaccess', str_repeat('a', 60) . '.txt'] as $name) {
            $r = $a->request('POST', '/lab/files', ['name' => $name, 'content' => 'x']);
            eq(422, $r['status'], "create '$name'");
        }
        foreach (['..%2F..%2Fconfig%2Fconfig.php', '..%2F..%2F..%2Fbackend%2Fconfig%2F.env', '%2e%2e%2fsecret.txt'] as $path) {
            $r = $a->request('GET', "/lab/files/$path");
            ok(in_array($r['status'], [404, 422], true), "read $path returned {$r['status']}");
            ok(!str_contains(json_encode($r['json']), 'DB_PASS'), 'config content leaked');
        }
    },

    'oversized and malformed bodies are refused' => function () use ($a) {
        eq(413, $a->request('POST', '/projects', null, true, str_repeat('x', 3_200_000))['status']);
        $r = $a->request('POST', '/projects', null, true, '{not json');
        eq(400, $r['status']);
        eq('INVALID_JSON', $r['json']['error']['code']);
    },

    'quiz questions never reveal their answer keys' => function () use ($a) {
        $text = json_encode(data($a->request('GET', '/quizzes/html-css-fundamentals')));
        foreach (['is_correct', '"answer"', 'accepted', 'explanation', 'payload'] as $secret) {
            ok(!str_contains($text, $secret), "quiz payload contains $secret");
        }
    },

    'repeated failed logins are throttled' => function () use ($base) {
        $c = new Client($base);
        $email = 'nobody.' . bin2hex(random_bytes(3)) . '@example.com';
        $statuses = [];
        for ($i = 0; $i < 6; $i++) {
            $statuses[] = $c->login($email, 'Wrong-password-1')['status'];
        }
        eq([401, 401, 401, 401, 401, 429], $statuses);
    },

    'registration is rate limited per address' => function () use ($base, $pdo) {
        // Fill this address's quota directly, then one more registration must be refused.
        $stmt =$pdo->prepare("INSERT INTO rate_limit_hits (bucket, subject) VALUES ('register', ?)");
        foreach (['127.0.0.1', '::1'] as $ip) {
            for ($i = 0; $i < 10; $i++) $stmt->execute([$ip]);
        }
        $c = new Client($base);
        $c->csrf = $c->request('GET', '/auth/csrf')['json']['data']['csrfToken'];
        $r = $c->request('POST', '/auth/register', ['name' => 'Rate Limited', 'email' => 'rate.' . bin2hex(random_bytes(3)) . '@example.com', 'password' => 'Rate-Test-1!']);
        eq(429, $r['status']);
        eq('TOO_MANY_REQUESTS', $r['json']['error']['code']);
        eq('60', $r['headers']['retry-after'][0] ?? null);
    },
];

try {
    $code = run(['API security (' . $base . ')' => $tests]);
} finally {
    $cleanup();
}
exit($code);
