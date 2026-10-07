<?php

declare(strict_types=1);

// Web-root shim. The real app lives in _app/, which .htaccess denies, so src/ and
// config/ (DB credentials, password hash) are never web-accessible.
const APP_DIR = __DIR__ . '/../_app';

require APP_DIR . '/public/index.php';
