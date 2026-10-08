<?php

declare(strict_types=1);

namespace App;

/**
 * Studio definition files (database/studios/<slug>.php): import order and local placement of a TMDB title.
 * place() evaluates the definitions' sources against a details payload without calling TMDB, so a title added by
 * hand lands where the importer would put it.
 */
final class StudioDefinitions
{
    /** Files in database/studios that are data, not studios. */
    private const NOT_STUDIOS = ['title-overrides', 'always-keep', 'franchises', 'saga-names', 'studio-order', 'exclusions', 'not-versions'];
    /** Catch-all categories: imported last so the studios keep their titles. */
    private const CATEGORIES = ['anime', 'series', 'peliculas'];

    public static function dir(): string
    {
        return __DIR__ . '/../database/studios';
    }

    public static function exists(string $slug): bool
    {
        return $slug !== '' && $slug[0] !== '_' && !in_array($slug, self::NOT_STUDIOS, true) && is_file(self::dir() . '/' . $slug . '.php');
    }

    /** @return array<string, mixed> */
    public static function load(string $slug): array
    {
        if (!self::exists($slug)) {
            throw new \RuntimeException("Unknown studio '$slug' (expected database/studios/$slug.php).");
        }
        return require self::dir() . '/' . $slug . '.php';
    }

    /**
     * Import order: disney-xd first (it claims its series), then the studios alphabetically, then the catch-all
     * categories (anime, series, peliculas).
     * @return list<string>
     */
    public static function orderedSlugs(): array
    {
        $slugs = [];
        foreach (glob(self::dir() . '/*.php') ?: [] as $f) {
            $s = basename($f, '.php');
            if (self::exists($s)) {
                $slugs[] = $s;
            }
        }
        $rank = function (string $s): array {
            $cat = array_search($s, self::CATEGORIES, true);
            return [$s === 'disney-xd' ? 0 : ($cat !== false ? 2 : 1), $cat === false ? 0 : $cat, $s];
        };
        usort($slugs, function ($a, $b) use ($rank) {
            return $rank($a) <=> $rank($b);
        });
        return $slugs;
    }

    public static function isCategory(string $slug): bool
    {
        return in_array($slug, self::CATEGORIES, true);
    }

    /**
     * Global exclusions (database/studios/exclusions.php): production companies and single titles no source imports.
     * @return array{companies: list<int>, titles: array<string, true>} titles keyed 'movie:<id>' / 'tv:<id>'
     */
    public static function exclusions(): array
    {
        $file = self::dir() . '/exclusions.php';
        $x = is_file($file) ? require $file : [];
        return [
            'companies' => array_values(array_map('intval', array_keys($x['companies'] ?? []))),
            'titles' => array_fill_keys(array_keys($x['titles'] ?? []), true),
        ];
    }

    /**
     * Pairs that look like versions of each other but are different works (database/studios/not-versions.php).
     * @return array<string, true> keyed '<ref>|<ref>' with both orders, refs 'movie:<id>' / 'tv:<id>'
     */
    public static function notVersions(): array
    {
        $file = self::dir() . '/not-versions.php';
        $pairs = [];
        foreach (is_file($file) ? require $file : [] as [$a, $b]) {
            $pairs["$a|$b"] = true;
            $pairs["$b|$a"] = true;
        }
        return $pairs;
    }

    /**
     * Is a title excluded: listed by id, or produced by an excluded company?
     * @param array<string, mixed> $d TMDB details payload
     * @param string $media 'movie' or 'tv'
     * @param array{companies: list<int>, titles: array<string, true>} $exclusions from exclusions()
     */
    public static function isExcluded(array $d, string $media, array $exclusions): bool
    {
        return isset($exclusions['titles'][($media === 'tv' ? 'tv' : 'movie') . ':' . (int) ($d['id'] ?? 0)])
            || (bool) array_intersect(self::ids($d['production_companies'] ?? []), $exclusions['companies']);
    }

    /**
     * Where a title belongs: the first studio section (in import order) with a source that matches the details
     * (vote counts and runtime are ignored: a title added by hand skips curation). When no section matches, a studio
     * whose companies/networks produced it (keeping animation and live action apart) gets it without a section; else
     * the category for its type: anime (animation + Japanese), series or peliculas.
     * @param array<string, mixed> $d TMDB details payload
     * @param string $media 'movie' or 'tv'
     * @return array{studio: string, section: string|null}
     */
    public static function place(array $d, string $media): array
    {
        $defs = [];
        foreach (self::orderedSlugs() as $slug) {
            $defs[$slug] = self::load($slug);
            foreach ($defs[$slug]['sections'] as $section) {
                if (in_array((int) $d['id'], array_map('intval', $section['exclude_ids'] ?? []), true)) {
                    continue;
                }
                foreach ($section['sources'] ?? [$section['source']] as $source) {
                    if (self::matches($source, $d, $media, false)) {
                        return ['studio' => $slug, 'section' => (string) $section['slug']];
                    }
                }
            }
        }
        foreach ($defs as $slug => $def) {
            if (self::isCategory($slug)) {
                continue;
            }
            foreach ($def['sections'] as $section) {
                foreach ($section['sources'] ?? [$section['source']] as $source) {
                    if (self::matches($source, $d, $media, true)) {
                        return ['studio' => $slug, 'section' => null];
                    }
                }
            }
        }
        $genres = self::ids($d['genres'] ?? []);
        $anime = in_array(16, $genres, true) && ($d['original_language'] ?? '') === 'ja';
        return ['studio' => $anime ? 'anime' : ($media === 'tv' ? 'series' : 'peliculas'), 'section' => null];
    }

    /**
     * Does a definition source claim this title? $loose ignores dates, languages and every genre except animation
     * (used to find the producing studio when no section matches).
     */
    private static function matches(array $source, array $d, string $media, bool $loose): bool
    {
        $srcMedia = ($source['media'] ?? 'movie') === 'tv' ? 'tv' : 'movie';
        $genres = self::ids($d['genres'] ?? []);
        $animated = in_array(16, $genres, true);
        if ($source['type'] === 'ids') {
            return !$loose && $srcMedia === $media && in_array((int) $d['id'], array_map('intval', $source['ids']), true);
        }
        if ($source['type'] === 'collection') {
            if ($loose || $media !== 'movie' || !in_array((int) ($d['belongs_to_collection']['id'] ?? 0), array_map('intval', $source['ids']), true)) {
                return false;
            }
            return !(isset($source['genre']) && !in_array((int) $source['genre'], $genres, true))
                && !(isset($source['not_genre']) && in_array((int) $source['not_genre'], $genres, true));
        }
        if ($srcMedia !== $media) {
            return false;
        }
        $p = $source['params'] + ['without_genres' => '99'];
        $companies = self::ids($d['production_companies'] ?? []);
        $networks = self::ids($d['networks'] ?? []);
        if (isset($p['with_companies']) && !self::listMatch((string) $p['with_companies'], $companies)) {
            return false;
        }
        if (isset($p['with_networks']) && !self::listMatch((string) $p['with_networks'], $networks)) {
            return false;
        }
        if (!isset($p['with_companies']) && !isset($p['with_networks']) && $loose) {
            return false; // a loose match needs a producing company or network
        }
        if ($loose) {
            $wantsAnimation = isset($p['with_genres']) && in_array(16, self::split((string) $p['with_genres']), true);
            $noAnimation = in_array(16, self::split((string) $p['without_genres']), true);
            return !($wantsAnimation && !$animated) && !($noAnimation && $animated);
        }
        if (isset($p['without_companies']) && array_intersect(self::split((string) $p['without_companies']), $companies)) {
            return false;
        }
        if (isset($p['with_genres']) && !self::listMatch((string) $p['with_genres'], $genres)) {
            return false;
        }
        if (array_intersect(self::split((string) $p['without_genres']), $genres)) {
            return false;
        }
        if (isset($p['with_original_language']) && ($d['original_language'] ?? '') !== $p['with_original_language']) {
            return false;
        }
        $field = $media === 'tv' ? 'first_air_date' : 'primary_release_date';
        $date = (string) ($d[$media === 'tv' ? 'first_air_date' : 'release_date'] ?? '');
        if (isset($p[$field . '.gte']) && ($date === '' || $date < $p[$field . '.gte'])) {
            return false;
        }
        if (isset($p[$field . '.lte']) && $date !== '' && $date > $p[$field . '.lte']) {
            return false;
        }
        $primary = (int) (($d['genres'][0]['id'] ?? 0));
        if (isset($source['primary_genre']) && !in_array($primary, array_map('intval', (array) $source['primary_genre']), true)) {
            return false;
        }
        if (isset($source['primary_genre_not']) && in_array($primary, array_map('intval', (array) $source['primary_genre_not']), true)) {
            return false;
        }
        return true;
    }

    /** TMDB list syntax: "a|b" = any of, "a,b" = all of. */
    private static function listMatch(string $spec, array $have): bool
    {
        if (strpos($spec, '|') !== false) {
            return (bool) array_intersect(array_map('intval', explode('|', $spec)), $have);
        }
        return !array_diff(self::split($spec), $have);
    }

    /** @return list<int> */
    private static function split(string $spec): array
    {
        return array_values(array_filter(array_map('intval', preg_split('/[,|]/', $spec) ?: [])));
    }

    /** @return list<int> ids of a TMDB [{id, ...}] list */
    private static function ids(array $list): array
    {
        return array_values(array_map(function ($x) {
            return (int) ($x['id'] ?? 0);
        }, $list));
    }
}
