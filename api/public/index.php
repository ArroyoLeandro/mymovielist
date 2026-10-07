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
            Http::jsonCached([
                'studio' => ['slug' => $studio['slug'], 'name' => $studio['name'], 'logoUrl' => $studio['logoUrl']],
                'sections' => $repo->catalog($studio['id']),
            ]);
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
    } elseif ($method === 'GET' && preg_match('#^/api/users/([A-Za-z0-9_-]+)/list$#', $path, $m)) {
        $user = $repo->userByTag($m[1]);
        if ($user === null) {
            throw new HttpError(404, 'User not found.');
        }
        Http::json($repo->userList($user));
    }

    throw new HttpError(404, 'Not found.');
} catch (HttpError $e) {
    Http::json(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log((string) $e);
    Http::json(['error' => 'Internal server error.'], 500);
}
