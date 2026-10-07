<?php

// Nickelodeon (network 13) series; Nickelodeon Movies (2348) and Nickelodeon Animation Studio (4859) films.
require_once __DIR__ . '/_helpers.php';

return [
    'slug' => 'nickelodeon',
    'name' => 'Nickelodeon',
    'logo' => ['type' => 'network', 'id' => 13],
    'sections' => array_merge(
        decade_sections('animated', 'Series animadas', 'tv', [
            'with_networks' => '13', 'with_genres' => '16', 'without_genres' => tv_noise(), 'vote_count.gte' => 20,
        ], 1990, 2020),
        decade_sections('live', 'Series live action', 'tv', [
            'with_networks' => '13', 'without_genres' => '16,' . tv_noise(), 'vote_count.gte' => 20,
        ], 1980, 2020),
        [
            [
                'slug' => 'animated-films', 'name' => 'Películas animadas', 'period' => '1996-presente',
                'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                    'with_companies' => '2348|4859', 'with_genres' => '16', 'without_genres' => '99', 'vote_count.gte' => 50,
                ]],
            ],
            [
                'slug' => 'live-films', 'name' => 'Películas live action', 'period' => '1995-presente',
                'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                    'with_companies' => '2348', 'without_genres' => '16,99', 'vote_count.gte' => 50,
                ]],
            ],
        ]
    ),
];
