<?php

// General live-action movies (>= 5000 votes, >= 40 min), no animation or documentaries. Sections by primary genre; sagas
// come from TMDB collections. Must be imported after the studios so titles they own are skipped.
$params = ['without_genres' => '16,99', 'vote_count.gte' => 5000, 'with_runtime.gte' => 40];
$genres = [
    ['action', 'Acción', [28]],
    ['adventure', 'Aventura', [12]],
    ['comedy', 'Comedia', [35]],
    ['drama', 'Drama', [18]],
    ['horror', 'Terror', [27]],
    ['scifi', 'Ciencia ficción', [878]],
    ['fantasy', 'Fantasía', [14]],
    ['thriller', 'Suspenso', [53]],
    ['crime', 'Crimen', [80]],
    ['romance', 'Romance', [10749]],
];
$main = [];
$sections = [];
foreach ($genres as [$slug, $name, $ids]) {
    $main = array_merge($main, $ids);
    $sections[] = ['slug' => $slug, 'name' => $name, 'sources' => [
        ['type' => 'discover', 'media' => 'movie', 'min_votes' => 5000, 'max_pages' => 200, 'primary_genre' => $ids, 'params' => $params],
    ]];
}
$sections[] = ['slug' => 'other', 'name' => 'Otros (familia, bélica, historia, western y más)', 'sources' => [
    ['type' => 'discover', 'media' => 'movie', 'min_votes' => 5000, 'max_pages' => 200, 'primary_genre_not' => $main, 'params' => $params],
]];

return ['slug' => 'peliculas', 'name' => 'Películas', 'logo' => null, 'sections' => $sections];
