<?php

declare(strict_types=1);

namespace App;

/**
 * Minimal TMDB v3 client for the importer: v3 api_key query param or v4 bearer token,
 * ~20 req/s rate limit, retry on 429 (Retry-After) and transient failures, optional on-disk cache.
 */
final class TmdbClient
{
    private const BASE = 'https://api.themoviedb.org/3';
    private const MIN_INTERVAL = 0.05; // seconds between requests (~20 req/s)

    /** @var string */
    private $apiKey;
    /** @var string */
    private $readToken;
    /** @var string|null */
    private $cacheDir;
    /** @var string optional CA bundle path (PHP on Windows ships without one) */
    private $caBundle;
    /** @var float */
    private $last = 0.0;
    /** @var int */
    public $requests = 0;
    /** @var resource|\CurlHandle|null reused between requests (keep-alive: no new TLS handshake per call) */
    private $ch = null;

    public function __construct(string $apiKey, string $readToken, ?string $cacheDir, string $caBundle = '')
    {
        $this->apiKey = $apiKey;
        $this->readToken = $readToken;
        $this->cacheDir = $cacheDir;
        $this->caBundle = $caBundle;
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
    public function get(string $path, array $params = []): array
    {
        ksort($params);
        $query = http_build_query($params);
        $cacheFile = null;
        if ($this->cacheDir !== null) {
            // The cache key never includes credentials.
            $cacheFile = $this->cacheDir . '/' . sha1($path . '?' . $query) . '.json';
            if (is_file($cacheFile) && filemtime($cacheFile) > time() - 86400) {
                $cached = json_decode((string) file_get_contents($cacheFile), true);
                if (is_array($cached)) {
                    return $cached;
                }
            }
        }

        $headers = [];
        if ($this->readToken !== '') {
            $headers[] = 'Authorization: Bearer ' . $this->readToken;
        } else {
            $query .= ($query === '' ? '' : '&') . 'api_key=' . rawurlencode($this->apiKey);
        }
        $data = $this->fetch(self::BASE . $path . ($query === '' ? '' : '?' . $query), $headers);
        if ($cacheFile !== null && empty($data['_not_found'])) {
            file_put_contents($cacheFile, json_encode($data));
        }
        return $data;
    }

    /** @param list<string> $headers */
    private function fetch(string $url, array $headers): array
    {
        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $wait = self::MIN_INTERVAL - (microtime(true) - $this->last);
            if ($wait > 0) {
                usleep((int) ($wait * 1000000));
            }
            $this->last = microtime(true);
            $this->requests++;

            if ($this->ch === null) {
                $this->ch = curl_init();
            } else {
                curl_reset($this->ch);
            }
            $ch = $this->ch;
            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HEADER => true,
                CURLOPT_TIMEOUT => 30,
            ] + ($this->caBundle !== '' ? [CURLOPT_CAINFO => $this->caBundle] : []) + [
                CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
            ]);
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
