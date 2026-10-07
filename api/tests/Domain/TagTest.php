<?php

declare(strict_types=1);

namespace Tests\Domain;

use App\Domain\Exception\InvalidTag;
use App\Domain\Tag;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class TagTest extends TestCase
{
    public function testAcceptsLettersDigitsUnderscoreAndDash(): void
    {
        $tag = Tag::fromString('Ana_01-x');

        self::assertSame('Ana_01-x', $tag->value());
    }

    public function testNormalizedFormIsLowercase(): void
    {
        self::assertSame('ana', Tag::fromString('ANa')->normalized());
    }

    public function testIsComparedCaseInsensitively(): void
    {
        self::assertTrue(Tag::fromString('Ana')->equals(Tag::fromString('aNA')));
        self::assertFalse(Tag::fromString('Ana')->equals(Tag::fromString('Anb')));
    }

    public function testBoundaryLengthsAreAccepted(): void
    {
        self::assertSame('ab', Tag::fromString('ab')->value());
        self::assertSame(str_repeat('a', 20), Tag::fromString(str_repeat('a', 20))->value());
    }

    /** @return iterable<string, array{string}> */
    public static function invalidTags(): iterable
    {
        yield 'too short' => ['a'];
        yield 'too long' => [str_repeat('a', 21)];
        yield 'empty' => [''];
        yield 'space' => ['an a'];
        yield 'accent' => ['andrés'];
        yield 'symbol' => ['ana!'];
        yield 'surrounding whitespace' => [' ana '];
        yield 'trailing newline' => ["ana\n"];
    }

    #[DataProvider('invalidTags')]
    public function testRejectsInvalidTags(string $raw): void
    {
        $this->expectException(InvalidTag::class);

        Tag::fromString($raw);
    }
}
