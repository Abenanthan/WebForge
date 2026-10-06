<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;
use WebForge\Services\ProgressService;
use WebForge\Services\RateLimiter;
use WebForge\Services\QuizGrader;

/**
 * Assessments. Questions are sent WITHOUT their answer keys; answers are graded
 * on the server, stored per attempt, and update the learner's concept mastery.
 */
final class QuizController
{
    private const MAX_DURATION_SEC = 86_400;

    public function __construct(private readonly App $app)
    {
    }

    /** GET /api/quizzes */
    public function index(Request $req): Response
    {
        $rows = $this->app->db->all(
            'SELECT q.id, q.slug, q.title, q.description, q.difficulty, c.title AS concept, c.category,
                    (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS questions,
                    COUNT(a.id) AS attempts,
                    MAX(ROUND(a.score * 100 / NULLIF(a.max_score, 0))) AS best_pct,
                    MAX(a.submitted_at) AS last_at
             FROM quizzes q
             JOIN concepts c ON c.id = q.concept_id
             LEFT JOIN quiz_attempts a ON a.quiz_id = q.id AND a.user_id = ?
             GROUP BY q.id
             ORDER BY q.id',
            [$this->app->userId()],
            'SELECT quizzes with your attempts',
        );
        return Response::ok(array_map(static fn(array $q) => [
            'slug'        => $q['slug'],
            'title'       => $q['title'],
            'description' => $q['description'],
            'difficulty'  => $q['difficulty'],
            'concept'     => $q['concept'],
            'category'    => $q['category'],
            'questions'   => (int) $q['questions'],
            'attempts'    => (int) $q['attempts'],
            'bestPercent' => $q['best_pct'] === null ? null : (int) $q['best_pct'],
            'lastAttemptAt' => $q['last_at'],
        ], $rows));
    }

    /** GET /api/quizzes/{slug}: questions without answer keys */
    public function show(Request $req): Response
    {
        $quiz = $this->findQuiz($req);
        $questions = $this->questions((int) $quiz['id']);

        return Response::ok([
            'slug'        => $quiz['slug'],
            'title'       => $quiz['title'],
            'description' => $quiz['description'],
            'difficulty'  => $quiz['difficulty'],
            'questions'   => array_map(static function (array $q): array {
                $out = ['id' => $q['id'], 'type' => $q['type'], 'prompt' => $q['prompt'], 'code' => $q['code']];
                if (in_array($q['type'], QuizGrader::OPTION_TYPES, true)) {
                    $out['options'] = array_map(static fn(array $o) => ['id' => $o['id'], 'label' => $o['label']], $q['options']);
                } elseif ($q['type'] === 'match') {
                    // The answer mapping stays on the server.
                    $out['left'] = $q['payload']['left'] ?? [];
                    $out['right'] = $q['payload']['right'] ?? [];
                }
                return $out;
            }, $questions),
        ]);
    }

    /** POST /api/quizzes/{slug}/attempts  { answers: { "<questionId>": answer }, durationSec } */
    public function submit(Request $req): Response
    {
        $quiz = $this->findQuiz($req);
        $body = $req->json();
        $meta = Validator::check($body, ['durationSec' => ['int', 'between:0,' . self::MAX_DURATION_SEC]], $this->app->tracer);
        $answers = $body['answers'] ?? null;
        if (!is_array($answers) || ($answers !== [] && array_is_list($answers))) {
            throw new HttpException(422, 'VALIDATION_FAILED', 'Some fields are invalid.', ['answers' => 'Send an object keyed by question id.']);
        }

        (new RateLimiter($this->app))->hit('quiz-submit', 'user:' . $this->app->userId());
        $questions = $this->questions((int) $quiz['id']);
        $graded = $this->app->tracer->step('server', 'Grade answers', static function () use ($questions, $answers): array {
            return array_map(static fn(array $q) => ['question' => $q] + QuizGrader::grade($q, $q['options'], $answers[(string) $q['id']] ?? null), $questions);
        }, ['questions' => count($questions)]);

        $score = count(array_filter($graded, static fn(array $g) => $g['correct']));
        $max = count($graded);
        $userId = $this->app->userId();

        $attemptId = $this->app->db->transaction(function () use ($quiz, $userId, $score, $max, $meta, $graded): int {
            $this->app->db->run(
                'INSERT INTO quiz_attempts (user_id, quiz_id, score, max_score, duration_sec) VALUES (?, ?, ?, ?, ?)',
                [$userId, (int) $quiz['id'], $score, $max, $meta['durationSec']],
                'INSERT quiz attempt',
            );
            $attemptId = $this->app->db->lastInsertId();
            $placeholders = implode(', ', array_fill(0, count($graded), '(?, ?, ?, ?)'));
            $params = [];
            foreach ($graded as $g) {
                array_push($params, $attemptId, $g['question']['id'], json_encode($g['answer'], JSON_UNESCAPED_UNICODE), $g['correct'] ? 1 : 0);
            }
            $this->app->db->run(
                "INSERT INTO attempt_answers (attempt_id, question_id, answer_json, is_correct) VALUES {$placeholders}",
                $params,
                'INSERT ' . count($graded) . ' graded answers',
            );
            return $attemptId;
        });

        $conceptIds = array_values(array_unique(array_map(static fn(array $g) => $g['question']['concept_id'], $graded)));
        (new ProgressService($this->app))->recompute($userId, $conceptIds);

        return Response::ok($this->result((int) $attemptId), 201);
    }

    /** GET /api/attempts */
    public function attempts(Request $req): Response
    {
        $rows = $this->app->db->all(
            'SELECT a.id, a.score, a.max_score, a.duration_sec, a.submitted_at, q.slug, q.title
             FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id
             WHERE a.user_id = ? ORDER BY a.submitted_at DESC, a.id DESC LIMIT 50',
            [$this->app->userId()],
            'SELECT your attempts',
        );
        return Response::ok(array_map(static fn(array $a) => [
            'id' => (int) $a['id'], 'quizSlug' => $a['slug'], 'quizTitle' => $a['title'],
            'score' => (int) $a['score'], 'maxScore' => (int) $a['max_score'],
            'durationSec' => $a['duration_sec'] === null ? null : (int) $a['duration_sec'], 'submittedAt' => $a['submitted_at'],
        ], $rows));
    }

    /** GET /api/attempts/{id}: full review of one of your attempts */
    public function attempt(Request $req): Response
    {
        $id = filter_var($req->params['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id === false) {
            throw new HttpException(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found.');
        }
        return Response::ok($this->result($id));
    }

    // ---------------------------------------------------------------------

    /** Graded review of an attempt: every question with your answer, the right answer and why. */
    private function result(int $attemptId): array
    {
        $attempt = $this->app->db->one(
            'SELECT a.id, a.quiz_id, a.score, a.max_score, a.duration_sec, a.submitted_at, q.slug, q.title
             FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id WHERE a.id = ? AND a.user_id = ?',
            [$attemptId, $this->app->userId()],
            'SELECT attempt (owner-scoped)',
        ) ?? throw new HttpException(404, 'ATTEMPT_NOT_FOUND', 'Attempt not found.');

        $stored = [];
        foreach ($this->app->db->all('SELECT question_id, answer_json FROM attempt_answers WHERE attempt_id = ?', [$attemptId], 'SELECT stored answers') as $row) {
            $stored[(int) $row['question_id']] = json_decode($row['answer_json'], true);
        }

        $review = [];
        $weak = [];
        foreach ($this->questions((int) $attempt['quiz_id']) as $q) {
            $g = QuizGrader::grade($q, $q['options'], $stored[$q['id']] ?? null);
            $review[] = [
                'id' => $q['id'], 'type' => $q['type'], 'prompt' => $q['prompt'], 'code' => $q['code'],
                'correct' => $g['correct'], 'yourAnswer' => $g['yourAnswer'], 'correctAnswer' => $g['correctAnswer'],
                'explanation' => $q['explanation'], 'concept' => $q['concept_title'],
            ];
            if (!$g['correct']) {
                $weak[$q['concept_id']] ??= ['slug' => $q['concept_slug'], 'title' => $q['concept_title'], 'labPath' => $q['lab_path'], 'missed' => 0];
                $weak[$q['concept_id']]['missed']++;
            }
        }
        usort($weak, static fn(array $a, array $b) => $b['missed'] <=> $a['missed']);

        return [
            'id'          => (int) $attempt['id'],
            'quizSlug'    => $attempt['slug'],
            'quizTitle'   => $attempt['title'],
            'score'       => (int) $attempt['score'],
            'maxScore'    => (int) $attempt['max_score'],
            'durationSec' => $attempt['duration_sec'] === null ? null : (int) $attempt['duration_sec'],
            'submittedAt' => $attempt['submitted_at'],
            'review'      => $review,
            'recommended' => array_values($weak),
        ];
    }

    private function findQuiz(Request $req): array
    {
        $slug = (string) ($req->params['slug'] ?? '');
        return $this->app->db->one(
            'SELECT id, slug, title, description, difficulty FROM quizzes WHERE slug = ?',
            [$slug],
            'SELECT quiz by slug',
        ) ?? throw new HttpException(404, 'QUIZ_NOT_FOUND', 'Quiz not found.');
    }

    /** Questions in order with their options, answer keys and concept (server-side only). */
    private function questions(int $quizId): array
    {
        $db = $this->app->db;
        $rows = $db->all(
            'SELECT q.id, q.type, q.prompt, q.code_snippet, q.explanation, q.payload_json, q.concept_id,
                    c.slug AS concept_slug, c.title AS concept_title, c.lab_path
             FROM quiz_questions q JOIN concepts c ON c.id = q.concept_id
             WHERE q.quiz_id = ? ORDER BY q.position',
            [$quizId],
            'SELECT questions',
        );
        $options = [];
        foreach ($db->all(
            'SELECT o.id, o.question_id, o.label, o.is_correct FROM question_options o
             JOIN quiz_questions q ON q.id = o.question_id WHERE q.quiz_id = ? ORDER BY o.question_id, o.position',
            [$quizId],
            'SELECT answer options',
        ) as $o) {
            $options[(int) $o['question_id']][] = ['id' => (int) $o['id'], 'label' => $o['label'], 'is_correct' => (bool) $o['is_correct']];
        }

        return array_map(static fn(array $q) => [
            'id'            => (int) $q['id'],
            'type'          => $q['type'],
            'prompt'        => $q['prompt'],
            'code'          => $q['code_snippet'],
            'explanation'   => $q['explanation'],
            'payload'       => $q['payload_json'] === null ? [] : json_decode($q['payload_json'], true),
            'concept_id'    => (int) $q['concept_id'],
            'concept_slug'  => $q['concept_slug'],
            'concept_title' => $q['concept_title'],
            'lab_path'      => $q['lab_path'],
            'options'       => $options[(int) $q['id']] ?? [],
        ], $rows);
    }
}
