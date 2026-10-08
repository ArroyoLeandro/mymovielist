<?php

declare(strict_types=1);

/**
 * Merges a duplicate title into the one that stays (CLI, PHP 7.4+): a mockbuster next to the real movie, a pilot TV
 * movie next to its series... User data moves to --to and the --from row is deleted, all in one transaction.
 *
 *   php bin/merge-titles.php --from=<id> --to=<id> [--dry-run] [--allow-cross-media] [--config=path]
 *
 * Rules (database/migrations/009_merge_duplicates.sql applies the same ones in SQL):
 *   watch_entries    re-pointed; when the user already has --to: highest non-null score, earliest watched_at
 *   watchlist        union; when both: earliest added_at
 *   recommendations  re-pointed; when the same sender/recipient pair has both (uq_reco): earliest created_at, the
 *                    note of --to (else --from), dismissed only when both were dismissed (latest dismissal)
 *   title_providers  deleted with the --from row (catalog data, refreshed from TMDB)
 * Refuses equal or missing ids, titles of different media types (unless --allow-cross-media, e.g. a pilot movie into
 * its series) and any other table referencing movies.id that it does not know how to merge.
 * --dry-run runs everything inside the transaction and rolls it back. The --from title must also be excluded from the
 * importer (database/studios/exclusions.php or a definition change), or the next import adds it again.
 * Exit codes: 0 ok, 1 error, 2 usage.
 */

use App\Db;

require __DIR__ . '/../src/Db.php';

if (PHP_SAPI !== 'cli') {
    exit("CLI only.\n");
}

function say(string $line = ''): void
{
    fwrite(STDOUT, $line . "\n");
}

function fail(string $message, int $code = 1): void
{
    fwrite(STDERR, 'Error: ' . $message . "\n");
    exit($code);
}

$opts = getopt('', ['from:', 'to:', 'dry-run', 'allow-cross-media', 'config:', 'help']);
if (isset($opts['help']) || !isset($opts['from'], $opts['to'])) {
    say('Usage: php bin/merge-titles.php --from=<id> --to=<id> [--dry-run] [--allow-cross-media] [--config=path]');
    exit(isset($opts['help']) ? 0 : 2);
}
foreach (['from', 'to'] as $k) {
    if (!ctype_digit((string) $opts[$k]) || (int) $opts[$k] <= 0) {
        fail("--$k must be a positive title id.", 2);
    }
}
$from = (int) $opts['from'];
$to = (int) $opts['to'];
$dry = isset($opts['dry-run']);
if ($from === $to) {
    fail('--from and --to are the same title.', 2);
}

/** Highest non-null score (null only when both are null). */
function best_score($a, $b): ?int
{
    if ($a === null || $b === null) {
        return $a === null ? ($b === null ? null : (int) $b) : (int) $a;
    }
    return max((int) $a, (int) $b);
}

try {
    $configFile = isset($opts['config']) ? (string) $opts['config'] : (getenv('DISNEY_CONFIG') ?: __DIR__ . '/../config/config.php');
    if (!is_file($configFile)) {
        fail('Config file not found: ' . $configFile);
    }
    $config = require $configFile;
    $pdo = Db::connect($config['db']);

    // Every table that points at movies.id must be one this tool merges (a new user table needs a rule here first).
    $known = ['watch_entries', 'watchlist', 'recommendations', 'title_providers'];
    $q = $pdo->query(
        "SELECT DISTINCT table_name FROM information_schema.key_column_usage
         WHERE table_schema = DATABASE() AND referenced_table_name = 'movies' AND referenced_column_name = 'id'
         UNION SELECT DISTINCT table_name FROM information_schema.columns
         WHERE table_schema = DATABASE() AND column_name = 'movie_id'"
    );
    $unknown = array_diff(array_map('strval', $q->fetchAll(PDO::FETCH_COLUMN)), $known, ['movies']);
    if ($unknown) {
        fail('Unknown tables reference titles (' . implode(', ', $unknown) . '): teach merge-titles.php how to merge them first.');
    }

    $pdo->beginTransaction();
    $sel = $pdo->prepare(
        // LEFT JOINs: a title whose section or studio is gone still exists and can be merged.
        'SELECT m.id, m.media_type, m.tmdb_id, m.title, m.year, m.source, st.slug AS studio
         FROM movies m LEFT JOIN sections sec ON sec.id = m.section_id LEFT JOIN studios st ON st.id = sec.studio_id
         WHERE m.id = ? FOR UPDATE'
    );
    $rows = [];
    foreach (['from' => $from, 'to' => $to] as $k => $id) {
        $sel->execute([$id]);
        $rows[$k] = $sel->fetch();
        if (!$rows[$k]) {
            $pdo->rollBack();
            fail("Title #$id (--$k) does not exist.");
        }
    }
    $label = function (array $r): string {
        return sprintf('#%d %s:%s "%s" (%d) [%s]', $r['id'], $r['media_type'], $r['tmdb_id'] ?? 'NULL', $r['title'], $r['year'], $r['studio'] ?? 'no studio');
    };
    if ($rows['from']['media_type'] !== $rows['to']['media_type'] && !isset($opts['allow-cross-media'])) {
        $pdo->rollBack();
        fail('Different media types (' . $rows['from']['media_type'] . ' -> ' . $rows['to']['media_type'] . '): pass --allow-cross-media to merge anyway.', 2);
    }
    say(($dry ? '[dry run] ' : '') . 'Merge ' . $label($rows['from']) . ' -> ' . $label($rows['to']));

    // Watch entries.
    $moved = 0;
    $merged = [];
    $we = $pdo->prepare('SELECT user_id, movie_id, score, watched_at FROM watch_entries WHERE movie_id IN (?, ?) FOR UPDATE');
    $we->execute([$from, $to]);
    $byUser = [];
    foreach ($we->fetchAll() as $r) {
        $byUser[(int) $r['user_id']][(int) $r['movie_id'] === $from ? 'from' : 'to'] = $r;
    }
    foreach ($byUser as $userId => $pair) {
        if (!isset($pair['from'])) {
            continue;
        }
        if (!isset($pair['to'])) {
            $pdo->prepare('UPDATE watch_entries SET movie_id = ? WHERE user_id = ? AND movie_id = ?')->execute([$to, $userId, $from]);
            $moved++;
            continue;
        }
        $score = best_score($pair['from']['score'], $pair['to']['score']);
        $at = min($pair['from']['watched_at'], $pair['to']['watched_at']);
        $pdo->prepare('UPDATE watch_entries SET score = ?, watched_at = ? WHERE user_id = ? AND movie_id = ?')->execute([$score, $at, $userId, $to]);
        $pdo->prepare('DELETE FROM watch_entries WHERE user_id = ? AND movie_id = ?')->execute([$userId, $from]);
        $merged[] = sprintf('user %d: score %s + %s -> %s, watched_at %s', $userId, $pair['from']['score'] ?? 'none',
            $pair['to']['score'] ?? 'none', $score ?? 'none', $at);
    }
    say(sprintf('watch_entries: %d moved, %d merged with an existing entry', $moved, count($merged)));
    foreach ($merged as $line) {
        say('  ' . $line);
    }

    // Watchlist.
    $wl = $pdo->prepare('UPDATE watchlist t JOIN watchlist f ON f.user_id = t.user_id AND f.movie_id = ?
                         SET t.added_at = LEAST(t.added_at, f.added_at) WHERE t.movie_id = ?');
    $wl->execute([$from, $to]);
    $del = $pdo->prepare('DELETE f FROM watchlist f JOIN watchlist t ON t.user_id = f.user_id AND t.movie_id = ? WHERE f.movie_id = ?');
    $del->execute([$to, $from]);
    $wlMerged = $del->rowCount();
    $mv = $pdo->prepare('UPDATE watchlist SET movie_id = ? WHERE movie_id = ?');
    $mv->execute([$to, $from]);
    say(sprintf('watchlist: %d moved, %d already there (earliest added_at kept)', $mv->rowCount(), $wlMerged));

    // Recommendations (uq_reco: one per sender, recipient and title).
    $rc = $pdo->prepare('UPDATE recommendations t JOIN recommendations f
                           ON f.from_user_id = t.from_user_id AND f.to_user_id = t.to_user_id AND f.movie_id = ?
                         SET t.created_at = LEAST(t.created_at, f.created_at), t.note = COALESCE(t.note, f.note),
                             t.dismissed_at = IF(t.dismissed_at IS NULL OR f.dismissed_at IS NULL, NULL, GREATEST(t.dismissed_at, f.dismissed_at))
                         WHERE t.movie_id = ?');
    $rc->execute([$from, $to]);
    $del = $pdo->prepare('DELETE f FROM recommendations f JOIN recommendations t
                            ON t.from_user_id = f.from_user_id AND t.to_user_id = f.to_user_id AND t.movie_id = ?
                          WHERE f.movie_id = ?');
    $del->execute([$to, $from]);
    $rcMerged = $del->rowCount();
    $mv = $pdo->prepare('UPDATE recommendations SET movie_id = ? WHERE movie_id = ?');
    $mv->execute([$to, $from]);
    say(sprintf('recommendations: %d moved, %d merged with an existing one', $mv->rowCount(), $rcMerged));

    // Catalog rows of the duplicate, then the duplicate itself.
    $tp = $pdo->prepare('DELETE FROM title_providers WHERE title_id = ?');
    $tp->execute([$from]);
    $pdo->prepare('DELETE FROM movies WHERE id = ?')->execute([$from]);
    say(sprintf('title_providers: %d rows deleted; title #%d deleted.', $tp->rowCount(), $from));

    if ($dry) {
        $pdo->rollBack();
        say('Dry run: rolled back, nothing written.');
    } else {
        $pdo->commit();
        say('Done.');
    }
    if ($rows['from']['tmdb_id'] !== null) {
        $key = ($rows['from']['media_type'] === 'series' ? 'tv' : 'movie') . ':' . $rows['from']['tmdb_id'];
        say("Make sure the importer will not add $key again (database/studios/exclusions.php or its studio definition).");
    }
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fail('Database error: ' . $e->getMessage());
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fail($e->getMessage());
}
