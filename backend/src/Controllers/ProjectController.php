<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;
use WebForge\Repositories\ProjectRepository;

/** Project workspace: saved experiments (Web Playground, Canvas Studio, JSX Playground). */
final class ProjectController
{
    private const MAX_FILES = 10;
    private const MAX_FILE_BYTES = 262_144;   // 256 KB for source files
    private const MAX_IMAGE_BYTES = 2_097_152; // 2 MB for PNG drawings (stored as data URLs)
    private const PNG_DATA_URL = '/^data:image\/png;base64,[A-Za-z0-9+\/]+={0,2}$/';
    private const FILENAME_PATTERN = '/^[A-Za-z0-9_-]{1,40}\.(html|css|js|jsx|png)$/';
    private const LANGUAGE_BY_EXT = ['html' => 'html', 'css' => 'css', 'js' => 'javascript', 'jsx' => 'jsx', 'png' => 'png'];

    private readonly ProjectRepository $projects;

    public function __construct(private readonly App $app)
    {
        $this->projects = new ProjectRepository($app->db);
    }

    /** GET /api/projects */
    public function index(Request $req): Response
    {
        $rows = $this->projects->listForUser($this->app->userId());
        return Response::ok(array_map(static fn(array $p) => self::summary($p) + [
            'fileCount' => (int) $p['file_count'],
            'sizeChars' => (int) $p['size_chars'],
        ], $rows));
    }

    /** GET /api/projects/{id} */
    public function show(Request $req): Response
    {
        $project = $this->findOwned($req);
        return Response::ok(self::summary($project) + ['files' => $this->filesOf((int) $project['id'])]);
    }

    /** POST /api/projects  {title, type, description?, files[]} */
    public function store(Request $req): Response
    {
        $body = $req->json();
        $meta = Validator::check($body, [
            'title'       => ['required', 'string', 'min:1', 'max:120'],
            'type'        => ['required', 'in:web,canvas,jsx'],
            'description' => ['string', 'max:500'],
        ], $this->app->tracer);
        $files = $this->validateFiles($body['files'] ?? null);

        $id = $this->app->db->transaction(function () use ($meta, $files): int {
            $id = $this->projects->create($this->app->userId(), $meta['title'], $meta['type'], $meta['description']);
            $this->projects->replaceFiles($id, $files);
            return $id;
        });

        $project = $this->projects->find($this->app->userId(), $id);
        return Response::ok(self::summary($project) + ['files' => $this->filesOf($id)], 201);
    }

    /** PUT /api/projects/{id}  {title, description?, files[]}: full save */
    public function update(Request $req): Response
    {
        $project = $this->findOwned($req);
        $body = $req->json();
        $meta = Validator::check($body, [
            'title'       => ['required', 'string', 'min:1', 'max:120'],
            'description' => ['string', 'max:500'],
        ], $this->app->tracer);
        $files = $this->validateFiles($body['files'] ?? null);
        $id = (int) $project['id'];

        $this->app->db->transaction(function () use ($id, $meta, $files): void {
            $this->projects->updateMeta($this->app->userId(), $id, $meta['title'], $meta['description']);
            $this->projects->replaceFiles($id, $files);
            $this->projects->touch($id);
        });

        $saved = $this->projects->find($this->app->userId(), $id);
        return Response::ok(self::summary($saved) + ['files' => $this->filesOf($id)]);
    }

    /** PATCH /api/projects/{id}  {title, description?}: rename */
    public function rename(Request $req): Response
    {
        $project = $this->findOwned($req);
        $meta = Validator::check($req->json(), [
            'title'       => ['required', 'string', 'min:1', 'max:120'],
            'description' => ['string', 'max:500'],
        ], $this->app->tracer);
        $description = array_key_exists('description', $req->json()) ? $meta['description'] : $project['description'];
        $this->projects->updateMeta($this->app->userId(), (int) $project['id'], $meta['title'], $description);
        return Response::ok(self::summary($this->projects->find($this->app->userId(), (int) $project['id'])));
    }

    /** DELETE /api/projects/{id} */
    public function destroy(Request $req): Response
    {
        $project = $this->findOwned($req);
        $this->projects->delete($this->app->userId(), (int) $project['id']);
        return Response::ok(['deleted' => true, 'id' => (int) $project['id']]);
    }

    // ---------------------------------------------------------------------

    private function findOwned(Request $req): array
    {
        $id = filter_var($req->params['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $project = $id === false ? null : $this->projects->find($this->app->userId(), $id);
        // 404 (not 403) for other users' projects: existence is not revealed.
        return $project ?? throw new HttpException(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }

    /** @return list<array{filename:string, language:string, content:string}> */
    private function validateFiles(mixed $files): array
    {
        $t0 = microtime(true);
        $error = null;
        $clean = [];

        if (!is_array($files) || !array_is_list($files) || $files === []) {
            $error = 'At least one file is required.';
        } elseif (count($files) > self::MAX_FILES) {
            $error = 'A project may contain at most ' . self::MAX_FILES . ' files.';
        } else {
            $seen = [];
            foreach ($files as $i => $f) {
                $name = is_array($f) ? ($f['filename'] ?? null) : null;
                $content = is_array($f) ? ($f['content'] ?? null) : null;
                if (!is_string($name) || preg_match(self::FILENAME_PATTERN, $name) !== 1) {
                    $error = "File #" . ($i + 1) . ' has an invalid name (letters, digits, - and _, ending .html/.css/.js/.jsx/.png).';
                    break;
                }
                if (isset($seen[strtolower($name)])) {
                    $error = "Duplicate file name: $name.";
                    break;
                }
                $isPng = str_ends_with(strtolower($name), '.png');
                if (!is_string($content) || strlen($content) > ($isPng ? self::MAX_IMAGE_BYTES : self::MAX_FILE_BYTES)) {
                    $error = $isPng ? "$name must be an image of at most 2 MB." : "$name must be text of at most 256 KB.";
                    break;
                }
                if ($isPng && preg_match(self::PNG_DATA_URL, $content) !== 1) {
                    $error = "$name must be a base64 PNG data URL.";
                    break;
                }
                $seen[strtolower($name)] = true;
                $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                $clean[] = ['filename' => $name, 'language' => self::LANGUAGE_BY_EXT[$ext], 'content' => $content];
            }
        }

        $this->app->tracer->note('validation', 'Validate project files', [
            'count' => is_array($files) ? count($files) : 0,
            'rules' => ['max files' => self::MAX_FILES, 'max size' => '256 KB (PNG: 2 MB)', 'name' => self::FILENAME_PATTERN],
            'passed' => $error === null,
        ], $t0, $error === null ? 'success' : 'error');

        if ($error !== null) {
            throw new HttpException(422, 'VALIDATION_FAILED', $error, ['files' => $error]);
        }
        return $clean;
    }

    private function filesOf(int $projectId): array
    {
        return array_map(static fn(array $f) => [
            'filename'  => $f['filename'],
            'language'  => $f['language'],
            'content'   => $f['content'],
            'updatedAt' => $f['updated_at'],
        ], $this->projects->files($projectId));
    }

    private static function summary(array $p): array
    {
        return [
            'id'          => (int) $p['id'],
            'title'       => $p['title'],
            'type'        => $p['type'],
            'description' => $p['description'],
            'createdAt'   => $p['created_at'],
            'updatedAt'   => $p['updated_at'],
        ];
    }
}
