<?php
declare(strict_types=1);

namespace WebForge\Core;

/**
 * Hardened native PHP session + CSRF synchronizer token.
 *
 * Layout of $_SESSION:
 *   auth    => ['userId', 'name', 'email', 'role', 'loginAt']   (set on login)
 *   csrf    => random token, required in X-CSRF-Token on mutating requests
 *   created => unix time, lastSeen => unix time (idle timeout)
 *   lab     => reserved for the Session Demonstrator (Phase 6)
 */
final class Session
{
    private bool $expired = false;

    public function __construct(private readonly array $config)
    {
    }

    public function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.sid_length', '48');
        ini_set('session.sid_bits_per_character', '6');
        session_name($this->config['name']);
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off'),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();

        $now = time();
        $idle = $this->config['idle_minutes'] * 60;
        if (isset($_SESSION['lastSeen']) && $now - $_SESSION['lastSeen'] > $idle) {
            $this->expired = isset($_SESSION['auth']);
            $_SESSION = [];
            session_regenerate_id(true);
        }
        $_SESSION['created'] ??= $now;
        $_SESSION['lastSeen'] = $now;
    }

    /** True when this request found (and cleared) an idle-expired login. */
    public function wasExpired(): bool
    {
        return $this->expired;
    }

    public function user(): ?array
    {
        return $_SESSION['auth'] ?? null;
    }

    public function userId(): ?int
    {
        return isset($_SESSION['auth']['userId']) ? (int) $_SESSION['auth']['userId'] : null;
    }

    /** Called after credentials are verified. New id prevents session fixation. */
    public function login(array $user): void
    {
        session_regenerate_id(true);
        $_SESSION['auth'] = [
            'userId'  => (int) $user['id'],
            'name'    => $user['name'],
            'email'   => $user['email'],
            'role'    => $user['role'],
            'loginAt' => time(),
        ];
        $this->rotateCsrf();
    }

    public function logout(): void
    {
        $_SESSION = [];
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 3600,
            'path'     => $p['path'],
            'secure'   => $p['secure'],
            'httponly' => true,
            'samesite' => $p['samesite'],
        ]);
        session_destroy();
    }

    public function csrfToken(): string
    {
        return $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    }

    public function verifyCsrf(?string $token): bool
    {
        return isset($_SESSION['csrf']) && is_string($token) && hash_equals($_SESSION['csrf'], $token);
    }

    private function rotateCsrf(): void
    {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}
