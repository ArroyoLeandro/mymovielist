<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Exception\InvalidScore;

/** An integer rating from 1 to 10. */
final class Score
{
    public const MIN = 1;
    public const MAX = 10;

    private function __construct(private readonly int $value)
    {
    }

    public static function fromInt(int $value): self
    {
        if ($value < self::MIN || $value > self::MAX) {
            throw new InvalidScore(sprintf('Score must be between %d and %d.', self::MIN, self::MAX));
        }

        return new self($value);
    }

    public function value(): int
    {
        return $this->value;
    }
}
