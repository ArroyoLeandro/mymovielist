<?php

// Marvel Studios (company 420). MCU phases are derived from release-date windows; Marvel Animation is 13252.
// Live action and animation never share a section.
$movie = ['with_companies' => '420', 'without_genres' => '16,99,10770', 'vote_count.gte' => 50];
// Spider-Man films (Raimi 557-559, Amazing 1930/102382, MCU 315635/429617/634649) live in the sony studio.
$spider = [557, 558, 559, 1930, 102382, 315635, 429617, 634649];
$phase = function (string $slug, string $name, string $period, string $from, ?string $to) use ($movie, $spider) {
    $params = $movie + ['primary_release_date.gte' => $from];
    if ($to !== null) {
        $params['primary_release_date.lte'] = $to;
    }
    return ['slug' => $slug, 'name' => $name, 'period' => $period, 'exclude_ids' => $spider, 'source' => ['type' => 'discover', 'media' => 'movie', 'params' => $params]];
};

return [
    'slug' => 'marvel',
    'name' => 'Marvel Studios',
    'logo' => ['type' => 'company', 'id' => 420],
    'sections' => [
        $phase('pre-mcu', 'Antes del UCM', '1990-2007', '1990-01-01', '2007-12-31'),
        $phase('phase-1', 'Fase 1', '2008-2012', '2008-01-01', '2012-12-31'),
        $phase('phase-2', 'Fase 2', '2013-2015', '2013-01-01', '2015-12-31'),
        $phase('phase-3', 'Fase 3', '2016-2019', '2016-01-01', '2019-12-31'),
        $phase('phase-4', 'Fase 4', '2021-2022', '2020-01-01', '2022-12-31'),
        $phase('phase-5', 'Fase 5', '2023-2025', '2023-01-01', '2025-06-30'),
        $phase('phase-6', 'Fase 6', '2025-presente', '2025-07-01', null),
        [
            'slug' => 'series', 'name' => 'Series de Marvel', 'period' => '2021-presente',
            'source' => ['type' => 'discover', 'media' => 'tv', 'params' => [
                'with_companies' => '420', 'without_genres' => '16,' . '99,10767,10764,10763', 'vote_count.gte' => 20,
            ]],
        ],
        [
            'slug' => 'animated-films', 'name' => 'Películas animadas de Marvel', 'period' => '2000-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '420|13252', 'with_genres' => '16', 'without_genres' => '99', 'vote_count.gte' => 50,
            ]],
        ],
        [
            'slug' => 'animated-series', 'name' => 'Series animadas de Marvel', 'period' => '2021-presente',
            'source' => ['type' => 'discover', 'media' => 'tv', 'params' => [
                'with_companies' => '420|13252', 'with_genres' => '16', 'without_genres' => '99,10767,10764,10763', 'vote_count.gte' => 20,
            ]],
        ],
    ],
];
