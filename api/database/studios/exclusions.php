<?php

// Never imported by any studio or category (every source type: discover, collection, ids). Rows already in the
// catalog become orphans: prune deletes them unless protected (merge them first with bin/merge-titles.php).
//   'companies' => TMDB production companies whose titles are dropped (also sent as without_companies to discover).
//   'titles'    => 'movie:<tmdb_id>' / 'tv:<tmdb_id>' that duplicate another title (pilots of a series, etc.).
// Manual additions from the search (POST /api/titles/import) are refused too (422 "excluded").
return [
    'companies' => [
        1311 => 'The Asylum',                     // mockbusters (The Odyssey 2026, Titanic II, ...)
        152189 => 'The Global Asylum, LLC.',
        282681 => 'The Asylum Home Entertainment',
    ],
    'titles' => [
        'movie:64202' => 'Batman Beyond: The Movie (pilot episodes of tv:513 Batman del futuro)',
        'movie:287663' => 'Star Wars Rebels: Spark of Rebellion (pilot of tv:60554 Star Wars Rebels)',
    ],
];
