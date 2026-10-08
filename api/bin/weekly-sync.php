<?php

declare(strict_types=1);

/**
 * Weekly catalog sync (CLI, PHP 7.4+, cron). Runs every step of src/CatalogSync.php in one process:
 *   1. import every studio (new titles, recent releases under the relaxed rule, updated data),
 *   2. prune what no longer qualifies (never manual, protected or recent titles; skipped when an import step failed),
 *   3. refresh stale watch providers (--stale-days, default 6).
 *
 *   php bin/weekly-sync.php [--mode=full|import|providers] [--stale-days=6] [--limit=N] [--config=path]
 *
 * Shares the lock with the /admin page: a live run there (or another cron) makes this exit with code 3.
 * Output: one concise line per step (cron appends it to storage/weekly-sync.log); the detailed importer log of the
 * last run goes to storage/weekly-sync-detail.log. Exit codes: 0 ok, 1 a step failed / error, 2 usage, 3 lock held.
 *
 * Cron (Hostinger, Mondays 04:00):
 *   0 4 * * 1 /usr/bin/php /home/<user>/domains/<domain>/public_html/mymovielist/_app/bin/weekly-sync.php >> /home/<user>/domains/<domain>/public_html/mymovielist/_app/storage/weekly-sync.log 2>&1
 */

use App\CatalogSync;

if (PHP_SAPI !== 'cli') {
    exit("CLI only.\n");
}

ini_set('memory_limit', '512M');
ini_set('max_execution_time', '0');
set_time_limit(0);

foreach (['Db', 'TmdbClient', 'TmdbResolver', 'StudioDefinitions', 'CatalogImporter', 'WatchProviders', 'CatalogSync'] as $class) {
    require __DIR__ . '/../src/' . $class . '.php';
}

$opts = getopt('', ['mode:', 'stale-days:', 'limit:', 'config:', 'help']);
if (isset($opts['help'])) {
    fwrite(STDOUT, "Usage: php bin/weekly-sync.php [--mode=full|import|providers] [--stale-days=6] [--limit=N] [--config=path]\n");
    exit(0);
}
$mode = (string) ($opts['mode'] ?? 'full');
foreach (['stale-days', 'limit'] as $k) {
    if (isset($opts[$k]) && !ctype_digit((string) $opts[$k])) {
        fwrite(STDERR, "--$k must be a non-negative integer.\n");
        exit(2);
    }
}
if (!in_array($mode, CatalogSync::MODES, true)) {
    fwrite(STDERR, "--mode must be one of: " . implode(', ', CatalogSync::MODES) . "\n");
    exit(2);
}

$stamp = function (string $line): void {
    fwrite(STDOUT, '[' . date('Y-m-d H:i:s') . '] ' . $line . "\n");
};

$started = microtime(true);
$stamp("weekly-sync start (mode $mode)");
try {
    $configFile = isset($opts['config']) ? (string) $opts['config'] : (getenv('DISNEY_CONFIG') ?: __DIR__ . '/../config/config.php');
    if (!is_file($configFile)) {
        throw new RuntimeException('Config file not found: ' . $configFile);
    }
    $config = require $configFile;
    $sync = new CatalogSync($config);

    $storage = __DIR__ . '/../storage';
    $detail = @fopen($storage . '/weekly-sync-detail.log', 'w');
    if ($detail !== false) {
        fwrite($detail, '# weekly-sync ' . date('c') . " mode $mode\n");
        $sync->sink = function (string $line) use ($detail): void {
            fwrite($detail, $line . "\n");
        };
    }
    $code = $sync->runAll($mode, 'cron', $stamp, [
        'staleDays' => isset($opts['stale-days']) ? (int) $opts['stale-days'] : 6,
        'limit' => (int) ($opts['limit'] ?? 0),
    ]);
} catch (Throwable $e) {
    $stamp('ERROR: ' . $e->getMessage());
    $code = 1;
}
$stamp(sprintf('weekly-sync end: exit %d in %.0fs (TMDB requests: %d)', $code, microtime(true) - $started, isset($sync) ? (function () use ($sync): int {
    try {
        return $sync->tmdb()->requests;
    } catch (Throwable $e) {
        return 0;
    }
})() : 0));
exit($code);
