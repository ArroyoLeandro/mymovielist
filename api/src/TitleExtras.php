<?php

declare(strict_types=1);

namespace App;

/**
 * What the title modal shows from TMDB on demand, nothing stored in the database: the trailer links (see Trailers) and
 * the synopsis. One details request serves both: videos appended (Trailers' languages) and language=es-MX, which sets
 * the overview's language without changing the videos (they follow include_video_language only). TMDB does not fall
 * back to another translation (a missing one comes back as an empty overview), so an empty Latin-American synopsis asks
 * for the Spain one, then the English one: plain details requests, only when needed. Every request goes through the
 * caller's TmdbClient and its disk cache.
 */
final class TitleExtras
{
    /** Synopsis languages, best first: TMDB locale => the `overviewLang` the client gets. */
    private const OVERVIEW_LOCALES = ['es-MX' => 'es-MX', 'es-ES' => 'es-ES', 'en-US' => 'en'];

    /**
     * @param string $mediaType 'movie' or 'series'
     * @return array{original: array{key: string, name: string, lang: string, fallback: bool}|null, latino: array{key: string, name: string}|null, overview: string|null, overviewLang: string|null}
     */
    public static function fetch(TmdbClient $tmdb, string $mediaType, int $tmdbId): array
    {
        $path = ($mediaType === 'series' ? '/tv/' : '/movie/') . $tmdbId;
        $locale = (string) array_key_first(self::OVERVIEW_LOCALES);
        $d = $tmdb->get($path, Trailers::detailsParams() + ['language' => $locale]);
        if (!empty($d['_not_found'])) {
            return self::none();
        }
        $out = Trailers::fromDetails($tmdb, $path, $d);
        foreach (self::OVERVIEW_LOCALES as $loc => $label) {
            if ($loc !== $locale) {
                $d = $tmdb->get($path, ['language' => $loc]);
            }
            $text = self::clean((string) ($d['overview'] ?? ''));
            if ($text !== '') {
                return $out + ['overview' => $text, 'overviewLang' => $label];
            }
        }
        return $out + ['overview' => null, 'overviewLang' => null];
    }

    /** The answer for a title without TMDB data. */
    public static function none(): array
    {
        return ['original' => null, 'latino' => null, 'overview' => null, 'overviewLang' => null];
    }

    /** Trims the synopsis and keeps its paragraphs: Unix line breaks, at most one blank line between paragraphs. */
    private static function clean(string $text): string
    {
        $text = str_replace(["\r\n", "\r"], "\n", $text);
        $text = (string) preg_replace(['/[ \t]+\n/', '/\n{3,}/'], ["\n", "\n\n"], $text);
        return trim($text);
    }
}
