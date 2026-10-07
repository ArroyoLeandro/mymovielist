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

    /** Static (not per-user) list of studios. @return list<array{slug: string, name: string, logoUrl: string|null, movieCount: int}> */
    public function studios(): array
    {
        $rows = $this->run(
            'SELECT s.slug, s.name, s.logo_url, COUNT(m.id) AS movie_count
             FROM studios s
             LEFT JOIN sections sec ON sec.studio_id = s.id
             LEFT JOIN movies m ON m.section_id = sec.id
             GROUP BY s.id, s.slug, s.name, s.logo_url
             ORDER BY s.name',
            []
        )->fetchAll();

        return array_map(fn(array $r) => [
            'slug' => $r['slug'],
            'name' => $r['name'],
            'logoUrl' => $r['logo_url'],
            'movieCount' => (int) $r['movie_count'],
        ], $rows);
    }

    /** How many titles the user has watched per studio (small, per-user). @return list<array{slug: string, watchedCount: int}> */
    public function progress(int $userId): array
    {
        $rows = $this->run(
            'SELECT s.slug, COUNT(e.movie_id) AS watched_count
             FROM studios s
             LEFT JOIN sections sec ON sec.studio_id = s.id
             LEFT JOIN movies m ON m.section_id = sec.id
             LEFT JOIN watch_entries e ON e.movie_id = m.id AND e.user_id = ?
             GROUP BY s.id, s.slug
             ORDER BY s.name',
            [$userId]
        )->fetchAll();

        return array_map(fn(array $r) => [
            'slug' => $r['slug'],
            'watchedCount' => (int) $r['watched_count'],
        ], $rows);
    }

    /** @return array{id: int, slug: string, name: string, logoUrl: string|null}|null */
    public function studioBySlug(string $slug): ?array
    {
        $row = $this->run('SELECT id, slug, name, logo_url FROM studios WHERE slug = ?', [$slug])->fetch();
        return $row
            ? ['id' => (int) $row['id'], 'slug' => $row['slug'], 'name' => $row['name'], 'logoUrl' => $row['logo_url']]
            : null;
    }

    /** Static catalog: sections with titles. No per-user or social data, so it can be cached. */
    public function catalog(int $studioId): array
    {
        $sections = $this->run(
            'SELECT id, slug, name, period FROM sections WHERE studio_id = ? ORDER BY sort_order, id',
            [$studioId]
        )->fetchAll();

        $movies = $this->run(
            'SELECT m.id, m.section_id, m.title, m.original_title, m.year, m.poster_url, m.media_type, m.tmdb_id
             FROM movies m
             JOIN sections sec ON sec.id = m.section_id
             WHERE sec.studio_id = ?
             ORDER BY m.sort_order, m.id',
            [$studioId]
        )->fetchAll();

        $bySection = [];
        foreach ($movies as $m) {
            $bySection[$m['section_id']][] = [
                'id' => (int) $m['id'],
                'title' => $m['title'],
                'originalTitle' => $m['original_title'],
                'year' => (int) $m['year'],
                'posterUrl' => $m['poster_url'],
                'mediaType' => $m['media_type'],
                'tmdbId' => $m['tmdb_id'] === null ? null : (int) $m['tmdb_id'],
            ];
        }

        return array_map(fn(array $s) => [
            'slug' => $s['slug'],
            'name' => $s['name'],
            'period' => $s['period'],
            'movies' => $bySection[$s['id']] ?? [],
        ], $sections);
    }

    /**
     * Compact dynamic data for one studio: only titles with at least one entry.
     * @return list<array{movieId: int, watched: bool, score: int|null, ratings: list<array>, watchersCount: int, averageScore: float|null}>
     */
    public function ratings(int $studioId, int $userId): array
    {
        $rows = $this->run(
            'SELECT e.movie_id, e.user_id, u.tag, e.score
             FROM watch_entries e
             JOIN users u ON u.id = e.user_id
             JOIN movies m ON m.id = e.movie_id
             JOIN sections sec ON sec.id = m.section_id
             WHERE sec.studio_id = ?
             ORDER BY e.movie_id, (e.score IS NULL), e.score DESC, u.tag',
            [$studioId]
        )->fetchAll();

        $byMovie = [];
        foreach ($rows as $r) {
            $id = (int) $r['movie_id'];
            if (!isset($byMovie[$id])) {
                $byMovie[$id] = ['movieId' => $id, 'watched' => false, 'score' => null, 'ratings' => [], 'sum' => 0, 'scored' => 0];
            }
            $score = $r['score'] === null ? null : (int) $r['score'];
            $byMovie[$id]['ratings'][] = ['tag' => $r['tag'], 'score' => $score];
            if ((int) $r['user_id'] === $userId) {
                $byMovie[$id]['watched'] = true;
                $byMovie[$id]['score'] = $score;
            }
            if ($score !== null) {
                $byMovie[$id]['sum'] += $score;
                $byMovie[$id]['scored']++;
            }
        }

        $out = [];
        foreach ($byMovie as $m) {
            $out[] = [
                'movieId' => $m['movieId'],
                'watched' => $m['watched'],
                'score' => $m['score'],
                'ratings' => $m['ratings'],
                'watchersCount' => count($m['ratings']),
                'averageScore' => $m['scored'] > 0 ? round($m['sum'] / $m['scored'], 2) : null,
            ];
        }
        return $out;
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
