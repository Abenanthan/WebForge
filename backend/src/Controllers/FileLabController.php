<?php
declare(strict_types=1);

namespace WebForge\Controllers;

use WebForge\Core\App;
use WebForge\Core\HttpException;
use WebForge\Core\Request;
use WebForge\Core\Response;
use WebForge\Core\Validator;
use WebForge\Services\ActivityService;

/**
 * File Handling Lab: create / write / append / read / inspect / delete text files.
 *
 * Safety:
 *  - every user gets their own directory: storage/sandbox/{userId}/ (outside the web root)
 *  - file names must match NAME_PATTERN (no paths, no dots except ".txt")
 *  - the resolved path is checked with realpath() to stay inside that directory
 *  - quota: MAX_FILES files of at most MAX_BYTES each
 */
final class FileLabController
{
    private const NAME_PATTERN = '/^[A-Za-z0-9_-]{1,40}\.txt$/';
    private const MAX_FILES = 20;
    private const MAX_BYTES = 65_536;

    /** @var list<array{op:string, php:string, result:string}> */
    private array $log = [];

    public function __construct(private readonly App $app)
    {
    }

    /** GET /api/lab/files */
    public function index(Request $req): Response
    {
        $dir = $this->userDir();
        $files = [];
        foreach (glob($dir . DIRECTORY_SEPARATOR . '*.txt') ?: [] as $path) {
            $files[] = $this->info($path);
        }
        usort($files, static fn($a, $b) => strcmp($a['name'], $b['name']));
        $this->note('List the directory', 'glob($dir . "/*.txt")', count($files) . ' file(s)');
        return $this->respond(['files' => $files, 'quota' => ['files' => self::MAX_FILES, 'bytesPerFile' => self::MAX_BYTES]]);
    }

    /** POST /api/lab/files  {name, content?}: create a new file (fails if it exists) */
    public function create(Request $req): Response
    {
        $data = Validator::check($req->json(), ['name' => ['required', 'string'], 'content' => ['string']], $this->app->tracer);
        $path = $this->pathFor($data['name']);
        if (count(glob($this->userDir() . DIRECTORY_SEPARATOR . '*.txt') ?: []) >= self::MAX_FILES) {
            throw new HttpException(422, 'QUOTA_EXCEEDED', 'You already have ' . self::MAX_FILES . ' files. Delete one first.');
        }
        $content = $this->rawContent($req);
        $this->checkSize(strlen($content));

        // Mode "x": create, and fail if the file already exists (no silent overwrite).
        $handle = @fopen($path, 'x');
        $this->note('Create', "\$handle = fopen(\"{$data['name']}\", \"x\")", $handle ? 'resource (new file)' : 'false: file already exists');
        if ($handle === false) {
            throw new HttpException(409, 'FILE_EXISTS', "{$data['name']} already exists. Choose another name or open it.");
        }
        $written = fwrite($handle, $content);
        $this->note('Write', 'fwrite($handle, $content)', "{$written} bytes");
        fclose($handle);
        $this->note('Close', 'fclose($handle)', 'true');
        $this->syncMeta($data['name'], $path);

        $this->activity('create');
        return $this->respond(['file' => $this->info($path)], 201);
    }

    /** PUT /api/lab/files/{name}  {content}: overwrite */
    public function write(Request $req): Response
    {
        return $this->modify($req, 'w');
    }

    /** POST /api/lab/files/{name}/append  {content} */
    public function append(Request $req): Response
    {
        return $this->modify($req, 'a');
    }

    /** GET /api/lab/files/{name}: read the whole file */
    public function read(Request $req): Response
    {
        $name = (string) ($req->params['name'] ?? '');
        $path = $this->existing($name);
        $content = file_get_contents($path);
        $this->note('Read', "file_get_contents(\"{$name}\")", strlen($content) . ' bytes');
        $lines = $content === '' ? 0 : substr_count($content, "\n") + (str_ends_with($content, "\n") ? 0 : 1);
        $this->note('Count lines', 'count(file($path))', (string) $lines);
        $this->activity('read');
        return $this->respond(['file' => $this->info($path), 'content' => $content, 'lines' => $lines]);
    }

    /** DELETE /api/lab/files/{name} */
    public function destroy(Request $req): Response
    {
        $name = (string) ($req->params['name'] ?? '');
        $path = $this->existing($name);
        $ok = unlink($path);
        $this->note('Delete', "unlink(\"{$name}\")", $ok ? 'true' : 'false');
        $this->app->db->run('DELETE FROM lab_files WHERE user_id = ? AND filename = ?', [$this->app->userId(), $name], 'DELETE file metadata');
        return $this->respond(['deleted' => $name]);
    }

    // ---------------------------------------------------------------------

    private function modify(Request $req, string $mode): Response
    {
        $name = (string) ($req->params['name'] ?? '');
        $data = Validator::check($req->json(), ['content' => ['string']], $this->app->tracer);
        $path = $this->existing($name);
        $content = $this->rawContent($req);
        $finalSize = ($mode === 'a' ? filesize($path) : 0) + strlen($content);
        $this->checkSize($finalSize);

        $handle = fopen($path, $mode);
        $this->note($mode === 'a' ? 'Open for appending' : 'Open for writing', "fopen(\"{$name}\", \"{$mode}\")",
            $mode === 'a' ? 'pointer at the end of the file' : 'file truncated to 0 bytes');
        flock($handle, LOCK_EX);
        $this->note('Lock', 'flock($handle, LOCK_EX)', 'exclusive lock (no concurrent writers)');
        $written = fwrite($handle, $content);
        $this->note('Write', 'fwrite($handle, $content)', "{$written} bytes");
        flock($handle, LOCK_UN);
        fclose($handle);
        $this->note('Close', 'fclose($handle)', 'true');
        clearstatcache(true, $path);
        $this->syncMeta($name, $path);

        $this->activity($mode === 'a' ? 'append' : 'write');
        return $this->respond(['file' => $this->info($path)]);
    }

    /** The user's private directory, created on first use. */
    private function userDir(): string
    {
        $base = $this->app->config['storage_dir'] . DIRECTORY_SEPARATOR . 'sandbox';
        $dir = $base . DIRECTORY_SEPARATOR . $this->app->userId();
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException('Cannot create the sandbox directory.');
        }
        return realpath($dir);
    }

    /** Validate a name and build a path that is guaranteed to be inside the user's directory. */
    private function pathFor(string $name): string
    {
        $ok = preg_match(self::NAME_PATTERN, $name) === 1;
        $this->note('Validate the file name', "preg_match('/^[A-Za-z0-9_-]{1,40}\\.txt\$/', \$name)", $ok ? '1 (valid)' : '0 (rejected)');
        if (!$ok) {
            throw new HttpException(422, 'VALIDATION_FAILED', 'Use 1–40 letters, digits, - or _, ending in .txt (no folders).', ['name' => 'Invalid file name.']);
        }
        $dir = $this->userDir();
        $path = $dir . DIRECTORY_SEPARATOR . $name;
        $parent = realpath(dirname($path));
        $inside = $parent === $dir;
        $this->note('Confine to the sandbox', 'realpath(dirname($path)) === $sandboxDir', $inside ? 'true' : 'false');
        if (!$inside) {
            throw new HttpException(403, 'PATH_OUTSIDE_SANDBOX', 'That path is outside your sandbox.');
        }
        return $path;
    }

    private function existing(string $name): string
    {
        $path = $this->pathFor($name);
        $exists = is_file($path);
        $this->note('Check it exists', "file_exists(\"{$name}\")", $exists ? 'true' : 'false');
        if (!$exists) {
            throw new HttpException(404, 'FILE_NOT_FOUND', "{$name} does not exist.");
        }
        return $path;
    }

    /** File contents are kept byte for byte (the Validator trims strings, which would drop newlines). */
    private function rawContent(Request $req): string
    {
        $content = $req->json()['content'] ?? '';
        return is_string($content) ? $content : '';
    }

    private function checkSize(int $bytes): void
    {
        if ($bytes > self::MAX_BYTES) {
            throw new HttpException(422, 'FILE_TOO_LARGE', 'Files may be at most 64 KB.', ['content' => 'Too large.']);
        }
    }

    private function info(string $path): array
    {
        clearstatcache(true, $path);
        return [
            'name'     => basename($path),
            'size'     => filesize($path),
            'modified' => date('Y-m-d H:i:s', filemtime($path)),
            'readable' => is_readable($path),
            'writable' => is_writable($path),
            'md5'      => md5_file($path),
        ];
    }

    /** Keep the lab_files table in step with the filesystem (shows FS + DB together). */
    private function syncMeta(string $name, string $path): void
    {
        $this->app->db->run(
            'INSERT INTO lab_files (user_id, filename, size_bytes) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE size_bytes = VALUES(size_bytes), updated_at = CURRENT_TIMESTAMP',
            [$this->app->userId(), $name, filesize($path)],
            'UPSERT file metadata',
        );
    }

    private function note(string $op, string $php, string $result): void
    {
        $this->log[] = ['op' => $op, 'php' => $php, 'result' => $result];
        $this->app->tracer->note('server', $op, ['php' => $php, 'result' => $result]);
    }

    private function activity(string $op): void
    {
        (new ActivityService($this->app))->recordRun('php-file-handling', 'success', ['op' => $op]);
    }

    private function respond(array $data, int $status = 200): Response
    {
        return Response::ok($data + ['log' => $this->log], $status);
    }
}
