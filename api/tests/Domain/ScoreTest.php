<?php

declare(strict_types=1);

namespace Tests\Domain;

use App\Domain\Exception\InvalidScore;
use App\Domain\Score;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ScoreTest extends TestCase
{
    public function testAcceptsBoundaries(): void
    {
        self::assertSame(1, Score::fromInt(1)->value());
        self::assertSame(10, Score::fromInt(10)->value());
    }

    /** @return iterable<string, array{int}> */
    public static function outOfRange(): iterable
    {
        yield 'zero' => [0];
        yield 'eleven' => [11];
        yield 'negative' => [-3];
    }

    #[DataProvider('outOfRange')]
    public function testRejectsOutOfRange(int $value): void
    {
        $this->expectException(InvalidScore::class);

        Score::fromInt($value);
    }
}
