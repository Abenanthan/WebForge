<?php
declare(strict_types=1);

namespace WebForge\Services;

use WebForge\Core\App;

/**
 * Concept mastery (0–100), derived from real activity only:
 *   experiments : distinct experiments of the concept completed successfully / experiments of the concept
 *   quizzes     : questions of the concept whose LATEST answer is correct / questions of the concept
 * When a concept has both, each counts for half; otherwise the one it has counts fully.
 * The result is stored in user_progress so dashboards can read it cheaply.
 */
final class ProgressService
{
    public function __construct(private readonly App $app)
    {
    }

    /**
     * Recompute and store mastery for the given concepts (all when null).
     * @param list<int>|null $conceptIds
     * @return list<array> one row per concept
     */
    public function recompute(int $userId, ?array $conceptIds = null): array
    {
        $db = $this->app->db;
        $filter = '';
        $params = [$userId, $userId, $userId];
        if ($conceptIds !== null) {
            if ($conceptIds === []) {
                return [];
            }
            $filter = 'WHERE c.id IN (' . implode(',', array_fill(0, count($conceptIds), '?')) . ')';
            array_push($params, ...$conceptIds);
        }

        $rows = $db->all(
            "SELECT c.id, c.slug, c.title, c.category, c.lab_path,
                    (SELECT COUNT(*) FROM experiments e WHERE e.concept_id = c.id) AS exp_total,
                    (SELECT COUNT(DISTINCT r.experiment_id) FROM experiment_runs r JOIN experiments e ON e.id = r.experiment_id
                      WHERE e.concept_id = c.id AND r.user_id = ? AND r.status = 'success') AS exp_done,
                    (SELECT COUNT(*) FROM quiz_questions q WHERE q.concept_id = c.id) AS q_total,
                    (SELECT COUNT(*) FROM quiz_questions q
                      JOIN attempt_answers aa ON aa.question_id = q.id
                      JOIN quiz_attempts a ON a.id = aa.attempt_id AND a.user_id = ?
                      WHERE q.concept_id = c.id
                        AND aa.id = (SELECT aa2.id FROM attempt_answers aa2 JOIN quiz_attempts a2 ON a2.id = aa2.attempt_id
                                     WHERE aa2.question_id = q.id AND a2.user_id = a.user_id ORDER BY a2.submitted_at DESC, aa2.id DESC LIMIT 1)
                        AND aa.is_correct = 1) AS q_correct,
                    (SELECT COUNT(DISTINCT aa.question_id) FROM attempt_answers aa JOIN quiz_attempts a ON a.id = aa.attempt_id
                      JOIN quiz_questions q ON q.id = aa.question_id WHERE q.concept_id = c.id AND a.user_id = ?) AS q_answered
             FROM concepts c {$filter}
             ORDER BY c.id",
            $params,
            'Measure experiments and quiz answers per concept',
        );

        $result = [];
        foreach ($rows as $r) {
            $expTotal = (int) $r['exp_total'];
            $qTotal = (int) $r['q_total'];
            $expPart = $expTotal > 0 ? (int) $r['exp_done'] / $expTotal : null;
            $quizPart = $qTotal > 0 ? (int) $r['q_correct'] / $qTotal : null;
            $parts = array_values(array_filter([$expPart, $quizPart], static fn($p) => $p !== null));
            $mastery = $parts === [] ? 0 : (int) round(100 * array_sum($parts) / count($parts));

            $db->run(
                'INSERT INTO user_progress (user_id, concept_id, mastery, experiments_done) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   last_activity_at = IF(mastery <> VALUES(mastery) OR experiments_done <> VALUES(experiments_done), CURRENT_TIMESTAMP, last_activity_at),
                   mastery = VALUES(mastery), experiments_done = VALUES(experiments_done)',
                [$userId, (int) $r['id'], $mastery, (int) $r['exp_done']],
                "UPSERT progress: {$r['slug']}",
            );

            $result[] = [
                'conceptId'        => (int) $r['id'],
                'slug'             => $r['slug'],
                'title'            => $r['title'],
                'category'         => $r['category'],
                'labPath'          => $r['lab_path'],
                'mastery'          => $mastery,
                'experimentsDone'  => (int) $r['exp_done'],
                'experimentsTotal' => $expTotal,
                'questionsCorrect' => (int) $r['q_correct'],
                'questionsAnswered' => (int) $r['q_answered'],
                'questionsTotal'   => $qTotal,
            ];
        }
        return $result;
    }
}
