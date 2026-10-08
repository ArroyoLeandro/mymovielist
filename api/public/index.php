<?php

declare(strict_types=1);

// Front controller: routes only. SQL is in Repository, auth in Auth, JSON helpers in Http.

use App\Auth;
use App\CatalogImporter;
use App\CatalogSync;
use App\Db;
use App\Http;
use App\HttpError;
use App\Repository;
use App\TmdbClient;
use App\TmdbSearch;
use App\WatchProviders;

require __DIR__ . '/../src/Http.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Auth.php';
require __DIR__ . '/../src/Repository.php';
// TMDB-backed features (search, manual import, admin sync) load their classes on demand.
spl_autoload_register(function (string $class): void {
    $file = __DIR__ . '/../src/' . substr($class, 4) . '.php';
    if (strncmp($class, 'App\\', 4) === 0 && is_file($file)) {
        require $file;
    }
});

/** TMDB client for web requests: shared disk cache, responses kept 24 h. */
function tmdbClient(array $config): TmdbClient
{
    $cfg = $config['tmdb'] ?? [];
    $tmdb = new TmdbClient((string) ($cfg['api_key'] ?? ''), (string) ($cfg['read_token'] ?? ''), __DIR__ . '/../storage/tmdb-cache',
        (string) ($cfg['ca_bundle'] ?? (getenv('SSL_CERT_FILE') ?: '')), 86400);
    if (!$tmdb->hasCredentials()) {
        throw new HttpError(503, 'TMDB is not configured on the server.', 'tmdb_unavailable');
    }
    return $tmdb;
}

$configFile = getenv('DISNEY_CONFIG') ?: __DIR__ . '/../config/config.php';

try {
    if (!is_file($configFile)) {
        throw new RuntimeException('Missing config file.');
    }
    $config = require $configFile;
    $auth = new Auth($config['site_password_hash'], $config['session_name'] ?? 'disney_session');
    $repo = new Repository(Db::connect($config['db']));

    $method = $_SERVER['REQUEST_METHOD'];
    $path = rtrim((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
    $path = preg_replace('#^.*?(?=/api(/|$))#', '', $path); // tolerate a subdirectory prefix

    $auth->start();

    if ($method === 'POST' && $path === '/api/session') {
        $body = Http::jsonBody();
        $password = is_string($body['password'] ?? null) ? $body['password'] : '';
        $tag = is_string($body['tag'] ?? null) ? $body['tag'] : '';
        if (!$auth->checkPassword($password)) {
            throw new HttpError(401, 'Wrong password.');
        }
        if (preg_match('/\A[A-Za-z0-9_-]{2,20}\z/', $tag) !== 1) {
            throw new HttpError(422, 'Tag must be 2-20 characters: letters, digits, "_" or "-".');
        }
        $user = $repo->findOrCreateUser($tag);
        $auth->login($user['id']);
        Http::json(['user' => $user]);
    }

    // Every other endpoint requires a session.
    $userId = $auth->userId();
    $current = $userId === null ? null : $repo->userById($userId);
    if ($current === null) {
        throw new HttpError(401, 'Authentication required.');
    }

    if ($path === '/api/session') {
        if ($method === 'GET') {
            Http::json(['user' => $current]);
        }
        if ($method === 'DELETE') {
            $auth->logout();
            Http::noContent();
        }
    } elseif ($path === '/api/studios' && $method === 'GET') {
        Http::jsonCached($repo->studios()); // static: cacheable
    } elseif ($path === '/api/me/progress' && $method === 'GET') {
        Http::json($repo->progress($current['id']));
    } elseif ($method === 'GET' && preg_match('#^/api/studios/([a-z0-9-]+)/(movies|ratings)$#', $path, $m)) {
        $studio = $repo->studioBySlug($m[1]);
        if ($studio === null) {
            throw new HttpError(404, 'Studio not found.');
        }
        if ($m[2] === 'movies') {
            // Static: titles and posters only, cacheable. Per-user and social data is in /ratings.
            Http::jsonCached(['studio' => ['slug' => $studio['slug'], 'name' => $studio['name'], 'logoUrl' => $studio['logoUrl']]]
                + $repo->catalog($studio['id']));
        }
        Http::json($repo->ratings($studio['id'], $current['id']));
    } elseif ($method === 'PUT' && preg_match('#^/api/movies/(\d+)/entry$#', $path, $m)) {
        $movieId = (int) $m[1];
        $body = Http::jsonBody();
        $watched = $body['watched'] ?? null;
        $score = $body['score'] ?? null;
        if (!is_bool($watched)) {
            throw new HttpError(422, '"watched" must be a boolean.');
        }
        if ($score !== null && (!is_int($score) || $score < 1 || $score > 10)) {
            throw new HttpError(422, '"score" must be an integer from 1 to 10 or null.');
        }
        if (!$watched && $score !== null) {
            throw new HttpError(422, 'A score requires the movie to be watched.');
        }
        if (!$repo->movieExists($movieId)) {
            throw new HttpError(404, 'Movie not found.');
        }
        Http::json($watched
            ? $repo->saveEntry($current['id'], $movieId, $score)
            : $repo->removeEntry($current['id'], $movieId));
    } elseif ($path === '/api/ranking' && $method === 'GET') {
        $slug = isset($_GET['studio']) && is_string($_GET['studio']) && $_GET['studio'] !== '' ? $_GET['studio'] : null;
        $rows = $repo->ranking($slug);
        if ($rows === null) {
            throw new HttpError(404, 'Studio not found.');
        }
        Http::json($rows);
    } elseif ($path === '/api/highlights' && $method === 'GET') {
        Http::json($repo->highlights());
    } elseif ($method === 'GET' && preg_match('#^/api/users/([A-Za-z0-9_-]+)/profile$#', $path, $m)) {
        $user = $repo->userByTag($m[1]);
        if ($user === null) {
            throw new HttpError(404, 'User not found.');
        }
        Http::json($repo->profile($user, $current['id']));
    } elseif ($path === '/api/users' && $method === 'GET') {
        Http::json($repo->userTags());
    } elseif ($path === '/api/home' && $method === 'GET') {
        Http::json($repo->home($current['id']));
    } elseif ($path === '/api/titles' && $method === 'GET') {
        $f = [];
        foreach (['type', 'studio', 'status', 'provider', 'ptype', 'sort', 'q'] as $k) {
            $f[$k] = isset($_GET[$k]) && is_string($_GET[$k]) ? $_GET[$k] : '';
        }
        $f['decade'] = isset($_GET['decade']) ? (int) $_GET['decade'] : 0;
        $f['page'] = isset($_GET['page']) ? (int) $_GET['page'] : 1;
        Http::json($repo->titles($current['id'], $f));
    } elseif ($path === '/api/providers' && $method === 'GET') {
        // Static (changes only when bin/refresh-providers.php runs): cacheable. ?used=1 = providers with >= 1 title.
        Http::jsonCached($repo->providers(($_GET['used'] ?? '') === '1'));
    } elseif ($path === '/api/tmdb/search' && $method === 'GET') {
        // "¿No está? Agregalo": TMDB movies and series, max 20 searches per minute per session, cached 24 h.
        $q = isset($_GET['q']) && is_string($_GET['q']) ? TmdbSearch::normalize($_GET['q']) : '';
        $len = function_exists('mb_strlen') ? mb_strlen($q, 'UTF-8') : strlen($q);
        if ($len < 2 || $len > 100) {
            throw new HttpError(422, 'The query needs 2 to 100 characters.', 'bad_query');
        }
        $now = time();
        $recent = array_values(array_filter((array) ($_SESSION['tmdb_search'] ?? []), function ($t) use ($now) {
            return (int) $t > $now - 60;
        }));
        if (count($recent) >= 20) {
            header('Retry-After: ' . max(1, 60 - ($now - (int) $recent[0])));
            throw new HttpError(429, 'Too many searches, wait a moment.', 'rate_limited', ['retryAfter' => max(1, 60 - ($now - (int) $recent[0]))]);
        }
        $recent[] = $now;
        $_SESSION['tmdb_search'] = $recent;
        session_write_close(); // TMDB can take a moment: do not block the user's other requests
        try {
            $results = (new TmdbSearch(tmdbClient($config), $repo))->search($q);
        } catch (HttpError $e) {
            throw $e;
        } catch (RuntimeException $e) {
            error_log('TMDB search failed: ' . $e->getMessage());
            throw new HttpError(502, 'TMDB did not answer, try again.', 'tmdb_unavailable');
        }
        Http::json(['query' => $q, 'results' => $results]);
    } elseif ($path === '/api/titles/import' && $method === 'POST') {
        // Adds a TMDB title to the catalog (idempotent): placed by the studio definitions or in its category.
        $body = Http::jsonBody();
        $tmdbId = $body['tmdbId'] ?? null;
        $media = $body['mediaType'] ?? null;
        if (!is_int($tmdbId) || $tmdbId <= 0 || !in_array($media, ['movie', 'series', 'tv'], true)) {
            throw new HttpError(422, '"tmdbId" must be a positive integer and "mediaType" "movie" or "series".', 'bad_request');
        }
        session_write_close();
        set_time_limit(60);
        $tmdb = tmdbClient($config);
        $pdo = Db::connect($config['db']);
        try {
            $res = (new CatalogImporter($pdo, $tmdb, (array) ($config['catalog'] ?? [])))->importManual($media === 'movie' ? 'movie' : 'tv', $tmdbId, $current['id']);
        } catch (DomainException $e) {
            throw new HttpError(422, 'Only released titles can be added.', 'unreleased');
        } catch (PDOException $e) {
            throw $e;
        } catch (RuntimeException $e) {
            error_log('Manual import failed: ' . $e->getMessage());
            throw new HttpError(502, 'TMDB did not answer, try again.', 'tmdb_unavailable');
        }
        if ($res === null) {
            throw new HttpError(404, 'TMDB does not know this title.', 'not_found');
        }
        if ($res['created']) {
            try {
                (new WatchProviders($pdo, $tmdb, strtoupper((string) ($config['tmdb']['watch_country'] ?? 'AR'))))
                    ->refreshOne($res['id'], $media === 'movie' ? 'movie' : 'series', $tmdbId);
            } catch (Throwable $e) {
                error_log('Providers for a manual import failed (the weekly sync retries): ' . $e->getMessage());
            }
        }
        Http::json([
            'created' => $res['created'],
            'title' => $repo->titleById($res['id'], $current['id']),
            'studio' => $repo->studioOfTitle($res['id']),
        ], $res['created'] ? 201 : 200);
    } elseif (strpos($path, '/api/admin/') === 0) {
        // Admin (catalog sync on demand): logged-in session + admin unlock (30 min) with the admin password.
        $hash = (string) ($config['admin_password_hash'] ?? '');
        if ($hash === '' || strpos($hash, '$2y$10$replace') === 0) {
            throw new HttpError(503, 'Admin is not configured (admin_password_hash in config.php).', 'admin_disabled');
        }
        $unlocked = (int) ($_SESSION['admin_until'] ?? 0) > time();
        if ($path === '/api/admin/unlock' && $method === 'POST') {
            $body = Http::jsonBody();
            $fails = (array) ($_SESSION['admin_fails'] ?? []);
            if ((int) ($fails['until'] ?? 0) > time()) {
                $wait = (int) $fails['until'] - time();
                header('Retry-After: ' . $wait);
                throw new HttpError(429, 'Too many failed attempts, try again later.', 'locked_out', ['retryAfter' => $wait]);
            }
            $password = is_string($body['password'] ?? null) ? $body['password'] : '';
            if (!password_verify($password, $hash)) {
                usleep(800000);
                $count = (int) ($fails['count'] ?? 0) + 1;
                $_SESSION['admin_fails'] = $count >= 5 ? ['count' => 0, 'until' => time() + 600] : ['count' => $count, 'until' => 0];
                throw new HttpError(401, 'Wrong admin password.', 'bad_password', ['attemptsLeft' => $count >= 5 ? 0 : 5 - $count]);
            }
            unset($_SESSION['admin_fails']);
            $_SESSION['admin_until'] = time() + 1800;
            Http::json(['unlocked' => true, 'expiresIn' => 1800]);
        }
        if (!$unlocked) {
            if ($path === '/api/admin/status' && $method === 'GET') {
                Http::json(['unlocked' => false]);
            }
            throw new HttpError(403, 'Unlock the admin page first.', 'admin_locked');
        }
        session_write_close(); // steps take a while: never hold the session lock
        $sync = new CatalogSync($config, Db::connect($config['db']));
        if ($path === '/api/admin/status' && $method === 'GET') {
            Http::json(['unlocked' => true, 'expiresIn' => (int) $_SESSION['admin_until'] - time(), 'steps' => [
                'full' => count($sync->plan('full')), 'import' => count($sync->plan('import')), 'providers' => 1,
            ]] + $sync->status());
        }
        if ($path === '/api/admin/sync/start' && $method === 'POST') {
            $body = Http::jsonBody();
            $mode = $body['mode'] ?? null;
            if (!in_array($mode, CatalogSync::MODES, true)) {
                throw new HttpError(422, '"mode" must be full, import or providers.', 'bad_request');
            }
            $options = [];
            foreach (['limit' => [0, 100000], 'staleDays' => [0, 365]] as $k => $range) {
                if (isset($body[$k])) {
                    if (!is_int($body[$k]) || $body[$k] < $range[0] || $body[$k] > $range[1]) {
                        throw new HttpError(422, "\"$k\" must be an integer from {$range[0]} to {$range[1]}.", 'bad_request');
                    }
                    $options[$k] = $body[$k];
                }
            }
            $run = $sync->start($mode, $current['tag'], $options);
            if ($run === null) {
                throw new HttpError(409, 'Another sync is running.', 'locked', ['running' => $sync->status()['running']]);
            }
            Http::json($sync->status()['running'], 201);
        }
        if ($path === '/api/admin/sync/step' && $method === 'POST') {
            $body = Http::jsonBody();
            if (!is_string($body['runId'] ?? null) || !is_int($body['index'] ?? null)) {
                throw new HttpError(422, '"runId" (string) and "index" (integer) are required.', 'bad_request');
            }
            set_time_limit(120);
            ignore_user_abort(true); // a closed tab must not cut a step halfway
            try {
                Http::json($sync->step($body['runId'], $body['index'], 40.0));
            } catch (DomainException $e) {
                throw new HttpError(409, $e->getMessage(), 'run_inactive');
            }
        }
        if ($path === '/api/admin/sync/finish' && $method === 'POST') {
            $body = Http::jsonBody();
            if (!is_string($body['runId'] ?? null)) {
                throw new HttpError(422, '"runId" is required.', 'bad_request');
            }
            $run = $sync->finish($body['runId'], ($body['cancelled'] ?? false) === true);
            if ($run === null) {
                throw new HttpError(404, 'Run not found.', 'not_found');
            }
            Http::json($run);
        }
    } elseif ($path === '/api/search' && $method === 'GET') {
        $q = isset($_GET['q']) && is_string($_GET['q']) ? $_GET['q'] : '';
        Http::json($repo->search($q, $current['id']));
    } elseif (preg_match('#^/api/movies/(\d+)/watchlist$#', $path, $m) && ($method === 'PUT' || $method === 'DELETE')) {
        $movieId = (int) $m[1];
        if (!$repo->movieExists($movieId)) {
            throw new HttpError(404, 'Movie not found.');
        }
        if ($method === 'PUT') {
            $repo->addToWatchlist($current['id'], $movieId);
        } else {
            $repo->removeFromWatchlist($current['id'], $movieId);
        }
        Http::noContent();
    } elseif ($method === 'POST' && preg_match('#^/api/movies/(\d+)/recommendations$#', $path, $m)) {
        $movieId = (int) $m[1];
        $body = Http::jsonBody();
        $toTags = $body['toTags'] ?? null;
        if (!is_array($toTags) || !$toTags || count($toTags) > 50) {
            throw new HttpError(422, '"toTags" must be a non-empty list of user tags.');
        }
        foreach ($toTags as $t) {
            if (!is_string($t)) {
                throw new HttpError(422, '"toTags" must be a list of strings.');
            }
        }
        $note = $body['note'] ?? null;
        if ($note !== null && !is_string($note)) {
            throw new HttpError(422, '"note" must be a string.');
        }
        $note = $note === null ? '' : trim($note);
        $len = function_exists('mb_strlen') ? mb_strlen($note, 'UTF-8') : strlen($note);
        if ($len > 280) {
            throw new HttpError(422, '"note" can have at most 280 characters.');
        }
        if (!$repo->movieExists($movieId)) {
            throw new HttpError(404, 'Movie not found.');
        }
        $sent = $repo->recommend($current['id'], $movieId, $toTags, $note === '' ? null : $note);
        if (!$sent) {
            throw new HttpError(422, 'Choose at least one friend (not yourself).');
        }
        Http::json(['sentTo' => $sent], 201);
    } elseif ($method === 'DELETE' && preg_match('#^/api/recommendations/(\d+)$#', $path, $m)) {
        if (!$repo->deleteRecommendation((int) $m[1], $current['id'])) {
            throw new HttpError(404, 'Recommendation not found.');
        }
        Http::noContent();
    } elseif (preg_match('#^/api/recommendations/(\d+)/dismiss$#', $path, $m) && ($method === 'POST' || $method === 'DELETE')) {
        // Recipient only: POST hides it from their lists, DELETE undoes that. The sender's history is untouched.
        $recoId = (int) $m[1];
        $to = $repo->recommendationRecipient($recoId);
        if ($to === null) {
            throw new HttpError(404, 'Recommendation not found.');
        }
        if ($to !== $current['id']) {
            throw new HttpError(403, 'Only the recipient can dismiss a recommendation.');
        }
        $repo->setRecommendationDismissed($recoId, $method === 'POST');
        Http::noContent();
    }

    throw new HttpError(404, 'Not found.');
} catch (HttpError $e) {
    Http::json(['error' => $e->getMessage()] + ($e->reason !== null ? ['code' => $e->reason] : []) + $e->extra, $e->status);
} catch (Throwable $e) {
    error_log((string) $e);
    Http::json(['error' => 'Internal server error.'], 500);
}
