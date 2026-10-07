<?php

declare(strict_types=1);

namespace App;

/** Error that maps directly to an HTTP status and a JSON message. */
final class HttpError extends \RuntimeException
{
    /** @var int */
    public $status;

    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

/** Minimal JSON request/response helpers. */
final class Http
{
    /** @param mixed $data */
    public static function json($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function noContent(): void
    {
        http_response_code(204);
        exit;
    }

    /** Decodes the JSON object body of a mutation request (415 if not JSON, 422 if malformed). */
    public static function jsonBody(): array
    {
        $type = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
        if (strpos($type, 'application/json') !== 0) {
            throw new HttpError(415, 'Content-Type must be application/json.');
        }
        $data = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($data)) {
            throw new HttpError(422, 'Request body must be a JSON object.');
        }
        return $data;
    }
}
