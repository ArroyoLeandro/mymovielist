-- 008: automatic catalog growth and titles added by hand.
--   movies.added_at          when the title entered the catalog (home row "Estrenos y agregadas recientemente")
--   movies.source            'rule' = imported from a studio definition, 'manual' = added by a user from the search
--   movies.added_by_user_id  who added a manual title (NULL for rule titles; SET NULL if the user is deleted)
-- MariaDB 10.5+/11, additive and re-runnable. Existing rows get a fixed past added_at so they do not flood the
-- "recent" row; only rows still NULL are touched (the importer and the manual import always set it).
SET NAMES utf8mb4;

ALTER TABLE movies
    ADD COLUMN IF NOT EXISTS added_at DATETIME NULL AFTER sort_order,
    ADD COLUMN IF NOT EXISTS source ENUM('rule','manual') NOT NULL DEFAULT 'rule' AFTER added_at,
    ADD COLUMN IF NOT EXISTS added_by_user_id INT UNSIGNED NULL AFTER source,
    ADD KEY IF NOT EXISTS idx_movies_added (added_at),
    ADD KEY IF NOT EXISTS idx_movies_added_by (added_by_user_id),
    ADD CONSTRAINT fk_movies_added_by FOREIGN KEY IF NOT EXISTS (added_by_user_id) REFERENCES users (id) ON DELETE SET NULL;

UPDATE movies SET added_at = '2026-01-01 00:00:00' WHERE added_at IS NULL;
