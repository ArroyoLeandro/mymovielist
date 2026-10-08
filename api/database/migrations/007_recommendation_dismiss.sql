-- 007: recipients can dismiss a received recommendation without deleting it (the sender keeps the history).
-- MariaDB 10.5+/11, additive and re-runnable: no existing row is touched (NULL = not dismissed).
SET NAMES utf8mb4;

ALTER TABLE recommendations
    ADD COLUMN IF NOT EXISTS dismissed_at DATETIME NULL AFTER created_at;
