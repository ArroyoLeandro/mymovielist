<?php

declare(strict_types=1);

namespace App;

use PDO;

final class Db
{
    /** @param array{dsn: string, user?: string, pass?: string} $config */
    public static function connect(array $config): PDO
    {
        return new PDO($config['dsn'], $config['user'] ?? null, $config['pass'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
}
