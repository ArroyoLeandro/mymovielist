-- 009: merge duplicate titles and fix two sagas (data only, no schema change). Back up the database first.
-- Same rules as bin/merge-titles.php: watch entries move to the kept title (when the user has both: highest non-null
-- score, earliest watched_at), watchlist is a union (earliest added_at), recommendations move (when the same
-- sender/recipient has both: earliest created_at, dismissed only when both were), then the duplicate row is deleted
-- (its title_providers rows go with it by FK).
--   #3330 movie:1698863 "The Odyssey" (The Asylum mockbuster)         -> #3331 movie:1368337 "The Odyssey" (Nolan)
--   #901  movie:64202   "Batman Beyond: The Movie" (pilot)            -> #1155 tv:513 "Batman del futuro"
--   #649  movie:287663  "Star Wars Rebels: Spark of Rebellion" (pilot) -> #125 tv:60554 "Star Wars Rebels"
-- Every row is looked up by id AND (media_type, tmdb_id): if either does not match, that merge does nothing.
-- Re-runnable: once a duplicate is gone its variable is NULL and every statement of that merge matches no row.
-- Deploy the code of this release first: its exclusions keep the importer from adding the duplicates again.
-- MariaDB 10.5+/11 (phpMyAdmin: paste the whole file into the SQL tab of the database and run it once).
SET NAMES utf8mb4;

START TRANSACTION;

-- ---------------------------------------------------------------------------------------------------------------
-- #3330 -> #3331
SET @f := (SELECT id FROM movies WHERE id = 3330 AND media_type = 'movie' AND tmdb_id = 1698863);
SET @t := (SELECT id FROM movies WHERE id = 3331 AND media_type = 'movie' AND tmdb_id = 1368337);
SET @f := IF(@t IS NULL, NULL, @f);

UPDATE watch_entries t JOIN watch_entries f ON f.user_id = t.user_id AND f.movie_id = @f
SET t.score = IF(f.score IS NULL, t.score, IF(t.score IS NULL, f.score, GREATEST(t.score, f.score))),
    t.watched_at = LEAST(t.watched_at, f.watched_at)
WHERE t.movie_id = @t;
DELETE f FROM watch_entries f JOIN watch_entries t ON t.user_id = f.user_id AND t.movie_id = @t WHERE f.movie_id = @f;
UPDATE watch_entries SET movie_id = @t WHERE movie_id = @f;

UPDATE watchlist t JOIN watchlist f ON f.user_id = t.user_id AND f.movie_id = @f
SET t.added_at = LEAST(t.added_at, f.added_at) WHERE t.movie_id = @t;
DELETE f FROM watchlist f JOIN watchlist t ON t.user_id = f.user_id AND t.movie_id = @t WHERE f.movie_id = @f;
UPDATE watchlist SET movie_id = @t WHERE movie_id = @f;

UPDATE recommendations t JOIN recommendations f
    ON f.from_user_id = t.from_user_id AND f.to_user_id = t.to_user_id AND f.movie_id = @f
SET t.created_at = LEAST(t.created_at, f.created_at), t.note = COALESCE(t.note, f.note),
    t.dismissed_at = IF(t.dismissed_at IS NULL OR f.dismissed_at IS NULL, NULL, GREATEST(t.dismissed_at, f.dismissed_at))
WHERE t.movie_id = @t;
DELETE f FROM recommendations f JOIN recommendations t
    ON t.from_user_id = f.from_user_id AND t.to_user_id = f.to_user_id AND t.movie_id = @t
WHERE f.movie_id = @f;
UPDATE recommendations SET movie_id = @t WHERE movie_id = @f;

DELETE FROM title_providers WHERE title_id = @f;
DELETE FROM movies WHERE id = @f;

-- ---------------------------------------------------------------------------------------------------------------
-- #901 -> #1155 (movie into series)
SET @f := (SELECT id FROM movies WHERE id = 901 AND media_type = 'movie' AND tmdb_id = 64202);
SET @t := (SELECT id FROM movies WHERE id = 1155 AND media_type = 'series' AND tmdb_id = 513);
SET @f := IF(@t IS NULL, NULL, @f);

UPDATE watch_entries t JOIN watch_entries f ON f.user_id = t.user_id AND f.movie_id = @f
SET t.score = IF(f.score IS NULL, t.score, IF(t.score IS NULL, f.score, GREATEST(t.score, f.score))),
    t.watched_at = LEAST(t.watched_at, f.watched_at)
WHERE t.movie_id = @t;
DELETE f FROM watch_entries f JOIN watch_entries t ON t.user_id = f.user_id AND t.movie_id = @t WHERE f.movie_id = @f;
UPDATE watch_entries SET movie_id = @t WHERE movie_id = @f;

UPDATE watchlist t JOIN watchlist f ON f.user_id = t.user_id AND f.movie_id = @f
SET t.added_at = LEAST(t.added_at, f.added_at) WHERE t.movie_id = @t;
DELETE f FROM watchlist f JOIN watchlist t ON t.user_id = f.user_id AND t.movie_id = @t WHERE f.movie_id = @f;
UPDATE watchlist SET movie_id = @t WHERE movie_id = @f;

UPDATE recommendations t JOIN recommendations f
    ON f.from_user_id = t.from_user_id AND f.to_user_id = t.to_user_id AND f.movie_id = @f
SET t.created_at = LEAST(t.created_at, f.created_at), t.note = COALESCE(t.note, f.note),
    t.dismissed_at = IF(t.dismissed_at IS NULL OR f.dismissed_at IS NULL, NULL, GREATEST(t.dismissed_at, f.dismissed_at))
WHERE t.movie_id = @t;
DELETE f FROM recommendations f JOIN recommendations t
    ON t.from_user_id = f.from_user_id AND t.to_user_id = f.to_user_id AND t.movie_id = @t
WHERE f.movie_id = @f;
UPDATE recommendations SET movie_id = @t WHERE movie_id = @f;

DELETE FROM title_providers WHERE title_id = @f;
DELETE FROM movies WHERE id = @f;

-- ---------------------------------------------------------------------------------------------------------------
-- #649 -> #125 (movie into series)
SET @f := (SELECT id FROM movies WHERE id = 649 AND media_type = 'movie' AND tmdb_id = 287663);
SET @t := (SELECT id FROM movies WHERE id = 125 AND media_type = 'series' AND tmdb_id = 60554);
SET @f := IF(@t IS NULL, NULL, @f);

UPDATE watch_entries t JOIN watch_entries f ON f.user_id = t.user_id AND f.movie_id = @f
SET t.score = IF(f.score IS NULL, t.score, IF(t.score IS NULL, f.score, GREATEST(t.score, f.score))),
    t.watched_at = LEAST(t.watched_at, f.watched_at)
WHERE t.movie_id = @t;
DELETE f FROM watch_entries f JOIN watch_entries t ON t.user_id = f.user_id AND t.movie_id = @t WHERE f.movie_id = @f;
UPDATE watch_entries SET movie_id = @t WHERE movie_id = @f;

UPDATE watchlist t JOIN watchlist f ON f.user_id = t.user_id AND f.movie_id = @f
SET t.added_at = LEAST(t.added_at, f.added_at) WHERE t.movie_id = @t;
DELETE f FROM watchlist f JOIN watchlist t ON t.user_id = f.user_id AND t.movie_id = @t WHERE f.movie_id = @f;
UPDATE watchlist SET movie_id = @t WHERE movie_id = @f;

UPDATE recommendations t JOIN recommendations f
    ON f.from_user_id = t.from_user_id AND f.to_user_id = t.to_user_id AND f.movie_id = @f
SET t.created_at = LEAST(t.created_at, f.created_at), t.note = COALESCE(t.note, f.note),
    t.dismissed_at = IF(t.dismissed_at IS NULL OR f.dismissed_at IS NULL, NULL, GREATEST(t.dismissed_at, f.dismissed_at))
WHERE t.movie_id = @t;
DELETE f FROM recommendations f JOIN recommendations t
    ON t.from_user_id = f.from_user_id AND t.to_user_id = f.to_user_id AND t.movie_id = @t
WHERE f.movie_id = @f;
UPDATE recommendations SET movie_id = @t WHERE movie_id = @f;

DELETE FROM title_providers WHERE title_id = @f;
DELETE FROM movies WHERE id = @f;

-- ---------------------------------------------------------------------------------------------------------------
-- Sagas. Los Hechiceros de Waverly Place: the TMDB collection 413935 (the movies) joins the manual franchise
-- 'waverly-place' (the series), as database/studios/franchises.php now says; the emptied TMDB row is removed.
SET @keep := (SELECT id FROM collections WHERE slug = 'waverly-place');
SET @old := (SELECT id FROM collections WHERE tmdb_collection_id = 413935 AND slug = 'tmdb-413935');
UPDATE movies SET collection_id = @keep WHERE collection_id = @old AND @keep IS NOT NULL;
DELETE FROM collections WHERE id = @old AND NOT EXISTS (SELECT 1 FROM movies m WHERE m.collection_id = collections.id);

-- TMDB collection 8945 is Mad Max (database/studios/saga-names.php had it as "Hombres de negro").
UPDATE collections SET name = 'Mad Max' WHERE tmdb_collection_id = 8945 AND BINARY name <> BINARY 'Mad Max';

COMMIT;

-- Check: the three duplicates are gone and the sagas are fixed (expected: 0, 1, 0, 1).
SELECT (SELECT COUNT(*) FROM movies WHERE (media_type, tmdb_id) IN (('movie', 1698863), ('movie', 64202), ('movie', 287663))) AS duplicates_left,
       (SELECT COUNT(*) FROM collections WHERE name = 'Mad Max') AS mad_max,
       (SELECT COUNT(*) FROM collections WHERE tmdb_collection_id = 413935) AS waverly_tmdb_rows,
       (SELECT COUNT(*) FROM collections WHERE name LIKE '%Waverly%') AS waverly_sagas;
