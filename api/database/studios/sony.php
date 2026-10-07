<?php

// Sony Pictures: Sony Pictures Animation (2251) plus live-action franchises (TMDB collections, ids verified).
// Spider-Verse is animated, so it sits in Animación; the live-action Spider-Man films have their own sections.
$col = function (array $ids, array $extra = []) {
    return ['type' => 'collection', 'ids' => $ids] + $extra;
};

return [
    'slug' => 'sony',
    'name' => 'Sony Pictures',
    'logo' => ['type' => 'company', 'id' => 34],
    'sections' => [
        [
            'slug' => 'animation', 'name' => 'Animación', 'period' => '2006-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => ['with_companies' => '2251', 'without_genres' => '99,10770']],
        ],
        ['slug' => 'spider-man', 'name' => 'Spider-Man', 'period' => '2002-presente', 'source' => $col([556, 125574, 531241], ['not_genre' => 16])],
        [
            'slug' => 'sony-spider-man-universe', 'name' => 'Universo Spider-Man de Sony', 'period' => '2018-2024',
            'sources' => [$col([558216]), ['type' => 'ids', 'media' => 'movie', 'ids' => [526896, 634492, 539972]]],
        ],
        ['slug' => 'mib', 'name' => 'Hombres de Negro', 'period' => '1997-2019', 'sources' => [$col([86055]), ['type' => 'ids', 'media' => 'movie', 'ids' => [479455]]]],
        ['slug' => 'jumanji', 'name' => 'Jumanji', 'period' => '1995-presente', 'source' => $col([495527])],
        ['slug' => 'ghostbusters', 'name' => 'Cazafantasmas', 'period' => '1984-presente', 'source' => $col([2980])],
        ['slug' => 'bad-boys', 'name' => 'Bad Boys', 'period' => '1995-presente', 'source' => $col([14890])],
    ],
];
