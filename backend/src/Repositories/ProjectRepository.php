<?php
declare(strict_types=1);

namespace WebForge\Repositories;

use WebForge\Core\Db;

/** Every query is scoped by user_id, so users can only ever reach their own projects. */
final class ProjectRepository
{
    public function __construct(private readonly Db $db)
    {
    }

    public function listForUser(int $userId): array
    {
        return $this->db->all(
            'SELECT p.id, p.title, p.type, p.description, p.created_at, p.updated_at,
                    COUNT(f.id) AS file_count, COALESCE(SUM(CHAR_LENGTH(f.content)), 0) AS size_chars
             FROM projects p
             LEFT JOIN project_files f ON f.project_id = p.id
             WHERE p.user_id = ?
             GROUP BY p.id
             ORDER BY p.updated_at DESC',
            [$userId],
            'SELECT projects with file stats',
        );
    }

    public function find(int $userId, int $projectId): ?array
    {
        return $this->db->one(
            'SELECT id, title, type, description, created_at, updated_at
             FROM projects WHERE id = ? AND user_id = ?',
            [$projectId, $userId],
            'SELECT project (owner-scoped)',
        );
    }

    public function files(int $projectId): array
    {
        return $this->db->all(
            'SELECT filename, language, content, updated_at FROM project_files
             WHERE project_id = ? ORDER BY id',
            [$projectId],
            'SELECT project files',
        );
    }

    public function create(int $userId, string $title, string $type, ?string $description): int
    {
        $this->db->run(
            'INSERT INTO projects (user_id, title, type, description) VALUES (?, ?, ?, ?)',
            [$userId, $title, $type, $description],
            'INSERT project',
        );
        return $this->db->lastInsertId();
    }

    public function updateMeta(int $userId, int $projectId, string $title, ?string $description): void
    {
        $this->db->run(
            'UPDATE projects SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND user_id = ?',
            [$title, $description, $projectId, $userId],
            'UPDATE project details',
        );
    }

    public function touch(int $projectId): void
    {
        $this->db->run('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [$projectId], 'Touch project timestamp');
    }

    /** Replace the project's file set with $files (upsert + delete removed files). */
    public function replaceFiles(int $projectId, array $files): void
    {
        $names = [];
        foreach ($files as $f) {
            $this->db->run(
                'INSERT INTO project_files (project_id, filename, language, content) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE language = VALUES(language), content = VALUES(content)',
                [$projectId, $f['filename'], $f['language'], $f['content']],
                "UPSERT file {$f['filename']}",
            );
            $names[] = $f['filename'];
        }
        $placeholders = implode(',', array_fill(0, count($names), '?'));
        $this->db->run(
            "DELETE FROM project_files WHERE project_id = ? AND filename NOT IN ($placeholders)",
            [$projectId, ...$names],
            'DELETE files removed from project',
        );
    }

    public function delete(int $userId, int $projectId): bool
    {
        return $this->db->run(
            'DELETE FROM projects WHERE id = ? AND user_id = ?',
            [$projectId, $userId],
            'DELETE project (files cascade)',
        )->rowCount() > 0;
    }
}
