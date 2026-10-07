<?php

// Manual title fixes applied last by bin/import-tmdb.php (they always win over TMDB data).
// Format: "movie:<tmdb_id>" or "tv:<tmdb_id>" => 'Title to show',
// e.g. 'movie:12345' => 'Some Title',
// Keep this list short: Mexican Spanish titles are used exactly as TMDB returns them; only fix clear data errors.
return [
    // TMDB's only non-English LATAM alt title for Toy Story 5 is Quechua (PE); es-MX is empty.
    'movie:1084244' => 'Toy Story 5',
];
