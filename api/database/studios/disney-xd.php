<?php

// Jetix / Disney XD. TMDB has no Jetix network, so this uses Disney XD (44), Toon Disney (142) and the
// Jetix production companies (11296 Jetix, 203278 Jetix Europe, 95853 Jetix France).
// Import this studio before `disney` so shared animated series stay here.
require_once __DIR__ . '/_helpers.php';

$animated = ['with_genres' => '16', 'without_genres' => tv_noise(), 'vote_count.gte' => 10];
$live = ['without_genres' => '16,' . tv_noise(), 'vote_count.gte' => 10];

return [
    'slug' => 'disney-xd',
    'name' => 'Jetix / Disney XD',
    'logo' => ['type' => 'network', 'id' => 44],
    'sections' => [
        [
            'slug' => 'animated-series', 'name' => 'Series animadas', 'period' => '1998-presente',
            'sources' => [
                ['type' => 'discover', 'media' => 'tv', 'params' => $animated + ['with_networks' => '44|142']],
                ['type' => 'discover', 'media' => 'tv', 'params' => $animated + ['with_companies' => '11296|203278|95853']],
            ],
        ],
        [
            'slug' => 'live-series', 'name' => 'Series live action', 'period' => '2009-presente',
            'sources' => [
                ['type' => 'discover', 'media' => 'tv', 'params' => $live + ['with_networks' => '44|142']],
                ['type' => 'discover', 'media' => 'tv', 'params' => $live + ['with_companies' => '11296|203278|95853']],
            ],
        ],
    ],
];
