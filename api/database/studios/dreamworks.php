<?php

// DreamWorks Animation (company 521). Feature films by decade.
require_once __DIR__ . '/_helpers.php';

return [
    'slug' => 'dreamworks',
    'name' => 'DreamWorks Animation',
    'logo' => ['type' => 'company', 'id' => 521],
    'sections' => decade_sections('films', '', 'movie', ['with_companies' => '521', 'without_genres' => '99,10770'], 1990, 2020),
];
