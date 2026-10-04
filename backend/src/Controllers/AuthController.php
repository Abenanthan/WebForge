<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;
use WebForge\Repositories\UserRepository;

final class AuthController
{
    private const THROTTLE_MINUTES = 15;
    private const MAX_EMAIL_FAILURES = 5;
    private const MAX_IP_FAILURES = 20;
    /** bcrypt hash of a random discarded string, verified against when the email is unknown. */
    private const TIMING_DUMMY_HASH = '$2y$10$0kFgC/PY5/D5ouHesDc1hurYtblRrLdSIVfmX46QVXEpxFFv5S2WK';

    private readonly UserRepository $users;

    public function __construct(private readonly App $app)
    {
        $this->users = new UserRepository($app->db);
    }

    /** GET /api/auth/csrf: issue (or return) the CSRF token for this session. */
    public function csrf(Request $req): Response
    {
        return Response::ok(['csrfToken' => $this->app->session->csrfToken()]);
    }

    /** GET /api/auth/me: current user (or null) plus CSRF token; used on SPA start-up. */
    public function me(Request $req): Response
    {
        $session = $this->app->session;
        $user = null;
        if ($session->userId() !== null) {
            $user = $this->users->findPublic($session->userId());
            if ($user === null) {           // account deleted while logged in
                $session->logout();
                $session->start();
            }
        }
        return Response::ok([
            'user'           => $user ? self::publicUser($user) : null,
            'csrfToken'      => $session->csrfToken(),
            'sessionExpired' => $session->wasExpired(),
        ]);
    }

    /** POST /api/auth/register */
    public function register(Request $req): Response
    {
        $tracer = $this->app->tracer;
        $data = Validator::check($req->json(), [
            'name'     => ['required', 'string', 'min:2', 'max:80', 'name'],
            'email'    => ['required', 'string', 'email', 'max:190'],
            'password' => ['required', 'string', 'min:8', 'max:72', 'password'],
        ], $tracer);
        $email = mb_strtolower($data['email']);

        if ($this->users->emailExists($email)) {
            throw new HttpException(409, 'EMAIL_TAKEN', 'An account with this email already exists.', [
                'email' => 'This email is already registered.',
            ]);
        }

        $hash = $tracer->step('server', 'Hash password (bcrypt)', fn() => password_hash($data['password'], PASSWORD_DEFAULT));
        $id = $this->users->create($data['name'], $email, $hash);
        $user = ['id' => $id, 'name' => $data['name'], 'email' => $email, 'role' => 'student'];

        $tracer->step('server', 'Create authenticated session', fn() => $this->app->session->login($user));

        return Response::ok([
            'user'      => self::publicUser($this->users->findPublic($id)),
            'csrfToken' => $this->app->session->csrfToken(),
        ], 201);
    }

    /** POST /api/auth/login */
    public function login(Request $req): Response
    {
        $tracer = $this->app->tracer;
        $data = Validator::check($req->json(), [
            'email'    => ['required', 'string', 'email', 'max:190'],
            'password' => ['required', 'string', 'max:200'],
        ], $tracer);
        $email = mb_strtolower($data['email']);
        $ip = $req->ip();

        $failures = $this->users->recentFailures($ip, $email, self::THROTTLE_MINUTES);
        if ($failures['email'] >= self::MAX_EMAIL_FAILURES || $failures['ip'] >= self::MAX_IP_FAILURES) {
            throw new HttpException(429, 'TOO_MANY_ATTEMPTS',
                'Too many failed login attempts. Try again in ' . self::THROTTLE_MINUTES . ' minutes.');
        }

        $user = $this->users->findByEmail($email);
        // Always run password_verify so response time does not reveal whether the email exists.
        $valid = $tracer->step('server', 'Verify password (bcrypt)', static fn() => password_verify(
            $data['password'],
            $user['password_hash'] ?? self::TIMING_DUMMY_HASH,
        ));

        if ($user === null || !$valid) {
            $this->users->recordFailure($ip, $email);
            throw new HttpException(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
        }

        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $this->users->updatePasswordHash((int) $user['id'], password_hash($data['password'], PASSWORD_DEFAULT));
        }
        $this->users->clearFailures($email);
        $this->users->touchLogin((int) $user['id']);
        $tracer->step('server', 'Create authenticated session', fn() => $this->app->session->login($user));

        return Response::ok([
            'user'      => self::publicUser($this->users->findPublic((int) $user['id'])),
            'csrfToken' => $this->app->session->csrfToken(),
        ]);
    }

    /** POST /api/auth/logout */
    public function logout(Request $req): Response
    {
        $this->app->tracer->step('server', 'Destroy session', fn() => $this->app->session->logout());
        return Response::ok(['loggedOut' => true]);
    }

    private static function publicUser(array $u): array
    {
        return [
            'id'          => (int) $u['id'],
            'name'        => $u['name'],
            'email'       => $u['email'],
            'role'        => $u['role'],
            'createdAt'   => $u['created_at'] ?? null,
            'lastLoginAt' => $u['last_login_at'] ?? null,
        ];
    }
}
