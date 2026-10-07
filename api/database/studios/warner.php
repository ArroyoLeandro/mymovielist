<?php

// Warner Bros.: animation plus big live-action franchises (TMDB collections, ids verified via /search/collection).
// Companies: Warner Bros. Animation 2785, Warner Bros. Feature Animation 215559, Warner Bros. Pictures Animation 257419,
// Warner Bros. Pictures 174, DC Entertainment 9993, DC Films 10576, DC Studios 184898.
$col = function (array $ids, array $extra = []) {
    return ['type' => 'collection', 'ids' => $ids] + $extra;
};

return [
    'slug' => 'warner',
    'name' => 'Warner Bros.',
    'logo' => ['type' => 'company', 'id' => 174],
    'sections' => [
        [
            'slug' => 'animation', 'name' => 'Animación', 'period' => '1990-presente',
            'sources' => [
                ['type' => 'discover', 'media' => 'movie', 'params' => ['with_companies' => '2785|215559|257419', 'with_genres' => '16', 'without_genres' => '99,10770', 'vote_count.gte' => 50]],
                ['type' => 'discover', 'media' => 'movie', 'params' => ['with_companies' => '174', 'with_genres' => '16', 'without_genres' => '99,10770', 'vote_count.gte' => 50]],
            ],
        ],
        ['slug' => 'wizarding-world', 'name' => 'Wizarding World', 'period' => '2001-2022', 'source' => $col([1241, 435259])],
        [
            'slug' => 'dc', 'name' => 'DC', 'period' => '2005-presente',
            'sources' => [
                $col([263, 209131, 468552, 573693, 531242, 724848, 948485, 987044], ['not_genre' => 16]),
                ['type' => 'discover', 'media' => 'movie', 'params' => ['with_companies' => '9993|10576|184898', 'without_genres' => '16,99,10770', 'vote_count.gte' => 200]],
            ],
        ],
        ['slug' => 'matrix', 'name' => 'Matrix', 'period' => '1999-2021', 'source' => $col([2344], ['not_genre' => 16])],
        ['slug' => 'lotr', 'name' => 'El Señor de los Anillos / El Hobbit', 'period' => '2001-2014', 'source' => $col([119, 121938])],
        [
            'slug' => 'monsterverse', 'name' => 'MonsterVerse', 'period' => '2014-presente',
            'sources' => [$col([535313]), ['type' => 'ids', 'media' => 'movie', 'ids' => [293167]]],
        ],
        ['slug' => 'conjuring', 'name' => 'El Conjuro', 'period' => '2013-presente', 'source' => $col([313086, 402074, 968052])],
    ],
];
