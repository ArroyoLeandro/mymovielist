-- 006: where to watch (TMDB watch providers, data by JustWatch) for one country (AR by default).
-- MariaDB 10.5+/11, additive and re-runnable: no existing row or watch entry is touched.
-- title_providers uses `title_id` (not `movie_id`) on purpose: the importer's --prune treats tables with a movie_id
-- column as user data that protects titles; provider rows must never protect a title (it is also excluded by name).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS providers (
    id INT UNSIGNED NOT NULL,              -- TMDB provider_id
    name VARCHAR(100) NOT NULL,
    logo_url VARCHAR(500) NULL,
    display_priority INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS title_providers (
    title_id INT UNSIGNED NOT NULL,
    provider_id INT UNSIGNED NOT NULL,
    type ENUM('flatrate','free','ads','rent','buy') NOT NULL,
    display_priority INT NOT NULL DEFAULT 0,
    PRIMARY KEY (title_id, provider_id, type),
    KEY idx_title_providers_provider (provider_id, type, title_id),
    CONSTRAINT fk_title_providers_title FOREIGN KEY (title_id) REFERENCES movies (id) ON DELETE CASCADE,
    CONSTRAINT fk_title_providers_provider FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE movies
    ADD COLUMN IF NOT EXISTS providers_link VARCHAR(500) NULL AFTER poster_url,
    ADD COLUMN IF NOT EXISTS providers_updated_at DATETIME NULL AFTER providers_link;
