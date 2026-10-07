<?php

// Shared helpers for studio definition files (not a studio itself).

if (!function_exists('decade_sections')) {
    /** TV genres that are not scripted series: documentary, talk, reality, news. */
    function tv_noise(): string
    {
        return '99,10767,10764,10763';
    }

    /**
     * One section per decade ("Años 2000"), each a discover source with a release/air date window.
     * Empty decades are dropped by the importer. $media is 'movie' or 'tv'.
     */
    function decade_sections(string $slugPrefix, string $label, string $media, array $params, int $fromDecade, int $toDecade): array
    {
        $field = $media === 'tv' ? 'first_air_date' : 'primary_release_date';
        $sections = [];
        for ($d = $fromDecade; $d <= $toDecade; $d += 10) {
            $sections[] = [
                'slug' => $slugPrefix . '-' . $d,
                'name' => ($label !== '' ? $label . ' · ' : '') . 'Años ' . $d,
                'period' => $d . '-' . ($d + 9),
                'source' => ['type' => 'discover', 'media' => $media, 'params' => $params + [
                    $field . '.gte' => $d . '-01-01',
                    $field . '.lte' => ($d + 9) . '-12-31',
                ]],
            ];
        }
        return $sections;
    }
}
