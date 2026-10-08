<?php

declare(strict_types=1);

/**
 * Where to watch: refreshes TMDB watch providers (data by JustWatch) for one country (CLI, PHP 7.4+, cron friendly).
 *
 *   php bin/refresh-providers.php [--country=AR] [--stale-days=7] [--limit=N] [--studio=slug] [--dry-run] [--verbose]
 *
 * Only titles whose providers were never fetched or are older than --stale-days are refreshed (0 = all). For each
 * title its rows in title_providers are replaced in one transaction, providers are upserted and movies.providers_link /
 * providers_updated_at are set (also when the country has no data: no rows, timestamp set).
 * No disk cache: providers change weekly. A lock file in storage/ prevents overlapping runs.
 * Exit codes: 0 ok, 1 error (or some titles failed), 2 usage, 3 another run holds the lock.
 */

use App\Db;
use App\TmdbClient;

require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/TmdbClient.php';

if (PHP_SAPI !== 'cli') {
    exit("CLI only.\n");
}

const PROVIDER_TYPES = ['flatrate', 'free', 'ads', 'rent', 'buy'];
const LOGO_BASE = 'https://image.tmdb.org/t/p/w92';
// Channel/tier variants hidden when their base provider is listed for the same title and type
// (e.g. "Crunchyroll Amazon Channel" when "Crunchyroll" is there).
const VARIANT_SUFFIXES = '/\s+(?:Amazon Channels?|Apple TV Channels?|Roku Premium Channels?|Standard with Ads|Basic with Ads|with Ads)$/i';

function out(string $line): void
{
    fwrite(STDOUT, $line . "\n");
}

function stop(string $message, int $code = 1): void
{
    fwrite(STDERR, 'Error: ' . $message . "\n");
    exit($code);
}

$opts = getopt('', ['country:', 'stale-days:', 'limit:', 'studio:', 'dry-run', 'verbose', 'config:', 'help']);
if (isset($opts['help'])) {
    out('Usage: php bin/refresh-providers.php [--country=AR] [--stale-days=7] [--limit=N] [--studio=slug] [--dry-run] [--verbose] [--config=path]');
    exit(0);
}
foreach (['stale-days', 'limit'] as $k) {
    if (isset($opts[$k]) && !ctype_digit((string) $opts[$k])) {
        stop("--$k must be a non-negative integer.", 2);
    }
}
$dry = isset($opts['dry-run']);
$verbose = isset($opts['verbose']) || $dry;
$staleDays = isset($opts['stale-days']) ? (int) $opts['stale-days'] : 7;
$limit = isset($opts['limit']) ? (int) $opts['limit'] : 0;
$studio = isset($opts['studio']) ? (string) preg_replace('/[^a-z0-9-]/', '', (string) $opts['studio']) : '';

$storage = __DIR__ . '/../storage';
if (!is_dir($storage)) {
    @mkdir($storage, 0775, true);
}
$lock = @fopen($storage . '/refresh-providers.lock', 'c');
if ($lock === false) {
    stop('Cannot open the lock file in ' . realpath($storage) . '.');
}
if (!flock($lock, LOCK_EX | LOCK_NB)) {
    fwrite(STDERR, "Another refresh-providers run is in progress; exiting.\n");
    exit(3);
}

$started = microtime(true);
try {
    $configFile = isset($opts['config']) ? (string) $opts['config'] : (getenv('DISNEY_CONFIG') ?: __DIR__ . '/../config/config.php');
    if (!is_file($configFile)) {
        stop('Config file not found: ' . $configFile);
    }
    $config = require $configFile;
    $tmdbCfg = $config['tmdb'] ?? [];
    $country = strtoupper((string) ($opts['country'] ?? ($tmdbCfg['watch_country'] ?? 'AR')));
    if (preg_match('/\A[A-Z]{2}\z/', $country) !== 1) {
        stop('--country must be a 2-letter ISO 3166-1 code.', 2);
    }
    $tmdb = new TmdbClient(
        (string) ($tmdbCfg['api_key'] ?? ''),
        (string) ($tmdbCfg['read_token'] ?? ''),
        null, // no cache: providers change weekly
        (string) ($tmdbCfg['ca_bundle'] ?? (getenv('SSL_CERT_FILE') ?: ''))
    );
    if (!$tmdb->hasCredentials()) {
        stop("TMDB credentials are missing. Set 'tmdb' => ['api_key' => '...'] in config.php.");
    }
    $pdo = Db::connect($config['db']);

    $where = ['m.tmdb_id IS NOT NULL'];
    $params = [];
    if ($staleDays > 0) {
        $where[] = '(m.providers_updated_at IS NULL OR m.providers_updated_at < ?)';
        $params[] = date('Y-m-d H:i:s', time() - $staleDays * 86400);
    }
    if ($studio !== '') {
        $where[] = 's.slug = ?';
        $params[] = $studio;
    }
    $sql = 'SELECT m.id, m.media_type, m.tmdb_id, m.title, m.year FROM movies m
            JOIN sections sec ON sec.id = m.section_id JOIN studios s ON s.id = sec.studio_id
            WHERE ' . implode(' AND ', $where) . '
            ORDER BY m.providers_updated_at IS NOT NULL, m.providers_updated_at, m.id' . ($limit > 0 ? ' LIMIT ' . $limit : '');
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $titles = $stmt->fetchAll();
    out(sprintf('Watch providers (%s): %d titles to refresh%s.', $country, count($titles), $dry ? ' [dry run: nothing is written]' : ''));

    $upsertProvider = $pdo->prepare(
        'INSERT INTO providers (id, name, logo_url, display_priority) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), logo_url = VALUES(logo_url), display_priority = VALUES(display_priority)'
    );
    $deleteRows = $pdo->prepare('DELETE FROM title_providers WHERE title_id = ?');
    $insertRow = $pdo->prepare('INSERT INTO title_providers (title_id, provider_id, type, display_priority) VALUES (?, ?, ?, ?)');
    $touch = $pdo->prepare('UPDATE movies SET providers_link = ?, providers_updated_at = ? WHERE id = ?');

    $stats = ['updated' => 0, 'with' => 0, 'without' => 0, 'failed' => 0, 'hidden' => 0];
    foreach ($titles as $t) {
        $label = sprintf('#%d %s "%s" (%d)', $t['id'], $t['media_type'], $t['title'], $t['year']);
        try {
            $res = $tmdb->get('/' . ($t['media_type'] === 'series' ? 'tv' : 'movie') . '/' . (int) $t['tmdb_id'] . '/watch/providers');
        } catch (Throwable $e) {
            $stats['failed']++;
            fwrite(STDERR, "  failed $label: " . $e->getMessage() . "\n");
            if (strpos($e->getMessage(), 'HTTP 401') !== false) {
                throw $e; // bad credentials: every request would fail
            }
            continue;
        }
        $data = isset($res['_not_found']) ? [] : ($res['results'][$country] ?? []);
        [$rows, $providers, $hidden] = normalizeProviders($data);
        $stats['hidden'] += $hidden;
        $link = isset($data['link']) && is_string($data['link']) && $data['link'] !== '' ? substr($data['link'], 0, 500) : null;

        if (!$dry) {
            $pdo->beginTransaction();
            try {
                foreach ($providers as $p) {
                    $upsertProvider->execute([$p['id'], $p['name'], $p['logo'], $p['priority']]);
                }
                $deleteRows->execute([$t['id']]);
                foreach ($rows as $r) {
                    $insertRow->execute([$t['id'], $r['id'], $r['type'], $r['priority']]);
                }
                $touch->execute([$link,date('Y-m-d H:i:s'), $t['id']]);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e; // a database error is not per-title: stop
            }
        }
        $stats['updated']++;
        $stats[$rows ? 'with' : 'without']++;
        if ($verbose) {
            out("  $label: " . ($rows ? describe($rows, $providers) : '-'));
        }
    }

    out(sprintf(
        'Done in %.1fs: %d titles %s (%d with providers, %d without), %d failed, %d channel variants hidden, %d TMDB requests.',
        microtime(true) - $started, $stats['updated'], $dry ? 'checked' : 'updated', $stats['with'], $stats['without'],
        $stats['failed'], $stats['hidden'], $tmdb->requests
    ));
    exit($stats['failed'] > 0 ? 1 : 0);
} catch (PDOException $e) {
    stop('Database error: ' . $e->getMessage() . ' (was database/migrations/006_watch_providers.sql applied?)');
} catch (Throwable $e) {
    stop($e->getMessage());
}

/**
 * Flattens one country's result into rows (provider id, type, priority), drops channel/tier variants whose base
 * provider is listed for the same type, and collects the providers used.
 * @return array{0: list<array{id: int, type: string, priority: int}>, 1: array<int, array<string, mixed>>, 2: int}
 */
function normalizeProviders(array $data): array
{
    $rows = [];
    $providers = [];
    $hidden = 0;
    foreach (PROVIDER_TYPES as $type) {
        $list = is_array($data[$type] ?? null) ? $data[$type] : [];
        $names = [];
        foreach ($list as $p) {
            $names[providerKey((string) ($p['provider_name'] ?? ''))] = true;
        }
        $seen = [];
        foreach ($list as $p) {
            $id = (int) ($p['provider_id'] ?? 0);
            $name = trim((string) ($p['provider_name'] ?? ''));
            if ($id <= 0 || $name === '' || isset($seen[$id])) {
                continue;
            }
            $base = providerKey((string) preg_replace(VARIANT_SUFFIXES, '', $name));
            if ($base !== providerKey($name) && isset($names[$base])) {
                $hidden++;
                continue;
            }
            $seen[$id] = true;
            $priority = (int) ($p['display_priority'] ?? 0);
            $rows[] = ['id' => $id, 'type' => $type, 'priority' => $priority];
            $providers[$id] = [
                'id' => $id,
                'name' => substr($name, 0, 100),
                'logo' => !empty($p['logo_path']) ? LOGO_BASE . $p['logo_path'] : null,
                'priority' => $priority,
            ];
        }
    }
    return [$rows, $providers, $hidden];
}

/** Comparable provider name: "Paramount+" and "Paramount Plus" match. */
function providerKey(string $name): string
{
    return trim((string) preg_replace('/\s+/', ' ', str_replace('+', ' plus', strtolower($name))));
}

/** "flatrate: Netflix, Disney Plus | buy: Google Play Movies" */
function describe(array $rows, array $providers): string
{
    $byType = [];
    foreach ($rows as $r) {
        $byType[$r['type']][] = $providers[$r['id']]['name'];
    }
    $parts = [];
    foreach ($byType as $type => $names) {
        $parts[] = $type . ': ' . implode(', ', $names);
    }
    return implode(' | ', $parts);
}
