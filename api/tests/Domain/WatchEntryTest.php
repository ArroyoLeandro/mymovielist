<?php

declare(strict_types=1);

namespace Tests\Domain;

use App\Domain\Exception\InvalidWatchEntry;
use App\Domain\Score;
use App\Domain\WatchEntry;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

final class WatchEntryTest extends TestCase
{
    public function testWatchedEntryWithScore(): void
    {
        $at = new DateTimeImmutable('2026-01-02 03:04:05');
        $entry = new WatchEntry(1, 2, true, Score::fromInt(8), $at);

        self::assertSame(1, $entry->userId());
        self::assertSame(2, $entry->movieId());
        self::assertTrue($entry->watched());
        self::assertSame(8, $entry->score()?->value());
        self::assertSame($at, $entry->watchedAt());
    }

    public function testWatchedEntryWithoutScore(): void
    {
        $entry = new WatchEntry(1, 2, true, null, new DateTimeImmutable());

        self::assertNull($entry->score());
    }

    public function testScoreRequiresWatched(): void
    {
        $this->expectException(InvalidWatchEntry::class);

        new WatchEntry(1, 2, false, Score::fromInt(5), new DateTimeImmutable());
    }

    public function testUnwatchedEntryWithoutScoreIsAllowed(): void
    {
        $entry = new WatchEntry(1, 2, false, null, new DateTimeImmutable());

        self::assertFalse($entry->watched());
    }
}
