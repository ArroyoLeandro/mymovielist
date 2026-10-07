<?php

// Studio Ghibli (company 10342). vote_count >= 50 leaves out shorts and obscure titles.
require_once __DIR__ . '/_helpers.php';

return [
    'slug' => 'ghibli',
    'name' => 'Studio Ghibli',
    'logo' => ['type' => 'company', 'id' => 10342],
    'sections' => decade_sections('films', '', 'movie', ['with_companies' => '10342', 'without_genres' => '99,10770', 'vote_count.gte' => 50], 1980, 2020),
];
