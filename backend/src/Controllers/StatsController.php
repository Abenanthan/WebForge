<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\Request;
use WebForge\Core\Response;

/** Aggregated, user-scoped figures for the main dashboard. */
final class StatsController
{
    public function __construct(private readonly App $app)
    {
    }

    /** GET /api/stats/dashboard */
    public function dashboard(Request $req): Response
    {
        $db = $this->app->db;
        $uid = $this->app->userId();

        $totals = $db->one(
            'SELECT
                (SELECT COUNT(DISTINCT experiment_id) FROM experiment_runs WHERE user_id = ? AND status = \'success\') AS experiments_completed,
                (SELECT COUNT(*) FROM experiment_runs WHERE user_id = ?) AS total_runs,
                (SELECT COUNT(*) FROM experiments) AS experiments_available,
                (SELECT COUNT(*) FROM projects WHERE user_id = ?) AS projects,
                (SELECT COUNT(*) FROM quiz_attempts WHERE user_id = ?) AS assessments,
                (SELECT ROUND(AVG(score * 100 / NULLIF(max_score, 0))) FROM quiz_attempts WHERE user_id = ?) AS avg_score,
                (SELECT COUNT(*) FROM traces WHERE user_id = ?) AS traces',
            array_fill(0, 6, $uid),
            'SELECT dashboard totals',
        );

        $recentProjects = $db->all(
            'SELECT id, title, type, updated_at FROM projects
             WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5',
            [$uid],
            'SELECT recent projects',
        );

        $activity = $db->all(
            "(SELECT 'experiment' AS kind, e.title AS title, e.module AS module, r.status AS status, r.created_at AS at
                FROM experiment_runs r JOIN experiments e ON e.id = r.experiment_id WHERE r.user_id = ?)
             UNION ALL
             (SELECT 'assessment', q.title, 'assessment', CONCAT(a.score, '/', a.max_score), a.submitted_at
                FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id WHERE a.user_id = ?)
             UNION ALL
             (SELECT 'project', p.title, 'projects', 'created', p.created_at
                FROM projects p WHERE p.user_id = ?)
             ORDER BY at DESC LIMIT 8",
            [$uid, $uid, $uid],
            'SELECT recent activity (UNION)',
        );

        $progress = $db->all(
            'SELECT c.category,
                    COUNT(*) AS concepts,
                    COALESCE(ROUND(AVG(up.mastery)), 0) AS mastery
             FROM concepts c
             LEFT JOIN user_progress up ON up.concept_id = c.id AND up.user_id = ?
             GROUP BY c.category
             ORDER BY MIN(c.id)',
            [$uid],
            'SELECT mastery by category',
        );

        $traces = $db->all(
            'SELECT t.trace_uid, t.module, t.label, t.status, t.total_ms, t.created_at,
                    (SELECT COUNT(*) FROM trace_steps s WHERE s.trace_id = t.id) AS steps
             FROM traces t WHERE t.user_id = ?
             ORDER BY t.created_at DESC LIMIT 5',
            [$uid],
            'SELECT recent traces',
        );

        return Response::ok([
            'totals' => [
                'experimentsCompleted' => (int) $totals['experiments_completed'],
                'experimentsAvailable' => (int) $totals['experiments_available'],
                'totalRuns'            => (int) $totals['total_runs'],
                'projects'             => (int) $totals['projects'],
                'assessments'          => (int) $totals['assessments'],
                'averageScore'         => $totals['avg_score'] === null ? null : (int) $totals['avg_score'],
                'traces'               => (int) $totals['traces'],
            ],
            'recentProjects' => array_map(static fn(array $p) => [
                'id' => (int) $p['id'], 'title' => $p['title'], 'type' => $p['type'], 'updatedAt' => $p['updated_at'],
            ], $recentProjects),
            'recentActivity' => $activity,
            'progress' => array_map(static fn(array $p) => [
                'category' => $p['category'], 'concepts' => (int) $p['concepts'], 'mastery' => (int) $p['mastery'],
            ], $progress),
            'recentTraces' => array_map(static fn(array $t) => [
                'traceId' => $t['trace_uid'], 'module' => $t['module'], 'label' => $t['label'], 'status' => $t['status'],
                'totalMs' => (float) $t['total_ms'], 'steps' => (int) $t['steps'], 'createdAt' => $t['created_at'],
            ], $traces),
        ]);
    }
}
