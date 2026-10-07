<?php

// Cartoon Network (network 56) series and Cartoon Network Studios (company 7899) films.
require_once __DIR__ . '/_helpers.php';

return [
    'slug' => 'cartoon-network',
    'name' => 'Cartoon Network',
    'logo' => ['type' => 'network', 'id' => 56],
    'sections' => array_merge(
        decade_sections('animated', 'Series animadas', 'tv', [
            'with_networks' => '56', 'with_genres' => '16', 'without_genres' => tv_noise(), 'vote_count.gte' => 20,
        ], 1990, 2020),
        [
            [
                'slug' => 'live-series', 'name' => 'Series live action', 'period' => '2000-presente',
                'source' => ['type' => 'discover', 'media' => 'tv', 'params' => [
                    'with_networks' => '56', 'without_genres' => '16,' . tv_noise(), 'vote_count.gte' => 20,
                ]],
            ],
            [
                'slug' => 'animated-films', 'name' => 'Películas animadas', 'period' => '1990-presente',
                'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                    'with_companies' => '7899', 'with_genres' => '16', 'without_genres' => '99', 'vote_count.gte' => 50,
                ]],
            ],
        ]
    ),
];
