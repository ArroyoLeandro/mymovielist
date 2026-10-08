<?php

declare(strict_types=1);

/**
 * TMDB catalog importer (CLI, PHP 7.4+). The logic lives in src/CatalogImporter.php (curation rules documented there).
 *
 *   php bin/import-tmdb.php --match-existing [--dry-run]        link seeded rows (tmdb_id NULL) to TMDB ids
 *   php bin/import-tmdb.php --studio=disney [--dry-run]         import/update a studio from database/studios/<slug>.php
 *
 * --studio=all imports every studio file (disney-xd first, the anime/series/peliculas categories last).
 * Other flags: --prune (delete unprotected orphaned rows; with --dry-run it only reports), --max-prune=N (skip a
 * studio's prune when it would delete more than N rows), --move (take over rows currently owned by another studio;
 * their ids and watch entries are kept), --emit-seed=path, --no-cache (skip the 6-day response cache in
 * storage/tmdb-cache), --no-recent-rule (normal thresholds only, no recent-release entry or prune grace),
 * --config=path, --verbose.
 * Exit codes: 0 ok, 1 error, 2 usage.
 */

use App\CatalogImporter;
use App\Db;
use App\StudioDefinitions;
use App\TmdbClient;

require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/TmdbClient.php';
require __DIR__ . '/../src/TmdbResolver.php';
require __DIR__ . '/../src/StudioDefinitions.php';
require __DIR__ . '/../src/CatalogImporter.php';

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

$opts = getopt('', ['studio:', 'dry-run', 'match-existing', 'emit-seed:', 'prune', 'max-prune:', 'move', 'no-cache', 'no-recent-rule', 'config:', 'verbose', 'help']);
if (isset($opts['help']) || (!isset($opts['studio']) && !isset($opts['match-existing']))) {
    say("Usage:\n  php bin/import-tmdb.php --match-existing [--dry-run]\n  php bin/import-tmdb.php --studio=<slug>|all [--dry-run] [--prune] [--max-prune=N] [--move] [--emit-seed=path] [--no-cache] [--no-recent-rule] [--verbose]");
    exit(isset($opts['help']) ? 0 : 2);
}
$dry = isset($opts['dry-run']);
ini_set('memory_limit', '512M');

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
        (string) ($tmdbCfg['ca_bundle'] ?? (getenv('SSL_CERT_FILE') ?: '')),
        6 * 86400
    );
    if (!$tmdb->hasCredentials()) {
        fail("TMDB credentials are missing. Set 'tmdb' => ['api_key' => '...'] (v3) or ['read_token' => '...'] (v4) in config.php.");
    }
    $rules = (array) ($config['catalog'] ?? []);
    if (isset($opts['no-recent-rule'])) {
        $rules['recent_months'] = 0;
        $rules['grace_months'] = 0;
    }
    $importer = new CatalogImporter(Db::connect($config['db']), $tmdb, $rules, 'say');

    if (isset($opts['match-existing'])) {
        $importer->matchExisting($dry);
    } else {
        $slug = (string) preg_replace('/[^a-z0-9-]/', '', (string) $opts['studio']);
        $slugs = $slug === 'all' ? StudioDefinitions::orderedSlugs() : [$slug];
        if (!StudioDefinitions::exists($slugs[0] ?? '')) {
            fail("Unknown studio '$slug' (expected database/studios/$slug.php).", 2);
        }
        foreach ($slugs as $one) {
            say("\n=== $one ===");
            $importer->importStudio($one, [
                'dry' => $dry,
                'verbose' => isset($opts['verbose']),
                'prune' => isset($opts['prune']),
                'max_prune' => (int) ($opts['max-prune'] ?? 0),
                'move' => isset($opts['move']),
                'emit_seed' => $opts['emit-seed'] ?? null,
            ]);
        }
    }
    say(sprintf('Done (%d TMDB requests%s).', $tmdb->requests, $dry ? ', dry run: nothing written' : ''));
} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage() . ' (are all database/migrations applied?)');
} catch (Throwable $e) {
    fail($e->getMessage());
}
