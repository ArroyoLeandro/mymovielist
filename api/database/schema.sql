-- MySQL 5.7+/8 schema. utf8mb4, InnoDB.
SET NAMES utf8mb4;

CREATE TABLE studios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    logo_url VARCHAR(500) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_studios_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sections (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    studio_id INT UNSIGNED NOT NULL,
    slug VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    period VARCHAR(50) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sections_studio_slug (studio_id, slug),
    CONSTRAINT fk_sections_studio FOREIGN KEY (studio_id) REFERENCES studios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE movies (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    section_id INT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    original_title VARCHAR(200) NULL,
    year SMALLINT NOT NULL,
    media_type ENUM('movie','series') NOT NULL DEFAULT 'movie',
    tmdb_id INT UNSIGNED NULL,
    wiki_title VARCHAR(200) NULL,
    poster_url VARCHAR(500) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_movies_section (section_id, sort_order),
    UNIQUE KEY uq_movies_media_tmdb (media_type, tmdb_id),
    CONSTRAINT fk_movies_section FOREIGN KEY (section_id) REFERENCES sections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tag VARCHAR(20) NOT NULL,
    tag_normalized VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_tag_normalized (tag_normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE watch_entries (
    user_id INT UNSIGNED NOT NULL,
    movie_id INT UNSIGNED NOT NULL,
    score TINYINT UNSIGNED NULL,
    watched_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, movie_id),
    KEY idx_watch_entries_movie (movie_id),
    CONSTRAINT fk_watch_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_watch_movie FOREIGN KEY (movie_id) REFERENCES movies (id) ON DELETE CASCADE,
    CONSTRAINT chk_watch_score CHECK (score IS NULL OR (score BETWEEN 1 AND 10))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
