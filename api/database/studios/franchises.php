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
    // --- Anime (series + movies in one saga; ids that are not imported are ignored) ---
    'dragon-ball' => [
        'name' => 'Dragon Ball',
        'tmdb_collections' => [425164, 620873],
        'titles' => ['tv:12609', 'tv:12971', 'tv:12697', 'tv:62715', 'tv:61709', 'tv:236994', 'tv:80020',
            'movie:28609', 'movie:39100', 'movie:39323', 'movie:24752', 'movie:44251', 'movie:39101', 'movie:303857', 'movie:39107',
            'movie:39104', 'movie:39103', 'movie:34433', 'movie:126963', 'movie:39324', 'movie:39106', 'movie:39105', 'movie:39108',
            'movie:39102', 'movie:610150', 'movie:503314'],
    ],
    'naruto' => [
        'name' => 'Naruto',
        'tmdb_collections' => [23616],
        'titles' => ['tv:46260', 'tv:31910', 'tv:70881', 'movie:347201', 'movie:118406', 'movie:317442', 'movie:75624', 'movie:20982',
            'movie:50723', 'movie:36728', 'movie:17581', 'movie:16907'],
    ],
    'pokemon' => [
        'name' => 'Pokémon',
        'tmdb_collections' => [34055, 661031],
        'titles' => ['tv:60572', 'tv:61295', 'tv:13230', 'movie:571891', 'movie:436931', 'movie:10228', 'movie:12599', 'movie:10991'],
    ],
    'digimon' => ['name' => 'Digimon', 'titles' => ['tv:31654', 'tv:98034', 'tv:9302', 'tv:8991']],
    'saint-seiya' => [
        'name' => 'Los Caballeros del Zodiaco',
        'tmdb_collections' => [109079],
        'titles' => ['tv:42444', 'tv:61389', 'tv:62428', 'tv:44317', 'tv:78122', 'movie:287590'],
    ],
    'sailor-moon' => ['name' => 'Sailor Moon', 'titles' => ['tv:3570', 'tv:61339']],
    'one-piece' => [
        'name' => 'One Piece',
        'tmdb_collections' => [23456],
        'titles' => ['tv:37854', 'movie:374205', 'movie:900667', 'movie:176983', 'movie:568012'],
    ],
    'attack-on-titan' => ['name' => 'Ataque a los Titanes', 'titles' => ['tv:1429', 'tv:63510']],
    'my-hero-academia' => [
        'name' => 'My Hero Academia',
        'tmdb_collections' => [1189668],
        'titles' => ['tv:65930', 'movie:505262', 'movie:592350', 'movie:768744'],
    ],
    'demon-slayer' => [
        'name' => 'Demon Slayer',
        'tmdb_collections' => [925155],
        'titles' => ['tv:85937', 'movie:635302', 'movie:1311031'],
    ],
    'jujutsu-kaisen' => [
        'name' => 'Jujutsu Kaisen',
        'tmdb_collections' => [1529614],
        'titles' => ['tv:95479', 'movie:810693'],
    ],
    'evangelion' => [
        'name' => 'Evangelion',
        'tmdb_collections' => [210303, 96850],
        'titles' => ['tv:890', 'movie:18491', 'movie:21832', 'movie:75629', 'movie:15137', 'movie:22843', 'movie:283566'],
    ],
    'fullmetal-alchemist' => ['name' => 'Fullmetal Alchemist', 'titles' => ['tv:37863', 'tv:31911']],
    'yu-gi-oh' => ['name' => 'Yu-Gi-Oh!', 'titles' => ['tv:36406', 'tv:902', 'tv:12536']],
    'gundam' => ['name' => 'Gundam', 'titles' => ['tv:21730']],
    'doraemon' => ['name' => 'Doraemon', 'titles' => ['tv:57911', 'tv:65733', 'movie:265712', 'movie:728776']],
    'seven-deadly-sins' => [
        'name' => 'Los Siete Pecados Capitales',
        'tmdb_collections' => [703485],
        'titles' => ['tv:62104', 'tv:218843', 'movie:843241', 'movie:507569'],
    ],
    'sword-art-online' => ['name' => 'Sword Art Online', 'titles' => ['tv:45782', 'tv:78204', 'movie:413594']],
    'hunter-x-hunter' => ['name' => 'Hunter x Hunter', 'titles' => ['tv:45952', 'tv:46298']],
    'lupin-iii' => ['name' => 'Lupin III', 'tmdb_collections' => [1185967], 'titles' => ['tv:31572', 'movie:15371']],
    // --- Live-action series ---
    'star-trek-series' => ['name' => 'Viaje a las estrellas', 'titles' => ['tv:253', 'tv:580', 'tv:655', 'tv:1855', 'tv:314', 'tv:67198', 'tv:85949', 'tv:103516']],
    'chicago' => ['name' => 'Chicago', 'titles' => ['tv:44006', 'tv:58841']],
    'ncis' => ['name' => 'NCIS', 'titles' => ['tv:4614', 'tv:17610']],
    'vikings' => ['name' => 'Vikingos', 'titles' => ['tv:44217', 'tv:116135']],
    'game-of-thrones' => ['name' => 'Juego de Tronos', 'titles' => ['tv:1399', 'tv:94997']],
    'buffyverse' => ['name' => 'Buffy, la cazavampiros', 'titles' => ['tv:95', 'tv:2426']],
    'greys-anatomy' => ['name' => 'Anatomía de Grey', 'titles' => ['tv:1416', 'tv:76773']],
    'arrowverse' => ['name' => 'Arrowverso', 'titles' => ['tv:60735', 'tv:62643']],
    'breaking-bad' => ['name' => 'Breaking Bad', 'titles' => ['tv:1396', 'tv:60059']],
    'walking-dead' => ['name' => 'The Walking Dead', 'titles' => ['tv:1402', 'tv:62286', 'tv:206586', 'tv:100757']],
];
