<?php

declare(strict_types=1);

// Front controller: routes only. SQL is in Repository, auth in Auth, JSON helpers in Http.

use App\Auth;
use App\Db;
use App\Http;
use App\HttpError;
use App\Repository;

require __DIR__ . '/../src/Http.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Auth.php';
require __DIR__ . '/../src/Repository.php';

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
    Http::json(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log((string) $e);
    Http::json(['error' => 'Internal server error.'], 500);
}
