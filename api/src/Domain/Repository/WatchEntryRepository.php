<?php

declare(strict_types=1);

namespace App\Domain\Repository;

use App\Domain\Movie;
use App\Domain\WatchEntry;

interface WatchEntryRepository
{
    /** Inserts or replaces the entry for (user, movie). Keeps the original watchedAt when one exists. */
    public function save(WatchEntry $entry): WatchEntry;

    public function remove(int $userId, int $movieId): void;

    /** @return array<int, WatchEntry> keyed by movie id */
    public function findByUser(int $userId): array;

    /**
     * Aggregates over every user's entries.
     *
     * @return array<int, array{watchersCount: int, averageScore: float|null}> keyed by movie id
     */
    public function movieStats(): array;

    /**
     * @return list<array{tag: string, watchedCount: int, averageScore: float|null}>
     *         ordered by watchedCount desc, then tag
     */
    public function ranking(): array;

    /**
     * @return list<array{movie: Movie, score: int|null, watchedAt: \DateTimeImmutable}>
     *         most recently watched first
     */
    public function listForUser(int $userId): array;
}
