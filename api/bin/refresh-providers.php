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
use App\WatchProviders;

require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/TmdbClient.php';
require __DIR__ . '/../src/WatchProviders.php';

if (PHP_SAPI !== 'cli') {
    exit("CLI only.\n");
}

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

    $wp = new WatchProviders($pdo, $tmdb, $country);
    $titles = $wp->staleTitles($staleDays, $studio, $limit);
    out(sprintf('Watch providers (%s): %d titles to refresh%s.', $country, count($titles), $dry ? ' [dry run: nothing is written]' : ''));
    $stats = $wp->refresh($titles, $dry, $verbose ? 'out' : null);
    foreach ($stats['errors'] as $err) {
        fwrite(STDERR, '  ' . $err . "\n");
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
