<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Exception\InvalidWatchEntry;
use DateTimeImmutable;

/** The relation between a user and a movie. A score is only meaningful when the movie was watched. */
final class WatchEntry
{
    public function __construct(
        private readonly int $userId,
        private readonly int $movieId,
        private readonly bool $watched,
        private readonly ?Score $score,
        private readonly DateTimeImmutable $watchedAt,
    ) {
        if (!$watched && $score !== null) {
            throw new InvalidWatchEntry('A score requires the movie to be marked as watched.');
        }
    }

    public function userId(): int
    {
        return $this->userId;
    }

    public function movieId(): int
    {
        return $this->movieId;
    }

    public function watched(): bool
    {
        return $this->watched;
    }

    public function score(): ?Score
    {
        return $this->score;
    }

    public function watchedAt(): DateTimeImmutable
    {
        return $this->watchedAt;
    }
}
