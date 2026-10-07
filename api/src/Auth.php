<?php

declare(strict_types=1);

namespace App;

/** Shared site password check plus PHP session handling. */
final class Auth
{
    private const LIFETIME = 60 * 60 * 24 * 30;

    private string $passwordHash;
    private string $sessionName;

    public function __construct(string $passwordHash, string $sessionName)
    {
        $this->passwordHash = $passwordHash;
        $this->sessionName = $sessionName;
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
        // Private save path: the shared default is garbage-collected by other sites' scripts.
        $dir = __DIR__ . '/../storage/sessions';
        if ((is_dir($dir) || @mkdir($dir, 0700, true)) && is_writable($dir)) {
            session_save_path($dir);
        }
        session_set_cookie_params([
            'lifetime' => self::LIFETIME,
            'path' => '/',
            'secure' => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
        // Sliding expiry: re-send the cookie so active users stay signed in.
        if (isset($_SESSION['user_id']) && !headers_sent()) {
            setcookie($this->sessionName, session_id(), [
                'expires' => time() + self::LIFETIME,
                'path' => '/',
                'secure' => $https,
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
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
