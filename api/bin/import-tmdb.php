<?php

declare(strict_types=1);

/**
 * TMDB catalog importer (CLI, PHP 7.4+).
 *
 *   php bin/import-tmdb.php --match-existing [--dry-run]        link seeded rows (tmdb_id NULL) to TMDB ids
 *   php bin/import-tmdb.php --studio=disney [--dry-run]         import/update a studio from database/studios/<slug>.php
 *
 * Other flags: --emit-seed=path (write the resolved rows as SQL), --prune (delete orphaned rows that have no
 * watch entries), --move (take over rows currently owned by another studio; their ids and watch entries are kept), --no-cache (skip the 24h response cache in storage/tmdb-cache), --config=path, --verbose.
 * Rows with watch entries are never deleted; rows no longer in the definition are reported as "orphaned".
 */

use App\Db;
use App\TmdbClient;
use App\TmdbResolver;

require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/TmdbClient.php';
require __DIR__ . '/../src/TmdbResolver.php';

if (PHP_SAPI !== 'cli') {
    exit("CLI only.\n");
}

function say(string $line = ''): void
{
    fwrite(STDOUT, $line . "\n");
}

function fail(string $message, int $code = 1): void
{
    fwrite(STDERR, "Error: " . $message . "\n");
    exit($code);
}

$opts = getopt('', ['studio:', 'dry-run', 'match-existing', 'emit-seed:', 'prune', 'move', 'no-cache', 'config:', 'verbose', 'help']);
if (isset($opts['help']) || (!isset($opts['studio']) && !isset($opts['match-existing']))) {
    say("Usage:\n  php bin/import-tmdb.php --match-existing [--dry-run]\n  php bin/import-tmdb.php --studio=<slug> [--dry-run] [--emit-seed=path] [--prune] [--no-cache] [--verbose]");
    exit(isset($opts['help']) ? 0 : 2);
}
$dry = isset($opts['dry-run']);
$verbose = isset($opts['verbose']) || $dry;

try {
    $configFile = isset($opts['config']) ? (string) $opts['config'] : (getenv('DISNEY_CONFIG') ?: __DIR__ . '/../config/config.php');
    if (!is_file($configFile)) {
        fail('Config file not found: ' . $configFile);
    }
    $config = require $configFile;
    $tmdbCfg = $config['tmdb'] ?? [];
    $tmdb = new TmdbClient(
        (string) ($tmdbCfg['api_key'] ?? ''),
        (string) ($tmdbCfg['read_token'] ?? ''),
        isset($opts['no-cache']) ? null : __DIR__ . '/../storage/tmdb-cache',
        (string) ($tmdbCfg['ca_bundle'] ?? (getenv('SSL_CERT_FILE') ?: ''))
    );
    if (!$tmdb->hasCredentials()) {
        fail("TMDB credentials are missing. Set 'tmdb' => ['api_key' => '...'] (v3) or ['read_token' => '...'] (v4) in config.php.");
    }
    $pdo = Db::connect($config['db']);

    if (isset($opts['match-existing'])) {
        matchExisting($pdo, $tmdb, $dry);
    } else {
        importStudio($pdo, $tmdb, preg_replace('/[^a-z0-9-]/', '', (string) $opts['studio']), $opts, $dry, $verbose);
    }
    say(sprintf('Done (%d TMDB requests%s).', $tmdb->requests, $dry ? ', dry run: nothing written' : ''));
} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage() . " (was database/migrations/002_tmdb.sql applied?)");
} catch (Throwable $e) {
    fail($e->getMessage());
}

// ---------------------------------------------------------------------------------------------------------------

/** Link seeded rows without a tmdb_id to TMDB (search by original English title + year). */
function matchExisting(PDO $pdo, TmdbClient $tmdb, bool $dry): void
{
    $rows = $pdo->query('SELECT id, title, wiki_title, year FROM movies WHERE tmdb_id IS NULL ORDER BY id')->fetchAll();
    say(count($rows) . ' rows without tmdb_id.');
    $taken = [];
    foreach ($pdo->query("SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL AND media_type = 'movie'")->fetchAll() as $r) {
        $taken[(int) $r['tmdb_id']] = true;
    }
    $matched = 0;
    $unmatched = [];
    foreach ($rows as $row) {
        $query = trim((string) preg_replace('/\s*\((?:[^()]*\bfilm|film)\)\s*$/i', '', (string) ($row['wiki_title'] ?: $row['title'])));
        $year = (int) $row['year'];
        $hit = null;
        foreach ([['year' => $year], []] as $extra) {
            $res = $tmdb->get('/search/movie', array_merge(['query' => $query, 'language' => 'en-US', 'include_adult' => 'false'], $extra));
            $hit = pickSearchHit($res['results'] ?? [], $query, $year);
            if ($hit !== null) {
                break;
            }
        }
        if ($hit === null || isset($taken[(int) $hit['id']])) {
            $unmatched[] = sprintf('#%d "%s" (%d) -> %s', $row['id'], $query, $year, $hit === null ? 'no match' : 'tmdb ' . $hit['id'] . ' already used');
            continue;
        }
        $taken[(int) $hit['id']] = true;
        $matched++;
        say(sprintf('%s #%d "%s" (%d) -> tmdb %d "%s" %s', $dry ? '[dry]' : 'ok', $row['id'], $query, $year, $hit['id'], $hit['title'], substr((string) ($hit['release_date'] ?? ''), 0, 10)));
        if (!$dry) {
            $pdo->prepare("UPDATE movies SET tmdb_id = ?, media_type = 'movie' WHERE id = ? AND tmdb_id IS NULL")->execute([(int) $hit['id'], $row['id']]);
        }
    }
    say("Matched: $matched. Unmatched: " . count($unmatched));
    foreach ($unmatched as $line) {
        say('  UNMATCHED ' . $line);
    }
}

function normTitle(string $s): string
{
    $s = strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s) ?: $s);
    return (string) preg_replace('/[^a-z0-9]+/', '', $s);
}

/** Best search result: release year within +-1, exact title match preferred, then most voted. */
function pickSearchHit(array $results, string $query, int $year): ?array
{
    $best = null;
    $bestScore = -1;
    $q = normTitle($query);
    foreach ($results as $r) {
        $ry = (int) substr((string) ($r['release_date'] ?? ''), 0, 4);
        if ($ry === 0 || abs($ry - $year) > 1) {
            continue;
        }
        $exact = normTitle((string) ($r['title'] ?? '')) === $q || normTitle((string) ($r['original_title'] ?? '')) === $q;
        $score = ($exact ? 1000000 : 0) + (int) ($r['vote_count'] ?? 0);
        if ($score > $bestScore && ($exact || (int) ($r['vote_count'] ?? 0) >= 100)) {
            $best = $r;
            $bestScore = $score;
        }
    }
    return $best;
}

// ---------------------------------------------------------------------------------------------------------------

function importStudio(PDO $pdo, TmdbClient $tmdb, string $slug, array $opts, bool $dry, bool $verbose): void
{
    $file = __DIR__ . '/../database/studios/' . $slug . '.php';
    if ($slug === '' || !is_file($file)) {
        fail("Unknown studio '$slug' (expected database/studios/$slug.php).");
    }
    $def = require $file;
    $overrides = require __DIR__ . '/../database/studios/title-overrides.php';
    $today = date('Y-m-d');

    // 1. Resolve every section's titles from TMDB (each title appears in the first section that claims it).
    $seen = [];
    $resolved = []; // section slug => list of items
    foreach ($def['sections'] as $section) {
        $exclude = array_flip($section['exclude_ids'] ?? []);
        $items = [];
        $skipped = ['dupe' => 0, 'unreleased' => 0, 'missing' => 0];
        foreach (collectSection($tmdb, $section, $today) as $ref) {
            $key = $ref['media'] . ':' . $ref['id'];
            if (isset($exclude[$ref['id']])) {
                continue;
            }
            if (isset($seen[$key])) {
                $skipped['dupe']++;
                continue;
            }
            $seen[$key] = true;
            $d = fetchDetails($tmdb, $ref['media'], $ref['id']);
            if ($d === null) {
                $skipped['missing']++;
                continue;
            }
            $date = (string) ($d[$ref['media'] === 'tv' ? 'first_air_date' : 'release_date'] ?? '');
            if ($date === '' || $date > $today) {
                $skipped['unreleased']++;
                continue;
            }
            $title = TmdbResolver::title($d, $ref['media'], $overrides);
            $original = trim((string) ($d[$ref['media'] === 'tv' ? 'original_name' : 'original_title'] ?? ''));
            $poster = TmdbResolver::poster($d);
            $items[] = [
                'media' => $ref['media'] === 'tv' ? 'series' : 'movie',
                'tmdb' => $ref['id'],
                'title' => $title,
                'original' => ($original !== '' && $original !== $title) ? $original : null,
                'year' => (int) substr($date, 0, 4),
                'date' => $date,
                'poster' => $poster['url'],
                'poster_country' => $poster['country'],
            ];
        }
        usort($items, function ($a, $b) {
            return [$a['date'], $a['title']] <=> [$b['date'], $b['title']];
        });
        $resolved[$section['slug']] = $items;
        say(sprintf('[%s] %d titles (skipped: %d duplicates, %d unreleased, %d not found)', $section['slug'], count($items), $skipped['dupe'], $skipped['unreleased'], $skipped['missing']));
    }

    $logo = resolveLogo($tmdb, $def['logo'] ?? null);

    // 2. Diff against the database and apply.
    $studio = $pdo->prepare('SELECT id FROM studios WHERE slug = ?');
    $studio->execute([$def['slug']]);
    $studioId = $studio->fetchColumn();
    if ($studioId === false) {
        say("Studio '{$def['slug']}' is new.");
        if (!$dry) {
            $pdo->prepare('INSERT INTO studios (slug, name, logo_url) VALUES (?, ?, ?)')->execute([$def['slug'], $def['name'], $logo]);
            $studioId = $pdo->lastInsertId();
        }
    } elseif (!$dry) {
        $pdo->prepare('UPDATE studios SET name = ?, logo_url = ? WHERE id = ?')->execute([$def['name'], $logo, $studioId]);
    }
    say('Logo: ' . ($logo ?? '(none, UI falls back to the name)'));

    // Existing rows by (media, tmdb) across the whole DB, with the owning studio.
    $existing = [];
    $stmt = $pdo->query(
        'SELECT m.id, m.media_type, m.tmdb_id, m.title, m.original_title, m.year, m.poster_url, m.sort_order,
                m.section_id, sec.slug AS section_slug, sec.studio_id
         FROM movies m JOIN sections sec ON sec.id = m.section_id WHERE m.tmdb_id IS NOT NULL'
    );
    foreach ($stmt->fetchAll() as $r) {
        $existing[$r['media_type'] . ':' . $r['tmdb_id']] = $r;
    }

    $keep = [];
    $totals = ['new' => 0, 'updated' => 0, 'same' => 0, 'foreign' => 0];
    foreach ($def['sections'] as $i => $section) {
        $sectionId = null;
        if ($studioId !== false) {
            $q = $pdo->prepare('SELECT id FROM sections WHERE studio_id = ? AND slug = ?');
            $q->execute([$studioId, $section['slug']]);
            $sectionId = $q->fetchColumn();
            if ($sectionId === false && !$dry && $resolved[$section['slug']]) {
                $pdo->prepare('INSERT INTO sections (studio_id, slug, name, period, sort_order) VALUES (?, ?, ?, ?, ?)')
                    ->execute([$studioId, $section['slug'], $section['name'], $section['period'] ?? null, $i + 1]);
                $sectionId = $pdo->lastInsertId();
            } elseif ($sectionId !== false && !$dry && $resolved[$section['slug']]) {
                $pdo->prepare('UPDATE sections SET name = ?, period = ?, sort_order = ? WHERE id = ?')
                    ->execute([$section['name'], $section['period'] ?? null, $i + 1, $sectionId]);
            }
        }
        $sectionId = $sectionId === false ? null : $sectionId;

        $n = ['new' => 0, 'updated' => 0, 'same' => 0, 'foreign' => 0];
        foreach ($resolved[$section['slug']] as $pos => $item) {
            $key = $item['media'] . ':' . $item['tmdb'];
            $order = $pos + 1;
            $row = $existing[$key] ?? null;
            $label = sprintf('%s -> %s (%d) poster:%s', $item['original'] ?? $item['title'], $item['title'], $item['year'], $item['poster_country'] ?? ($item['poster'] ? 'none' : 'MISSING'));
            if ($row !== null && $studioId !== false && (int) $row['studio_id'] !== (int) $studioId && !isset($opts['move'])) {
                $n['foreign']++;
                say("  ! owned by another studio, skipped: $label");
                continue;
            }
            $keep[$key] = true;
            if ($row === null) {
                $n['new']++;
                if ($verbose) {
                    say("  + [{$section['slug']}] $label");
                }
                if (!$dry) {
                    $pdo->prepare('INSERT INTO movies (section_id, media_type, tmdb_id, title, original_title, year, poster_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                        ->execute([$sectionId, $item['media'], $item['tmdb'], $item['title'], $item['original'], $item['year'], $item['poster'], $order]);
                }
                continue;
            }
            $changes = [];
            foreach (['title' => 'title', 'original' => 'original_title', 'year' => 'year', 'poster' => 'poster_url'] as $k => $col) {
                if ((string) $item[$k] !== (string) $row[$col]) {
                    $changes[$col] = $item[$k];
                }
            }
            if ($sectionId !== null && (int) $row['section_id'] !== (int) $sectionId) {
                $changes['section_id'] = $sectionId;
            }
            if ((int) $row['sort_order'] !== $order) {
                $changes['sort_order'] = $order;
            }
            if (!$changes) {
                $n['same']++;
                continue;
            }
            $n['updated']++;
            if ($verbose) {
                say("  ~ [{$section['slug']}] $label  (" . implode(', ', array_keys($changes)) . ')');
            }
            if (!$dry) {
                $set = implode(', ', array_map(function ($c) {
                    return "$c = ?";
                }, array_keys($changes)));
                $pdo->prepare("UPDATE movies SET $set WHERE id = ?")->execute(array_merge(array_values($changes), [$row['id']]));
            }
        }
        foreach ($n as $k => $v) {
            $totals[$k] += $v;
        }
        say(sprintf('  [%s] new %d, updated %d, unchanged %d%s', $section['slug'], $n['new'], $n['updated'], $n['same'], $n['foreign'] ? ", skipped(other studio) {$n['foreign']}" : ''));
    }
    say(sprintf('Total: new %d, updated %d, unchanged %d.', $totals['new'], $totals['updated'], $totals['same']));

    // Drop sections of this studio that ended up empty (nothing resolved, or everything moved away).
    if ($studioId !== false && !$dry) {
        $pdo->prepare('DELETE FROM sections WHERE studio_id = ? AND NOT EXISTS (SELECT 1 FROM movies m WHERE m.section_id = sections.id)')->execute([$studioId]);
    }

    // 3. Orphans: rows in this studio that are no longer in the definition. Never deleted if they have entries.
    if ($studioId !== false) {
        $q = $pdo->prepare(
            'SELECT m.id, m.title, m.year, m.media_type, m.tmdb_id, sec.slug AS section_slug,
                    (SELECT COUNT(*) FROM watch_entries e WHERE e.movie_id = m.id) AS entries
             FROM movies m JOIN sections sec ON sec.id = m.section_id WHERE sec.studio_id = ?'
        );
        $q->execute([$studioId]);
        $orphans = array_filter($q->fetchAll(), function ($r) use ($keep) {
            return $r['tmdb_id'] === null || !isset($keep[$r['media_type'] . ':' . $r['tmdb_id']]);
        });
        say(count($orphans) . ' orphaned rows (in DB but not in the definition).');
        foreach ($orphans as $r) {
            $deletable = (int) $r['entries'] === 0 && isset($opts['prune']);
            say(sprintf('  orphaned #%d [%s] "%s" (%d) tmdb:%s entries:%d%s', $r['id'], $r['section_slug'], $r['title'], $r['year'], $r['tmdb_id'] ?? 'NULL', $r['entries'], $deletable ? ' -> deleted' : ''));
            if ($deletable && !$dry) {
                $pdo->prepare('DELETE FROM movies WHERE id = ?')->execute([$r['id']]);
            }
        }
    }

    if (isset($opts['emit-seed'])) {
        emitSeed((string) $opts['emit-seed'], $def, $logo, $resolved);
        say('Seed written to ' . $opts['emit-seed']);
    }
}

/** A section has one 'source' or several 'sources' (merged, first occurrence wins). */
function collectSection(TmdbClient $tmdb, array $section, string $today): array
{
    $refs = [];
    foreach ($section['sources'] ?? [$section['source']] as $source) {
        foreach (collectIds($tmdb, $source, $today) as $ref) {
            $refs[$ref['media'] . ':' . $ref['id']] = $ref;
        }
    }
    return array_values($refs);
}

/** @return list<array{media: string, id: int}> media is the TMDB path segment: 'movie' or 'tv'. */
function collectIds(TmdbClient $tmdb, array $source, string $today): array
{
    $media = $source['media'] === 'tv' ? 'tv' : 'movie';
    if ($source['type'] === 'collection') {
        // TMDB collections: released parts only; optional 'genre' (keep only) / 'not_genre' (drop) filters.
        $refs = [];
        foreach ($source['ids'] as $cid) {
            $c = $tmdb->get('/collection/' . (int) $cid, ['language' => 'en-US']);
            foreach ($c['parts'] ?? [] as $part) {
                $date = (string) ($part['release_date'] ?? '');
                $genres = $part['genre_ids'] ?? [];
                if ($date === '' || $date > $today) {
                    continue;
                }
                if (isset($source['genre']) && !in_array($source['genre'], $genres, true)) {
                    continue;
                }
                if (isset($source['not_genre']) && in_array($source['not_genre'], $genres, true)) {
                    continue;
                }
                $refs[] = ['media' => 'movie', 'id' => (int) $part['id']];
            }
        }
        return $refs;
    }
    if ($source['type'] === 'ids') {
        return array_map(function ($id) use ($media) {
            return ['media' => $media, 'id' => (int) $id];
        }, $source['ids']);
    }

    $params = $source['params'];
    $dateField = $media === 'tv' ? 'first_air_date' : 'primary_release_date';
    // Defaults: no unreleased titles, no adult content, no shorts (movies >= 40 min), no documentaries.
    $params += ['include_adult' => 'false', 'sort_by' => $dateField . '.asc', $dateField . '.lte' => $today];
    if ($media === 'movie') {
        $params += ['with_runtime.gte' => 40, 'without_genres' => '99'];
    } else {
        $params += ['without_genres' => '99'];
    }
    $refs = [];
    $maxPages = (int) ($source['max_pages'] ?? 50);
    for ($page = 1; $page <= $maxPages; $page++) {
        $res = $tmdb->get('/discover/' . $media, $params + ['page' => $page]);
        foreach ($res['results'] ?? [] as $r) {
            $refs[] = ['media' => $media, 'id' => (int) $r['id']];
        }
        if ($page >= (int) ($res['total_pages'] ?? 1)) {
            break;
        }
    }
    return $refs;
}

function fetchDetails(TmdbClient $tmdb, string $media, int $id): ?array
{
    $d = $tmdb->get('/' . $media . '/' . $id, [
        'language' => 'es-MX',
        'append_to_response' => 'alternative_titles,translations,images',
        'include_image_language' => 'es,null',
    ]);
    return isset($d['_not_found']) ? null : $d;
}

/** Logo from an explicit URL, or TMDB /company/{id} or /network/{id} (w300). */
function resolveLogo(TmdbClient $tmdb, $logo): ?string
{
    if (is_string($logo) && $logo !== '') {
        return $logo;
    }
    if (is_array($logo) && isset($logo['type'], $logo['id'])) {
        $d = $tmdb->get('/' . ($logo['type'] === 'network' ? 'network' : 'company') . '/' . (int) $logo['id']);
        if (!empty($d['logo_path'])) {
            return 'https://image.tmdb.org/t/p/w300' . $d['logo_path'];
        }
    }
    return null;
}

function emitSeed(string $path, array $def, ?string $logo, array $resolved): void
{
    $q = function ($v) {
        return $v === null ? 'NULL' : "'" . str_replace(["\\", "'"], ["\\\\", "''"], (string) $v) . "'";
    };
    $sql = "-- Generated by bin/import-tmdb.php for studio '{$def['slug']}'. Do not edit by hand.\nSET NAMES utf8mb4;\n\n";
    $sql .= 'INSERT INTO studios (slug, name, logo_url) VALUES (' . $q($def['slug']) . ', ' . $q($def['name']) . ', ' . $q($logo) . ");\n\n";
    $studioSub = '(SELECT id FROM studios WHERE slug = ' . $q($def['slug']) . ')';
    foreach ($def['sections'] as $i => $s) {
        $sql .= 'INSERT INTO sections (studio_id, slug, name, period, sort_order) VALUES (' . $studioSub . ', ' . $q($s['slug']) . ', ' . $q($s['name']) . ', ' . $q($s['period'] ?? null) . ', ' . ($i + 1) . ");\n";
    }
    $sql .= "\n";
    foreach ($def['sections'] as $s) {
        $sectionSub = '(SELECT id FROM sections WHERE studio_id = ' . $studioSub . ' AND slug = ' . $q($s['slug']) . ')';
        foreach ($resolved[$s['slug']] as $pos => $it) {
            $sql .= 'INSERT INTO movies (section_id, media_type, tmdb_id, title, original_title, year, poster_url, sort_order) VALUES ('
                . $sectionSub . ', ' . $q($it['media']) . ', ' . $it['tmdb'] . ', ' . $q($it['title']) . ', ' . $q($it['original']) . ', '
                . $it['year'] . ', ' . $q($it['poster']) . ', ' . ($pos + 1) . ");\n";
        }
    }
    file_put_contents($path, $sql);
}
