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
 * Database Lab: INSERT / SELECT / UPDATE / DELETE on the user's own rows of lab_contacts.
 * Every response carries meta.sql: the prepared-statement template, its bound
 * parameters, rows affected and timing. Values are never concatenated into SQL.
 */
final class DbLabController
{
    private const MAX_ROWS = 50;
    /** Column names cannot be bound as parameters, so ORDER BY uses a whitelist. */
    private const SORTABLE = ['name' => 'name', 'age' => 'age', 'city' => 'city', 'created' => 'created_at'];
    private const ROW_RULES = [
        'name'  => ['required', 'string', 'min:2', 'max:80', 'name'],
        'email' => ['required', 'string', 'email', 'max:190'],
        'age'   => ['int', 'between:1,120'],
        'city'  => ['string', 'max:80'],
    ];
    private const SAMPLE = [
        ['Asha Rao', 'asha.rao@example.com', 21, 'Chennai'],
        ['Rahul Menon', 'rahul.m@example.com', 23, 'Kochi'],
        ['Priya Das', 'priya.das@example.com', 19, 'Kolkata'],
        ['Arjun Iyer', 'arjun.iyer@example.com', 25, 'Chennai'],
        ['Meera Pillai', 'meera.p@example.com', 22, 'Bengaluru'],
    ];

    private array $sqlLog = [];

    public function __construct(private readonly App $app)
    {
    }

    /** GET /api/lab/db/contacts?search=&city=&minAge=&sort=&dir= */
    public function select(Request $req): Response
    {
        $q = Validator::check($req->query, [
            'search' => ['string', 'max:60'],
            'city'   => ['string', 'max:80'],
            'minAge' => ['int', 'between:1,120'],
            'sort'   => ['in:' . implode(',', array_keys(self::SORTABLE))],
            'dir'    => ['in:asc,desc'],
        ], $this->app->tracer);

        $where = ['user_id = ?'];
        $params = [$this->app->userId()];
        if ($q['search'] !== null) {
            $where[] = '(name LIKE ? OR email LIKE ?)';
            $like = '%' . addcslashes($q['search'], '%_\\') . '%';
            array_push($params, $like, $like);
        }
        if ($q['city'] !== null) {
            $where[] = 'city = ?';
            $params[] = $q['city'];
        }
        if ($q['minAge'] !== null) {
            $where[] = 'age >= ?';
            $params[] = $q['minAge'];
        }
        $order = self::SORTABLE[$q['sort'] ?? 'created'] . ' ' . strtoupper($q['dir'] ?? 'asc');

        $sql = "SELECT id, name, email, age, city, created_at\nFROM lab_contacts\nWHERE " . implode("\n  AND ", $where) . "\nORDER BY {$order}";
        $rows = $this->exec('SELECT', $sql, $params, fn($stmt) => $stmt->fetchAll());

        (new ActivityService($this->app))->recordRun('db-select', 'success', ['filters' => array_keys(array_filter($q, static fn($v) => $v !== null))]);
        return $this->respond(['rows' => array_map([self::class, 'row'], $rows)]);
    }

    /** POST /api/lab/db/contacts */
    public function insert(Request $req): Response
    {
        $data = Validator::check($req->json(), self::ROW_RULES, $this->app->tracer);
        $count = (int) $this->app->db->one('SELECT COUNT(*) AS n FROM lab_contacts WHERE user_id = ?', [$this->app->userId()], 'Check row quota')['n'];
        if ($count >= self::MAX_ROWS) {
            throw new HttpException(422, 'QUOTA_EXCEEDED', 'The lab table holds at most ' . self::MAX_ROWS . ' rows. Delete some first.');
        }

        $sql = "INSERT INTO lab_contacts (user_id, name, email, age, city)\nVALUES (?, ?, ?, ?, ?)";
        $params = [$this->app->userId(), $data['name'], mb_strtolower($data['email']), $data['age'], $data['city']];
        $id = $this->exec('INSERT', $sql, $params, fn() => $this->app->db->lastInsertId());

        (new ActivityService($this->app))->recordRun('db-insert', 'success');
        return $this->respond(['id' => $id, 'row' => $this->fetchRow($id)], 201);
    }

    /** PUT /api/lab/db/contacts/{id} */
    public function update(Request $req): Response
    {
        $id = $this->idParam($req);
        $data = Validator::check($req->json(), self::ROW_RULES, $this->app->tracer);

        $sql = "UPDATE lab_contacts\nSET name = ?, email = ?, age = ?, city = ?\nWHERE id = ? AND user_id = ?";
        $params = [$data['name'], mb_strtolower($data['email']), $data['age'], $data['city'], $id, $this->app->userId()];
        $affected = $this->exec('UPDATE', $sql, $params, fn($stmt) => $stmt->rowCount());
        if ($affected === 0 && $this->fetchRow($id) === null) {
            throw new HttpException(404, 'ROW_NOT_FOUND', "No contact with id {$id} in your table.");
        }

        (new ActivityService($this->app))->recordRun('db-update', 'success');
        return $this->respond(['id' => $id, 'row' => $this->fetchRow($id)]);
    }

    /** DELETE /api/lab/db/contacts/{id} */
    public function delete(Request $req): Response
    {
        $id = $this->idParam($req);
        $sql = "DELETE FROM lab_contacts\nWHERE id = ? AND user_id = ?";
        $affected = $this->exec('DELETE', $sql, [$id, $this->app->userId()], fn($stmt) => $stmt->rowCount());
        if ($affected === 0) {
            throw new HttpException(404, 'ROW_NOT_FOUND', "No contact with id {$id} in your table.");
        }

        (new ActivityService($this->app))->recordRun('db-delete', 'success');
        return $this->respond(['id' => $id, 'deleted' => true]);
    }

    /** POST /api/lab/db/reset: replace the user's rows with the sample data (one transaction). */
    public function reset(Request $req): Response
    {
        $uid = $this->app->userId();
        $this->app->db->transaction(function () use ($uid): void {
            $this->exec('DELETE', "DELETE FROM lab_contacts\nWHERE user_id = ?", [$uid], fn($s) => $s->rowCount());
            foreach (self::SAMPLE as [$name, $email, $age, $city]) {
                $this->exec('INSERT', "INSERT INTO lab_contacts (user_id, name, email, age, city)\nVALUES (?, ?, ?, ?, ?)",
                    [$uid, $name, $email, $age, $city], fn() => $this->app->db->lastInsertId());
            }
        });
        return $this->respond(['reset' => true, 'rows' => count(self::SAMPLE)]);
    }

    // ---------------------------------------------------------------------

    /**
     * Run one prepared statement and describe it for the SQL panel.
     * @param callable(\PDOStatement):mixed $result
     */
    private function exec(string $operation, string $sql, array $params, callable $result): mixed
    {
        $t0 = hrtime(true);
        $stmt = $this->app->db->run($sql, $params, "{$operation} lab_contacts");
        $value = $result($stmt);
        $this->sqlLog[] = [
            'operation'    => $operation,
            'statement'    => $sql,
            'params'       => $params,
            'rowsAffected' => $operation === 'SELECT' ? count($value) : $stmt->rowCount(),
            'lastInsertId' => $operation === 'INSERT' ? $value : null,
            'ms'           => round((hrtime(true) - $t0) / 1e6, 2),
        ];
        return $value;
    }

    private function fetchRow(int $id): ?array
    {
        $row = $this->app->db->one(
            'SELECT id, name, email, age, city, created_at FROM lab_contacts WHERE id = ? AND user_id = ?',
            [$id, $this->app->userId()],
            'SELECT the changed row',
        );
        return $row ? self::row($row) : null;
    }

    private function idParam(Request $req): int
    {
        $id = filter_var($req->params['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        return $id === false ? throw new HttpException(404, 'ROW_NOT_FOUND', 'Invalid row id.') : $id;
    }

    private static function row(array $r): array
    {
        return [
            'id' => (int) $r['id'], 'name' => $r['name'], 'email' => $r['email'],
            'age' => $r['age'] === null ? null : (int) $r['age'], 'city' => $r['city'], 'createdAt' => $r['created_at'],
        ];
    }

    private function respond(array $data, int $status = 200): Response
    {
        return Response::ok($data, $status)->withMeta('sql', $this->sqlLog);
    }
}
