<?php
declare(strict_types=1);

namespace WebForge\Services;

use WebForge\Core\App;
use WebForge\Core\HttpException;

/** Records experiment runs (dashboard statistics and activity history). */
final class ActivityService
{
    private const MAX_INPUT_BYTES = 4096;

    public function __construct(private readonly App $app)
    {
    }

    /**
     * @param array|null $input small summary of what was run (never secrets)
     * @return array{id:int, slug:string, title:string}
     */
    public function recordRun(string $slug, string $status, ?array $input = null): array
    {
        $experiment = $this->app->db->one(
            'SELECT id, slug, title FROM experiments WHERE slug = ?',
            [$slug],
            'Find experiment by slug',
        ) ?? throw new HttpException(404, 'EXPERIMENT_NOT_FOUND', 'Unknown experiment.');

        $json = null;
        if ($input !== null) {
            $json = json_encode($input, JSON_UNESCAPED_UNICODE);
            if ($json === false || strlen($json) > self::MAX_INPUT_BYTES) {
                throw new HttpException(422, 'VALIDATION_FAILED', 'Run input is too large.', ['input' => 'Maximum 4 KB.']);
            }
        }

        $this->app->db->run(
            'INSERT INTO experiment_runs (user_id, experiment_id, status, input_json) VALUES (?, ?, ?, ?)',
            [$this->app->userId(), $experiment['id'], $status, $json],
            'INSERT experiment run (activity log)',
        );

        return ['id' => $this->app->db->lastInsertId(), 'slug' => $experiment['slug'], 'title' => $experiment['title']];
    }
}
