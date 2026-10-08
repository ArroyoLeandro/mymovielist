<?php

declare(strict_types=1);

namespace App;

use PDO;

/**
 * Where to watch: TMDB watch providers (data by JustWatch) for one country, stored per title in title_providers.
 * Used by bin/refresh-providers.php, the catalog sync and the manual import of a title.
 */
final class WatchProviders
{
    public const TYPES = ['flatrate', 'free', 'ads', 'rent', 'buy'];
    private const LOGO_BASE = 'https://image.tmdb.org/t/p/w92';
    // Channel/tier variants hidden when their base provider is listed for the same title and type
    // (e.g. "Crunchyroll Amazon Channel" when "Crunchyroll" is there).
    private const VARIANT_SUFFIXES = '/\s+(?:Amazon Channels?|Apple TV Channels?|Roku Premium Channels?|Standard with Ads|Basic with Ads|with Ads)$/i';
    private const BATCH = 30; // titles fetched in parallel per round

    /** @var PDO */
    private $pdo;
    /** @var TmdbClient */
    private $tmdb;
    /** @var string */
    private $country;

    public function __construct(PDO $pdo, TmdbClient $tmdb, string $country)
    {
        $this->pdo = $pdo;
        $this->tmdb = $tmdb;
        $this->country = $country;
    }

    /** SQL filter for titles whose providers were never fetched or are older than $staleDays (0 = all). */
    private function staleWhere(int $staleDays, string $studio, array &$params): string
    {
        $where = ['m.tmdb_id IS NOT NULL'];
        if ($staleDays > 0) {
            $where[] = '(m.providers_updated_at IS NULL OR m.providers_updated_at < ?)';
            $params[] = date('Y-m-d H:i:s', time() - $staleDays * 86400);
        }
        if ($studio !== '') {
            $where[] = 's.slug = ?';
            $params[] = $studio;
        }
        return implode(' AND ', $where);
    }

    public function countStale(int $staleDays, string $studio = ''): int
    {
        $params = [];
        $where = $this->staleWhere($staleDays, $studio, $params);
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM movies m JOIN sections sec ON sec.id = m.section_id JOIN studios s ON s.id = sec.studio_id WHERE ' . $where);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    /** @return list<array<string, mixed>> stalest first (never fetched first) */
    public function staleTitles(int $staleDays, string $studio = '', int $limit = 0): array
    {
        $params = [];
        $where = $this->staleWhere($staleDays, $studio, $params);
        $stmt = $this->pdo->prepare(
            'SELECT m.id, m.media_type, m.tmdb_id, m.title, m.year FROM movies m
             JOIN sections sec ON sec.id = m.section_id JOIN studios s ON s.id = sec.studio_id
             WHERE ' . $where . '
             ORDER BY m.providers_updated_at IS NOT NULL, m.providers_updated_at, m.id' . ($limit > 0 ? ' LIMIT ' . $limit : '')
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Refreshes the given titles (rows with id, media_type, tmdb_id, title, year), fetching in parallel batches.
     * Per title its rows are replaced in one transaction; also titles without data get their timestamp.
     * @param callable(string): void|null $log receives one line per title (verbose)
     * @return array{updated: int, with: int, without: int, failed: int, hidden: int, errors: list<string>}
     */
    public function refresh(array $titles, bool $dry = false, ?callable $log = null): array
    {
        $stats = ['updated' => 0, 'with' => 0, 'without' => 0, 'failed' => 0, 'hidden' => 0, 'errors' => []];
        foreach (array_chunk($titles, self::BATCH) as $chunk) {
            $requests = [];
            foreach ($chunk as $t) {
                $requests[(string) $t['id']] = ['/' . ($t['media_type'] === 'series' ? 'tv' : 'movie') . '/' . (int) $t['tmdb_id'] . '/watch/providers'];
            }
            try {
                $responses = $this->tmdb->getMany($requests, false); // never cached: providers change weekly
            } catch (TmdbDeadlineExceeded $e) {
                throw $e;
            } catch (\Throwable $e) {
                if (strpos($e->getMessage(), 'HTTP 401') !== false) {
                    throw $e; // bad credentials: every request would fail
                }
                $stats['failed'] += count($chunk);
                $stats['errors'][] = 'batch failed: ' . $e->getMessage();
                continue;
            }
            foreach ($chunk as $t) {
                $res = $responses[(string) $t['id']] ?? ['_not_found' => true];
                [$rows, $hidden, $link] = $this->store((int) $t['id'], $res, $dry);
                $stats['hidden'] += $hidden;
                $stats['updated']++;
                $stats[$rows ? 'with' : 'without']++;
                if ($log !== null) {
                    $log(sprintf('  #%d %s "%s" (%d): %s', $t['id'], $t['media_type'], $t['title'], $t['year'], $rows ? self::describe($rows) : '-'));
                }
            }
        }
        return $stats;
    }

    /** Fetches and stores one title's providers right away (manual import). Returns how many offers it has. */
    public function refreshOne(int $titleId, string $media, int $tmdbId): int
    {
        $res = $this->tmdb->get('/' . ($media === 'series' ? 'tv' : 'movie') . '/' . $tmdbId . '/watch/providers', [], false);
        return count($this->store($titleId, $res, false)[0]);
    }

    /**
     * @param array<string, mixed> $res TMDB /watch/providers response
     * @return array{0: list<array<string, mixed>>, 1: int, 2: string|null} rows, hidden variants, link
     */
    private function store(int $titleId, array $res, bool $dry): array
    {
        $data = isset($res['_not_found']) ? [] : ($res['results'][$this->country] ?? []);
        [$rows, $providers, $hidden] = self::normalize($data);
        $link = isset($data['link']) && is_string($data['link']) && $data['link'] !== '' ? substr($data['link'], 0, 500) : null;
        if ($dry) {
            return [$rows, $hidden, $link];
        }
        $this->pdo->beginTransaction();
        try {
            $upsert = $this->pdo->prepare(
                'INSERT INTO providers (id, name, logo_url, display_priority) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), logo_url = VALUES(logo_url), display_priority = VALUES(display_priority)'
            );
            foreach ($providers as $p) {
                $upsert->execute([$p['id'], $p['name'], $p['logo'], $p['priority']]);
            }
            $this->pdo->prepare('DELETE FROM title_providers WHERE title_id = ?')->execute([$titleId]);
            $insert = $this->pdo->prepare('INSERT INTO title_providers (title_id, provider_id, type, display_priority) VALUES (?, ?, ?, ?)');
            foreach ($rows as $r) {
                $insert->execute([$titleId, $r['id'], $r['type'], $r['priority']]);
            }
            $this->pdo->prepare('UPDATE movies SET providers_link = ?, providers_updated_at = ? WHERE id = ?')->execute([$link, date('Y-m-d H:i:s'), $titleId]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e; // a database error is not per-title: stop
        }
        return [$rows, $hidden, $link];
    }

    /**
     * Flattens one country's result into rows (provider id, type, priority), drops channel/tier variants whose base
     * provider is listed for the same type, and collects the providers used.
     * @return array{0: list<array{id: int, type: string, priority: int}>, 1: array<int, array<string, mixed>>, 2: int}
     */
    public static function normalize(array $data): array
    {
        $rows = [];
        $providers = [];
        $hidden = 0;
        foreach (self::TYPES as $type) {
            $list = is_array($data[$type] ?? null) ? $data[$type] : [];
            $names = [];
            foreach ($list as $p) {
                $names[self::key((string) ($p['provider_name'] ?? ''))] = true;
            }
            $seen = [];
            foreach ($list as $p) {
                $id = (int) ($p['provider_id'] ?? 0);
                $name = trim((string) ($p['provider_name'] ?? ''));
                if ($id <= 0 || $name === '' || isset($seen[$id])) {
                    continue;
                }
                $base = self::key((string) preg_replace(self::VARIANT_SUFFIXES, '', $name));
                if ($base !== self::key($name) && isset($names[$base])) {
                    $hidden++;
                    continue;
                }
                $seen[$id] = true;
                $priority = (int) ($p['display_priority'] ?? 0);
                $rows[] = ['id' => $id, 'type' => $type, 'priority' => $priority, 'name' => substr($name, 0, 100)];
                $providers[$id] = [
                    'id' => $id,
                    'name' => substr($name, 0, 100),
                    'logo' => !empty($p['logo_path']) ? self::LOGO_BASE . $p['logo_path'] : null,
                    'priority' => $priority,
                ];
            }
        }
        return [$rows, $providers, $hidden];
    }

    /** Comparable provider name: "Paramount+" and "Paramount Plus" match. */
    private static function key(string $name): string
    {
        return trim((string) preg_replace('/\s+/', ' ', str_replace('+', ' plus', strtolower($name))));
    }

    /** "flatrate: Netflix, Disney Plus | buy: Google Play Movies" */
    private static function describe(array $rows): string
    {
        $byType = [];
        foreach ($rows as $r) {
            $byType[$r['type']][] = $r['name'];
        }
        $parts = [];
        foreach ($byType as $type => $names) {
            $parts[] = $type . ': ' . implode(', ', $names);
        }
        return implode(' | ', $parts);
    }
}
