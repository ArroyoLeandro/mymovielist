<?php

// Blue Sky Studios (company 9383): one section.
return [
    'slug' => 'blue-sky',
    'name' => 'Blue Sky Studios',
    'logo' => ['type' => 'company', 'id' => 9383],
    'sections' => [
        [
            'slug' => 'films', 'name' => 'Películas', 'period' => '2002-2021',
            'source' => ['type' => 'discover', 'media' => 'movie', 'params' => ['with_companies' => '9383', 'without_genres' => '99,10770']],
        ],
    ],
];
