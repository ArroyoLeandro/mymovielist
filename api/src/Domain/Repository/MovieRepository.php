<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Movie;

interface MovieRepository
{
    public function findById(int $id): ?Movie;

    public function count(): int;
}
