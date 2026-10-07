<?php

// Manual franchises (sagas) for titles TMDB does not group: mainly series. The importer stores them as rows in
// `collections` (slug = key) and they win over TMDB belongs_to_collection.
//   'slug' => [
//       'name'             => 'Name shown in the UI',
//       'poster'           => 'https://...' (optional; the UI falls back to the first title's poster),
//       'titles'           => ['tv:<tmdb_id>', 'movie:<tmdb_id>', ...],
//       'tmdb_collections' => [<tmdb collection id>, ...]   // optional: pull those TMDB collections into this franchise
//   ]
// A saga in the UI is any collection with 2+ titles inside the current studio, so franchises can span studios.
return [
    'star-wars' => [
        'name' => 'Star Wars',
        'tmdb_collections' => [10],
        'titles' => [
            'tv:3478', 'tv:25', 'tv:3122', 'tv:4194', 'tv:60554', 'tv:82856', 'tv:105971', 'tv:114478', 'tv:115036',
            'tv:203085', 'tv:92830', 'tv:83867', 'tv:202998', 'tv:114461', 'tv:202879', 'tv:251091', 'tv:114479',
            'tv:288055', 'tv:289219', 'tv:289324',
        ],
    ],
    'mcu-series' => [
        'name' => 'Series del Universo Cinematográfico de Marvel',
        'titles' => [
            'tv:88396', 'tv:84958', 'tv:88329', 'tv:91363', 'tv:85271', 'tv:92749', 'tv:232125', 'tv:92782', 'tv:92783',
            'tv:114472', 'tv:138502', 'tv:122226', 'tv:138501', 'tv:114471', 'tv:138503', 'tv:241388', 'tv:138505',
            'tv:202555', 'tv:198178',
        ],
    ],
    'waverly-place' => ['name' => 'Los Hechiceros de Waverly Place', 'titles' => ['tv:3498', 'tv:245026']],
    'suite-life' => ['name' => 'Zack y Cody', 'titles' => ['tv:4605', 'tv:15079']],
    'ravens' => ['name' => 'Es Tan Raven', 'titles' => ['tv:4602', 'tv:119', 'tv:72027']],
];
