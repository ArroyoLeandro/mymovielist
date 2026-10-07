-- 004: studio display order and kind (studio vs category). MariaDB 10.5+/11, re-runnable and additive.
-- The importer fills both from database/studios/studio-order.php on every run.
SET NAMES utf8mb4;

ALTER TABLE studios
    ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'studio';
