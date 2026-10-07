<?php

declare(strict_types=1);

namespace App;

/** Shared site password check plus PHP session handling. */
final class Auth
{
    private const LIFETIME = 60 * 60 * 24 * 30;

    public function __construct(private readonly string $passwordHash, private readonly string $sessionName)
    {
    }

    public function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
        session_name($this->sessionName);
        ini_set('session.gc_maxlifetime', (string) self::LIFETIME);
        session_set_cookie_params([
            'lifetime' => self::LIFETIME,
            'path' => '/',
            'secure' => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    public function checkPassword(string $password): bool
    {
        if (password_verify($password, $this->passwordHash)) {
            return true;
        }
        usleep(400_000); // slow down password guessing
        return false;
    }

    public function login(int $userId): void
    {
        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
    }

    public function userId(): ?int
    {
        return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
    }

    public function logout(): void
    {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
        setcookie($this->sessionName, '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    }
}
