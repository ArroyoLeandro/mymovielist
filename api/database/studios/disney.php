<?php

// Studio definition for bin/import-tmdb.php.
//   logo:    explicit URL, or ['type' => 'company'|'network', 'id' => N] (resolved to a TMDB logo URL)
//   source:  ['type' => 'ids', 'media' => 'movie'|'tv', 'ids' => [...]]  (explicit canon list)
//            ['type' => 'discover', 'media' => 'movie'|'tv', 'params' => [...TMDB discover params...]]
//   exclude_ids: TMDB ids to drop from a section. A title belongs to the first section that claims it.
// Defaults added to every discover source: released only, no adult, sorted by date, and for movies
// runtime >= 40 min (no shorts) and without documentaries (genre 99) unless the params say otherwise.
//
// TMDB ids: companies WDAS 6125, Pixar 3, Walt Disney Pictures 2, Walt Disney Productions 3166,
// DisneyToon Studios 5391, Disney Channel 240533 (+ Disney Channels Worldwide 241787), Lucasfilm Ltd. 1.
// TMDB tags WDAS films inconsistently (discover by company 6125 only returns ~18 modern films),
// so the seven WDAS eras use the explicit canon below (ids resolved with `--match-existing`).
return [
    'slug' => 'disney',
    'name' => 'Disney',
    'logo' => ['type' => 'company', 'id' => 2],
    'sections' => [
        [
            'slug' => 'golden-age', 'name' => 'Era Dorada', 'period' => '1937-1942',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [408, 10895, 756, 11360, 3170]],
        ],
        [
            'slug' => 'wartime', 'name' => 'Era de la Guerra / Películas Paquete', 'period' => '1942-1949',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [14906, 15947, 20343, 46929, 13757, 13465]],
        ],
        [
            'slug' => 'silver-age', 'name' => 'Era de Plata', 'period' => '1950-1967',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [11224, 12092, 10693, 10340, 10882, 12230, 9078, 9325]],
        ],
        [
            'slug' => 'bronze-age', 'name' => 'Era de Bronce / Oscura', 'period' => '1970-1988',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [10112, 11886, 250480, 11319, 10948, 10957, 9994, 12233]],
        ],
        [
            'slug' => 'renaissance', 'name' => 'El Renacimiento de Disney', 'period' => '1989-1999',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [10144, 11135, 10020, 812, 8587, 10530, 10545, 11970, 10674, 37135]],
        ],
        [
            'slug' => 'post-renaissance', 'name' => 'Post-Renacimiento / Era Post-Clásica', 'period' => '2000-2008',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [49948, 10567, 11688, 10865, 11544, 9016, 10009, 13700, 9982, 1267, 13053]],
        ],
        [
            // Includes Moana 2 (1241982) and Zootopia 2 (1084242), added to the original seed list.
            'slug' => 'revival', 'name' => 'Resurgimiento de Disney / Era 3D', 'period' => '2009-presente',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [
                10198, 38757, 51162, 82690, 109445, 177572, 269149, 277834, 404368, 330457,
                527774, 568124, 877269, 1022796, 1241982, 1084242,
            ]],
        ],
        [
            'slug' => 'pixar', 'name' => 'Pixar', 'period' => '1995-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '3', 'without_genres' => '99,10770',
            ]],
        ],
        [
            'slug' => 'live-action', 'name' => 'Live action de Disney', 'period' => '1950-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '2|3166', 'without_genres' => '16,99,10770', 'vote_count.gte' => 50,
            ]],
        ],
        [
            'slug' => 'disneytoon', 'name' => 'DisneyToon Studios', 'period' => '1990-2018',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '5391', 'without_genres' => '99,10770',
            ]],
        ],
        [
            'slug' => 'disney-channel', 'name' => 'Películas de Disney Channel', 'period' => '1997-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '240533|241787', 'with_genres' => '10770', 'without_genres' => '99',
            ]],
        ],
        [
            'slug' => 'lucasfilm', 'name' => 'Lucasfilm', 'period' => '1971-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '1', 'without_genres' => '99,10770', 'vote_count.gte' => 500,
            ]],
        ],
    ],
];
