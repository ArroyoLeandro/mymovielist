<?php

declare(strict_types=1);

namespace App;

use PDO;
use PDOException;

/**
 * TMDB catalog importer: resolves a studio definition (database/studios/<slug>.php) into titles and applies the diff,
 * curates by votes, prunes leftovers, and adds single titles by hand (manual import from the search).
 *
 * Curation: titles below the vote thresholds (movies 500, series 100 by default; min_votes on a studio/section/source
 * overrides it, keep_all => true on a section keeps everything) are not imported unless protected:
 *   - referenced by user data (watch entries or any other table with a movie_id), the always-keep list, keep_all;
 *   - added by hand (movies.source = 'manual');
 *   - recent releases: released in the last `recent_months` (12) they enter with a relaxed threshold
 *     (max(floor, threshold x recent_vote_ratio): movies 50 / series 20 for the studio defaults, 500 / 100 for the
 *     Películas / Series categories), and a movie trending now (popularity >= 150 with >= 20 votes) also enters;
 *   - grace: titles released in the last `grace_months` (18) that are already in the catalog are never dropped or
 *     pruned; after that they must meet the normal threshold.
 * Prune deletes the unprotected rows a studio no longer claims; `max_prune` skips a studio whose prune would delete
 * more rows than that (an unattended run must not empty a catalog after a bad TMDB response).
 */
final class CatalogImporter
{
    public const DEFAULT_MIN_VOTES = ['movie' => 500, 'tv' => 100];
    public const DEFAULT_RULES = [
        'recent_months' => 12,           // 0 disables the recent-release rule
        'grace_months' => 18,            // 0 disables the prune grace for recent releases
        'recent_min_votes_movie' => 50,  // floor of the relaxed threshold
        'recent_min_votes_tv' => 20,
        'recent_vote_ratio' => 0.1,      // relaxed threshold = max(floor, normal threshold x ratio)
        'trending_popularity' => 150.0,  // movies only: TMDB popularity that also lets a recent movie in...
        'trending_min_votes' => 20,      // ...when it has at least this many votes (filters zero-vote spam)
    ];
    public const MANUAL_SECTION = ['slug' => 'agregadas', 'name' => 'Agregadas por el grupo', 'sort_order' => 999];

    /** @var PDO */
    private $pdo;
    /** @var TmdbClient */
    private $tmdb;
    /** @var array<string, mixed> */
    private $rules;
    /** @var callable(string): void */
    private $log;
    /** @var array<string, int|null> collection memo for one importer instance */
    private $collectionMemo = [];

    public function __construct(PDO $pdo, TmdbClient $tmdb, array $rules = [], ?callable $log = null)
    {
        $this->pdo = $pdo;
        $this->tmdb = $tmdb;
        $this->rules = array_intersect_key($rules, self::DEFAULT_RULES) + self::DEFAULT_RULES;
        $this->log = $log ?? function (string $line): void {
        };
    }

    private function say(string $line = ''): void
    {
        ($this->log)($line);
    }

    /** First release date that still counts as recent for a window of $months (null when disabled). */
    private function cutoff(int $months, string $today): ?string
    {
        return $months > 0 ? date('Y-m-d', (int) strtotime($today . ' -' . $months . ' months')) : null;
    }

    /** Relaxed vote threshold for recent releases, derived from the normal one. */
    private function recentMin(string $media, int $normal): int
    {
        $floor = (int) $this->rules[$media === 'tv' ? 'recent_min_votes_tv' : 'recent_min_votes_movie'];
        return min($normal, max($floor, (int) ceil($normal * (float) $this->rules['recent_vote_ratio'])));
    }

    // -----------------------------------------------------------------------------------------------------------

    /** Link seeded rows without a tmdb_id to TMDB (search by original English title + year). */
    public function matchExisting(bool $dry): void
    {
        $rows = $this->pdo->query('SELECT id, title, wiki_title, year FROM movies WHERE tmdb_id IS NULL ORDER BY id')->fetchAll();
        $this->say(count($rows) . ' rows without tmdb_id.');
        $taken = [];
        foreach ($this->pdo->query("SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL AND media_type = 'movie'")->fetchAll() as $r) {
            $taken[(int) $r['tmdb_id']] = true;
        }
        $matched = 0;
        $unmatched = [];
        foreach ($rows as $row) {
            $query = trim((string) preg_replace('/\s*\((?:[^()]*\bfilm|film)\)\s*$/i', '', (string) ($row['wiki_title'] ?: $row['title'])));
            $year = (int) $row['year'];
            $hit = null;
            foreach ([['year' => $year], []] as $extra) {
                $res = $this->tmdb->get('/search/movie', array_merge(['query' => $query, 'language' => 'en-US', 'include_adult' => 'false'], $extra));
                $hit = self::pickSearchHit($res['results'] ?? [], $query, $year);
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
            $this->say(sprintf('%s #%d "%s" (%d) -> tmdb %d "%s" %s', $dry ? '[dry]' : 'ok', $row['id'], $query, $year, $hit['id'], $hit['title'], substr((string) ($hit['release_date'] ?? ''), 0, 10)));
            if (!$dry) {
                $this->pdo->prepare("UPDATE movies SET tmdb_id = ?, media_type = 'movie' WHERE id = ? AND tmdb_id IS NULL")->execute([(int) $hit['id'], $row['id']]);
            }
        }
        $this->say("Matched: $matched. Unmatched: " . count($unmatched));
        foreach ($unmatched as $line) {
            $this->say('  UNMATCHED ' . $line);
        }
    }

    private static function normTitle(string $s): string
    {
        $s = strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s) ?: $s);
        return (string) preg_replace('/[^a-z0-9]+/', '', $s);
    }

    /** Best search result: release year within +-1, exact title match preferred, then most voted. */
    private static function pickSearchHit(array $results, string $query, int $year): ?array
    {
        $best = null;
        $bestScore = -1;
        $q = self::normTitle($query);
        foreach ($results as $r) {
            $ry = (int) substr((string) ($r['release_date'] ?? ''), 0, 4);
            if ($ry === 0 || abs($ry - $year) > 1) {
                continue;
            }
            $exact = self::normTitle((string) ($r['title'] ?? '')) === $q || self::normTitle((string) ($r['original_title'] ?? '')) === $q;
            $score = ($exact ? 1000000 : 0) + (int) ($r['vote_count'] ?? 0);
            if ($score > $bestScore && ($exact || (int) ($r['vote_count'] ?? 0) >= 100)) {
                $best = $r;
                $bestScore = $score;
            }
        }
        return $best;
    }

    // -----------------------------------------------------------------------------------------------------------

    /**
     * Imports one studio definition.
     * @param array{dry?: bool, verbose?: bool, prune?: bool, move?: bool, max_prune?: int, emit_seed?: string|null} $opts
     * @return array<string, mixed> summary: studio, new, updated, unchanged, foreign, recent, orphans, deleted,
     *         pruneSkipped, before, after
     */
    public function importStudio(string $slug, array $opts = []): array
    {
        $dry = !empty($opts['dry']);
        $verbose = !empty($opts['verbose']) || $dry;
        $prune = !empty($opts['prune']);
        $maxPrune = (int) ($opts['max_prune'] ?? 0);
        $def = StudioDefinitions::load($slug);
        $dir = StudioDefinitions::dir();
        $overrides = require $dir . '/title-overrides.php';
        $always = array_flip(require $dir . '/always-keep.php');
        $franchises = require $dir . '/franchises.php';
        $sagaNames = require $dir . '/saga-names.php';
        $order = (require $dir . '/studio-order.php')[$def['slug']] ?? [100, 'studio'];
        $today = date('Y-m-d');
        $recentCut = $this->cutoff((int) $this->rules['recent_months'], $today);
        $graceCut = $this->cutoff((int) $this->rules['grace_months'], $today);

        // Protected rows (never filtered by votes, never pruned): referenced by watch entries or any other table with a
        // movie_id (watchlist, recommendations...), plus the always-keep list. Keys use the TMDB path: 'movie:<id>' / 'tv:<id>'.
        $referenced = self::referencedMovieIds($this->pdo);
        $prot = $always;
        $manual = [];
        $inGrace = [];
        foreach ($this->pdo->query('SELECT id, media_type, tmdb_id, source, release_date FROM movies WHERE tmdb_id IS NOT NULL')->fetchAll() as $r) {
            $k = ($r['media_type'] === 'series' ? 'tv' : 'movie') . ':' . $r['tmdb_id'];
            if (isset($referenced[(int) $r['id']])) {
                $prot[$k] = true;
            }
            if ($r['source'] === 'manual') {
                $manual[$k] = true;
            }
            if ($graceCut !== null && (string) $r['release_date'] >= $graceCut) {
                $inGrace[$k] = true;
            }
        }
        $beforeCount = 0;
        $studioRow = $this->pdo->prepare('SELECT id FROM studios WHERE slug = ?');
        $studioRow->execute([$def['slug']]);
        $beforeStudioId = $studioRow->fetchColumn();
        if ($beforeStudioId !== false) {
            $c = $this->pdo->prepare('SELECT COUNT(*) FROM movies m JOIN sections sec ON sec.id = m.section_id WHERE sec.studio_id = ?');
            $c->execute([$beforeStudioId]);
            $beforeCount = (int) $c->fetchColumn();
        }
        $protectedBelow = []; // protected titles under the vote threshold (kept)
        $lowVotes = [];       // 'media:id' => [votes, popularity] for titles filtered out by the threshold
        $recentIn = 0;        // titles that only entered through the recent-release rule
        $defaultMin = [];
        foreach (['movie', 'tv'] as $mt) {
            $defaultMin[$mt] = (int) ($def['min_votes_' . $mt] ?? $def['min_votes'] ?? self::DEFAULT_MIN_VOTES[$mt]);
        }

        // 1. Resolve every section's titles from TMDB (each title appears in the first section that claims it).
        $seen = [];
        $resolved = []; // section slug => list of items
        foreach ($def['sections'] as $section) {
            $exclude = array_flip($section['exclude_ids'] ?? []);
            $items = [];
            $skipped = ['dupe' => 0, 'unreleased' => 0, 'missing' => 0, 'lowvotes' => 0];
            $refs = [];
            foreach ($this->collectSection($section, $defaultMin, $today, $recentCut) as $ref) {
                if (!isset($exclude[$ref['id']])) {
                    $refs[] = $ref;
                }
            }
            foreach (array_chunk($refs, 60) as $chunk) {
                $details = $this->fetchDetailsMany(array_values(array_filter($chunk, function ($ref) use ($seen) {
                    return !isset($seen[$ref['media'] . ':' . $ref['id']]);
                })));
                foreach ($chunk as $ref) {
                    $key = $ref['media'] . ':' . $ref['id'];
                    if (isset($seen[$key])) {
                        $skipped['dupe']++;
                        continue;
                    }
                    $d = $details[$key] ?? null;
                    if ($d === null) {
                        $skipped['missing']++;
                        continue;
                    }
                    $date = (string) ($d[$ref['media'] === 'tv' ? 'first_air_date' : 'release_date'] ?? '');
                    if ($date === '' || $date > $today) {
                        $skipped['unreleased']++;
                        continue;
                    }
                    // Curation: vote threshold (source > section > studio > default), unless the title is protected.
                    $votes = (int) ($d['vote_count'] ?? 0);
                    $pop = (float) ($d['popularity'] ?? 0);
                    $min = (int) ($ref['min_votes'] ?? $section['min_votes'] ?? $defaultMin[$ref['media']]);
                    if ($votes < $min) {
                        $recent = $recentCut !== null && $date >= $recentCut && ($votes >= $this->recentMin($ref['media'], $min)
                            || ($ref['media'] === 'movie' && $pop >= (float) $this->rules['trending_popularity'] && $votes >= (int) $this->rules['trending_min_votes']));
                        $why = isset($always[$key]) ? 'always-keep' : (isset($prot[$key]) ? 'referenced' : (isset($manual[$key]) ? 'manual'
                            : (!empty($section['keep_all']) ? 'canon' : ($recent ? 'recent' : (isset($inGrace[$key]) ? 'grace' : null)))));
                        if ($why === null) {
                            $skipped['lowvotes']++;
                            $lowVotes[$key] = [$votes, $pop];
                            continue;
                        }
                        if ($why === 'recent') {
                            $recentIn++;
                        } else {
                            $protectedBelow[] = sprintf('%s "%s" (%s) votes:%d < %d [%s]', $key, $d[$ref['media'] === 'tv' ? 'name' : 'title'] ?? '?', substr($date, 0, 4), $votes, $min, $why);
                        }
                    }
                    $seen[$key] = true;
                    $items[] = $this->item($d, $ref['media'], $overrides);
                }
            }
            usort($items, function ($a, $b) {
                return [$a['date'], $a['title']] <=> [$b['date'], $b['title']];
            });
            $resolved[$section['slug']] = $items;
            $this->say(sprintf('[%s] %d titles (skipped: %d duplicates, %d unreleased, %d not found, %d below vote threshold)', $section['slug'], count($items), $skipped['dupe'], $skipped['unreleased'], $skipped['missing'], $skipped['lowvotes']));
        }

        // Resolution is done (and cached): the rest must not stop halfway because of a caller's time budget.
        $deadline = $this->tmdb->deadline;
        $this->tmdb->deadline = null;
        $logo = $this->resolveLogo($def['logo'] ?? null);

        // 2. Diff against the database and apply.
        $studio = $this->pdo->prepare('SELECT id FROM studios WHERE slug = ?');
        $studio->execute([$def['slug']]);
        $studioId = $studio->fetchColumn();
        if ($studioId === false) {
            $this->say("Studio '{$def['slug']}' is new.");
            if (!$dry) {
                $this->pdo->prepare('INSERT INTO studios (slug, name, logo_url, sort_order, kind) VALUES (?, ?, ?, ?, ?)')->execute([$def['slug'], $def['name'], $logo, $order[0], $order[1]]);
                $studioId = $this->pdo->lastInsertId();
            }
        } elseif (!$dry) {
            $this->pdo->prepare('UPDATE studios SET name = ?, logo_url = ?, sort_order = ?, kind = ? WHERE id = ?')->execute([$def['name'], $logo, $order[0], $order[1], $studioId]);
        }
        if ($verbose) {
            $this->say('Logo: ' . ($logo ?? '(none, UI falls back to the name)'));
        }

        // Existing rows by (media, tmdb) across the whole DB, with the owning studio.
        $existing = [];
        $stmt = $this->pdo->query(
            'SELECT m.id, m.media_type, m.tmdb_id, m.title, m.original_title, m.year, m.release_date, m.vote_count, m.popularity,
                    m.collection_id, m.poster_url, m.sort_order, m.section_id, sec.slug AS section_slug, sec.studio_id
             FROM movies m JOIN sections sec ON sec.id = m.section_id WHERE m.tmdb_id IS NOT NULL'
        );
        foreach ($stmt->fetchAll() as $r) {
            $existing[$r['media_type'] . ':' . $r['tmdb_id']] = $r;
        }

        $franchiseOf = self::franchiseMap($franchises);
        $keep = [];
        $totals = ['new' => 0, 'updated' => 0, 'same' => 0, 'foreign' => 0];
        $now = date('Y-m-d H:i:s');
        foreach ($def['sections'] as $i => $section) {
            $sectionId = null;
            if ($studioId !== false) {
                $q = $this->pdo->prepare('SELECT id FROM sections WHERE studio_id = ? AND slug = ?');
                $q->execute([$studioId, $section['slug']]);
                $sectionId = $q->fetchColumn();
                if ($sectionId === false && !$dry && $resolved[$section['slug']]) {
                    $this->pdo->prepare('INSERT INTO sections (studio_id, slug, name, period, sort_order) VALUES (?, ?, ?, ?, ?)')
                        ->execute([$studioId, $section['slug'], $section['name'], $section['period'] ?? null, $i + 1]);
                    $sectionId = $this->pdo->lastInsertId();
                } elseif ($sectionId !== false && !$dry && $resolved[$section['slug']]) {
                    $this->pdo->prepare('UPDATE sections SET name = ?, period = ?, sort_order = ? WHERE id = ?')
                        ->execute([$section['name'], $section['period'] ?? null, $i + 1, $sectionId]);
                }
            }
            $sectionId = $sectionId === false ? null : $sectionId;

            $n = ['new' => 0, 'updated' => 0, 'same' => 0, 'foreign' => 0];
            foreach ($resolved[$section['slug']] as $pos => $item) {
                $key = $item['media'] . ':' . $item['tmdb'];
                $sort = $pos + 1;
                $row = $existing[$key] ?? null;
                $label = sprintf('%s -> %s (%d) poster:%s', $item['original'] ?? $item['title'], $item['title'], $item['year'], $item['poster_country'] ?? ($item['poster'] ? 'none' : 'MISSING'));
                if ($row !== null && $studioId !== false && (int) $row['studio_id'] !== (int) $studioId && empty($opts['move'])) {
                    $n['foreign']++;
                    if ($verbose) {
                        $this->say("  ! owned by another studio, skipped: $label");
                    }
                    continue;
                }
                $keep[$key] = true;
                $collectionId = $this->ensureCollection($item, $franchiseOf, $franchises, $sagaNames, $dry);
                if ($row === null) {
                    $n['new']++;
                    if ($verbose) {
                        $this->say("  + [{$section['slug']}] $label");
                    }
                    if (!$dry) {
                        $this->pdo->prepare('INSERT INTO movies (section_id, media_type, tmdb_id, title, original_title, year, release_date, vote_count, popularity, collection_id, poster_url, sort_order, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                            ->execute([$sectionId, $item['media'], $item['tmdb'], $item['title'], $item['original'], $item['year'], $item['date'], $item['votes'], $item['popularity'], $collectionId, $item['poster'], $sort, $now]);
                    }
                    continue;
                }
                $changes = [];
                $item['collection_id'] = $collectionId;
                foreach (['title' => 'title', 'original' => 'original_title', 'year' => 'year', 'date' => 'release_date', 'votes' => 'vote_count',
                          'popularity' => 'popularity', 'collection_id' => 'collection_id', 'poster' => 'poster_url'] as $k => $col) {
                    if ((string) $item[$k] !== (string) $row[$col]) {
                        $changes[$col] = $item[$k];
                    }
                }
                if ($sectionId !== null && (int) $row['section_id'] !== (int) $sectionId) {
                    $changes['section_id'] = $sectionId;
                }
                if ((int) $row['sort_order'] !== $sort) {
                    $changes['sort_order'] = $sort;
                }
                if (!$changes) {
                    $n['same']++;
                    continue;
                }
                $n['updated']++;
                if ($verbose) {
                    $this->say("  ~ [{$section['slug']}] $label  (" . implode(', ', array_keys($changes)) . ')');
                }
                if (!$dry) {
                    $set = implode(', ', array_map(function ($c) {
                        return "$c = ?";
                    }, array_keys($changes)));
                    $this->pdo->prepare("UPDATE movies SET $set WHERE id = ?")->execute(array_merge(array_values($changes), [$row['id']]));
                }
            }
            foreach ($n as $k => $v) {
                $totals[$k] += $v;
            }
            if ($verbose || $n['new'] || $n['updated']) {
                $this->say(sprintf('  [%s] new %d, updated %d, unchanged %d%s', $section['slug'], $n['new'], $n['updated'], $n['same'], $n['foreign'] ? ", skipped(other studio) {$n['foreign']}" : ''));
            }
        }
        $this->say(sprintf('Total: new %d, updated %d, unchanged %d%s.', $totals['new'], $totals['updated'], $totals['same'], $recentIn ? " ($recentIn recent releases under the normal threshold)" : ''));

        // Drop sections of this studio that ended up empty (nothing resolved, or everything moved away).
        if ($studioId !== false && !$dry) {
            $this->pdo->prepare('DELETE FROM sections WHERE studio_id = ? AND NOT EXISTS (SELECT 1 FROM movies m WHERE m.section_id = sections.id)')->execute([$studioId]);
        }

        // 3. Orphans: rows in this studio that are no longer in the definition. Never deleted when protected.
        $deleted = 0;
        $orphanCount = 0;
        $pruneSkipped = false;
        $afterCount = $beforeCount;
        if ($studioId !== false) {
            $q = $this->pdo->prepare(
                'SELECT m.id, m.title, m.year, m.media_type, m.tmdb_id, m.source, m.release_date, sec.slug AS section_slug
                 FROM movies m JOIN sections sec ON sec.id = m.section_id WHERE sec.studio_id = ?'
            );
            $q->execute([$studioId]);
            $orphans = array_filter($q->fetchAll(), function ($r) use ($keep) {
                return $r['tmdb_id'] === null || !isset($keep[$r['media_type'] . ':' . $r['tmdb_id']]);
            });
            $orphanCount = count($orphans);
            $this->say($orphanCount . ' orphaned rows (in DB but not in the definition or below the vote threshold).');
            $why = function (array $r) use ($referenced, $always, $graceCut): ?string {
                $rk = ($r['media_type'] === 'series' ? 'tv' : 'movie') . ':' . $r['tmdb_id'];
                if (isset($referenced[(int) $r['id']])) {
                    return 'user data';
                }
                if (isset($always[$rk])) {
                    return 'always-keep';
                }
                if ($r['source'] === 'manual') {
                    return 'manual';
                }
                if ($graceCut !== null && (string) $r['release_date'] >= $graceCut) {
                    return 'recent';
                }
                return null;
            };
            $deletable = $prune ? count(array_filter($orphans, function ($r) use ($why) {
                return $why($r) === null;
            })) : 0;
            if ($deletable > 0 && $maxPrune > 0 && $deletable > $maxPrune) {
                $pruneSkipped = true;
                $this->say("WARN: prune would delete $deletable rows (limit $maxPrune): skipped for this studio, review it by hand.");
            }
            foreach ($orphans as $r) {
                $rk = ($r['media_type'] === 'series' ? 'tv' : 'movie') . ':' . $r['tmdb_id'];
                $lv = $lowVotes[$rk] ?? null;
                $reason = $why($r);
                $delete = $reason === null && $prune && !$pruneSkipped;
                if ($delete) {
                    $deleted++;
                }
                if ($lv !== null && $reason === null && !$delete && !$verbose) {
                    continue; // below-threshold rows are only listed on --verbose / --dry-run / --prune
                }
                if (!$verbose && !$delete && $reason !== null) {
                    continue;
                }
                $this->say(sprintf('  orphaned #%d [%s] "%s" (%d) tmdb:%s%s%s%s', $r['id'], $r['section_slug'], $r['title'], $r['year'], $r['tmdb_id'] ?? 'NULL',
                    $lv !== null ? " votes:{$lv[0]}" : '', $reason !== null ? " PROTECTED ($reason)" : '', $delete ? ' -> ' . ($dry ? 'would delete' : 'deleted') : ''));
                if ($delete && !$dry) {
                    $this->pdo->prepare('DELETE FROM movies WHERE id = ?')->execute([$r['id']]);
                }
            }
            if (!$dry) {
                // Keep vote data fresh on rows that stay although they fell under the threshold; drop emptied sections.
                foreach ($lowVotes as $k => $v) {
                    [$mt, $tid] = explode(':', $k);
                    $this->pdo->prepare('UPDATE movies SET vote_count = ?, popularity = ? WHERE media_type = ? AND tmdb_id = ?')
                        ->execute([$v[0], number_format($v[1], 3, '.', ''), $mt === 'tv' ? 'series' : 'movie', (int) $tid]);
                }
                $this->pdo->prepare('DELETE FROM sections WHERE studio_id = ? AND NOT EXISTS (SELECT 1 FROM movies m WHERE m.section_id = sections.id)')->execute([$studioId]);
            }
            $c = $this->pdo->prepare('SELECT COUNT(*) FROM movies m JOIN sections sec ON sec.id = m.section_id WHERE sec.studio_id = ?');
            $c->execute([$studioId]);
            $afterCount = $dry ? $beforeCount + $totals['new'] - $deleted : (int) $c->fetchColumn();
            $this->say(sprintf('Titles in studio: before %d -> after %d%s.', $beforeCount, $afterCount, $dry ? ' (projected)' : ''));
            if ($protectedBelow && ($prune || $verbose)) {
                $this->say(count($protectedBelow) . ' protected titles below the vote threshold (kept):');
                foreach (array_unique($protectedBelow) as $line) {
                    $this->say('  ' . $line);
                }
            }
        }

        if (!empty($opts['emit_seed'])) {
            self::emitSeed((string) $opts['emit_seed'], $def, $logo, $resolved);
            $this->say('Seed written to ' . $opts['emit_seed']);
        }
        $this->tmdb->deadline = $deadline;
        return [
            'studio' => $def['slug'], 'name' => $def['name'], 'new' => $totals['new'], 'updated' => $totals['updated'],
            'unchanged' => $totals['same'], 'foreign' => $totals['foreign'], 'recent' => $recentIn, 'orphans' => $orphanCount,
            'deleted' => $deleted, 'pruneSkipped' => $pruneSkipped, 'before' => $beforeCount, 'after' => $afterCount,
        ];
    }

    /**
     * Item row resolved from a details payload (LATAM title and poster, saga hint).
     * @return array<string, mixed>
     */
    private function item(array $d, string $media, array $overrides): array
    {
        $date = (string) ($d[$media === 'tv' ? 'first_air_date' : 'release_date'] ?? '');
        $title = TmdbResolver::title($d, $media, $overrides);
        $original = trim((string) ($d[$media === 'tv' ? 'original_name' : 'original_title'] ?? ''));
        $poster = TmdbResolver::poster($d);
        return [
            'media' => $media === 'tv' ? 'series' : 'movie',
            'tmdb' => (int) $d['id'],
            'title' => $title,
            'original' => ($original !== '' && $original !== $title) ? $original : null,
            'year' => (int) substr($date, 0, 4),
            'date' => $date,
            'votes' => (int) ($d['vote_count'] ?? 0),
            'popularity' => number_format((float) ($d['popularity'] ?? 0), 3, '.', ''),
            'collection' => $media === 'movie' ? (int) ($d['belongs_to_collection']['id'] ?? 0) : 0,
            'poster' => $poster['url'],
            'poster_country' => $poster['country'],
        ];
    }

    // -----------------------------------------------------------------------------------------------------------

    /**
     * Adds one title by hand (search "¿No está? Agregalo"): placed where the studio definitions would put it, or in
     * the category for its type, in the definition's section or an "Agregadas por el grupo" section created on demand.
     * Idempotent: an existing (media, tmdb id) row is returned as is.
     * @param string $media 'movie' or 'tv'
     * @return array{id: int, created: bool}|null null when TMDB does not know the title
     * @throws \DomainException when the title is not released yet
     */
    public function importManual(string $media, int $tmdbId, ?int $userId): ?array
    {
        $media = $media === 'tv' ? 'tv' : 'movie';
        $dbMedia = $media === 'tv' ? 'series' : 'movie';
        $existingId = $this->titleId($dbMedia, $tmdbId);
        if ($existingId !== null) {
            return ['id' => $existingId, 'created' => false];
        }
        $d = $this->fetchDetails($media, $tmdbId);
        if ($d === null) {
            return null;
        }
        $date = (string) ($d[$media === 'tv' ? 'first_air_date' : 'release_date'] ?? '');
        if ($date === '' || $date > date('Y-m-d')) {
            throw new \DomainException('Not released yet.');
        }
        $dir = StudioDefinitions::dir();
        $item = $this->item($d, $media, require $dir . '/title-overrides.php');
        $place = StudioDefinitions::place($d, $media);
        $franchises = require $dir . '/franchises.php';
        $collectionId = $this->ensureCollection($item, self::franchiseMap($franchises), $franchises, require $dir . '/saga-names.php', false);

        $sectionId = $this->sectionFor($place['studio'], $place['section']);
        $next = $this->pdo->prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM movies WHERE section_id = ?');
        $next->execute([$sectionId]);
        try {
            $this->pdo->prepare(
                "INSERT INTO movies (section_id, media_type, tmdb_id, title, original_title, year, release_date, vote_count, popularity,
                                     collection_id, poster_url, sort_order, added_at, source, added_by_user_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)"
            )->execute([$sectionId, $item['media'], $item['tmdb'], $item['title'], $item['original'], $item['year'], $item['date'], $item['votes'],
                $item['popularity'], $collectionId ?: null, $item['poster'], (int) $next->fetchColumn(), date('Y-m-d H:i:s'), $userId]);
        } catch (PDOException $e) {
            $id = $this->titleId($dbMedia, $tmdbId); // lost a race with a concurrent import of the same title
            if ($id === null) {
                throw $e;
            }
            return ['id' => $id, 'created' => false];
        }
        return ['id' => (int) $this->pdo->lastInsertId(), 'created' => true];
    }

    private function titleId(string $dbMedia, int $tmdbId): ?int
    {
        $q = $this->pdo->prepare('SELECT id FROM movies WHERE media_type = ? AND tmdb_id = ?');
        $q->execute([$dbMedia, $tmdbId]);
        $id = $q->fetchColumn();
        return $id === false ? null : (int) $id;
    }

    /** Section row for a manual title: the definition's section, or "Agregadas por el grupo"; created when missing. */
    private function sectionFor(string $studioSlug, ?string $sectionSlug): int
    {
        $def = StudioDefinitions::load($studioSlug);
        $q = $this->pdo->prepare('SELECT id FROM studios WHERE slug = ?');
        $q->execute([$studioSlug]);
        $studioId = $q->fetchColumn();
        if ($studioId === false) {
            $order = (require StudioDefinitions::dir() . '/studio-order.php')[$studioSlug] ?? [100, 'studio'];
            $this->pdo->prepare('INSERT INTO studios (slug, name, logo_url, sort_order, kind) VALUES (?, ?, NULL, ?, ?)')
                ->execute([$studioSlug, $def['name'], $order[0], $order[1]]);
            $studioId = $this->pdo->lastInsertId();
        }
        $section = ['slug' => self::MANUAL_SECTION['slug'], 'name' => self::MANUAL_SECTION['name'], 'period' => null, 'sort' => self::MANUAL_SECTION['sort_order']];
        foreach ($def['sections'] as $i => $s) {
            if ($sectionSlug !== null && $s['slug'] === $sectionSlug) {
                $section = ['slug' => $s['slug'], 'name' => $s['name'], 'period' => $s['period'] ?? null, 'sort' => $i + 1];
            }
        }
        $q = $this->pdo->prepare('SELECT id FROM sections WHERE studio_id = ? AND slug = ?');
        $q->execute([$studioId, $section['slug']]);
        $id = $q->fetchColumn();
        if ($id !== false) {
            return (int) $id;
        }
        try {
            $this->pdo->prepare('INSERT INTO sections (studio_id, slug, name, period, sort_order) VALUES (?, ?, ?, ?, ?)')
                ->execute([$studioId, $section['slug'], $section['name'], $section['period'], $section['sort']]);
            return (int) $this->pdo->lastInsertId();
        } catch (PDOException $e) {
            $q->execute([$studioId, $section['slug']]); // created concurrently
            return (int) $q->fetchColumn();
        }
    }

    // -----------------------------------------------------------------------------------------------------------

    /**
     * @return array<int, true> ids of movies referenced by user data: any other table with a movie_id column or an FK to
     * movies.id, except catalog tables (title_providers is refreshed from TMDB and must never protect a title).
     */
    public static function referencedMovieIds(PDO $pdo): array
    {
        $tables = [];
        $catalog = "'movies', 'title_providers'";
        $q = "SELECT table_name AS t, column_name AS c FROM information_schema.columns
              WHERE table_schema = DATABASE() AND column_name = 'movie_id' AND table_name NOT IN ($catalog)
              UNION
              SELECT table_name, column_name FROM information_schema.key_column_usage
              WHERE table_schema = DATABASE() AND referenced_table_name = 'movies' AND referenced_column_name = 'id'
                AND table_name NOT IN ($catalog)";
        foreach ($pdo->query($q)->fetchAll() as $r) {
            $tables[$r['t'] . '.' . $r['c']] = [$r['t'], $r['c']];
        }
        $ids = [];
        foreach ($tables as $tc) {
            foreach ($pdo->query('SELECT DISTINCT `' . $tc[1] . '` FROM `' . $tc[0] . '`')->fetchAll(PDO::FETCH_COLUMN) as $id) {
                $ids[(int) $id] = true;
            }
        }
        return $ids;
    }

    /** 'movie:<id>' / 'tv:<id>' => franchise slug, 'c:<tmdb collection id>' => franchise slug. */
    private static function franchiseMap(array $franchises): array
    {
        $map = [];
        foreach ($franchises as $slug => $f) {
            foreach ($f['titles'] ?? [] as $t) {
                $map[$t] = $slug;
            }
            foreach ($f['tmdb_collections'] ?? [] as $cid) {
                $map['c:' . $cid] = $slug;
            }
        }
        return $map;
    }

    /**
     * Collection row (saga) for an item: a manual franchise wins over TMDB belongs_to_collection.
     * Creates the row when missing (not on dry runs, where 0 stands for "would be created"). Memoized per instance.
     */
    private function ensureCollection(array $item, array $franchiseOf, array $franchises, array $sagaNames, bool $dry): ?int
    {
        $slug = $franchiseOf[($item['media'] === 'series' ? 'tv' : 'movie') . ':' . $item['tmdb']]
            ?? ($item['collection'] ? ($franchiseOf['c:' . $item['collection']] ?? null) : null);
        if ($slug === null && !$item['collection']) {
            return null;
        }
        $mk = ($slug !== null ? 's:' . $slug : 't:' . $item['collection']) . ($dry ? ':dry' : '');
        if (array_key_exists($mk, $this->collectionMemo)) {
            return $this->collectionMemo[$mk];
        }
        if ($slug !== null) {
            $f = $franchises[$slug];
            $f['name'] = $sagaNames[$slug] ?? $f['name'];
            $sel = $this->pdo->prepare('SELECT id, name, poster_url FROM collections WHERE slug = ?');
            $sel->execute([$slug]);
            $row = $sel->fetch();
            if ($row && !$dry && ($row['name'] !== $f['name'] || $row['poster_url'] !== ($f['poster'] ?? null))) {
                $this->pdo->prepare('UPDATE collections SET name = ?, poster_url = ? WHERE id = ?')->execute([$f['name'], $f['poster'] ?? null, $row['id']]);
            }
            if (!$row && !$dry) {
                $this->pdo->prepare('INSERT INTO collections (slug, name, poster_url) VALUES (?, ?, ?)')->execute([$slug, $f['name'], $f['poster'] ?? null]);
                return $this->collectionMemo[$mk] = (int) $this->pdo->lastInsertId();
            }
            return $this->collectionMemo[$mk] = $row ? (int) $row['id'] : 0;
        }
        $sel = $this->pdo->prepare('SELECT id, name FROM collections WHERE tmdb_collection_id = ?');
        $sel->execute([$item['collection']]);
        $row = $sel->fetch();
        if ($row && $dry) {
            return $this->collectionMemo[$mk] = (int) $row['id'];
        }
        if (!$row && $dry) {
            return $this->collectionMemo[$mk] = 0;
        }
        $d = $this->tmdb->get('/collection/' . $item['collection'], [
            'language' => 'es-MX',
            'append_to_response' => 'translations,images',
            'include_image_language' => 'es,null',
        ]);
        if (isset($d['_not_found']) || empty($d['id'])) {
            return $this->collectionMemo[$mk] = $row ? (int) $row['id'] : null;
        }
        $name = $sagaNames['collection:' . (int) $d['id']] ?? self::collectionName($d);
        if ($row) {
            if ($row['name'] !== $name) {
                $this->pdo->prepare('UPDATE collections SET name = ? WHERE id = ?')->execute([$name, $row['id']]);
            }
            return $this->collectionMemo[$mk] = (int) $row['id'];
        }
        $this->pdo->prepare('INSERT INTO collections (tmdb_collection_id, slug, name, poster_url) VALUES (?, ?, ?, ?)')
            ->execute([(int) $d['id'], 'tmdb-' . (int) $d['id'], $name, TmdbResolver::poster($d)['url']]);
        return $this->collectionMemo[$mk] = (int) $this->pdo->lastInsertId();
    }

    /** Saga name: /collection?language=es-MX name when translated, else the es-MX / any es translation, else the original. */
    private static function collectionName(array $d): string
    {
        $strip = function ($n) {
            $n = trim((string) $n);
            return trim((string) preg_replace('/\s*(?:[-:–]\s*)?\(?\b(?:colecci[oó]n|collection|saga)\b\)?\s*$/iu', '', $n)) ?: $n;
        };
        $byRegion = [];
        foreach ($d['translations']['translations'] ?? [] as $t) {
            if (($t['iso_639_1'] ?? '') === 'es') {
                $n = trim((string) ($t['data']['name'] ?? $t['data']['title'] ?? ''));
                if ($n !== '' && !isset($byRegion[$t['iso_3166_1'] ?? ''])) {
                    $byRegion[$t['iso_3166_1'] ?? ''] = $n;
                }
            }
        }
        $main = trim((string) ($d['name'] ?? ''));
        $english = null;
        foreach ($d['translations']['translations'] ?? [] as $t) {
            if (($t['iso_639_1'] ?? '') === 'en' && trim((string) ($t['data']['name'] ?? '')) !== '') {
                $english = trim((string) $t['data']['name']);
                break;
            }
        }
        if (isset($byRegion['MX'])) {
            return $strip($byRegion['MX']);
        }
        if ($main !== '' && $english !== null && preg_match('/[\x{3040}-\x{30ff}\x{4e00}-\x{9fff}]/u', $main)) {
            return $strip($english); // untranslated Japanese name: use the English one
        }
        if ($main !== '' && $main !== $english) { // the es-MX response differs from the English text: it is translated
            return $strip($main);
        }
        if ($byRegion) {
            return $strip(reset($byRegion));
        }
        return $strip($main);
    }

    /**
     * A section has one 'source' or several 'sources' (merged, first occurrence wins).
     * @return list<array{media: string, id: int, min_votes?: int}>
     */
    private function collectSection(array $section, array $defaultMin, string $today, ?string $recentCut): array
    {
        $refs = [];
        foreach ($section['sources'] ?? [$section['source']] as $source) {
            $media = ($source['media'] ?? 'movie') === 'tv' ? 'tv' : 'movie';
            $min = (int) ($source['min_votes'] ?? $section['min_votes'] ?? $defaultMin[$media]);
            foreach ($this->collectIds($source, $today, $recentCut, empty($section['keep_all']) ? $min : 0) as $ref) {
                if (isset($source['min_votes'])) {
                    $ref['min_votes'] = (int) $source['min_votes'];
                }
                $refs[$ref['media'] . ':' . $ref['id']] = $ref;
            }
        }
        return array_values($refs);
    }

    /**
     * @param int $min normal vote threshold of this source (0: no curation, no extra recent-release passes)
     * @return list<array{media: string, id: int}> media is the TMDB path segment: 'movie' or 'tv'.
     */
    private function collectIds(array $source, string $today, ?string $recentCut, int $min): array
    {
        $media = ($source['media'] ?? 'movie') === 'tv' ? 'tv' : 'movie';
        if ($source['type'] === 'collection') {
            // TMDB collections: released parts only; optional 'genre' (keep only) / 'not_genre' (drop) filters.
            $refs = [];
            foreach ($source['ids'] as $cid) {
                $c = $this->tmdb->get('/collection/' . (int) $cid, ['language' => 'en-US']);
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
        $refs = $this->discover($media, $params, (int) ($source['max_pages'] ?? 50), $source);

        // Recent releases: when the source asks TMDB for more votes than the relaxed threshold, look again at the last
        // months with the relaxed count (most popular first), and for movies at what is trending now.
        $votesParam = (int) ($params['vote_count.gte'] ?? 0);
        if ($recentCut !== null && $min > 0 && $votesParam > 0) {
            $from = max($recentCut, (string) ($params[$dateField . '.gte'] ?? ''));
            $to = min($today, (string) $params[$dateField . '.lte']);
            if ($from <= $to) {
                $window = [$dateField . '.gte' => $from, $dateField . '.lte' => $to, 'sort_by' => 'popularity.desc'];
                $relaxed = $this->recentMin($media, $min);
                if ($votesParam > $relaxed) {
                    $refs = array_merge($refs, $this->discover($media, array_merge($params, $window, ['vote_count.gte' => $relaxed]), 20, $source));
                }
                $trendVotes = (int) $this->rules['trending_min_votes'];
                if ($media === 'movie' && $votesParam > $trendVotes) {
                    $minPop = (float) $this->rules['trending_popularity'];
                    $hot = $this->discover($media, array_merge($params, $window, ['vote_count.gte' => $trendVotes]), 1, $source, $minPop);
                    $refs = array_merge($refs, $hot);
                }
            }
        }
        $unique = [];
        foreach ($refs as $r) {
            $unique[$r['media'] . ':' . $r['id']] = $r;
        }
        return array_values($unique);
    }

    /** @return list<array{media: string, id: int}> */
    private function discover(string $media, array $params, int $maxPages, array $source, float $minPopularity = 0.0): array
    {
        $refs = [];
        for ($page = 1; $page <= $maxPages; $page++) {
            $res = $this->tmdb->get('/discover/' . $media, $params + ['page' => $page]);
            foreach ($res['results'] ?? [] as $r) {
                // Optional client-side filter on the primary (first) genre: 'primary_genre' => [ids], 'primary_genre_not' => [ids].
                $g = (int) (($r['genre_ids'] ?? [])[0] ?? 0);
                if ((isset($source['primary_genre']) && !in_array($g, (array) $source['primary_genre'], true))
                    || (isset($source['primary_genre_not']) && in_array($g, $source['primary_genre_not'], true))) {
                    continue;
                }
                if ($minPopularity > 0 && (float) ($r['popularity'] ?? 0) < $minPopularity) {
                    continue;
                }
                $refs[] = ['media' => $media, 'id' => (int) $r['id']];
            }
            if ($page >= (int) ($res['total_pages'] ?? 1)) {
                break;
            }
        }
        return $refs;
    }

    public function fetchDetails(string $media, int $id): ?array
    {
        $d = $this->tmdb->get('/' . $media . '/' . $id, TmdbResolver::DETAILS_PARAMS);
        return isset($d['_not_found']) ? null : $d;
    }

    /**
     * Details for several refs, fetched in parallel (shared disk cache with fetchDetails).
     * @param list<array{media: string, id: int}> $refs
     * @return array<string, array<string, mixed>> 'media:id' => details (missing titles left out)
     */
    public function fetchDetailsMany(array $refs): array
    {
        $requests = [];
        foreach ($refs as $ref) {
            $requests[$ref['media'] . ':' . $ref['id']] = ['/' . $ref['media'] . '/' . (int) $ref['id'], TmdbResolver::DETAILS_PARAMS];
        }
        return array_filter($this->tmdb->getMany($requests), function ($d) {
            return !isset($d['_not_found']);
        });
    }

    /** Logo from an explicit URL, or TMDB /company/{id} or /network/{id} (w300). */
    private function resolveLogo($logo): ?string
    {
        if (is_string($logo) && $logo !== '') {
            return $logo;
        }
        if (is_array($logo) && isset($logo['type'], $logo['id'])) {
            $d = $this->tmdb->get('/' . ($logo['type'] === 'network' ? 'network' : 'company') . '/' . (int) $logo['id']);
            if (!empty($d['logo_path'])) {
                return 'https://image.tmdb.org/t/p/w300' . $d['logo_path'];
            }
        }
        return null;
    }

    private static function emitSeed(string $path, array $def, ?string $logo, array $resolved): void
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
}
