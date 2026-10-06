<?php
declare(strict_types=1);

namespace WebForge\Services;

use WebForge\Core\App;
use WebForge\Core\HttpException;

/**
 * Sliding-window rate limiter backed by the rate_limit_hits table.
 *
 *   (new RateLimiter($app))->hit('register', $req->ip(), 10, 3600);
 *
 * Throws 429 TOO_MANY_REQUESTS when the subject already made $limit accepted
 * requests in the last $windowSec seconds; otherwise records this one.
 */
final class RateLimiter
{
    /** Limits per action: [max requests, window in seconds]. */
    public const LIMITS = [
        'register'     => [10, 3600],   // new accounts per IP per hour
        'trace-save'   => [120, 600],   // stored traces per user per 10 minutes
        'quiz-submit'  => [40, 600],    // graded attempts per user per 10 minutes
        'project-save' => [120, 600],   // project creates/saves per user per 10 minutes
    ];
    private const PRUNE_AFTER_SEC = 86_400;

    public function __construct(private readonly App $app)
    {
    }

    public function hit(string $bucket, string $subject): void
    {
        [$limit, $window] = self::LIMITS[$bucket] ?? throw new \LogicException("Unknown rate-limit bucket '$bucket'");
        $db = $this->app->db;

        $count = (int) $db->one(
            'SELECT COUNT(*) AS n FROM rate_limit_hits
             WHERE bucket = ? AND subject = ? AND hit_at > (NOW() - INTERVAL ? SECOND)',
            [$bucket, $subject, $window],
            "Rate limit check: {$bucket}",
        )['n'];

        if ($count >= $limit) {
            $minutes = (int) ceil($window / 60);
            throw new HttpException(429, 'TOO_MANY_REQUESTS',
                "Too many requests. You can do this {$limit} times per {$minutes} minutes; please wait and try again.");
        }

        $db->run('INSERT INTO rate_limit_hits (bucket, subject) VALUES (?, ?)', [$bucket, $subject], "Rate limit record: {$bucket}");
        // Opportunistic cleanup (about 1 in 50 requests) keeps the table small without a cron job.
        if (random_int(1, 50) === 1) {
            $db->run('DELETE FROM rate_limit_hits WHERE hit_at < (NOW() - INTERVAL ? SECOND)', [self::PRUNE_AFTER_SEC], 'Prune old rate-limit rows');
        }
    }
}
