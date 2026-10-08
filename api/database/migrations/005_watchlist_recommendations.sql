-- 005: watchlist ("Quiero verla") and friend recommendations. MariaDB 10.5+/11, re-runnable and additive.
-- Both tables keep a `movie_id` column so the importer's prune never removes a referenced title.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS watchlist (
    user_id INT UNSIGNED NOT NULL,
    movie_id INT UNSIGNED NOT NULL,
    added_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, movie_id),
    KEY idx_watchlist_movie (movie_id),
    CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_watchlist_movie FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Self-recommendations are rejected by the API (a CHECK would clash with the FK actions on MySQL).
CREATE TABLE IF NOT EXISTS recommendations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    from_user_id INT UNSIGNED NOT NULL,
    to_user_id INT UNSIGNED NOT NULL,
    movie_id INT UNSIGNED NOT NULL,
    note VARCHAR(280) NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_reco (from_user_id, to_user_id, movie_id),
    KEY idx_reco_to (to_user_id),
    KEY idx_reco_movie (movie_id),
    CONSTRAINT fk_reco_from FOREIGN KEY (from_user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_reco_to FOREIGN KEY (to_user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_reco_movie FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
