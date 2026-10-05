<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;
use WebForge\Services\ActivityService;

/** Records that the user ran a client-side experiment (feeds dashboard stats and activity history). */
final class ExperimentController
{
    public function __construct(private readonly App $app)
    {
    }

    /** POST /api/experiments/{slug}/runs  {status: success|error, input?: object} */
    public function recordRun(Request $req): Response
    {
        $body = $req->json();
        $data = Validator::check($body, ['status' => ['required', 'in:success,error']], $this->app->tracer);
        $input = isset($body['input']) && is_array($body['input']) ? $body['input'] : null;

        $run = (new ActivityService($this->app))->recordRun((string) ($req->params['slug'] ?? ''), $data['status'], $input);

        return Response::ok([
            'id'         => $run['id'],
            'experiment' => $run['slug'],
            'title'      => $run['title'],
            'status'     => $data['status'],
        ], 201);
    }
}
