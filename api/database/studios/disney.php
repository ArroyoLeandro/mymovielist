<?php

// Studio definition for bin/import-tmdb.php. Animation only: live action lives in disney-live-action,
// Lucasfilm in lucasfilm, Disney XD / Jetix series in disney-xd. Never mix animation (genre 16) and live action in a section.
//   source also supports ['type' => 'collection', 'ids' => [...], 'genre' => N?, 'not_genre' => N?]; a section may use 'sources' => [...] (merged).
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
// Those eras set 'keep_all' => true: the canon is never filtered by the vote threshold (curation).
require_once __DIR__ . '/_helpers.php';

return [
    'slug' => 'disney',
    'name' => 'Disney Animación',
    'logo' => ['type' => 'company', 'id' => 6125], // Walt Disney Animation Studios (2 = Walt Disney Pictures, used by live action)
    'sections' => [
        [
            'slug' => 'golden-age', 'keep_all' => true, 'name' => 'Era Dorada', 'period' => '1937-1942',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [408, 10895, 756, 11360, 3170]],
        ],
        [
            'slug' => 'wartime', 'keep_all' => true, 'name' => 'Era de la Guerra / Películas Paquete', 'period' => '1942-1949',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [14906, 15947, 20343, 46929, 13757, 13465]],
        ],
        [
            'slug' => 'silver-age', 'keep_all' => true, 'name' => 'Era de Plata', 'period' => '1950-1967',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [11224, 12092, 10693, 10340, 10882, 12230, 9078, 9325]],
        ],
        [
            'slug' => 'bronze-age', 'keep_all' => true, 'name' => 'Era de Bronce / Oscura', 'period' => '1970-1988',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [10112, 11886, 250480, 11319, 10948, 10957, 9994, 12233]],
        ],
        [
            'slug' => 'renaissance', 'keep_all' => true, 'name' => 'El Renacimiento de Disney', 'period' => '1989-1999',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [10144, 11135, 10020, 812, 8587, 10530, 10545, 11970, 10674, 37135]],
        ],
        [
            'slug' => 'post-renaissance', 'keep_all' => true, 'name' => 'Post-Renacimiento / Era Post-Clásica', 'period' => '2000-2008',
            'source' => ['type' => 'ids', 'media' => 'movie', 'ids' => [49948, 10567, 11688, 10865, 11544, 9016, 10009, 13700, 9982, 1267, 13053]],
        ],
        [
            // The current era grows by itself: explicit canon (includes Moana 2 1241982 and Zootopia 2 1084242) plus
            // every WDAS (6125) animated feature >= 40 min released since 2009 (that discover returns exactly the canon).
            'slug' => 'revival', 'keep_all' => true, 'name' => 'Resurgimiento de Disney / Era 3D', 'period' => '2009-presente',
            'sources' => [
                ['type' => 'ids', 'media' => 'movie', 'ids' => [
                    10198, 38757, 51162, 82690, 109445, 177572, 269149, 277834, 404368, 330457,
                    527774, 568124, 877269, 1022796, 1241982, 1084242,
                ]],
                ['type' => 'discover', 'media' => 'movie', 'params' => [
                    'with_companies' => '6125', 'with_genres' => '16', 'without_genres' => '99,10770',
                    'with_runtime.gte' => 40, 'primary_release_date.gte' => '2009-01-01',
                ]],
            ],
        ],
        [
            'slug' => 'pixar', 'name' => 'Pixar', 'period' => '1995-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '3', 'without_genres' => '99,10770',
            ]],
        ],
        [
            'slug' => 'disneytoon', 'name' => 'DisneyToon Studios', 'period' => '1990-2018',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '5391', 'without_genres' => '99,10770',
            ]],
        ],
        [
            'slug' => 'animated-tv-movies', 'name' => 'Películas animadas para TV', 'period' => '2000-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '240533|241787', 'with_genres' => '10770,16', 'without_genres' => '99',
            ]],
        ],
        [
            // Disney XD / Toon Disney series are claimed by the disney-xd studio (import that first).
            'slug' => 'animated-series', 'name' => 'Series animadas de Disney', 'period' => '1990-presente',
            'source' => ['type' => 'discover', 'media' => 'tv', 'params' => [
                'with_networks' => '54|281', 'with_genres' => '16', 'without_genres' => tv_noise(), 'vote_count.gte' => 20,
            ]],
        ],
    ],
];
