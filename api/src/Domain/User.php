<?php

declare(strict_types=1);

namespace App\Domain;

final class User
{
    public function __construct(
        private readonly int $id,
        private readonly Tag $tag,
    ) {
    }

    public function id(): int
    {
        return $this->id;
    }

    public function tag(): Tag
    {
        return $this->tag;
    }
}
