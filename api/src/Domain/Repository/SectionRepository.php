<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Section;

interface SectionRepository
{
    /** @return list<Section> sections with their movies, both in sort order */
    public function findByStudio(int $studioId): array;
}
