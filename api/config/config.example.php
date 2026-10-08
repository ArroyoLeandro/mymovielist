<?php

// Copy to config.php (gitignored) and fill in real values. The db block matches docker-compose.yml (local dev only).
// Generate the hash with: php bin/hash-password.php "the shared site password"
return [
    'db' => [
        'dsn' => 'mysql:host=127.0.0.1;port=3306;dbname=disney_catalog;charset=utf8mb4',
        'user' => 'disney',
        'pass' => 'disney',
    ],
    'site_password_hash' => '$2y$10$replace.with.output.of.bin/hash-password.php',
    'session_name' => 'disney_session',
    // Only needed by bin/import-tmdb.php (CLI). Use either the v3 api_key or the v4 read_token (bearer).
    // watch_country: ISO 3166-1 country for "where to watch" (bin/refresh-providers.php), default 'AR'.
    'tmdb' => ['api_key' => '', 'read_token' => '', 'ca_bundle' => '', 'watch_country' => 'AR'], // ca_bundle: optional path to a CA file (PHP on Windows)
];
