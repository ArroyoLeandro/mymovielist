<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Studio;

interface StudioRepository
{
    /** @return list<array{studio: Studio, movieCount: int}> ordered by name */
    public function allWithMovieCount(): array;

    public function findBySlug(string $slug): ?Studio;
}
