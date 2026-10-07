<?php

declare(strict_types=1);

namespace Tests\Domain;

use App\Domain\Movie;
use App\Domain\Section;
use App\Domain\Studio;
use PHPUnit\Framework\TestCase;

final class CatalogEntitiesTest extends TestCase
{
    public function testStudioExposesIdentity(): void
    {
        $studio = new Studio(1, 'disney', 'Disney');

        self::assertSame(1, $studio->id());
        self::assertSame('disney', $studio->slug());
        self::assertSame('Disney', $studio->name());
    }

    public function testMovieExposesData(): void
    {
        $movie = new Movie(7, 'Pinocho', 'Pinocchio', 1940, 'https://example.test/p.jpg');

        self::assertSame(7, $movie->id());
        self::assertSame('Pinocho', $movie->title());
        self::assertSame('Pinocchio', $movie->originalTitle());
        self::assertSame(1940, $movie->year());
        self::assertSame('https://example.test/p.jpg', $movie->posterUrl());
    }

    public function testMovieOptionalFieldsCanBeNull(): void
    {
        $movie = new Movie(7, 'Dumbo', null, 1941, null);

        self::assertNull($movie->originalTitle());
        self::assertNull($movie->posterUrl());
    }

    public function testSectionHoldsItsMovies(): void
    {
        $movie = new Movie(7, 'Dumbo', null, 1941, null);
        $section = new Section(3, 'golden-age', 'Golden Age', '1937-1942', [$movie]);

        self::assertSame('golden-age', $section->slug());
        self::assertSame('Golden Age', $section->name());
        self::assertSame('1937-1942', $section->period());
        self::assertSame([$movie], $section->movies());
    }
}
