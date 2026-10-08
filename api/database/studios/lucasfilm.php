<?php

// Lucasfilm (company 1) and Lucasfilm Animation (108270). Animation and live action are separate sections.
require_once __DIR__ . '/_helpers.php';

return [
    'slug' => 'lucasfilm',
    'name' => 'Lucasfilm',
    'logo' => ['type' => 'company', 'id' => 1],
    'sections' => [
        [
            'slug' => 'films', 'name' => 'Películas', 'period' => '1971-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '1', 'without_genres' => '16,99,10770', 'vote_count.gte' => 500,
            ]],
        ],
        [
            'slug' => 'animated-films', 'name' => 'Películas animadas', 'period' => '2008-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '1|108270', 'with_genres' => '16', 'without_genres' => '99,10770', 'vote_count.gte' => 50,
            ]],
        ],
        [
            'slug' => 'series', 'name' => 'Series live action', 'period' => '2019-presente',
            'source' => ['type' => 'discover', 'media' => 'tv', 'params' => [
                'with_companies' => '1', 'without_genres' => '16,' . tv_noise(), 'vote_count.gte' => 20,
            ]],
        ],
        [
            'slug' => 'animated-series', 'name' => 'Series animadas', 'period' => '2003-presente',
            'source' => ['type' => 'discover', 'media' => 'tv', 'params' => [
                'with_companies' => '1|108270', 'with_genres' => '16', 'without_genres' => tv_noise(), 'vote_count.gte' => 20,
            ]],
        ],
    ],
];
