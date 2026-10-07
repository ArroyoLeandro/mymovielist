<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Tag;
use App\Domain\User;

interface UserRepository
{
    /** Returns the user for the tag (case-insensitive), registering it when unknown. */
    public function findOrRegister(Tag $tag): User;

    public function findByTag(Tag $tag): ?User;

    public function findById(int $id): ?User;
}
