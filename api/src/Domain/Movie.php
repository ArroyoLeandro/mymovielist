<?php

declare(strict_types=1);

namespace App\Domain;

final class Movie
{
    public function __construct(
        private readonly int $id,
        private readonly string $title,
        private readonly ?string $originalTitle,
        private readonly int $year,
        private readonly ?string $posterUrl,
    ) {
    }

    public function id(): int
    {
        return $this->id;
    }

    public function title(): string
    {
        return $this->title;
    }

    public function originalTitle(): ?string
    {
        return $this->originalTitle;
    }

    public function year(): int
    {
        return $this->year;
    }

    public function posterUrl(): ?string
    {
        return $this->posterUrl;
    }
}
