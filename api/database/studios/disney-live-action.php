<?php

// Disney live action: Walt Disney Pictures films, Disney Channel original movies and live-action series.
// Companies: Walt Disney Pictures 2, Walt Disney Productions 3166, Disney Channel 240533 / Disney Channels Worldwide 241787;
// networks Disney Channel 54, Disney Junior 281. Animation lives in the disney studio.
require_once __DIR__ . '/_helpers.php';

return [
    'slug' => 'disney-live-action',
    'name' => 'Disney Live Action',
    'logo' => ['type' => 'company', 'id' => 2],
    'sections' => array_merge(
        decade_sections('films', 'Películas', 'movie', [
            'with_companies' => '2|3166', 'without_genres' => '16,99,10770', 'vote_count.gte' => 50,
        ], 1950, 2020),
        [[
            'slug' => 'disney-channel', 'name' => 'Películas de Disney Channel', 'period' => '1997-presente',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => [
                'with_companies' => '240533|241787', 'with_genres' => '10770', 'without_genres' => '16,99',
            ]],
        ]],
        decade_sections('series', 'Series', 'tv', [
            'with_networks' => '54|281', 'without_genres' => '16,' . tv_noise(), 'vote_count.gte' => 10,
        ], 1980, 2020)
    ),
];
