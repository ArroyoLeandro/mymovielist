<?php

declare(strict_types=1);

namespace App;

use PDO;
use PDOException;

/** All SQL lives here. Portable across MySQL and SQLite. */
final class Repository
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    /** @return array{id: int, tag: string} */
    public function findOrCreateUser(string $tag): array
    {
        $user = $this->userByTag($tag);
        if ($user !== null) {
            return $user;
        }
        try {
            $this->run(
                'INSERT INTO users (tag, tag_normalized, created_at) VALUES (?, ?, ?)',
                [$tag, strtolower($tag), date('Y-m-d H:i:s')]
            );
        } catch (PDOException $e) {
            // Lost a race with a concurrent registration of the same tag: fall through to the lookup.
        }
        $user = $this->userByTag($tag);
        if ($user === null) {
            throw new \RuntimeException('Could not register user.');
        }
        return $user;
    }

    /** @return array{id: int, tag: string}|null */
    public function userByTag(string $tag): ?array
    {
        return $this->user('SELECT id, tag FROM users WHERE tag_normalized = ?', [strtolower($tag)]);
    }

    /** @return array{id: int, tag: string}|null */
    public function userById(int $id): ?array
    {
        return $this->user('SELECT id, tag FROM users WHERE id = ?', [$id]);
    }

    /** @return list<array{slug: string, name: string, movieCount: int}> */
    public function studios(): array
    {
        $rows = $this->run(
            'SELECT s.slug, s.name, COUNT(m.id) AS movie_count
             FROM studios s
             LEFT JOIN sections sec ON sec.studio_id = s.id
             LEFT JOIN movies m ON m.section_id = sec.id
             GROUP BY s.id, s.slug, s.name
             ORDER BY s.name',
            []
        )->fetchAll();

        return array_map(fn(array $r) => [
            'slug' => $r['slug'],
            'name' => $r['name'],
            'movieCount' => (int) $r['movie_count'],
        ], $rows);
    }

    /** @return array{id: int, slug: string, name: string}|null */
    public function studioBySlug(string $slug): ?array
    {
        $row = $this->run('SELECT id, slug, name FROM studios WHERE slug = ?', [$slug])->fetch();
        return $row ? ['id' => (int) $row['id'], 'slug' => $row['slug'], 'name' => $row['name']] : null;
    }

    /** Sections with movies, plus the given user's watched/score and every user's aggregates. */
    public function catalog(int $studioId, int $userId): array
    {
        $sections = $this->run(
            'SELECT id, slug, name, period FROM sections WHERE studio_id = ? ORDER BY sort_order, id',
            [$studioId]
        )->fetchAll();

        $movies = $this->run(
            'SELECT m.id, m.section_id, m.title, m.original_title, m.year, m.poster_url,
                    mine.score AS my_score, (mine.user_id IS NOT NULL) AS watched,
                    COUNT(e.user_id) AS watchers_count, AVG(e.score) AS average_score
             FROM movies m
             JOIN sections sec ON sec.id = m.section_id
             LEFT JOIN watch_entries e ON e.movie_id = m.id
             LEFT JOIN watch_entries mine ON mine.movie_id = m.id AND mine.user_id = ?
             WHERE sec.studio_id = ?
             GROUP BY m.id, m.section_id, m.title, m.original_title, m.year, m.poster_url, m.sort_order,
                      mine.score, mine.user_id
             ORDER BY m.sort_order, m.id',
            [$userId, $studioId]
        )->fetchAll();

        $rows = $this->run(
            'SELECT e.movie_id, u.tag, e.score
             FROM watch_entries e
             JOIN users u ON u.id = e.user_id
             JOIN movies m ON m.id = e.movie_id
             JOIN sections sec ON sec.id = m.section_id
             WHERE sec.studio_id = ?
             ORDER BY (e.score IS NULL), e.score DESC, u.tag',
            [$studioId]
        )->fetchAll();
        $ratings = [];
        foreach ($rows as $r) {
            $ratings[$r['movie_id']][] = [
                'tag' => $r['tag'],
                'score' => $r['score'] === null ? null : (int) $r['score'],
            ];
        }

        $bySection = [];
        foreach ($movies as $m) {
            $bySection[$m['section_id']][] = [
                'id' => (int) $m['id'],
                'title' => $m['title'],
                'originalTitle' => $m['original_title'],
                'year' => (int) $m['year'],
                'posterUrl' => $m['poster_url'],
                'watched' => (bool) $m['watched'],
                'score' => $m['my_score'] === null ? null : (int) $m['my_score'],
                'watchersCount' => (int) $m['watchers_count'],
                'averageScore' => self::avg($m['average_score']),
                'ratings' => $ratings[$m['id']] ?? [],
            ];
        }

        return array_map(fn(array $s) => [
            'slug' => $s['slug'],
            'name' => $s['name'],
            'period' => $s['period'],
            'movies' => $bySection[$s['id']] ?? [],
        ], $sections);
    }

    public function movieExists(int $movieId): bool
    {
        return $this->run('SELECT 1 FROM movies WHERE id = ?', [$movieId])->fetch() !== false;
    }

    /** Creates or updates the entry; keeps the original watched_at on updates. Returns the stored entry. */
    public function saveEntry(int $userId, int $movieId, ?int $score): array
    {
        $existing = $this->run(
            'SELECT watched_at FROM watch_entries WHERE user_id = ? AND movie_id = ?',
            [$userId, $movieId]
        )->fetch();

        if ($existing) {
            $this->run(
                'UPDATE watch_entries SET score = ? WHERE user_id = ? AND movie_id = ?',
                [$score, $userId, $movieId]
            );
            $watchedAt = $existing['watched_at'];
        } else {
            $watchedAt = date('Y-m-d H:i:s');
            $this->run(
                'INSERT INTO watch_entries (user_id, movie_id, score, watched_at) VALUES (?, ?, ?, ?)',
                [$userId, $movieId, $score, $watchedAt]
            );
        }

        return ['movieId' => $movieId, 'watched' => true, 'score' => $score, 'watchedAt' => self::iso($watchedAt)];
    }

    public function removeEntry(int $userId, int $movieId): array
    {
        $this->run('DELETE FROM watch_entries WHERE user_id = ? AND movie_id = ?', [$userId, $movieId]);
        return ['movieId' => $movieId, 'watched' => false, 'score' => null, 'watchedAt' => null];
    }

    /** @return list<array{tag: string, watchedCount: int, averageScore: float|null}> */
    public function ranking(): array
    {
        $rows = $this->run(
            'SELECT u.tag, COUNT(e.movie_id) AS watched_count, AVG(e.score) AS average_score
             FROM users u
             LEFT JOIN watch_entries e ON e.user_id = u.id
             GROUP BY u.id, u.tag
             ORDER BY watched_count DESC, u.tag',
            []
        )->fetchAll();

        return array_map(fn(array $r) => [
            'tag' => $r['tag'],
            'watchedCount' => (int) $r['watched_count'],
            'averageScore' => self::avg($r['average_score']),
        ], $rows);
    }

    /** @return array{user: array{tag: string}, stats: array, entries: list<array>} */
    public function userList(array $user): array
    {
        $rows = $this->run(
            'SELECT m.id, m.title, m.original_title, m.year, m.poster_url, e.score, e.watched_at
             FROM watch_entries e
             JOIN movies m ON m.id = e.movie_id
             WHERE e.user_id = ?
             ORDER BY e.watched_at DESC, m.id',
            [$user['id']]
        )->fetchAll();

        $distribution = array_fill(1, 10, 0);
        $sum = 0;
        $scored = 0;
        $entries = [];
        foreach ($rows as $r) {
            $score = $r['score'] === null ? null : (int) $r['score'];
            if ($score !== null) {
                $distribution[$score]++;
                $sum += $score;
                $scored++;
            }
            $entries[] = [
                'movie' => [
                    'id' => (int) $r['id'],
                    'title' => $r['title'],
                    'originalTitle' => $r['original_title'],
                    'year' => (int) $r['year'],
                    'posterUrl' => $r['poster_url'],
                ],
                'score' => $score,
                'watchedAt' => self::iso($r['watched_at']),
            ];
        }

        $total = (int) $this->run('SELECT COUNT(*) FROM movies', [])->fetchColumn();

        return [
            'user' => ['tag' => $user['tag']],
            'stats' => [
                'watchedCount' => count($entries),
                'totalMovies' => $total,
                'averageScore' => $scored > 0 ? round($sum / $scored, 2) : null,
                'scoreDistribution' => $distribution,
            ],
            'entries' => $entries,
        ];
    }

    private function user(string $sql, array $params): ?array
    {
        $row = $this->run($sql, $params)->fetch();
        return $row ? ['id' => (int) $row['id'], 'tag' => $row['tag']] : null;
    }

    private function run(string $sql, array $params): \PDOStatement
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /** @param mixed $value */
    private static function avg($value): ?float
    {
        return $value === null ? null : round((float) $value, 2);
    }

    private static function iso(string $dbDate): string
    {
        return str_replace(' ', 'T', $dbDate);
    }
}
