<?php

declare(strict_types=1);

// Usage: php bin/hash-password.php "shared site password"
$password = $argv[1] ?? null;
if ($password === null || $password === '') {
    fwrite(STDERR, "Usage: php bin/hash-password.php <password>\n");
    exit(1);
}
echo password_hash($password, PASSWORD_DEFAULT), PHP_EOL;
