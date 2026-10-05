<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;
use WebForge\Services\ActivityService;

/**
 * Session Demonstrator. Uses a SEPARATE PHP session (its own cookie,
 * WEBFORGE_LAB_SID) so learners can log in, inspect, regenerate and destroy it
 * without touching their real WebForge login session.
 *
 * Flow: LOGIN → SESSION CREATED → AUTHENTICATED PAGE → SESSION DATA → LOGOUT → SESSION DESTROYED
 */
final class SessionLabController
{
    private const COOKIE = 'WEBFORGE_LAB_SID';
    private const MAX_VARS = 8;

    /** @var list<array{step:string, php:string, result:string}> */
    private array $log = [];

    public function __construct(private readonly App $app)
    {
    }

    /** GET /api/lab/session/state */
    public function state(Request $req): Response
    {
        $this->open(false);
        $state = $this->describe();
        $this->close();
        return $this->respond($state);
    }

    /** POST /api/lab/session/login  {password}: re-enter your WebForge password */
    public function login(Request $req): Response
    {
        $data = Validator::check($req->json(), ['password' => ['required', 'string', 'max:200']], $this->app->tracer);

        $row = $this->app->db->one('SELECT name, password_hash FROM users WHERE id = ?', [$this->app->userId()], 'SELECT password_hash for the logged-in user');
        $ok = $this->app->tracer->step('server', 'password_verify()', static fn() => password_verify($data['password'], $row['password_hash'] ?? ''));
        $this->note('Check credentials', 'password_verify($password, $row["password_hash"])', $ok ? 'true' : 'false');
        if (!$ok) {
            throw new HttpException(401, 'INVALID_CREDENTIALS', 'Password does not match your account.');
        }

        $this->open(true);
        $oldId = session_id();
        session_regenerate_id(true);
        $this->note('Prevent session fixation', 'session_regenerate_id(true)', self::preview($oldId) . ' → ' . self::preview(session_id()));
        $_SESSION['lab'] = [
            'user'      => $row['name'],
            'loginAt'   => time(),
            'lastSeen'  => time(),
            'createdAt' => $_SESSION['lab']['createdAt'] ?? time(),
            'requests'  => 1,
            'vars'      => [],
        ];
        $this->note('Store login state', '$_SESSION["user"] = $row["name"]', var_export($row['name'], true));
        $state = $this->describe();
        $this->close();

        (new ActivityService($this->app))->recordRun('php-sessions', 'success', ['step' => 'login']);
        return $this->respond($state);
    }

    /** GET /api/lab/session/protected: the "authenticated page" */
    public function protectedPage(Request $req): Response
    {
        $this->open(false);
        $user = $_SESSION['lab']['user'] ?? null;
        $this->note('Guard the page', 'if (!isset($_SESSION["user"])) { http_response_code(401); exit; }', $user ? 'allowed' : 'blocked');
        if ($user === null) {
            $this->close();
            throw new HttpException(401, 'LAB_NOT_LOGGED_IN', 'No lab session login: this page is only for logged-in visitors.');
        }
        $state = $this->describe();
        $this->close();
        return $this->respond($state, ['page' => "Welcome back, {$user}. This content was rendered only because \$_SESSION says you are logged in."]);
    }

    /** POST /api/lab/session/data  {key, value}: store something in the session */
    public function setData(Request $req): Response
    {
        $data = Validator::check($req->json(), [
            'key'   => ['required', 'string', 'regex:/^[a-z][a-z0-9_]{0,19}$/'],
            'value' => ['required', 'string', 'max:100'],
        ], $this->app->tracer);

        $this->open(false);
        if (!isset($_SESSION['lab']['user'])) {
            $this->close();
            throw new HttpException(401, 'LAB_NOT_LOGGED_IN', 'Log in to the lab session first.');
        }
        $vars = $_SESSION['lab']['vars'];
        if (!isset($vars[$data['key']]) && count($vars) >= self::MAX_VARS) {
            $this->close();
            throw new HttpException(422, 'VALIDATION_FAILED', 'At most ' . self::MAX_VARS . ' session variables.', ['key' => 'Remove a variable first.']);
        }
        $_SESSION['lab']['vars'][$data['key']] = $data['value'];
        $this->note('Write session data', "\$_SESSION[\"{$data['key']}\"] = " . var_export($data['value'], true), 'stored on the server, not in the cookie');
        $state = $this->describe();
        $this->close();
        return $this->respond($state);
    }

    /** POST /api/lab/session/logout: destroy the lab session completely */
    public function logout(Request $req): Response
    {
        $this->open(false);
        $id = session_id();
        $_SESSION = [];
        $this->note('Clear the data', '$_SESSION = []', 'empty');
        $params = session_get_cookie_params();
        setcookie(self::COOKIE, '', ['expires' => time() - 3600, 'path' => $params['path'], 'httponly' => true, 'samesite' => 'Lax']);
        $this->note('Expire the cookie', 'setcookie(session_name(), "", time() - 3600)', 'browser deletes ' . self::COOKIE);
        session_destroy();
        $this->note('Delete server storage', 'session_destroy()', 'session ' . self::preview($id) . ' no longer exists');

        (new ActivityService($this->app))->recordRun('php-sessions', 'success', ['step' => 'logout']);
        return $this->respond(['active' => false, 'loggedIn' => false, 'destroyed' => true, 'cookie' => self::COOKIE]);
    }

    // ---------------------------------------------------------------------

    /**
     * Switch from the (already released) WebForge session to the lab session.
     * A new lab session is only created when $create is true (login).
     */
    private function open(bool $create): void
    {
        $this->app->session->release();
        $cookie = $_COOKIE[self::COOKIE] ?? null;
        $hasCookie = is_string($cookie) && preg_match('/^[A-Za-z0-9,-]{22,256}$/', $cookie) === 1;
        if (!$hasCookie && !$create) {
            $this->note('Look for the session cookie', 'isset($_COOKIE["' . self::COOKIE . '"])', 'false: no session yet');
            return;
        }
        // The id MUST be set explicitly: after session_write_close() PHP still remembers the
        // WebForge session's id, and session_start() would otherwise reopen (and the later
        // session_regenerate_id(true) would delete) the user's real login session.
        // Strict mode replaces any unknown/forged id with a fresh one.
        session_name(self::COOKIE);
        session_id($hasCookie ? $cookie : session_create_id());
        session_start();
        $this->note('Resume or start the session', 'session_start()', 'id ' . self::preview(session_id()) . ($hasCookie ? ' (from cookie)' : ' (new)'));
        if (isset($_SESSION['lab'])) {
            $_SESSION['lab']['requests']++;
            $_SESSION['lab']['lastSeen'] = time();
        }
    }

    private function close(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
    }

    private function describe(): array
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            return ['active' => false, 'loggedIn' => false, 'cookie' => self::COOKIE];
        }
        $lab = $_SESSION['lab'] ?? null;
        return [
            'active'      => true,
            'loggedIn'    => isset($lab['user']),
            'cookie'      => self::COOKIE,
            'idPreview'   => self::preview(session_id()),
            'user'        => $lab['user'] ?? null,
            'loginAt'     => isset($lab['loginAt']) ? date('H:i:s', $lab['loginAt']) : null,
            'lastSeen'    => isset($lab['lastSeen']) ? date('H:i:s', $lab['lastSeen']) : null,
            'requests'    => $lab['requests'] ?? 0,
            'vars'        => (object) ($lab['vars'] ?? []),
            'settings'    => [
                'session.save_handler'    => ini_get('session.save_handler'),
                'session.gc_maxlifetime'  => ini_get('session.gc_maxlifetime') . ' s',
                'session.cookie_httponly' => (bool) ini_get('session.cookie_httponly') ? 'on' : 'off',
                'session.use_strict_mode' => ini_get('session.use_strict_mode') ? 'on' : 'off',
            ],
        ];
    }

    private function respond(array $state, array $extra = []): Response
    {
        return Response::ok(['session' => $state, 'log' => $this->log] + $extra);
    }

    private function note(string $step, string $php, string $result): void
    {
        $this->log[] = ['step' => $step, 'php' => $php, 'result' => $result];
        $this->app->tracer->note('server', $step, ['php' => $php, 'result' => $result]);
    }

    /** Never reveal a full session id: it is a bearer credential. */
    private static function preview(string $id): string
    {
        return $id === '' ? '(none)' : substr($id, 0, 6) . '…' . substr($id, -4);
    }
}
