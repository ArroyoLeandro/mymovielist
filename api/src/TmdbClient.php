<?php

declare(strict_types=1);

namespace App;

/** Thrown before a network request once the caller's time budget is spent (cache hits are still served). */
final class TmdbDeadlineExceeded extends \RuntimeException
{
}

/**
 * Minimal TMDB v3 client: v3 api_key query param or v4 bearer token, ~20 req/s rate limit, retry on 429
 * (Retry-After) and transient failures, optional on-disk cache (gzip-compressed JSON, configurable TTL),
 * parallel fetches (getMany) and an optional deadline for time-boxed web requests.
 */
final class TmdbClient
{
    private const BASE = 'https://api.themoviedb.org/3';
    private const MIN_INTERVAL = 0.05; // seconds between sequential requests (~20 req/s)
    private const PARALLEL = 6;        // concurrent requests in getMany()

    /** @var string */
    private $apiKey;
    /** @var string */
    private $readToken;
    /** @var string|null */
    private $cacheDir;
    /** @var int seconds a cached response stays valid */
    private $cacheTtl;
    /** @var string optional CA bundle path (PHP on Windows ships without one) */
    private $caBundle;
    /** @var float */
    private $last = 0.0;
    /** @var int */
    public $requests = 0;
    /** @var float|null microtime(true) after which no new network request starts (TmdbDeadlineExceeded) */
    public $deadline = null;
    /** @var resource|\CurlHandle|null reused between requests (keep-alive: no new TLS handshake per call) */
    private $ch = null;
    /** @var list<resource|\CurlHandle> handles reused by getMany() (keep-alive per parallel slot) */
    private $pool = [];
    /** @var resource|\CurlMultiHandle|null the multi handle owns the connection cache: kept for the client's lifetime */
    private $mh = null;

    public function __construct(string $apiKey, string $readToken, ?string $cacheDir, string $caBundle = '', int $cacheTtl = 86400)
    {
        $this->apiKey = $apiKey;
        $this->readToken = $readToken;
        $this->cacheDir = $cacheDir;
        $this->caBundle = $caBundle;
        $this->cacheTtl = max(60, $cacheTtl);
        if ($cacheDir !== null && !is_dir($cacheDir)) {
            @mkdir($cacheDir, 0775, true);
        }
    }

    public function hasCredentials(): bool
    {
        return $this->apiKey !== '' || $this->readToken !== '';
    }

    /**
     * @param array<string, scalar> $params
     * @return array<string, mixed>
     */
    public function get(string $path, array $params = [], bool $useCache = true): array
    {
        ksort($params);
        $query = http_build_query($params);
        $key = $path . '?' . $query;
        if ($useCache) {
            $cached = $this->readCache($key);
            if ($cached !== null) {
                return $cached;
            }
        }
        $this->checkDeadline();
        $this->throttle();
        $data = $this->fetch($this->url($path, $query), $this->headers());
        if ($useCache) {
            $this->writeCache($key, $data);
        }
        return $data;
    }

    /**
     * Fetches several requests in parallel (cache hits are served without a request). Failed transfers, 429 and 5xx
     * responses are retried one by one through get().
     * @param array<string, array{0: string, 1?: array<string, scalar>}> $requests key => [path, params]
     * @return array<string, array<string, mixed>> key => response (['_not_found' => true] on 404)
     */
    public function getMany(array $requests, bool $useCache = true): array
    {
        $out = [];
        $todo = [];
        foreach ($requests as $k => $req) {
            $params = $req[1] ?? [];
            ksort($params);
            $query = http_build_query($params);
            $cached = $useCache ? $this->readCache($req[0] . '?' . $query) : null;
            if ($cached !== null) {
                $out[$k] = $cached;
            } else {
                $todo[$k] = [$req[0], $params, $query];
            }
        }
        if (!$todo) {
            return $out;
        }
        if (!function_exists('curl_multi_init')) {
            foreach ($todo as $k => $t) {
                $out[$k] = $this->get($t[0], $t[1], $useCache);
            }
            return $out;
        }

        $retry = [];
        foreach (array_chunk($todo, self::PARALLEL, true) as $chunk) {
            $this->checkDeadline();
            if ($this->mh === null) {
                $this->mh = curl_multi_init();
            }
            $mh = $this->mh;
            $handles = [];
            $slot = 0;
            foreach ($chunk as $k => $t) {
                if (!isset($this->pool[$slot])) {
                    $this->pool[$slot] = curl_init();
                } else {
                    curl_reset($this->pool[$slot]);
                }
                $h = $this->pool[$slot++];
                curl_setopt_array($h, $this->curlOptions($this->url($t[0], $t[2]), $this->headers()));
                curl_multi_add_handle($mh, $h);
                $handles[$k] = $h;
            }
            $this->requests += count($handles);
            do {
                $status = curl_multi_exec($mh, $running);
                if ($running && curl_multi_select($mh, 0.05) === -1) {
                    usleep(5000); // short select timeout: on some builds (Windows) select waits the whole timeout
                }
            } while ($running && $status === CURLM_OK);
            foreach ($handles as $k => $h) {
                $raw = curl_multi_getcontent($h);
                $code = (int) curl_getinfo($h, CURLINFO_HTTP_CODE);
                $body = substr((string) $raw, (int) curl_getinfo($h, CURLINFO_HEADER_SIZE));
                curl_multi_remove_handle($mh, $h);
                if ($code === 401) {
                    throw new \RuntimeException('TMDB rejected the credentials (HTTP 401). Check tmdb.api_key / tmdb.read_token in config.php.');
                }
                if ($code === 404) {
                    $out[$k] = ['_not_found' => true];
                    continue;
                }
                $json = $code === 200 ? json_decode($body, true) : null;
                if (!is_array($json)) {
                    $retry[$k] = $chunk[$k]; // 429, 5xx, transport error: sequential retry with backoff
                    continue;
                }
                $out[$k] = $json;
                if ($useCache) {
                    $this->writeCache($chunk[$k][0] . '?' . $chunk[$k][2], $json);
                }
            }
            $this->last = microtime(true);
        }
        foreach ($retry as $k => $t) {
            $out[$k] = $this->get($t[0], $t[1], $useCache);
        }
        return $out;
    }

    /** Deletes cache files older than $maxAge seconds. Returns how many were removed. */
    public function pruneCache(int $maxAge): int
    {
        if ($this->cacheDir === null || !is_dir($this->cacheDir)) {
            return 0;
        }
        $removed = 0;
        $limit = time() - $maxAge;
        foreach (new \DirectoryIterator($this->cacheDir) as $f) {
            if ($f->isFile() && preg_match('/\.json(\.gz)?$/', $f->getFilename()) === 1 && $f->getMTime() < $limit) {
                if (@unlink($f->getPathname())) {
                    $removed++;
                }
            }
        }
        return $removed;
    }

    private function checkDeadline(): void
    {
        if ($this->deadline !== null && microtime(true) >= $this->deadline) {
            throw new TmdbDeadlineExceeded('Time budget spent.');
        }
    }

    private function throttle(): void
    {
        $wait = self::MIN_INTERVAL - (microtime(true) - $this->last);
        if ($wait > 0) {
            usleep((int) ($wait * 1000000));
        }
        $this->last = microtime(true);
    }

    private function url(string $path, string $query): string
    {
        if ($this->readToken === '') {
            $query .= ($query === '' ? '' : '&') . 'api_key=' . rawurlencode($this->apiKey);
        }
        return self::BASE . $path . ($query === '' ? '' : '?' . $query);
    }

    /** @return list<string> */
    private function headers(): array
    {
        return $this->readToken !== '' ? ['Authorization: Bearer ' . $this->readToken] : [];
    }

    /** @param list<string> $headers */
    private function curlOptions(string $url, array $headers): array
    {
        return [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
        ] + ($this->caBundle !== '' ? [CURLOPT_CAINFO => $this->caBundle] : []);
    }

    /** The cache key never includes credentials. Files are gzip-compressed when zlib is available. */
    private function cacheFile(string $key): ?string
    {
        if ($this->cacheDir === null) {
            return null;
        }
        return $this->cacheDir . '/' . sha1($key) . (function_exists('gzencode') ? '.json.gz' : '.json');
    }

    /** @return array<string, mixed>|null */
    private function readCache(string $key): ?array
    {
        $file = $this->cacheFile($key);
        if ($file === null) {
            return null;
        }
        $legacy = $this->cacheDir . '/' . sha1($key) . '.json'; // uncompressed files from older versions
        foreach (array_unique([$file, $legacy]) as $f) {
            if (is_file($f) && filemtime($f) > time() - $this->cacheTtl) {
                $raw = (string) file_get_contents($f);
                if (substr($f, -3) === '.gz') {
                    $raw = (string) @gzdecode($raw);
                }
                $data = json_decode($raw, true);
                if (is_array($data)) {
                    return $data;
                }
            }
        }
        return null;
    }

    /** @param array<string, mixed> $data */
    private function writeCache(string $key, array $data): void
    {
        $file = $this->cacheFile($key);
        if ($file === null || !empty($data['_not_found'])) {
            return;
        }
        $json = (string) json_encode($data);
        @file_put_contents($file, substr($file, -3) === '.gz' ? gzencode($json, 6) : $json, LOCK_EX);
    }

    /** @param list<string> $headers */
    private function fetch(string $url, array $headers): array
    {
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            if ($attempt > 1) {
                $this->throttle();
            }
            $this->requests++;

            if ($this->ch === null) {
                $this->ch = curl_init();
            } else {
                curl_reset($this->ch);
            }
            $ch = $this->ch;
            curl_setopt_array($ch, $this->curlOptions($url, $headers));
            $raw = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
            $error = curl_error($ch);

            if ($raw === false) {
                if ($attempt < 5) {
                    sleep($attempt);
                    continue;
                }
                throw new \RuntimeException('TMDB request failed: ' . $error);
            }
            $head = substr((string) $raw, 0, $headerSize);
            $body = substr((string) $raw, $headerSize);

            if ($status === 429) {
                $retry = preg_match('/^Retry-After:\s*(\d+)/mi', $head, $m) === 1 ? (int) $m[1] : 2;
                sleep(max(1, $retry));
                continue;
            }
            if ($status >= 500 && $attempt < 5) {
                sleep($attempt);
                continue;
            }
            if ($status === 401) {
                throw new \RuntimeException('TMDB rejected the credentials (HTTP 401). Check tmdb.api_key / tmdb.read_token in config.php.');
            }
            if ($status === 404) {
                return ['_not_found' => true];
            }
            $json = json_decode($body, true);
            if ($status !== 200 || !is_array($json)) {
                throw new \RuntimeException('TMDB returned HTTP ' . $status . '.');
            }
            return $json;
        }
        throw new \RuntimeException('TMDB rate limit: gave up after repeated 429 responses.');
    }
}
