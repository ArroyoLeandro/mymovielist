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

    /**
     * Ranking. Without a studio: global (movies + series counts, studios led). With a studio slug: % of that
     * studio's titles watched. Returns null when the studio does not exist.
     * @return list<array<string, mixed>>|null
     */
    public function ranking(?string $studioSlug = null): ?array
    {
        $users = $this->run('SELECT id, tag FROM users', [])->fetchAll();
        $totals = [];  // studio id => ['slug', 'total']
        foreach ($this->run(
            'SELECT st.id, st.slug, COUNT(m.id) AS total FROM studios st
             LEFT JOIN sections s ON s.studio_id = st.id LEFT JOIN movies m ON m.section_id = s.id GROUP BY st.id, st.slug',
            []
        )->fetchAll() as $r) {
            $totals[(int) $r['id']] = ['slug' => $r['slug'], 'total' => (int) $r['total']];
        }
        // user id => studio id => [watched, scoreSum, scored]
        $per = [];
        foreach ($this->run(
            'SELECT e.user_id, s.studio_id, COUNT(*) AS watched, COALESCE(SUM(e.score), 0) AS score_sum, COUNT(e.score) AS scored
             FROM watch_entries e JOIN movies m ON m.id = e.movie_id JOIN sections s ON s.id = m.section_id
             GROUP BY e.user_id, s.studio_id',
            []
        )->fetchAll() as $r) {
            $per[(int) $r['user_id']][(int) $r['studio_id']] = [(int) $r['watched'], (float) $r['score_sum'], (int) $r['scored']];
        }

        if ($studioSlug !== null) {
            $studioId = null;
            foreach ($totals as $id => $t) {
                if ($t['slug'] === $studioSlug) {
                    $studioId = $id;
                }
            }
            if ($studioId === null) {
                return null;
            }
            $total = $totals[$studioId]['total'];
            $rows = [];
            foreach ($users as $u) {
                [$w, $sum, $scored] = $per[(int) $u['id']][$studioId] ?? [0, 0.0, 0];
                $rows[] = [
                    'tag' => $u['tag'], 'watchedCount' => $w, 'totalCount' => $total,
                    'percent' => $total > 0 ? round($w * 100 / $total, 1) : 0.0,
                    'averageScore' => $scored > 0 ? round($sum / $scored, 2) : null,
                ];
            }
            usort($rows, function ($a, $b) {
                return [$b['percent'], $b['watchedCount'], $b['averageScore'] ?? -1, $a['tag']]
                    <=> [$a['percent'], $a['watchedCount'], $a['averageScore'] ?? -1, $b['tag']];
            });
            return $rows;
        }

        $series = [];
        foreach ($this->run(
            "SELECT e.user_id, COUNT(*) AS n FROM watch_entries e JOIN movies m ON m.id = e.movie_id
             WHERE m.media_type = 'series' GROUP BY e.user_id",
            []
        )->fetchAll() as $r) {
            $series[(int) $r['user_id']] = (int) $r['n'];
        }

        $rows = [];
        $ids = [];
        foreach ($users as $u) {
            $uid = (int) $u['id'];
            $w = 0;
            $sum = 0.0;
            $scored = 0;
            foreach ($per[$uid] ?? [] as $x) {
                $w += $x[0];
                $sum += $x[1];
                $scored += $x[2];
            }
            $s = $series[$uid] ?? 0;
            $ids[$u['tag']] = $uid;
            $rows[$u['tag']] = [
                'tag' => $u['tag'], 'watchedCount' => $w, 'moviesWatched' => $w - $s, 'seriesWatched' => $s,
                'averageScore' => $scored > 0 ? round($sum / $scored, 2) : null, 'leaderOf' => 0,
            ];
        }
        // Studio leader: highest % watched (same total for everyone, so highest count), then average score.
        foreach ($totals as $sid => $t) {
            if ($t['total'] === 0) {
                continue;
            }
            $best = null;
            $bestKey = null;
            foreach ($ids as $tag => $uid) {
                $x = $per[$uid][$sid] ?? null;
                if ($x === null) {
                    continue;
                }
                $key = [$x[0], $x[2] > 0 ? $x[1] / $x[2] : 0];
                if ($bestKey === null || $key > $bestKey) {
                    $best = $tag;
                    $bestKey = $key;
                }
            }
            if ($best !== null) {
                $rows[$best]['leaderOf']++;
            }
        }
        $rows = array_values($rows);
        usort($rows, function ($a, $b) {
            return [$b['watchedCount'], $b['averageScore'] ?? -1, $a['tag']] <=> [$a['watchedCount'], $a['averageScore'] ?? -1, $b['tag']];
        });
        return $rows;
    }

    /**
     * Group highlights computed from scored watch entries. Every card is null when there is not enough data.
     * @return array<string, mixed>
     */
    public function highlights(): array
    {
        $rows = $this->run(
            'SELECT u.tag, e.movie_id, e.score, m.title, m.year, m.poster_url
             FROM watch_entries e JOIN users u ON u.id = e.user_id JOIN movies m ON m.id = e.movie_id
             WHERE e.score IS NOT NULL',
            []
        )->fetchAll();

        $byUser = [];   // tag => [movie id => score]
        $byMovie = [];  // movie id => ['m' => info, 'scores' => [tag => score]]
        foreach ($rows as $r) {
            $id = (int) $r['movie_id'];
            $byUser[$r['tag']][$id] = (int) $r['score'];
            $byMovie[$id]['m'] = ['id' => $id, 'title' => $r['title'], 'year' => (int) $r['year'], 'posterUrl' => $r['poster_url']];
            $byMovie[$id]['scores'][$r['tag']] = (int) $r['score'];
        }

        // Most generous / most demanding (>= 5 scored titles, and at least two such users to compare).
        $avgs = [];
        foreach ($byUser as $tag => $scores) {
            if (count($scores) >= 5) {
                $avgs[] = ['tag' => (string) $tag, 'average' => round(array_sum($scores) / count($scores), 2), 'count' => count($scores)];
            }
        }
        $generous = $demanding = null;
        if (count($avgs) >= 2) {
            usort($avgs, function ($a, $b) {
                return [$b['average'], $a['tag']] <=> [$a['average'], $b['tag']];
            });
            $generous = $avgs[0];
            $demanding = $avgs[count($avgs) - 1];
            if ($generous['average'] === $demanding['average']) {
                $generous = $demanding = null;
            }
        }

        // Most controversial (stddev, >= 3 scores) and group favorite (average, >= 3 scores).
        $controversial = $favorite = null;
        foreach ($byMovie as $x) {
            $s = array_values($x['scores']);
            $n = count($s);
            if ($n < 3) {
                continue;
            }
            $mean = array_sum($s) / $n;
            $var = array_sum(array_map(function ($v) use ($mean) {
                return ($v - $mean) ** 2;
            }, $s)) / $n;
            $sd = sqrt($var);
            if ($sd >= 1 && ($controversial === null || $sd > $controversial['stdev'])) {
                arsort($x['scores']);
                $list = [];
                foreach ($x['scores'] as $tag => $v) {
                    $list[] = ['tag' => (string) $tag, 'score' => $v];
                }
                $controversial = ['movie' => $x['m'], 'stdev' => round($sd, 2), 'scores' => $list];
            }
            if ($favorite === null || [$mean, $n] > [$favorite['average'], $favorite['votes']]) {
                $favorite = ['movie' => $x['m'], 'average' => $mean, 'votes' => $n];
            }
        }
        if ($favorite !== null) {
            $favorite['average'] = round($favorite['average'], 2);
        }

        // Soulmates: pair with the lowest mean absolute difference over >= 5 titles both scored.
        $soulmates = null;
        $tags = array_map('strval', array_keys($byUser));
        sort($tags);
        for ($i = 0; $i < count($tags); $i++) {
            for ($j = $i + 1; $j < count($tags); $j++) {
                $common = array_intersect_key($byUser[$tags[$i]], $byUser[$tags[$j]]);
                if (count($common) < 5) {
                    continue;
                }
                $diff = 0;
                foreach ($common as $id => $v) {
                    $diff += abs($v - $byUser[$tags[$j]][$id]);
                }
                $mad = $diff / count($common);
                if ($soulmates === null || $mad < $soulmates['mad'] || ($mad === $soulmates['mad'] && count($common) > $soulmates['common'])) {
                    $soulmates = ['a' => $tags[$i], 'b' => $tags[$j], 'common' => count($common), 'mad' => $mad];
                }
            }
        }
        if ($soulmates !== null) {
            $soulmates = [
                'a' => $soulmates['a'], 'b' => $soulmates['b'], 'common' => $soulmates['common'],
                'match' => (int) round(100 - $soulmates['mad'] * 100 / 9),
            ];
        }

        return [
            'mostGenerous' => $generous, 'mostDemanding' => $demanding, 'controversial' => $controversial,
            'favorite' => $favorite, 'soulmates' => $soulmates,
        ];
    }

    /** @return array{user: array{tag: string}, stats: array, entries: list<array>} */
    public function userList(array $user): array
    {
        $rows = $this->run(
            'SELECT m.id, m.title, m.original_title, m.year, m.poster_url, m.media_type, e.score, e.watched_at,
                    sec.slug AS section_slug, sec.name AS section_name,
                    s.slug AS studio_slug, s.name AS studio_name, s.logo_url
             FROM watch_entries e
             JOIN movies m ON m.id = e.movie_id
             JOIN sections sec ON sec.id = m.section_id
             JOIN studios s ON s.id = sec.studio_id
             WHERE e.user_id = ?
             ORDER BY e.watched_at DESC, m.id',
            [$user['id']]
        )->fetchAll();

        $distribution = array_fill(1, 10, 0);
        $sum = 0;
        $scored = 0;
        $entries = [];
        $studios = [];
        foreach ($rows as $r) {
            $score = $r['score'] === null ? null : (int) $r['score'];
            if ($score !== null) {
                $distribution[$score]++;
                $sum += $score;
                $scored++;
            }
            $k = $r['studio_slug'];
            if (!isset($studios[$k])) {
                $studios[$k] = ['slug' => $k, 'name' => $r['studio_name'], 'logoUrl' => $r['logo_url'],
                    'watched' => 0, 'sum' => 0, 'scored' => 0];
            }
            $studios[$k]['watched']++;
            if ($score !== null) {
                $studios[$k]['sum'] += $score;
                $studios[$k]['scored']++;
            }
            $entries[] = [
                'movie' => [
                    'id' => (int) $r['id'],
                    'title' => $r['title'],
                    'originalTitle' => $r['original_title'],
                    'year' => (int) $r['year'],
                    'posterUrl' => $r['poster_url'],
                    'mediaType' => $r['media_type'],
                    'studio' => ['slug' => $r['studio_slug'], 'name' => $r['studio_name']],
                    'section' => ['slug' => $r['section_slug'], 'name' => $r['section_name']],
                ],
                'score' => $score,
                'watchedAt' => self::iso($r['watched_at']),
            ];
        }

        $total = (int) $this->run('SELECT COUNT(*) FROM movies', [])->fetchColumn();

        $totals = $this->run(
            'SELECT s.slug, COUNT(m.id) AS total
             FROM studios s
             JOIN sections sec ON sec.studio_id = s.id
             JOIN movies m ON m.section_id = sec.id
             GROUP BY s.id, s.slug',
            []
        )->fetchAll(PDO::FETCH_KEY_PAIR);
        $byStudio = [];
        foreach ($studios as $st) {
            $byStudio[] = [
                'slug' => $st['slug'], 'name' => $st['name'], 'logoUrl' => $st['logoUrl'],
                'watched' => $st['watched'], 'total' => (int) ($totals[$st['slug']] ?? 0),
                'avgScore' => $st['scored'] > 0 ? round($st['sum'] / $st['scored'], 2) : null,
            ];
        }
        usort($byStudio, fn(array $a, array $b) => $b['watched'] <=> $a['watched'] ?: strcmp($a['name'], $b['name']));

        return [
            'user' => ['tag' => $user['tag']],
            'stats' => [
                'watchedCount' => count($entries),
                'totalMovies' => $total,
                'averageScore' => $scored > 0 ? round($sum / $scored, 2) : null,
                'scoreDistribution' => $distribution,
                'byStudio' => $byStudio,
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
