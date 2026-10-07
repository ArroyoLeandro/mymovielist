<?php

declare(strict_types=1);

// Web-root shim. The real app lives OUTSIDE the web root, so src/ and config/
// (with the DB credentials and password hash) are never web-accessible.
// Adjust APP_DIR if you upload the app folder somewhere else.
const APP_DIR = __DIR__ . '/../../disney-app';

require APP_DIR . '/public/index.php';
