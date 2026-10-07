<?php

// General live-action TV (>= 1000 votes), no animation, talk/reality/news/documentary or kids. Sections by primary genre.
// Must be imported after the studios so titles they own are skipped.
$params = ['without_genres' => '16,10764,10767,10763,99,10762', 'vote_count.gte' => 1000];
$genres = [
    ['drama', 'Drama', [18]],
    ['comedy', 'Comedia', [35]],
    ['crime', 'Crimen y policiales', [80]],
    ['scifi-fantasy', 'Ciencia ficción y fantasía', [10765]],
    ['action-adventure', 'Acción y aventura', [10759]],
    ['mystery', 'Misterio', [9648]],
];
$main = [];
$sections = [];
foreach ($genres as [$slug, $name, $ids]) {
    $main = array_merge($main, $ids);
    $sections[] = ['slug' => $slug, 'name' => $name, 'sources' => [
        ['type' => 'discover', 'media' => 'tv', 'min_votes' => 1000, 'max_pages' => 100, 'primary_genre' => $ids, 'params' => $params],
    ]];
}
$sections[] = ['slug' => 'other', 'name' => 'Otros (bélica, western, familia y más)', 'sources' => [
    ['type' => 'discover', 'media' => 'tv', 'min_votes' => 1000, 'max_pages' => 100, 'primary_genre_not' => $main, 'params' => $params],
]];

return ['slug' => 'series', 'name' => 'Series', 'logo' => null, 'sections' => $sections];
