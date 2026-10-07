-- 003: curation (TMDB votes/popularity) and sagas (collections). MariaDB 10.5+/11 (uses IF NOT EXISTS, so it is re-runnable).
-- Additive: no existing row or watch entry is touched.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS collections (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tmdb_collection_id INT UNSIGNED NULL,
    slug VARCHAR(80) NOT NULL,
    name VARCHAR(200) NOT NULL,
    poster_url VARCHAR(500) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_collections_tmdb (tmdb_collection_id),
    UNIQUE KEY uq_collections_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE movies
    ADD COLUMN IF NOT EXISTS release_date DATE NULL AFTER year,
    ADD COLUMN IF NOT EXISTS vote_count INT UNSIGNED NULL AFTER tmdb_id,
    ADD COLUMN IF NOT EXISTS popularity DECIMAL(10,3) NULL AFTER vote_count,
    ADD COLUMN IF NOT EXISTS collection_id INT UNSIGNED NULL AFTER popularity,
    ADD KEY IF NOT EXISTS idx_movies_collection (collection_id),
    ADD CONSTRAINT fk_movies_collection FOREIGN KEY IF NOT EXISTS (collection_id) REFERENCES collections (id) ON DELETE SET NULL;
