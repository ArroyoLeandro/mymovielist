<?php

// Universal: animation (Illumination 6704, Universal Pictures 33 + genre 16) plus live-action franchises.
// Import dreamworks first: DreamWorks titles distributed by Universal then stay in /dreamworks.
$col = function (array $ids, array $extra = []) {
    return ['type' => 'collection', 'ids' => $ids] + $extra;
};

return [
    'slug' => 'universal',
    'name' => 'Universal',
    'logo' => ['type' => 'company', 'id' => 33],
    'sections' => [
        [
            'slug' => 'animation', 'name' => 'Animación', 'period' => '1990-presente',
            'sources' => [
                ['type' => 'discover', 'media' => 'movie', 'params' => ['with_companies' => '6704', 'without_genres' => '99,10770']],
                ['type' => 'discover', 'media' => 'movie', 'params' => ['with_companies' => '33', 'with_genres' => '16', 'without_genres' => '99,10770', 'vote_count.gte' => 50]],
            ],
        ],
        ['slug' => 'jurassic', 'name' => 'Jurassic Park / World', 'period' => '1993-presente', 'source' => $col([328])],
        ['slug' => 'fast', 'name' => 'Rápidos y Furiosos', 'period' => '2001-presente', 'source' => $col([9485], ['not_genre' => 16])],
        ['slug' => 'bttf', 'name' => 'Volver al futuro', 'period' => '1985-1990', 'source' => $col([264])],
        ['slug' => 'bourne', 'name' => 'Bourne', 'period' => '2002-2016', 'source' => $col([31562])],
    ],
];
