<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Exception\InvalidTag;

/** A user public handle: 2-20 chars of [A-Za-z0-9_-], compared case-insensitively. */
final class Tag
{
    private function __construct(private readonly string $value)
    {
    }

    public static function fromString(string $raw): self
    {
        // \z (not $) so a trailing newline is rejected.
        if (preg_match('/\A[A-Za-z0-9_-]{2,20}\z/', $raw) !== 1) {
            throw new InvalidTag('Tag must be 2-20 characters: letters, digits, "_" or "-".');
        }

        return new self($raw);
    }

    public function value(): string
    {
        return $this->value;
    }

    public function normalized(): string
    {
        return strtolower($this->value);
    }

    public function equals(self $other): bool
    {
        return $this->normalized() === $other->normalized();
    }
}
