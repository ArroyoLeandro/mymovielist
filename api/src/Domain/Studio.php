<?php

declare(strict_types=1);

namespace App\Domain;

final class Studio
{
    public function __construct(
        private readonly int $id,
        private readonly string $slug,
        private readonly string $name,
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
}
