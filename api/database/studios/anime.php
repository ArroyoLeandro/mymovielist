<?php

// Anime: Japanese-language animation. Series need >= 200 votes (>= 100 when first aired before 2005); movies >= 500 votes,
// without Studio Ghibli (company 10342, it has its own studio). One section per era, each with its series and movies.
// Must be imported after the studios so titles they own are skipped.
$tv = ['with_genres' => '16', 'with_original_language' => 'ja'];
$film = $tv + ['without_companies' => '10342', 'vote_count.gte' => 500, 'with_runtime.gte' => 40];

$eras = [
    ['classics', 'Clásicos (antes de 1990)', 'hasta 1989', null, '1989-12-31', false],
    ['90s', 'Años 90', '1990-1999', '1990-01-01', '1999-12-31', false],
    ['2000s', 'Años 2000', '2000-2009', '2000-01-01', '2009-12-31', true],
    ['2010s', 'Años 2010', '2010-2019', '2010-01-01', '2019-12-31', false],
    ['2020s', 'Años 2020', '2020-presente', '2020-01-01', null, false],
];

$sections = [];
foreach ($eras as [$slug, $name, $period, $from, $to, $split]) {
    $range = function ($field, $a, $b) {
        return ($a ? [$field . '.gte' => $a] : []) + ($b ? [$field . '.lte' => $b] : []);
    };
    $sources = [];
    if ($split) {
        // 2000-2004 aired before the cutoff (100 votes), 2005-2009 needs 200.
        $sources[] = ['type' => 'discover', 'media' => 'tv', 'min_votes' => 100, 'max_pages' => 100,
            'params' => $tv + ['vote_count.gte' => 100] + $range('first_air_date', $from, '2004-12-31')];
        $sources[] = ['type' => 'discover', 'media' => 'tv', 'min_votes' => 200, 'max_pages' => 100,
            'params' => $tv + ['vote_count.gte' => 200] + $range('first_air_date', '2005-01-01', $to)];
    } else {
        $pre2005 = $to !== null && $to < '2005';
        $sources[] = ['type' => 'discover', 'media' => 'tv', 'min_votes' => $pre2005 ? 100 : 200, 'max_pages' => 100,
            'params' => $tv + ['vote_count.gte' => $pre2005 ? 100 : 200] + $range('first_air_date', $from, $to)];
    }
    $sources[] = ['type' => 'discover', 'media' => 'movie', 'min_votes' => 500, 'max_pages' => 100,
        'params' => $film + $range('primary_release_date', $from, $to)];
    $sections[] = ['slug' => $slug, 'name' => $name, 'period' => $period, 'sources' => $sources];
}

return [
    'slug' => 'anime',
    'name' => 'Anime',
    'logo' => null,
    'sections' => $sections,
];
