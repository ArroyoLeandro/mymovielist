<?php

declare(strict_types=1);

namespace App;

use PDO;

/**
 * Catalog sync as a list of small steps, shared by the weekly cron (bin/weekly-sync.php runs every step in one
 * process) and the /admin page (the browser runs one step per request: shared hosting cuts long requests and has
 * no exec()). Steps: import one studio (each studio in import order), prune every studio, refresh watch providers.
 *
 * A step called with a time budget may answer "partial": the TMDB client stops starting requests at the deadline,
 * everything fetched so far stays in the disk cache, and calling the same step again continues where it stopped.
 *
 * One run at a time: a lock file in storage/ with a heartbeat (each step refreshes it). A lock without a heartbeat
 * for LOCK_TTL seconds is stale (closed tab, killed process) and can be taken over. Run state and the last finished
 * run are kept in storage/sync-state.json.
 */
final class CatalogSync
{
    public const LOCK_TTL = 900;
    public const MODES = ['full', 'import', 'providers'];
    private const CACHE_TTL = 6 * 86400;   // under a week: every weekly run fetches fresh discover pages and details
    private const PROVIDER_BATCH = 150;
    private const LOG_LINES = 300;         // per step, kept in the run state

    /** @var array<string, mixed> */
    private $config;
    /** @var string */
    private $storage;
    /** @var PDO|null */
    private $pdo;
    /** @var TmdbClient|null */
    private $tmdb;
    /** @var CatalogImporter|null */
    private $importer;
    /** @var list<string> log lines of the step being run */
    private $lines = [];
    /** @var callable(string): void|null extra log sink (CLI detail log) */
    public $sink = null;

    public function __construct(array $config, ?PDO $pdo = null, ?string $storage = null)
    {
        $this->config = $config;
        $this->pdo = $pdo;
        $this->storage = $storage ?? __DIR__ . '/../storage';
        if (!is_dir($this->storage)) {
            @mkdir($this->storage, 0775, true);
        }
    }

    private function pdo(): PDO
    {
        if ($this->pdo === null) {
            $this->pdo = Db::connect($this->config['db']);
        }
        return $this->pdo;
    }

    public function tmdb(): TmdbClient
    {
        if ($this->tmdb === null) {
            $cfg = $this->config['tmdb'] ?? [];
            $this->tmdb = new TmdbClient(
                (string) ($cfg['api_key'] ?? ''),
                (string) ($cfg['read_token'] ?? ''),
                $this->storage . '/tmdb-cache',
                (string) ($cfg['ca_bundle'] ?? (getenv('SSL_CERT_FILE') ?: '')),
                self::CACHE_TTL
            );
            if (!$this->tmdb->hasCredentials()) {
                throw new \RuntimeException("TMDB credentials are missing in config.php ('tmdb' => ['api_key' => ...]).");
            }
        }
        return $this->tmdb;
    }

    private function importer(): CatalogImporter
    {
        if ($this->importer === null) {
            $this->importer = new CatalogImporter($this->pdo(), $this->tmdb(), (array) ($this->config['catalog'] ?? []), function (string $line): void {
                $this->log($line);
            });
        }
        return $this->importer;
    }

    private function log(string $line): void
    {
        $this->lines[] = $line;
        if (count($this->lines) > self::LOG_LINES) {
            array_shift($this->lines);
        }
        if ($this->sink !== null) {
            ($this->sink)($line);
        }
    }

    // ---- plan ------------------------------------------------------------------------------------------------

    /** @return list<array{kind: string, studio: string|null, label: string}> */
    public function plan(string $mode): array
    {
        $steps = [];
        if ($mode === 'full' || $mode === 'import') {
            foreach (StudioDefinitions::orderedSlugs() as $slug) {
                $def = StudioDefinitions::load($slug);
                $steps[] = ['kind' => 'import', 'studio' => $slug, 'label' => 'Importando ' . $def['name']];
            }
        }
        if ($mode === 'full') {
            $steps[] = ['kind' => 'prune', 'studio' => null, 'label' => 'Quitando títulos que ya no califican'];
        }
        if ($mode === 'full' || $mode === 'providers') {
            $steps[] = ['kind' => 'providers', 'studio' => null, 'label' => 'Plataformas'];
        }
        return $steps;
    }

    // ---- lock and state --------------------------------------------------------------------------------------

    /** Runs $fn while holding a short exclusive lock on the state files (read-modify-write). */
    private function mutex(callable $fn)
    {
        $h = fopen($this->storage . '/sync.mutex', 'c');
        if ($h === false) {
            throw new \RuntimeException('Cannot open the sync mutex in ' . $this->storage . '.');
        }
        flock($h, LOCK_EX);
        try {
            return $fn();
        } finally {
            flock($h, LOCK_UN);
            fclose($h);
        }
    }

    /** @return array{current: array<string, mixed>|null, last: array<string, mixed>|null} */
    private function readState(): array
    {
        $raw = @file_get_contents($this->storage . '/sync-state.json');
        $s = $raw === false ? null : json_decode($raw, true);
        return ['current' => $s['current'] ?? null, 'last' => $s['last'] ?? null];
    }

    private function writeState(array $s): void
    {
        $tmp = $this->storage . '/sync-state.json.tmp';
        file_put_contents($tmp, json_encode($s, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        if (!@rename($tmp, $this->storage . '/sync-state.json')) {
            @unlink($this->storage . '/sync-state.json'); // Windows: rename does not replace
            rename($tmp, $this->storage . '/sync-state.json');
        }
    }

    private static function isLive(?array $run): bool
    {
        return $run !== null && empty($run['finishedAt']) && (time() - (int) ($run['heartbeat'] ?? 0)) < self::LOCK_TTL;
    }

    /** Public status: current run (when its lock is live) and the last finished one. @return array<string, mixed> */
    public function status(): array
    {
        $s = $this->mutex(function () {
            return $this->readState();
        });
        $live = self::isLive($s['current']);
        return [
            'running' => $live ? self::publicRun($s['current']) : null,
            'lockExpiresIn' => $live ? max(0, self::LOCK_TTL - (time() - (int) $s['current']['heartbeat'])) : null,
            'lastRun' => $s['last'] !== null ? self::publicRun($s['last']) : (!$live && $s['current'] !== null ? self::publicRun($s['current'] + ['abandoned' => true]) : null),
        ];
    }

    private static function publicRun(array $run): array
    {
        $out = $run;
        unset($out['heartbeat']);
        foreach ($out['steps'] as &$st) {
            unset($st['cursor']);
        }
        unset($st);
        return $out;
    }

    /**
     * Starts a run: takes the lock (refused when another live run holds it) and stores the step plan.
     * @param array{limit?: int, staleDays?: int} $options providers: refresh at most `limit` titles; stale threshold in days
     * @return array<string, mixed>|null the run, or null when the lock is held
     */
    public function start(string $mode, string $by, array $options = []): ?array
    {
        if (!in_array($mode, self::MODES, true)) {
            throw new \InvalidArgumentException('Unknown mode.');
        }
        $steps = array_map(function (array $st) {
            return $st + ['status' => 'pending', 'summary' => null, 'error' => null, 'durationMs' => 0, 'calls' => 0, 'progress' => null, 'cursor' => null];
        }, $this->plan($mode));
        return $this->mutex(function () use ($mode, $by, $options, $steps) {
            $s = $this->readState();
            if (self::isLive($s['current'])) {
                return null;
            }
            if ($s['current'] !== null && empty($s['current']['finishedAt'])) {
                $s['last'] = $s['current'] + ['abandoned' => true]; // stale lock: the previous run never finished
            }
            $run = [
                'id' => bin2hex(random_bytes(8)),
                'mode' => $mode,
                'by' => $by,
                'startedAt' => date('c'),
                'finishedAt' => null,
                'heartbeat' => time(),
                'options' => [
                    'limit' => max(0, (int) ($options['limit'] ?? 0)),
                    'staleDays' => max(0, (int) ($options['staleDays'] ?? 6)),
                ],
                'steps' => $steps,
                'totals' => null,
                'cancelled' => false,
            ];
            $s['current'] = $run;
            $this->writeState($s);
            $removed = $this->tmdb()->pruneCache(self::CACHE_TTL + 86400);
            if ($removed > 0) {
                $this->log("Cache: removed $removed expired files.");
            }
            return $run;
        });
    }

    /**
     * Runs (or continues) one step of the current run. $budget: seconds before the TMDB client stops starting
     * requests (null: no limit, CLI). Returns the step as stored, plus the log lines of this call.
     * @return array<string, mixed>
     * @throws \DomainException when the run is not the live one or the index is out of range
     */
    public function step(string $runId, int $index, ?float $budget): array
    {
        $run = $this->mutex(function () use ($runId, $index) {
            $s = $this->readState();
            $run = $s['current'];
            if ($run === null || $run['id'] !== $runId || !empty($run['finishedAt']) || !self::isLive($run)) {
                throw new \DomainException('This run is not active anymore.');
            }
            if (!isset($run['steps'][$index])) {
                throw new \DomainException('Unknown step.');
            }
            $s['current']['heartbeat'] = time();
            $this->writeState($s);
            return $s['current'];
        });
        $st = $run['steps'][$index];
        if ($st['status'] === 'done') {
            return $st + ['index' => $index, 'log' => []];
        }

        $this->lines = [];
        $t0 = microtime(true);
        $tmdb = $this->tmdb();
        $tmdb->deadline = $budget === null ? null : $t0 + $budget;
        $partial = false;
        try {
            if ($st['kind'] === 'import') {
                $sum = $this->importer()->importStudio((string) $st['studio'], []);
                $st['summary'] = ['new' => $sum['new'], 'updated' => $sum['updated'], 'unchanged' => $sum['unchanged'], 'recent' => $sum['recent']];
            } elseif ($st['kind'] === 'prune') {
                $partial = $this->prune($st);
            } else {
                $partial = $this->providers($st, $run['options'], $budget === null ? null : $t0 + $budget);
            }
            $st['status'] = $partial ? 'partial' : 'done';
            $st['error'] = null;
        } catch (TmdbDeadlineExceeded $e) {
            $st['status'] = 'partial';
            $this->log('Time budget reached: continuing in the next call (TMDB responses are cached).');
        } catch (\Throwable $e) {
            $st['status'] = 'error';
            $st['error'] = $e->getMessage();
            $this->log('ERROR: ' . $e->getMessage());
        } finally {
            $tmdb->deadline = null;
        }
        $st['calls']++;
        $st['durationMs'] += (int) round((microtime(true) - $t0) * 1000);

        $this->mutex(function () use ($runId, $index, $st) {
            $s = $this->readState();
            if ($s['current'] !== null && $s['current']['id'] === $runId) {
                $s['current']['steps'][$index] = $st;
                $s['current']['heartbeat'] = time();
                $this->writeState($s);
            }
        });
        unset($st['cursor']);
        return $st + ['index' => $index, 'log' => $this->lines];
    }

    /** Prune every studio (TMDB responses come from the cache filled by the import steps). Returns true when partial. */
    private function prune(array &$st): bool
    {
        $slugs = StudioDefinitions::orderedSlugs();
        $from = (int) ($st['cursor'] ?? 0);
        $sum = $st['summary'] ?? ['deleted' => 0, 'skipped' => []];
        $maxPrune = (int) ($this->config['catalog']['max_prune'] ?? 25);
        for ($i = $from; $i < count($slugs); $i++) {
            $r = $this->importer()->importStudio($slugs[$i], ['prune' => true, 'max_prune' => $maxPrune]);
            $sum['deleted'] += $r['deleted'];
            if ($r['pruneSkipped']) {
                $sum['skipped'][] = $slugs[$i];
            }
            $st['cursor'] = $i + 1;
            $st['summary'] = $sum;
            $st['progress'] = ['done' => $i + 1, 'total' => count($slugs)];
        }
        return false;
    }

    /** Refresh stale watch providers in batches until done or the deadline. Returns true when partial. */
    private function providers(array &$st, array $options, ?float $deadline): bool
    {
        $cfg = $this->config['tmdb'] ?? [];
        $wp = new WatchProviders($this->pdo(), $this->tmdb(), strtoupper((string) ($cfg['watch_country'] ?? 'AR')));
        $stale = (int) $options['staleDays'];
        if ($st['cursor'] === null) {
            $total = $wp->countStale($stale);
            if ($options['limit'] > 0) {
                $total = min($total, (int) $options['limit']);
            }
            $st['cursor'] = ['done' => 0, 'total' => $total];
            $st['summary'] = ['updated' => 0, 'with' => 0, 'without' => 0, 'failed' => 0];
        }
        while ($st['cursor']['done'] < $st['cursor']['total']) {
            if ($deadline !== null && microtime(true) > $deadline) {
                return true;
            }
            $titles = $wp->staleTitles($stale, '', min(self::PROVIDER_BATCH, $st['cursor']['total'] - $st['cursor']['done']));
            if (!$titles) {
                break;
            }
            $r = $wp->refresh($titles);
            foreach (['updated', 'with', 'without', 'failed'] as $k) {
                $st['summary'][$k] += $r[$k];
            }
            foreach ($r['errors'] as $err) {
                $this->log('WARN: ' . $err);
            }
            $st['cursor']['done'] += count($titles);
            $st['progress'] = ['done' => $st['cursor']['done'], 'total' => $st['cursor']['total']];
            $this->log(sprintf('Providers: %d/%d (%d with an offer, %d without, %d failed).', $st['cursor']['done'], $st['cursor']['total'], $st['summary']['with'], $st['summary']['without'], $st['summary']['failed']));
            if ($r['updated'] === 0) {
                break; // every title of the batch failed: stop instead of looping on them
            }
        }
        $st['progress'] = ['done' => $st['cursor']['done'], 'total' => $st['cursor']['total']];
        return false;
    }

    /**
     * Ends the run: totals, moved to "last run", lock released. Idempotent.
     * @return array<string, mixed>|null the finished run, or null when there is no such run
     */
    public function finish(string $runId, bool $cancelled = false): ?array
    {
        return $this->mutex(function () use ($runId, $cancelled) {
            $s = $this->readState();
            if ($s['current'] === null || $s['current']['id'] !== $runId) {
                return $s['last'] !== null && $s['last']['id'] === $runId ? self::publicRun($s['last']) : null;
            }
            $run = $s['current'];
            $t = ['new' => 0, 'updated' => 0, 'deleted' => 0, 'providersUpdated' => 0, 'withProviders' => 0, 'failedSteps' => 0];
            foreach ($run['steps'] as $st) {
                $sum = $st['summary'] ?? [];
                if ($st['kind'] === 'import') {
                    $t['new'] += (int) ($sum['new'] ?? 0);
                    $t['updated'] += (int) ($sum['updated'] ?? 0);
                } elseif ($st['kind'] === 'prune') {
                    $t['deleted'] += (int) ($sum['deleted'] ?? 0);
                } else {
                    $t['providersUpdated'] += (int) ($sum['updated'] ?? 0);
                    $t['withProviders'] += (int) ($sum['with'] ?? 0);
                }
                if ($st['status'] === 'error') {
                    $t['failedSteps']++;
                }
            }
            $run['totals'] = $t;
            $run['finishedAt'] = date('c');
            $run['cancelled'] = $cancelled;
            $t['unfinishedSteps'] = count(array_filter($run['steps'], function ($st) {
                return $st['status'] !== 'done';
            }));
            $run['totals'] = $t;
            $s['last'] = $run;
            $s['current'] = null;
            $this->writeState($s);
            return self::publicRun($run);
        });
    }

    /**
     * CLI: every step in order, without a time budget. Returns the process exit code (0 ok, 1 a step failed,
     * 3 another run holds the lock).
     * @param callable(string): void $out concise progress lines
     */
    public function runAll(string $mode, string $by, callable $out, array $options = []): int
    {
        $run = $this->start($mode, $by, $options);
        if ($run === null) {
            $out('Another sync is running (lock held); exiting.');
            return 3;
        }
        $failed = false;
        foreach ($run['steps'] as $i => $plan) {
            if ($plan['kind'] === 'prune' && $failed) {
                $out('[skip] prune: an import step failed, nothing is pruned on a partial import.');
                continue;
            }
            do {
                $st = $this->step($run['id'], $i, null);
            } while ($st['status'] === 'partial');
            $sum = $st['summary'] ?? [];
            $what = $plan['kind'] . ($plan['studio'] !== null ? ' ' . $plan['studio'] : '');
            if ($st['status'] === 'error') {
                $failed = true;
                $out(sprintf('[FAIL] %s: %s', $what, $st['error']));
                continue;
            }
            $detail = [];
            foreach ($sum as $k => $v) {
                $detail[] = $k . ' ' . (is_array($v) ? ($v ? implode(',', $v) : '-') : $v);
            }
            $out(sprintf('[ok] %s: %s (%.1fs)', $what, implode(', ', $detail), $st['durationMs'] / 1000));
        }
        $done = $this->finish($run['id']);
        $t = $done['totals'] ?? [];
        $out(sprintf('Totals: %d new, %d updated, %d removed, providers refreshed %d (%d with an offer)%s.',
            $t['new'] ?? 0, $t['updated'] ?? 0, $t['deleted'] ?? 0, $t['providersUpdated'] ?? 0, $t['withProviders'] ?? 0,
            $failed ? ', with failed steps' : ''));
        return $failed ? 1 : 0;
    }
}
