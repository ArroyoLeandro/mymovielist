<?php

declare(strict_types=1);

namespace App;

/**
 * "¿No está? Agregalo": TMDB search (movies and series) for titles missing from the catalog. Titles and posters are
 * resolved like the importer does (LATAM Spanish first), each result says whether it is already in the catalog.
 */
final class TmdbSearch
{
    public const LIMIT = 12;
    private const THUMB_BASE = 'https://image.tmdb.org/t/p/w185';

    /** @var TmdbClient */
    private $tmdb;
    /** @var Repository */
    private $repo;

    public function __construct(TmdbClient $tmdb, Repository $repo)
    {
        $this->tmdb = $tmdb;
        $this->repo = $repo;
    }

    /** Normalized query (also the cache key): trimmed, single spaces, lowercase. */
    public static function normalize(string $q): string
    {
        $q = trim((string) preg_replace('/\s+/u', ' ', $q));
        return function_exists('mb_strtolower') ? mb_strtolower($q, 'UTF-8') : strtolower($q);
    }

    /**
     * @return list<array<string, mixed>> {tmdbId, mediaType: movie|series, title, originalTitle, year, posterUrl,
     *         voteCount, released, inCatalog: {id, studioSlug}|null, excluded}
     */
    public function search(string $q): array
    {
        $res = $this->tmdb->get('/search/multi', ['query' => self::normalize($q), 'language' => 'es-MX', 'include_adult' => 'false', 'page' => 1]);
        $hits = [];
        foreach ($res['results'] ?? [] as $r) {
            if (in_array($r['media_type'] ?? '', ['movie', 'tv'], true) && !empty($r['id'])) {
                $hits[] = $r;
            }
            if (count($hits) === self::LIMIT) {
                break;
            }
        }
        if (!$hits) {
            return [];
        }

        $requests = [];
        foreach ($hits as $r) {
            $requests[$r['media_type'] . ':' . $r['id']] = ['/' . $r['media_type'] . '/' . (int) $r['id'], TmdbResolver::DETAILS_PARAMS];
        }
        try {
            $details = $this->tmdb->getMany($requests);
        } catch (\RuntimeException $e) {
            $details = []; // fall back to the search payload (es-MX title, default poster)
        }
        $catalog = $this->repo->catalogIdsByTmdb(array_map(function ($r) {
            return [$r['media_type'] === 'tv' ? 'series' : 'movie', (int) $r['id']];
        }, $hits));
        $overrides = require StudioDefinitions::dir() . '/title-overrides.php';
        $exclusions = StudioDefinitions::exclusions();
        $today = date('Y-m-d');

        $out = [];
        foreach ($hits as $r) {
            $media = $r['media_type'];
            $d = $details[$media . ':' . $r['id']] ?? null;
            if ($d !== null && isset($d['_not_found'])) {
                continue;
            }
            $src = $d ?? $r;
            $title = $d !== null ? TmdbResolver::title($d, $media, $overrides) : trim((string) ($r[$media === 'tv' ? 'name' : 'title'] ?? ''));
            $original = trim((string) ($src[$media === 'tv' ? 'original_name' : 'original_title'] ?? ''));
            $date = (string) ($src[$media === 'tv' ? 'first_air_date' : 'release_date'] ?? '');
            $poster = $d !== null ? TmdbResolver::poster($d)['url'] : (!empty($r['poster_path']) ? TmdbResolver::IMAGE_BASE . $r['poster_path'] : null);
            $dbMedia = $media === 'tv' ? 'series' : 'movie';
            $out[] = [
                'tmdbId' => (int) $r['id'],
                'mediaType' => $dbMedia,
                'title' => $title,
                'originalTitle' => $original !== '' && $original !== $title ? $original : null,
                'year' => $date !== '' ? (int) substr($date, 0, 4) : null,
                'posterUrl' => $poster !== null ? str_replace(TmdbResolver::IMAGE_BASE, self::THUMB_BASE, $poster) : null,
                'voteCount' => (int) ($src['vote_count'] ?? 0),
                'released' => $date !== '' && $date <= $today,
                'inCatalog' => $catalog[$dbMedia . ':' . (int) $r['id']] ?? null,
                // The manual import refuses these (exclusions.php); without details only the listed titles are known.
                'excluded' => StudioDefinitions::isExcluded($d ?? ['id' => (int) $r['id']], $media, $exclusions),
            ];
        }
        return $out;
    }
}
