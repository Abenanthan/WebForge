<?php
declare(strict_types=1);

namespace WebForge\Repositories;

use WebForge\Core\Db;

final class UserRepository
{
    public function __construct(private readonly Db $db)
    {
    }

    public function findByEmail(string $email): ?array
    {
        return $this->db->one(
            'SELECT id, name, email, password_hash, role FROM users WHERE email = ?',
            [$email],
            'Find user by email',
        );
    }

    public function findPublic(int $id): ?array
    {
        return $this->db->one(
            'SELECT id, name, email, role, created_at, last_login_at FROM users WHERE id = ?',
            [$id],
            'Load user profile',
        );
    }

    public function emailExists(string $email): bool
    {
        return $this->db->one('SELECT 1 AS found FROM users WHERE email = ?', [$email], 'Check email is unique') !== null;
    }

    public function create(string $name, string $email, string $passwordHash): int
    {
        $this->db->run(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
            [$name, $email, $passwordHash],
            'INSERT new user',
        );
        return $this->db->lastInsertId();
    }

    public function touchLogin(int $id): void
    {
        $this->db->run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$id], 'Record login time');
    }

    public function updatePasswordHash(int $id, string $hash): void
    {
        $this->db->run('UPDATE users SET password_hash = ? WHERE id = ?', [$hash, $id], 'Rehash password');
    }

    // --- brute-force throttling -------------------------------------------

    /** @return array{ip:int, email:int} failures in the last $minutes */
    public function recentFailures(string $ip, string $email, int $minutes): array
    {
        $row = $this->db->one(
            'SELECT
                SUM(ip_address = ?) AS ip_failures,
                SUM(email = ?)      AS email_failures
             FROM login_attempts
             WHERE attempted_at > (NOW() - INTERVAL ? MINUTE)
               AND (ip_address = ? OR email = ?)',
            [$ip, $email, $minutes, $ip, $email],
            'Count recent failed logins',
        );
        return ['ip' => (int) ($row['ip_failures'] ?? 0), 'email' => (int) ($row['email_failures'] ?? 0)];
    }

    public function recordFailure(string $ip, string $email): void
    {
        $this->db->run('INSERT INTO login_attempts (ip_address, email) VALUES (?, ?)', [$ip, $email], 'Log failed login');
    }

    public function clearFailures(string $email): void
    {
        $this->db->run('DELETE FROM login_attempts WHERE email = ?', [$email], 'Clear failed logins');
    }
}
