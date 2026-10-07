<?php

declare(strict_types=1);

namespace App\Domain;

/** A group of movies inside a studio catalog (for example a Disney era). */
final class Section
{
    /** @param list<Movie> $movies */
    public function __construct(
        private readonly int $id,
        private readonly string $slug,
        private readonly string $name,
        private readonly ?string $period,
        private readonly array $movies,
    ) {
    }

    public function id(): int
    {
        return $this->id;
    }

    public function slug(): string
    {
        return $this->slug;
    }

    public function name(): string
    {
        return $this->name;
    }

    public function period(): ?string
    {
        return $this->period;
    }

    /** @return list<Movie> */
    public function movies(): array
    {
        return $this->movies;
    }
}
