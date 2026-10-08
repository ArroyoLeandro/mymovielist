<?php

// Display order and kind of each studio in /api/studios: slug => [sort_order, kind]. kind is 'studio' or 'category'
// (anime/series/peliculas are catch-all categories, not production studios). Categories come first. Unlisted studios sort last.
return [
    'peliculas' => [1, 'category'],
    'series' => [2, 'category'],
    'anime' => [3, 'category'],
    'disney' => [10, 'studio'],
    'disney-live-action' => [20, 'studio'],
    'lucasfilm' => [30, 'studio'],
    'marvel' => [40, 'studio'],
    'disney-xd' => [50, 'studio'],
    'dreamworks' => [60, 'studio'],
    'universal' => [70, 'studio'],
    'warner' => [80, 'studio'],
    'sony' => [90, 'studio'],
    'blue-sky' => [100, 'studio'],
    'ghibli' => [110, 'studio'],
    'cartoon-network' => [130, 'studio'],
    'nickelodeon' => [140, 'studio'],
];
