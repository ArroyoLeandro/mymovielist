-- 002: TMDB-backed catalog. Run ONCE on an existing database (a second run fails harmlessly on the duplicate column).
-- Existing movies and watch_entries are untouched; media_type defaults to 'movie' and tmdb_id stays NULL
-- until the importer's --match-existing step fills it in.
SET NAMES utf8mb4;

ALTER TABLE movies
    ADD COLUMN media_type ENUM('movie','series') NOT NULL DEFAULT 'movie' AFTER year,
    ADD COLUMN tmdb_id INT UNSIGNED NULL AFTER media_type,
    ADD UNIQUE KEY uq_movies_media_tmdb (media_type, tmdb_id);

ALTER TABLE studios
    ADD COLUMN logo_url VARCHAR(500) NULL AFTER name;
