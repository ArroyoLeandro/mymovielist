<?php

declare(strict_types=1);

namespace App;

/** Pure functions that turn a TMDB details payload into our title and poster. */
final class TmdbResolver
{
    public const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
    /** Details request used to resolve a title (importer, manual import and search share the disk cache). */
    public const DETAILS_PARAMS = [
        'language' => 'es-MX',
        'append_to_response' => 'alternative_titles,translations,images',
        'include_image_language' => 'es,null',
    ];

    // Mexican Spanish is the reference for the whole region (Mexican dubs), so MX goes first.
    private const OTHER_LATAM_ALT = ['AR', 'UY', 'CL', 'PY', 'BO', 'PE', 'EC', 'CO', 'VE'];
    private const LATAM = ['MX', 'AR', 'UY', 'CL', 'PY', 'BO', 'PE', 'EC', 'CO', 'VE', '419',
        'GT', 'CR', 'PA', 'DO', 'HN', 'SV', 'NI', 'CU', 'PR'];

    /**
     * Title precedence (first non-empty wins; a manual override always wins):
     *   1. es-MX translation
     *   2. alternative title for MX
     *   3. alternative titles for AR, UY, CL, PY, BO, PE, EC, CO, VE (in that order; untyped preferred)
     *   4. a Spanish translation from any other Latin American country
     *   5. es-ES translation
     *   6. original title
     * @param array<string, mixed> $d details payload with alternative_titles + translations appended
     * @param array<string, string> $overrides "movie:<id>" / "tv:<id>" => title
     */
    public static function title(array $d, string $media, array $overrides): string
    {
        $key = ($media === 'tv' ? 'tv' : 'movie') . ':' . $d['id'];
        if (isset($overrides[$key]) && trim($overrides[$key]) !== '') {
            return trim($overrides[$key]);
        }

        $field = $media === 'tv' ? 'name' : 'title';
        $original = trim((string) ($d[$media === 'tv' ? 'original_name' : 'original_title'] ?? ''));

        $byRegion = [];
        foreach ($d['translations']['translations'] ?? [] as $t) {
            if (($t['iso_639_1'] ?? '') !== 'es') {
                continue;
            }
            $title = trim((string) ($t['data'][$field] ?? ''));
            $region = (string) ($t['iso_3166_1'] ?? '');
            if ($title !== '' && !isset($byRegion[$region])) {
                $byRegion[$region] = $title;
            }
        }

        $alt = [];
        foreach ($d['alternative_titles'][$media === 'tv' ? 'results' : 'titles'] ?? [] as $a) {
            $title = trim((string) ($a['title'] ?? ''));
            $country = (string) ($a['iso_3166_1'] ?? '');
            $type = (string) ($a['type'] ?? '');
            if ($title === '') {
                continue;
            }
            // Prefer untyped (regular) titles over e.g. "working title" / "informal".
            if (!isset($alt[$country]) || ($alt[$country]['type'] !== '' && $type === '')) {
                $alt[$country] = ['title' => $title, 'type' => $type];
            }
        }

        if (isset($byRegion['MX'])) {
            return $byRegion['MX'];
        }
        if (isset($alt['MX'])) {
            return $alt['MX']['title'];
        }
        foreach (self::OTHER_LATAM_ALT as $country) {
            if (isset($alt[$country])) {
                return $alt[$country]['title'];
            }
        }
        foreach ($byRegion as $country => $title) {
            if ($country !== 'ES' && in_array($country, self::LATAM, true)) {
                return $title;
            }
        }
        if (isset($byRegion['ES'])) {
            return $byRegion['ES'];
        }
        return $original !== '' ? $original : trim((string) ($d[$field] ?? ''));
    }

    /**
     * Poster precedence:
     *   1. Spanish poster tagged with a Latin American country (MX first, then AR, ..., 419), most voted first
     *   2. Spanish poster without a country
     *   3. any other Spanish poster (e.g. es-ES)
     *   4. the details poster (requested with language=es-MX; TMDB falls back to the default poster)
     *   5. any poster
     * @return array{url: string|null, country: string|null}
     */
    public static function poster(array $d): array
    {
        $posters = $d['images']['posters'] ?? [];
        $es = array_values(array_filter($posters, function ($p) {
            return ($p['iso_639_1'] ?? null) === 'es' && !empty($p['file_path']);
        }));
        usort($es, function ($a, $b) {
            return [$b['vote_count'] ?? 0, $b['vote_average'] ?? 0] <=> [$a['vote_count'] ?? 0, $a['vote_average'] ?? 0];
        });

        foreach (self::LATAM as $country) {
            foreach ($es as $p) {
                if (($p['iso_3166_1'] ?? null) === $country) {
                    return self::url($p['file_path'], $country);
                }
            }
        }
        foreach ($es as $p) {
            if (empty($p['iso_3166_1'])) {
                return self::url($p['file_path'], null);
            }
        }
        if ($es) {
            return self::url($es[0]['file_path'], $es[0]['iso_3166_1'] ?? null);
        }
        if (!empty($d['poster_path'])) {
            return self::url($d['poster_path'], 'details');
        }
        if (!empty($posters[0]['file_path'])) {
            return self::url($posters[0]['file_path'], 'other');
        }
        return ['url' => null, 'country' => null];
    }

    /** @return array{url: string, country: string|null} */
    private static function url(string $path, ?string $country): array
    {
        return ['url' => self::IMAGE_BASE . $path, 'country' => $country];
    }
}
