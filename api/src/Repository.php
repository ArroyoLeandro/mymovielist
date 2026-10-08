<?php

declare(strict_types=1);

namespace App;

use PDO;
use PDOException;

/** All SQL lives here. Portable across MySQL and SQLite. */
final class Repository
{
    /** Shortest version key (letters and digits) that may link two titles, see versionKeys(). */
    private const VERSION_MIN_KEY = 4;

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

    /** Static (not per-user) list of studios. @return list<array{slug: string, name: string, logoUrl: string|null, kind: string, movieCount: int}> */
    public function studios(): array
    {
        $rows = $this->run(
            'SELECT s.slug, s.name, s.logo_url, s.kind, COUNT(m.id) AS movie_count
             FROM studios s
             LEFT JOIN sections sec ON sec.studio_id = s.id
             LEFT JOIN movies m ON m.section_id = sec.id
             GROUP BY s.id, s.slug, s.name, s.logo_url, s.kind, s.sort_order
             ORDER BY s.sort_order, s.name',
            []
        )->fetchAll();

        return array_map(fn(array $r) => [
            'slug' => $r['slug'],
            'name' => $r['name'],
            'logoUrl' => $r['logo_url'],
            'kind' => $r['kind'],
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

    /**
     * Static catalog: sections with titles, plus sagas (collections with 2+ titles in this studio). No per-user or
     * social data, so it can be cached.
     * @return array{sections: list<array>, sagas: list<array>}
     */
    public function catalog(int $studioId): array
    {
        $sections = $this->run(
            'SELECT id, slug, name, period FROM sections WHERE studio_id = ? ORDER BY sort_order, id',
            [$studioId]
        )->fetchAll();

        $movies = $this->run(
            "SELECT m.id, m.section_id, m.title, m.original_title, m.year, m.release_date, m.poster_url, m.media_type, m.animated, m.tmdb_id,
                    m.providers_link, c.slug AS collection_slug, c.name AS collection_name, c.poster_url AS collection_poster,
                    CASE WHEN m.source = 'manual' THEN ab.tag END AS added_by_tag
             FROM movies m
             JOIN sections sec ON sec.id = m.section_id
             LEFT JOIN collections c ON c.id = m.collection_id
             LEFT JOIN users ab ON ab.id = m.added_by_user_id
             WHERE sec.studio_id = ?
             ORDER BY m.sort_order, m.id",
            [$studioId]
        )->fetchAll();

        $pmap = self::groupProviders($this->run(
            'SELECT tp.title_id, tp.provider_id, tp.type FROM title_providers tp
             JOIN movies m ON m.id = tp.title_id JOIN sections sec ON sec.id = m.section_id
             WHERE sec.studio_id = ?
             ORDER BY tp.title_id, tp.type, tp.display_priority, tp.provider_id',
            [$studioId]
        )->fetchAll());
        $used = [];
        foreach ($pmap as $list) {
            foreach ($list as $p) {
                $used[] = $p['id'];
            }
        }

        $bySection = [];
        $groups = []; // collection slug => saga being built
        foreach ($movies as $m) {
            $bySection[$m['section_id']][] = [
                'id' => (int) $m['id'],
                'title' => $m['title'],
                'originalTitle' => $m['original_title'],
                'year' => (int) $m['year'],
                'posterUrl' => $m['poster_url'],
                'mediaType' => $m['media_type'],
                'animated' => self::flag($m['animated']),
                'tmdbId' => $m['tmdb_id'] === null ? null : (int) $m['tmdb_id'],
                'collection' => $m['collection_slug'] === null ? null : ['slug' => $m['collection_slug'], 'name' => $m['collection_name']],
                'providers' => $pmap[(int) $m['id']] ?? [],
                'providersLink' => $m['providers_link'],
                'addedBy' => $m['added_by_tag'],
            ];
            if ($m['collection_slug'] !== null) {
                $date = $m['release_date'] ?: sprintf('%04d-01-01', (int) $m['year']);
                $g = &$groups[$m['collection_slug']];
                $g['slug'] = $m['collection_slug'];
                $g['name'] = $m['collection_name'];
                $g['poster'] = $m['collection_poster'];
                $g['items'][] = [$date, (int) $m['id'], $m['poster_url']];
                unset($g);
            }
        }

        $sagas = [];
        foreach ($groups as $g) {
            if (count($g['items']) < 2) {
                continue;
            }
            usort($g['items'], fn(array $a, array $b) => [$a[0], $a[1]] <=> [$b[0], $b[1]]);
            $sagas[] = [
                'first' => $g['items'][0][0],
                'saga' => [
                    'slug' => $g['slug'],
                    'name' => $g['name'],
                    'posterUrl' => $g['poster'] ?: $g['items'][0][2],
                    'titleIds' => array_map(fn(array $i) => $i[1], $g['items']),
                ],
            ];
        }
        usort($sagas, fn(array $a, array $b) => [$a['first'], $a['saga']['name']] <=> [$b['first'], $b['saga']['name']]);

        return [
            'sections' => array_map(fn(array $s) => [
                'slug' => $s['slug'],
                'name' => $s['name'],
                'period' => $s['period'],
                'movies' => $bySection[$s['id']] ?? [],
            ], $sections),
            'sagas' => array_map(fn(array $x) => $x['saga'], $sagas),
            'providers' => $this->providerDictionary($used),
        ];
    }

    /**
     * Compact dynamic data for one studio: only titles with at least one entry or pending for the user.
     * @return list<array<string, mixed>>
     */
    public function ratings(int $studioId, int $userId): array
    {
        $entries = $this->run(
            'SELECT e.movie_id, e.user_id, u.tag, e.score
             FROM watch_entries e
             JOIN users u ON u.id = e.user_id
             JOIN movies m ON m.id = e.movie_id
             JOIN sections sec ON sec.id = m.section_id
             WHERE sec.studio_id = ?
             ORDER BY e.movie_id, (e.score IS NULL), e.score DESC, u.tag',
            [$studioId]
        )->fetchAll();
        $pending = $this->run(
            'SELECT w.movie_id FROM watchlist w
             JOIN movies m ON m.id = w.movie_id
             JOIN sections sec ON sec.id = m.section_id
             WHERE sec.studio_id = ? AND w.user_id = ?',
            [$studioId, $userId]
        )->fetchAll(PDO::FETCH_COLUMN);
        return array_values($this->buildStates($entries, $pending, $userId));
    }

    /**
     * Dynamic state of the given titles for one viewer (blank state for titles nobody touched).
     * @param list<int> $ids
     * @return array<int, array<string, mixed>>
     */
    public function titleStates(array $ids, int $userId): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (!$ids) {
            return [];
        }
        $in = implode(',', array_fill(0, count($ids), '?'));
        $entries = $this->run(
            "SELECT e.movie_id, e.user_id, u.tag, e.score FROM watch_entries e JOIN users u ON u.id = e.user_id
             WHERE e.movie_id IN ($in) ORDER BY e.movie_id, (e.score IS NULL), e.score DESC, u.tag",
            $ids
        )->fetchAll();
        $pending = $this->run(
            "SELECT movie_id FROM watchlist WHERE user_id = ? AND movie_id IN ($in)",
            array_merge([$userId], $ids)
        )->fetchAll(PDO::FETCH_COLUMN);
        $states = $this->buildStates($entries, $pending, $userId);
        $out = [];
        foreach ($ids as $id) {
            $out[$id] = $states[$id] ?? self::blankState($id);
        }
        return $out;
    }

    /** @return array<string, mixed> */
    private static function blankState(int $id): array
    {
        return ['movieId' => $id, 'watched' => false, 'score' => null, 'pending' => false, 'ratings' => [], 'watchersCount' => 0, 'averageScore' => null];
    }

    /**
     * @param list<array<string, mixed>> $entries rows of movie_id, user_id, tag, score
     * @param list<mixed> $pending movie ids on the viewer's watchlist
     * @return array<int, array<string, mixed>>
     */
    private function buildStates(array $entries, array $pending, int $userId): array
    {
        $byMovie = [];
        foreach ($entries as $r) {
            $id = (int) $r['movie_id'];
            if (!isset($byMovie[$id])) {
                $byMovie[$id] = self::blankState($id) + ['sum' => 0, 'scored' => 0];
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
        foreach ($pending as $pid) {
            $id = (int) $pid;
            if (!isset($byMovie[$id])) {
                $byMovie[$id] = self::blankState($id) + ['sum' => 0, 'scored' => 0];
            }
            $byMovie[$id]['pending'] = true;
        }

        $out = [];
        foreach ($byMovie as $id => $m) {
            $out[$id] = [
                'movieId' => $m['movieId'],
                'watched' => $m['watched'],
                'score' => $m['score'],
                'pending' => $m['pending'],
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

    /**
     * TMDB reference of a title, for on-demand TMDB lookups (trailers).
     * @return array{mediaType: string, tmdbId: int|null}|null null when the title does not exist
     */
    public function tmdbRef(int $movieId): ?array
    {
        $r = $this->run('SELECT media_type, tmdb_id FROM movies WHERE id = ?', [$movieId])->fetch();
        if ($r === false) {
            return null;
        }
        return ['mediaType' => (string) $r['media_type'], 'tmdbId' => $r['tmdb_id'] === null ? null : (int) $r['tmdb_id']];
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

        // A watched title is no longer pending.
        $this->run('DELETE FROM watchlist WHERE user_id = ? AND movie_id = ?', [$userId, $movieId]);

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

    /** @return array{user: array{tag: string}, stats: array, watched: list<array>} */
    public function userList(array $user): array
    {
        $rows = $this->run(
            "SELECT m.id, m.title, m.original_title, m.year, m.poster_url, m.media_type, m.animated, m.providers_link, e.score, e.watched_at,
                    sec.slug AS section_slug, sec.name AS section_name,
                    s.slug AS studio_slug, s.name AS studio_name, s.logo_url,
                    CASE WHEN m.source = 'manual' THEN ab.tag END AS added_by_tag
             FROM watch_entries e
             JOIN movies m ON m.id = e.movie_id
             JOIN sections sec ON sec.id = m.section_id
             JOIN studios s ON s.id = sec.studio_id
             LEFT JOIN users ab ON ab.id = m.added_by_user_id
             WHERE e.user_id = ?
             ORDER BY e.watched_at DESC, m.id",
            [$user['id']]
        )->fetchAll();

        $pmap = $this->providerMap(array_column($rows, 'id'));
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
                    'animated' => self::flag($r['animated']),
                    'studio' => ['slug' => $r['studio_slug'], 'name' => $r['studio_name']],
                    'section' => ['slug' => $r['section_slug'], 'name' => $r['section_name']],
                    'providers' => $pmap[(int) $r['id']] ?? [],
                    'providersLink' => $r['providers_link'],
                    'addedBy' => $r['added_by_tag'],
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
            'watched' => $entries,
        ];
    }

    // ---- watchlist ----

    public function addToWatchlist(int $userId, int $movieId): void
    {
        if ($this->run('SELECT 1 FROM watch_entries WHERE user_id = ? AND movie_id = ?', [$userId, $movieId])->fetch()) {
            return; // already watched: nothing to want
        }
        if ($this->run('SELECT 1 FROM watchlist WHERE user_id = ? AND movie_id = ?', [$userId, $movieId])->fetch()) {
            return;
        }
        try {
            $this->run('INSERT INTO watchlist (user_id, movie_id, added_at) VALUES (?, ?, ?)', [$userId, $movieId, date('Y-m-d H:i:s')]);
        } catch (PDOException $e) {
            // Concurrent duplicate: already pending.
        }
    }

    public function removeFromWatchlist(int $userId, int $movieId): void
    {
        $this->run('DELETE FROM watchlist WHERE user_id = ? AND movie_id = ?', [$userId, $movieId]);
    }

    // ---- recommendations ----

    /** @return list<string> */
    public function userTags(): array
    {
        return $this->run('SELECT tag FROM users ORDER BY tag_normalized', [])->fetchAll(PDO::FETCH_COLUMN);
    }

    /**
     * Recommends a title to the given friends (upsert per recipient). Self and unknown tags are ignored.
     * @param list<string> $toTags
     * @return list<string> tags that received it
     */
    public function recommend(int $fromId, int $movieId, array $toTags, ?string $note): array
    {
        $sent = [];
        $now = date('Y-m-d H:i:s');
        foreach (array_unique(array_map('strtolower', $toTags)) as $tag) {
            $to = $this->userByTag($tag);
            if ($to === null || $to['id'] === $fromId) {
                continue;
            }
            $existing = $this->run(
                'SELECT id FROM recommendations WHERE from_user_id = ? AND to_user_id = ? AND movie_id = ?',
                [$fromId, $to['id'], $movieId]
            )->fetch();
            if ($existing) {
                // Re-sending brings it back for a recipient who had dismissed it.
                $this->run('UPDATE recommendations SET note = ?, created_at = ?, dismissed_at = NULL WHERE id = ?', [$note, $now, $existing['id']]);
            } else {
                $this->run(
                    'INSERT INTO recommendations (from_user_id, to_user_id, movie_id, note, created_at) VALUES (?, ?, ?, ?, ?)',
                    [$fromId, $to['id'], $movieId, $note, $now]
                );
            }
            $sent[] = $to['tag'];
        }
        return $sent;
    }

    /** Deletes a recommendation; only its sender can. Returns false when there is nothing to delete. */
    public function deleteRecommendation(int $id, int $userId): bool
    {
        return $this->run('DELETE FROM recommendations WHERE id = ? AND from_user_id = ?', [$id, $userId])->rowCount() > 0;
    }

    /** Recipient of a recommendation, or null when it does not exist. */
    public function recommendationRecipient(int $id): ?int
    {
        $to = $this->run('SELECT to_user_id FROM recommendations WHERE id = ?', [$id])->fetchColumn();
        return $to === false ? null : (int) $to;
    }

    /** Hides (or restores) a received recommendation for its recipient; the sender still sees it. Idempotent. */
    public function setRecommendationDismissed(int $id, bool $dismissed): void
    {
        if ($dismissed) {
            $this->run('UPDATE recommendations SET dismissed_at = COALESCE(dismissed_at, ?) WHERE id = ?', [date('Y-m-d H:i:s'), $id]);
        } else {
            $this->run('UPDATE recommendations SET dismissed_at = NULL WHERE id = ?', [$id]);
        }
    }

    /**
     * Profile: stats and watched list, pending titles and, for the owner only, both recommendation tabs.
     * @return array<string, mixed>
     */
    public function profile(array $user, int $viewerId): array
    {
        $out = $this->userList($user);

        $pending = $this->run(
            'SELECT ' . self::TITLE_COLS . ', wl.added_at ' . self::TITLE_FROM . '
             JOIN watchlist wl ON wl.movie_id = m.id WHERE wl.user_id = ? ORDER BY wl.added_at DESC, m.id',
            [$user['id']]
        )->fetchAll();
        $pmap = $this->providerMap(array_column($pending, 'id'));
        $out['pending'] = array_map(
            fn(array $r) => self::titleRow($r, $pmap) + ['addedAt' => self::iso($r['added_at'])],
            $pending
        );

        if ($user['id'] !== $viewerId) {
            return $out;
        }

        $toMe = $this->run(
            'SELECT ' . self::TITLE_COLS . ', r.id AS reco_id, r.note, r.created_at, f.tag AS from_tag,
                    mine.movie_id AS mine_movie, pend.movie_id AS pend_movie ' . self::TITLE_FROM . '
             JOIN recommendations r ON r.movie_id = m.id AND r.to_user_id = ? AND r.dismissed_at IS NULL
             JOIN users f ON f.id = r.from_user_id
             LEFT JOIN watch_entries mine ON mine.movie_id = m.id AND mine.user_id = r.to_user_id
             LEFT JOIN watchlist pend ON pend.movie_id = m.id AND pend.user_id = r.to_user_id
             ORDER BY r.created_at DESC, r.id DESC',
            [$user['id']]
        )->fetchAll();
        $mine = $this->run(
            'SELECT ' . self::TITLE_COLS . ', r.id AS reco_id, r.note, r.created_at, r.dismissed_at, t.tag AS to_tag, t.tag_normalized AS to_norm,
                    theirs.movie_id AS seen_movie, theirs.score AS their_score ' . self::TITLE_FROM . '
             JOIN recommendations r ON r.movie_id = m.id AND r.from_user_id = ?
             JOIN users t ON t.id = r.to_user_id
             LEFT JOIN watch_entries theirs ON theirs.movie_id = m.id AND theirs.user_id = r.to_user_id
             ORDER BY t.tag_normalized, r.created_at DESC, r.id DESC',
            [$user['id']]
        )->fetchAll();
        $pmap = $this->providerMap(array_merge(array_column($toMe, 'id'), array_column($mine, 'id')));

        $out['recommendedToMe'] = array_map(fn(array $r) => [
            'id' => (int) $r['reco_id'],
            'movie' => self::titleRow($r, $pmap),
            'from' => $r['from_tag'],
            'note' => $r['note'],
            'createdAt' => self::iso($r['created_at']),
            'watched' => $r['mine_movie'] !== null,
            'pending' => $r['pend_movie'] !== null,
        ], $toMe);

        $groups = [];
        foreach ($mine as $r) {
            $groups[$r['to_norm']]['toTag'] = $r['to_tag'];
            $groups[$r['to_norm']]['items'][] = [
                'id' => (int) $r['reco_id'],
                'movie' => self::titleRow($r, $pmap),
                'note' => $r['note'],
                'createdAt' => self::iso($r['created_at']),
                'watched' => $r['seen_movie'] !== null,
                'score' => $r['their_score'] === null ? null : (int) $r['their_score'],
                'dismissed' => $r['dismissed_at'] !== null,
            ];
        }
        $out['myRecommendations'] = array_values($groups);
        return $out;
    }

    // ---- global catalog: home rows, filtered titles, search ----

    private const TITLE_COLS = "m.id, m.title, m.original_title, m.year, m.poster_url, m.media_type, m.animated, m.tmdb_id, m.providers_link,
        sec.slug AS section_slug, sec.name AS section_name, s.slug AS studio_slug, s.name AS studio_name, s.kind AS studio_kind,
        CASE WHEN m.source = 'manual' THEN ab.tag END AS added_by_tag";
    private const TITLE_FROM = 'FROM movies m JOIN sections sec ON sec.id = m.section_id JOIN studios s ON s.id = sec.studio_id
        LEFT JOIN users ab ON ab.id = m.added_by_user_id';
    private const ADDED_ORDER = "DATE(m.added_at) DESC, (m.source = 'manual') DESC, m.added_at DESC, m.release_date DESC, m.popularity DESC, m.id";
    private const STATS_JOIN = 'LEFT JOIN (SELECT movie_id, COUNT(*) AS watchers, AVG(score) AS avg_score, COUNT(score) AS scored
                                            FROM watch_entries GROUP BY movie_id) w ON w.movie_id = m.id';

    /**
     * @param array<int, list<array{id: int, type: string}>> $pmap from providerMap()
     * @return array<string, mixed>
     */
    private static function titleRow(array $r, array $pmap): array
    {
        return [
            'id' => (int) $r['id'],
            'title' => $r['title'],
            'originalTitle' => $r['original_title'],
            'year' => (int) $r['year'],
            'posterUrl' => $r['poster_url'],
            'mediaType' => $r['media_type'],
            'animated' => self::flag($r['animated']),
            'tmdbId' => $r['tmdb_id'] === null ? null : (int) $r['tmdb_id'],
            'studio' => ['slug' => $r['studio_slug'], 'name' => $r['studio_name'], 'kind' => $r['studio_kind']],
            'section' => ['slug' => $r['section_slug'], 'name' => $r['section_name']],
            'providers' => $pmap[(int) $r['id']] ?? [],
            'providersLink' => $r['providers_link'],
            'addedBy' => $r['added_by_tag'],
        ];
    }

    /**
     * Title rows with the viewer's dynamic state attached under "state".
     * @param list<array<string, mixed>> $rows raw rows selected with TITLE_COLS
     * @return list<array<string, mixed>>
     */
    private function withStates(array $rows, int $userId): array
    {
        $ids = array_map(fn(array $r) => (int) $r['id'], $rows);
        $states = $this->titleStates($ids, $userId);
        $pmap = $this->providerMap($ids);
        return array_map(fn(array $r) => self::titleRow($r, $pmap) + ['state' => $states[(int) $r['id']]], $rows);
    }

    // ---- where to watch (TMDB watch providers, one country) ----

    /**
     * Compact providers per title, ordered by type (flatrate, free, ads, rent, buy) then TMDB display priority.
     * @param list<int|string> $ids
     * @return array<int, list<array{id: int, type: string}>>
     */
    private function providerMap(array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (!$ids) {
            return [];
        }
        $in = implode(',', array_fill(0, count($ids), '?'));
        return self::groupProviders($this->run(
            "SELECT title_id, provider_id, type FROM title_providers WHERE title_id IN ($in)
             ORDER BY title_id, type, display_priority, provider_id",
            $ids
        )->fetchAll());
    }

    /** @return array<int, list<array{id: int, type: string}>> */
    private static function groupProviders(array $rows): array
    {
        $map = [];
        foreach ($rows as $r) {
            $map[(int) $r['title_id']][] = ['id' => (int) $r['provider_id'], 'type' => $r['type']];
        }
        return $map;
    }

    /**
     * Providers dictionary keyed by id (a JSON object, also when empty).
     * @param list<int> $ids
     */
    private function providerDictionary(array $ids): object
    {
        $ids = array_values(array_unique($ids));
        $dict = [];
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            foreach ($this->run("SELECT id, name, logo_url FROM providers WHERE id IN ($in) ORDER BY id", $ids)->fetchAll() as $p) {
                $dict[(string) $p['id']] = ['name' => $p['name'], 'logoUrl' => $p['logo_url']];
            }
        }
        return (object) $dict;
    }

    /**
     * All providers (static): title counts overall and for subscription (flatrate/free/ads), most used first.
     * With $usedOnly, only providers that have at least one title.
     * @return list<array<string, mixed>>
     */
    public function providers(bool $usedOnly): array
    {
        $rows = $this->run(
            "SELECT p.id, p.name, p.logo_url, p.display_priority, COUNT(DISTINCT tp.title_id) AS n,
                    COUNT(DISTINCT CASE WHEN tp.type IN ('flatrate', 'free', 'ads') THEN tp.title_id END) AS n_flat
             FROM providers p LEFT JOIN title_providers tp ON tp.provider_id = p.id
             GROUP BY p.id, p.name, p.logo_url, p.display_priority
             " . ($usedOnly ? 'HAVING COUNT(tp.title_id) > 0' : '') . '
             ORDER BY n DESC, p.display_priority, p.name',
            []
        )->fetchAll();
        return array_map(fn(array $r) => [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'logoUrl' => $r['logo_url'],
            'titleCount' => (int) $r['n'],
            'flatrateCount' => (int) $r['n_flat'],
        ], $rows);
    }

    /** @return list<array<string, mixed>> raw rows; $params are in SQL order (join, where) */
    private function titleQuery(string $join, string $where, string $order, array $params, int $limit, int $offset = 0): array
    {
        $sql = 'SELECT ' . self::TITLE_COLS . ' ' . self::TITLE_FROM . ' ' . $join
            . ($where !== '' ? ' WHERE ' . $where : '') . ' ORDER BY ' . $order . ' LIMIT ' . $limit . ' OFFSET ' . $offset;
        return $this->run($sql, $params)->fetchAll();
    }

    /**
     * Home rows (each at most 20 items, empty rows omitted). Dynamic, per viewer. A title appears in one row only:
     * the personal rows ("Te recomendaron", "Tus pendientes") claim their titles first, then the others in display
     * order; a row skips titles already shown above or claimed and backfills from further down its own list.
     * @return array{rows: list<array<string, mixed>>}
     */
    public function home(int $userId): array
    {
        $size = 20;
        $popular = 'm.popularity DESC, m.vote_count DESC, m.id';
        // [key, title, "Ver todo" link, query(limit)] in display order; the sagas row goes after 'recommended'.
        $defs = [
            // New in the catalog (weekly sync and titles added by hand), newest first: by day, then hand-picked first.
            ['recent', 'Estrenos y agregadas recientemente', '/catalogo?sort=added', fn(int $n) =>
                $this->titleQuery('', 'm.added_at >= ?', self::ADDED_ORDER, [date('Y-m-d H:i:s', time() - 30 * 86400)], $n)],
            ['most-watched', 'Lo más visto del grupo', '/catalogo?sort=group-watched', fn(int $n) =>
                $this->titleQuery(self::STATS_JOIN, 'w.watchers IS NOT NULL', 'w.watchers DESC, ' . $popular, [], $n)],
            ['best-rated', 'Mejor puntuadas por el grupo', '/catalogo?sort=score', fn(int $n) =>
                $this->titleQuery(self::STATS_JOIN, 'w.scored >= 2', 'w.avg_score DESC, w.scored DESC, m.id', [], $n)],
            ['pending', 'Tus pendientes', '/catalogo?status=pending', fn(int $n) =>
                $this->titleQuery('JOIN watchlist wl ON wl.movie_id = m.id AND wl.user_id = ?', '', 'wl.added_at DESC, m.id', [$userId], $n)],
            ['recommended', 'Te recomendaron', '/u/me?tab=recomendadas', fn(int $n) =>
                $this->titleQuery(
                    'JOIN (SELECT movie_id, MAX(created_at) AS at FROM recommendations WHERE to_user_id = ? AND dismissed_at IS NULL GROUP BY movie_id) rc ON rc.movie_id = m.id
                     LEFT JOIN watch_entries mine ON mine.movie_id = m.id AND mine.user_id = ?',
                    'mine.movie_id IS NULL', 'rc.at DESC, m.id', [$userId, $userId], $n
                )],
            ['anime', 'Populares en Anime', '/catalogo?studio=anime&sort=popular', fn(int $n) =>
                $this->titleQuery('', 's.slug = ?', $popular, ['anime'], $n)],
            ['series', 'Series populares', '/catalogo?type=series&sort=popular', fn(int $n) =>
                $this->titleQuery('', "m.media_type = 'series' AND s.slug <> ?", $popular, ['anime'], $n)],
            ['movies', 'Películas populares', '/catalogo?type=movie&sort=popular', fn(int $n) =>
                $this->titleQuery('', "m.media_type = 'movie' AND s.slug <> ?", $popular, ['anime'], $n)],
        ];
        $claimOrder = ['recommended', 'pending', 'recent', 'most-watched', 'best-rated', 'anime', 'series', 'movies'];

        $used = [];   // title id => true
        $picked = []; // row key => raw rows
        $byKey = array_column($defs, null, 0);
        foreach ($claimOrder as $key) {
            // Enough candidates to fill the row even if every title already used is among them.
            $raw = [];
            foreach ($byKey[$key][3]($size + count($used)) as $r) {
                if (count($raw) < $size && !isset($used[(int) $r['id']])) {
                    $raw[] = $r;
                }
            }
            foreach ($raw as $r) {
                $used[(int) $r['id']] = true;
            }
            $picked[$key] = $raw;
        }

        $rows = [];
        foreach ($defs as [$key, $title, $link]) {
            if ($picked[$key]) {
                $rows[] = ['key' => $key, 'title' => $title, 'link' => $link, 'kind' => 'titles', 'items' => $this->withStates($picked[$key], $userId)];
            }
            if ($key === 'recommended') {
                $sagas = $this->popularSagas($userId);
                if ($sagas) {
                    $rows[] = ['key' => 'sagas', 'title' => 'Sagas populares', 'link' => null, 'kind' => 'sagas', 'items' => $sagas];
                }
            }
        }
        return ['rows' => $rows];
    }

    /** Sagas (collections with 2+ titles) ranked by the summed TMDB popularity of their titles. @return list<array<string, mixed>> */
    private function popularSagas(int $userId): array
    {
        $sagas = [];
        foreach ($this->run(
            'SELECT c.id, c.slug, c.name, c.poster_url, s.slug AS studio_slug, COUNT(m.id) AS n,
                    COALESCE(SUM(m.popularity), 0) AS pop, COUNT(e.movie_id) AS seen, MIN(m.poster_url) AS first_poster
             FROM collections c
             JOIN movies m ON m.collection_id = c.id
             JOIN sections sec ON sec.id = m.section_id
             JOIN studios s ON s.id = sec.studio_id
             LEFT JOIN watch_entries e ON e.movie_id = m.id AND e.user_id = ?
             GROUP BY c.id, c.slug, c.name, c.poster_url, s.slug',
            [$userId]
        )->fetchAll() as $r) {
            $k = (int) $r['id'];
            $n = (int) $r['n'];
            if (!isset($sagas[$k])) {
                $sagas[$k] = ['slug' => $r['slug'], 'name' => $r['name'], 'posterUrl' => $r['poster_url'] ?: $r['first_poster'],
                    'total' => 0, 'seen' => 0, 'pop' => 0.0, 'studioSlug' => $r['studio_slug'], 'best' => 0];
            }
            $sagas[$k]['total'] += $n;
            $sagas[$k]['seen'] += (int) $r['seen'];
            $sagas[$k]['pop'] += (float) $r['pop'];
            if ($n > $sagas[$k]['best']) { // link to the studio holding most of the saga
                $sagas[$k]['best'] = $n;
                $sagas[$k]['studioSlug'] = $r['studio_slug'];
            }
        }
        $sagas = array_filter($sagas, fn(array $x) => $x['best'] >= 2);
        usort($sagas, fn(array $a, array $b) => $b['pop'] <=> $a['pop'] ?: strcmp($a['name'], $b['name']));
        return array_map(fn(array $x) => [
            'slug' => $x['slug'], 'name' => $x['name'], 'posterUrl' => $x['posterUrl'],
            'total' => $x['total'], 'seen' => $x['seen'], 'studioSlug' => $x['studioSlug'],
        ], array_slice($sagas, 0, 20));
    }

    /**
     * Paged, filtered titles across all catalogs, 60 per page; pass the previous page's nextCursor as cursor.
     * @param array<string, mixed> $f type, studio, decade, status, provider, ptype, sort, q, cursor (page: legacy)
     * @return array<string, mixed> items, total, page, hasMore, nextCursor (null on the last page)
     * @throws \InvalidArgumentException on a malformed cursor
     */
    public function titles(int $userId, array $f): array
    {
        $size = 60;
        $page = max(1, (int) ($f['page'] ?? 1));
        $where = [];
        $params = [];
        if (in_array($f['type'] ?? '', ['movie', 'series'], true)) {
            $where[] = 'm.media_type = ?';
            $params[] = $f['type'];
        }
        if (($f['studio'] ?? '') !== '') {
            $where[] = 's.slug = ?';
            $params[] = $f['studio'];
        }
        if (($f['decade'] ?? 0) > 0) {
            $where[] = 'm.year >= ? AND m.year < ?';
            $params[] = (int) $f['decade'];
            $params[] = (int) $f['decade'] + 10;
        }
        $status = $f['status'] ?? '';
        if ($status === 'watched' || $status === 'unwatched') {
            $where[] = ($status === 'watched' ? '' : 'NOT ') . 'EXISTS (SELECT 1 FROM watch_entries x WHERE x.movie_id = m.id AND x.user_id = ?)';
            $params[] = $userId;
        } elseif ($status === 'pending') {
            $where[] = 'EXISTS (SELECT 1 FROM watchlist x WHERE x.movie_id = m.id AND x.user_id = ?)';
            $params[] = $userId;
        }
        // Where to watch: provider=<id>[,<id>] and/or ptype=flatrate|rent|buy|any (flatrate also matches free and ads).
        $providerIds = array_values(array_unique(array_filter(array_map('intval', explode(',', (string) ($f['provider'] ?? ''))), fn(int $i) => $i > 0)));
        $ptypes = ['flatrate' => ['flatrate', 'free', 'ads'], 'rent' => ['rent'], 'buy' => ['buy'], 'any' => []];
        $ptype = (string) ($f['ptype'] ?? '');
        if ($providerIds || isset($ptypes[$ptype])) {
            $sub = 'SELECT 1 FROM title_providers tp WHERE tp.title_id = m.id';
            if ($providerIds) {
                $sub .= ' AND tp.provider_id IN (' . implode(',', array_fill(0, count($providerIds), '?')) . ')';
                array_push($params, ...$providerIds);
            }
            if ($ptypes[$ptype] ?? []) {
                $sub .= ' AND tp.type IN (' . implode(',', array_fill(0, count($ptypes[$ptype]), '?')) . ')';
                array_push($params, ...$ptypes[$ptype]);
            }
            $where[] = "EXISTS ($sub)";
        }
        $q = trim((string) ($f['q'] ?? ''));
        if ($q !== '') {
            $where[] = '(m.title LIKE ? OR m.original_title LIKE ?)'; // unicode_ci: case and accent insensitive
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $params[] = $like;
            $params[] = $like;
        }
        $sort = isset(self::SORT_KEYS[$f['sort'] ?? '']) ? (string) $f['sort'] : 'popular';
        $keys = self::SORT_KEYS[$sort];
        $join = strpos(implode(' ', array_column($keys, 0)), 'w.') !== false ? self::STATS_JOIN : '';
        $cond = implode(' AND ', $where);
        $total = (int) $this->run('SELECT COUNT(*) ' . self::TITLE_FROM . ($cond !== '' ? ' WHERE ' . $cond : ''), $params)->fetchColumn();

        // Keyset pagination: the cursor holds the sort key of the last row sent, the next page starts strictly after
        // it. Unlike OFFSET, rows inserted or re-ranked above the cursor (a friend marks a title) never shift the
        // next page, so a title the client already has is not sent again. (A title whose key drops below the cursor
        // meanwhile, e.g. a mark removed, can come back on a later page: the web client keeps the first copy.)
        $cursor = (string) ($f['cursor'] ?? '');
        $offset = 0;
        if ($cursor !== '') {
            $after = self::decodeCursor($cursor, $sort, count($keys));
            $where[] = self::keysetAfter($keys, $after, $params);
        } elseif ($page > 1) {
            $offset = ($page - 1) * $size; // SPA bundles loaded before keyset pagination still send ?page=N
        }
        $cond = implode(' AND ', $where);
        $cols = [];
        foreach ($keys as $i => [$expr]) {
            $cols[] = "$expr AS sort_k$i";
        }
        $raw = $this->run(
            'SELECT ' . self::TITLE_COLS . ', ' . implode(', ', $cols) . ' ' . self::TITLE_FROM . ' ' . $join
            . ($cond !== '' ? ' WHERE ' . $cond : '')
            . ' ORDER BY ' . implode(', ', array_map(fn(array $k) => $k[0] . ' ' . $k[1], $keys))
            . ' LIMIT ' . ($size + 1) . ' OFFSET ' . $offset,
            $params
        )->fetchAll();
        $hasMore = count($raw) > $size;
        $raw = array_slice($raw, 0, $size);
        $next = null;
        if ($hasMore) {
            $last = $raw[count($raw) - 1];
            $next = self::encodeCursor($sort, array_map(fn(int $i) => $last["sort_k$i"], array_keys($keys)));
        }
        return ['items' => $this->withStates($raw, $userId), 'total' => $total, 'page' => $page, 'hasMore' => $hasMore, 'nextCursor' => $next];
    }

    /**
     * Sort keys of GET /api/titles: [SQL expression, direction], ending in the unique m.id. Expressions never yield
     * NULL (the sentinels sort where MySQL puts NULLs), so the keyset comparison and ORDER BY always agree.
     */
    private const SORT_KEYS = [
        'popular' => [['COALESCE(m.popularity, -1)', 'DESC'], ['COALESCE(m.vote_count, -1)', 'DESC'], ['m.id', 'ASC']],
        'year' => [['m.year', 'DESC'], ['COALESCE(m.popularity, -1)', 'DESC'], ['m.id', 'ASC']],
        'score' => [['COALESCE(w.avg_score, -1)', 'DESC'], ['COALESCE(w.scored, -1)', 'DESC'], ['COALESCE(m.popularity, -1)', 'DESC'], ['m.id', 'ASC']],
        'group-watched' => [['COALESCE(w.watchers, 0)', 'DESC'], ['COALESCE(m.popularity, -1)', 'DESC'], ['m.id', 'ASC']],
        'title' => [['m.title', 'ASC'], ['m.id', 'ASC']],
        // Same order as ADDED_ORDER (home "recent" row), titles without a date last.
        'added' => [
            ['(m.added_at IS NULL)', 'ASC'], ["COALESCE(DATE(m.added_at), '1000-01-01')", 'DESC'], ["(m.source = 'manual')", 'DESC'],
            ["COALESCE(m.added_at, '1000-01-01 00:00:00')", 'DESC'], ["COALESCE(m.release_date, '1000-01-01')", 'DESC'],
            ['COALESCE(m.popularity, -1)', 'DESC'], ['m.id', 'ASC'],
        ],
    ];

    /**
     * "Row comes after $values" for a mixed-direction key list, spelled out as OR-ed prefixes (portable, no row
     * value comparison): k0 beyond v0, or k0 = v0 and k1 beyond v1, ... Appends its parameters to $params.
     * @param list<array{0: string, 1: string}> $keys
     * @param list<int|float|string> $values
     */
    private static function keysetAfter(array $keys, array $values, array &$params): string
    {
        $or = [];
        foreach ($keys as $i => [$expr, $dir]) {
            $and = [];
            for ($j = 0; $j < $i; $j++) {
                $and[] = $keys[$j][0] . ' = ?';
                $params[] = $values[$j];
            }
            $and[] = $expr . ($dir === 'DESC' ? ' < ?' : ' > ?');
            $params[] = $values[$i];
            $or[] = '(' . implode(' AND ', $and) . ')';
        }
        return '(' . implode(' OR ', $or) . ')';
    }

    /** Opaque cursor: base64url JSON {s: sort, k: sort key values of the last row}. */
    private static function encodeCursor(string $sort, array $values): string
    {
        return rtrim(strtr(base64_encode((string) json_encode(['s' => $sort, 'k' => $values])), '+/', '-_'), '=');
    }

    /**
     * @return list<int|float|string>
     * @throws \InvalidArgumentException when the cursor is malformed or belongs to another sort
     */
    private static function decodeCursor(string $cursor, string $sort, int $count): array
    {
        $json = strlen($cursor) <= 2000 ? base64_decode(strtr($cursor, '-_', '+/'), true) : false;
        $data = $json === false ? null : json_decode($json, true);
        $values = is_array($data) && ($data['s'] ?? null) === $sort && is_array($data['k'] ?? null) ? $data['k'] : null;
        if ($values === null || array_keys($values) !== range(0, $count - 1)) {
            throw new \InvalidArgumentException('Invalid cursor.');
        }
        foreach ($values as $v) {
            if (!is_int($v) && !is_float($v) && !is_string($v)) {
                throw new \InvalidArgumentException('Invalid cursor.');
            }
        }
        return $values;
    }

    /** Lowercase and strip accents so "Señor" and "senor" compare equal. */
    private static function fold(string $s): string
    {
        $s = function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
        return strtr($s, [
            'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'ã' => 'a', 'å' => 'a', 'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
            'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i', 'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o', 'õ' => 'o',
            'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u', 'ñ' => 'n', 'ç' => 'c',
        ]);
    }

    /**
     * Global search over title and original title: prefix match > word match > contains, then popularity. Top 30.
     * @return list<array<string, mixed>>
     */
    public function search(string $q, int $userId): array
    {
        $needle = self::fold(trim($q));
        if (strlen($needle) < 2) {
            return [];
        }
        $like = '%' . addcslashes(trim($q), '%_\\') . '%';
        $raw = $this->titleQuery('', '(m.title LIKE ? OR m.original_title LIKE ?)', 'm.popularity DESC, m.vote_count DESC, m.id', [$like, $like], 300);

        $rank = function (array $r) use ($needle): int {
            $best = 3;
            foreach ([$r['title'], $r['original_title']] as $name) {
                if ($name === null) {
                    continue;
                }
                $name = self::fold((string) $name);
                if (strpos($name, $needle) === 0) {
                    return 0;
                }
                if (preg_match('/(^|[^\p{L}\p{N}])' . preg_quote($needle, '/') . '/u', $name) === 1) {
                    $best = min($best, 1);
                } elseif (strpos($name, $needle) !== false) {
                    $best = min($best, 2);
                }
            }
            return $best;
        };
        $ranked = [];
        foreach ($raw as $i => $r) { // $raw is already popularity-ordered, so the index breaks ties
            $ranked[] = [$rank($r), $i, $r];
        }
        usort($ranked, fn(array $a, array $b) => [$a[0], $a[1]] <=> [$b[0], $b[1]]);
        $top = array_map(fn(array $x) => $x[2], array_slice($ranked, 0, 30));
        return $this->withStates($top, $userId);
    }

    /** One title with the viewer's state (global title shape), or null. @return array<string, mixed>|null */
    public function titleById(int $id, int $userId): ?array
    {
        $raw = $this->titleQuery('', 'm.id = ?', 'm.id', [$id], 1);
        return $raw ? $this->withStates($raw, $userId)[0] : null;
    }

    /**
     * Other versions of a title (remakes, reboots, the series and the movie...): titles whose Spanish or original
     * title has the same version key as the Spanish or original title of this one. Computed at read time over every
     * title (a few ms for ~3000 rows), so renames by the weekly sync apply right away. Pairs listed in
     * database/studios/not-versions.php share a key but are different works and are skipped. Oldest first.
     * @return list<array<string, mixed>>|null null when the title does not exist
     */
    public function versions(int $id, int $userId): ?array
    {
        $all = $this->run('SELECT id, title, original_title, media_type, tmdb_id FROM movies', [])->fetchAll();
        $mine = null;
        $myRef = '';
        foreach ($all as $r) {
            if ((int) $r['id'] === $id) {
                $mine = self::versionKeys($r);
                $myRef = self::tmdbRefKey($r);
                break;
            }
        }
        if ($mine === null) {
            return null;
        }
        $notVersions = StudioDefinitions::notVersions();
        $ids = [];
        foreach ($all as $r) {
            if ((int) $r['id'] !== $id && $mine && array_intersect_key($mine, self::versionKeys($r))
                && !isset($notVersions[$myRef . '|' . self::tmdbRefKey($r)])) {
                $ids[] = (int) $r['id'];
            }
        }
        if (!$ids) {
            return [];
        }
        $in = implode(',', array_fill(0, count($ids), '?'));
        return $this->withStates($this->titleQuery('', "m.id IN ($in)", 'm.year, m.id', $ids, count($ids)), $userId);
    }

    /**
     * A row's TMDB ref in the studio data files' format: 'movie:<id>' / 'tv:<id>' ('' without a TMDB id).
     * @param array<string, mixed> $r row with media_type and tmdb_id
     */
    private static function tmdbRefKey(array $r): string
    {
        return $r['tmdb_id'] === null ? '' : ($r['media_type'] === 'series' ? 'tv' : 'movie') . ':' . (int) $r['tmdb_id'];
    }

    /**
     * Version keys of a title row: its Spanish title and its original title, each folded (case and accents), with
     * '&' read as "and", reduced to letters and digits and stripped of a leading Spanish article (el, la, los, las,
     * un, una). Two rows match when any key is equal, so "La Bella y la Bestia" matches "Bella y la Bestia" and
     * "Beauty & the Beast" matches "Beauty and the Beast". There is no translation: a Spanish title only meets an
     * English one when the other row's original_title spells it the same way. Keys under VERSION_MIN_KEY characters
     * are dropped: they are too generic ("Z", "Up", "It").
     * @param array<string, mixed> $r row with title and original_title
     * @return array<string, true>
     */
    private static function versionKeys(array $r): array
    {
        $keys = [];
        foreach ([$r['title'], $r['original_title']] as $name) {
            if ($name === null || $name === '') {
                continue;
            }
            $s = (string) preg_replace('/[^\p{L}\p{N}]+/u', ' ', strtr(self::fold((string) $name), ['&' => ' and ']));
            $s = (string) preg_replace('/^\s*(el|la|los|las|un|una) /', '', $s . ' ');
            $s = str_replace(' ', '', $s);
            if ((function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s)) >= self::VERSION_MIN_KEY) {
                $keys[$s] = true;
            }
        }
        return $keys;
    }

    /**
     * Which TMDB titles are already in the catalog.
     * @param list<array{0: string, 1: int}> $refs [media_type ('movie'|'series'), tmdb id]
     * @return array<string, array{id: int, studioSlug: string}> keyed 'movie:<id>' / 'series:<id>'
     */
    public function catalogIdsByTmdb(array $refs): array
    {
        if (!$refs) {
            return [];
        }
        $cond = implode(' OR ', array_fill(0, count($refs), '(m.media_type = ? AND m.tmdb_id = ?)'));
        $params = [];
        foreach ($refs as $r) {
            $params[] = $r[0];
            $params[] = (int) $r[1];
        }
        $out = [];
        foreach ($this->run('SELECT m.id, m.media_type, m.tmdb_id, s.slug FROM movies m JOIN sections sec ON sec.id = m.section_id
                             JOIN studios s ON s.id = sec.studio_id WHERE ' . $cond, $params)->fetchAll() as $r) {
            $out[$r['media_type'] . ':' . $r['tmdb_id']] = ['id' => (int) $r['id'], 'studioSlug' => $r['slug']];
        }
        return $out;
    }

    /** @return array{slug: string, name: string, kind: string}|null */
    public function studioOfTitle(int $id): ?array
    {
        $r = $this->run('SELECT s.slug, s.name, s.kind FROM movies m JOIN sections sec ON sec.id = m.section_id
                         JOIN studios s ON s.id = sec.studio_id WHERE m.id = ?', [$id])->fetch();
        return $r ? ['slug' => $r['slug'], 'name' => $r['name'], 'kind' => $r['kind']] : null;
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

    /** Nullable boolean column (movies.animated: null until the importer has seen the title). @param mixed $value */
    private static function flag($value): ?bool
    {
        return $value === null ? null : (bool) (int) $value;
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
