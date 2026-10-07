<?php

declare(strict_types=1);

// Fills movies.poster_url from English Wikipedia (pageimages) for movies that have a wiki_title.
// Usage: php bin/fetch-posters.php [--all]   (default: only movies without a poster)
// Use it after adding a new studio's movies to the database.

require __DIR__ . '/../src/Db.php';

$configFile = getenv('DISNEY_CONFIG') ?: __DIR__ . '/../config/config.php';
$config = require $configFile;
$pdo = App\Db::connect($config['db']);

$all = in_array('--all', $argv, true);
$sql = 'SELECT id, title, wiki_title FROM movies WHERE wiki_title IS NOT NULL'
    . ($all ? '' : ' AND poster_url IS NULL') . ' ORDER BY id';
$update = $pdo->prepare('UPDATE movies SET poster_url = ? WHERE id = ?');

$found = 0;
$missing = [];
foreach ($pdo->query($sql)->fetchAll() as $movie) {
    $url = 'https://en.wikipedia.org/w/api.php?' . http_build_query([
        'action' => 'query',
        'titles' => $movie['wiki_title'],
        'prop' => 'pageimages',
        'pithumbsize' => 500,
        'pilicense' => 'any',
        'format' => 'json',
        'redirects' => 1,
    ]);
    $context = stream_context_create(['http' => [
        'header' => "User-Agent: DisneyCatalogoBot/1.0 (private project)\r\n",
        'timeout' => 20,
    ]]);
    $json = @file_get_contents($url, false, $context);
    $poster = null;
    foreach (json_decode($json ?: '[]', true)['query']['pages'] ?? [] as $page) {
        if (!empty($page['thumbnail']['source'])) {
            $poster = strtok($page['thumbnail']['source'], '?');
        }
    }
    if ($poster === null) {
        $missing[] = $movie['title'];
        echo "MISS {$movie['title']} ({$movie['wiki_title']})\n";
    } else {
        $update->execute([$poster, $movie['id']]);
        $found++;
        echo "ok   {$movie['title']}\n";
    }
    usleep(200_000);
}

echo "Updated $found poster(s); " . count($missing) . " missing.\n";
