<?php

declare(strict_types=1);

namespace App;

/**
 * Trailer links of a title from TMDB videos (YouTube only), for a group that watches with the original audio:
 *   - original: the best trailer in the title's original language (TMDB original_language). When there is none and the
 *     original language is not English, the best English trailer instead, flagged as a fallback.
 *   - latino: the best Latin-American Spanish trailer (Spanish with any region but ES), only when the original language
 *     is not Spanish (a Spanish-language title already plays in Spanish).
 *
 * TMDB filters videos by language and the bare "es" only matches Spain (es-ES), so Latin-American videos are requested
 * by locale (es-MX, es-AR, ...). At most two requests, both on the shared disk cache: the details with English and
 * Latin-American videos appended (this also gives original_language), then the original-language videos when that
 * language is not English.
 */
final class Trailers
{
    /** Spanish locales asked for; a returned Spanish video counts as Latin American when its region is not ES. */
    private const LATAM_LOCALES = ['es-MX', 'es-AR', 'es-CO', 'es-CL', 'es-PE', 'es-VE', 'es-UY', 'es-EC', 'es-BO', 'es-PY',
        'es-CR', 'es-GT', 'es-PA', 'es-DO', 'es-SV', 'es-HN', 'es-NI', 'es-CU', 'es-PR', 'es-419', 'es-US'];
    /** Video types that count as a trailer, best first. */
    private const TYPES = ['Trailer' => 0, 'Teaser' => 1];

    /**
     * @param string $mediaType 'movie' or 'series'
     * @return array{original: array{key: string, name: string, lang: string, fallback: bool}|null, latino: array{key: string, name: string}|null}
     */
    public static function fetch(TmdbClient $tmdb, string $mediaType, int $tmdbId): array
    {
        $path = ($mediaType === 'series' ? '/tv/' : '/movie/') . $tmdbId;
        $d = $tmdb->get($path, ['append_to_response' => 'videos', 'include_video_language' => implode(',', array_merge(['en'], self::LATAM_LOCALES))]);
        if (!empty($d['_not_found'])) {
            return ['original' => null, 'latino' => null];
        }
        $lang = strtolower((string) ($d['original_language'] ?? ''));
        $videos = (array) ($d['videos']['results'] ?? []);
        if ($lang !== 'en' && preg_match('/\A[a-z]{2,3}\z/', $lang) === 1) {
            // The bare language matches its default region only ("es" = es-ES): add the countries of origin too.
            $locales = [$lang];
            foreach ((array) ($d['origin_country'] ?? []) as $c) {
                if (is_string($c) && preg_match('/\A[A-Z]{2}\z/', $c) === 1) {
                    $locales[] = $lang . '-' . $c;
                }
            }
            $more = $tmdb->get($path . '/videos', ['include_video_language' => implode(',', array_unique($locales))]);
            $videos = array_merge($videos, (array) ($more['results'] ?? []));
        }
        $released = (string) ($d['release_date'] ?? $d['first_air_date'] ?? '');
        return self::select($videos, $lang, $released);
    }

    /**
     * Picks the trailers from a TMDB video list (pure: no I/O).
     * @param list<array<string, mixed>> $videos TMDB video results
     * @param string $released release date (movie) or first air date (series), 'YYYY-MM-DD' or ''
     * @return array{original: array{key: string, name: string, lang: string, fallback: bool}|null, latino: array{key: string, name: string}|null}
     */
    public static function select(array $videos, string $lang, string $released): array
    {
        $original = $lang === '' ? null : self::best($videos, $released, function (array $v) use ($lang): ?int {
            return $v['iso_639_1'] === $lang ? 0 : null;
        });
        $fallback = false;
        if ($original === null && $lang !== 'en') {
            $original = self::best($videos, $released, function (array $v): ?int {
                return $v['iso_639_1'] === 'en' ? 0 : null;
            });
            $fallback = $original !== null;
        }
        // Latin-American Spanish audio: a "[Subtitulado]" video keeps the original audio, so it never counts; one that
        // says it is dubbed wins over an unlabeled one.
        $latino = $lang === 'es' ? null : self::best($videos, $released, function (array $v): ?int {
            if ($v['iso_639_1'] !== 'es' || $v['iso_3166_1'] === '' || $v['iso_3166_1'] === 'ES'
                || preg_match('/subtitulad|\bsubs?\b|\bv\.?o\.?s\.?e\b/iu', $v['name']) === 1) {
                return null;
            }
            return preg_match('/doblad|doblaje|latino/iu', $v['name']) === 1 ? 0 : 1;
        });
        return [
            'original' => $original === null ? null
                : ['key' => $original['key'], 'name' => $original['name'], 'lang' => $original['iso_639_1'], 'fallback' => $fallback],
            'latino' => $latino === null ? null : ['key' => $latino['key'], 'name' => $latino['name']],
        ];
    }

    /**
     * Best YouTube trailer among the videos $match accepts (it returns null to reject, else a preference, lower first):
     * then type Trailer before Teaser, official before unofficial, then by date, then larger size. Date: the newest one
     * published up to the release day (the final launch trailer, not the first teaser-like cut nor the post-release
     * spots); when none was published by then, the oldest later one. That skips re-release, "encore" and anniversary
     * trailers of movies and later-season trailers of series (no spoilers), and still finds a trailer for old titles
     * whose videos were uploaded years later. Without a release date: the newest.
     * @param list<array<string, mixed>> $videos
     * @param callable(array<string, mixed>): ?int $match
     * @return array{key: string, name: string, iso_639_1: string}|null
     */
    private static function best(array $videos, string $released, callable $match): ?array
    {
        $t0 = strtotime($released);
        $anchor = $t0 === false ? null : $t0 + 86399; // end of the release day
        $best = null;
        $bestRank = null;
        foreach ($videos as $v) {
            if (!is_array($v) || ($v['site'] ?? '') !== 'YouTube' || !isset(self::TYPES[$v['type'] ?? ''])) {
                continue;
            }
            $key = (string) ($v['key'] ?? '');
            if (preg_match('/\A[A-Za-z0-9_-]{6,20}\z/', $key) !== 1) {
                continue;
            }
            $v = [
                'key' => $key,
                'name' => trim((string) ($v['name'] ?? '')),
                'iso_639_1' => strtolower((string) ($v['iso_639_1'] ?? '')),
                'iso_3166_1' => strtoupper((string) ($v['iso_3166_1'] ?? '')),
                'type' => (string) $v['type'],
                'official' => !empty($v['official']),
                'published_at' => (string) ($v['published_at'] ?? ''),
                'size' => (int) ($v['size'] ?? 0),
            ];
            $pref = $match($v);
            if ($pref === null) {
                continue;
            }
            // Lower rank wins: launch-window videos newest first, then later ones oldest first, undated last.
            $t = strtotime($v['published_at']);
            $when = $t === false ? [2, 0] : ($anchor === null || $t <= $anchor ? [0, -$t] : [1, $t]);
            $rank = [$pref, self::TYPES[$v['type']], $v['official'] ? 0 : 1, $when[0], $when[1], -$v['size']];
            if ($bestRank === null || $rank < $bestRank) {
                $best = $v;
                $bestRank = $rank;
            }
        }
        return $best === null ? null : ['key' => $best['key'], 'name' => $best['name'], 'iso_639_1' => $best['iso_639_1']];
    }
}
