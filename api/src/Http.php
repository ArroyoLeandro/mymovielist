<?php

declare(strict_types=1);

namespace App;

/** Error that maps directly to an HTTP status and a JSON message. */
final class HttpError extends \RuntimeException
{
    /** @var int */
    public $status;
    /** @var string|null machine-readable reason for the client (JSON "code") */
    public $reason;
    /** @var array<string, mixed> extra JSON fields */
    public $extra;

    public function __construct(int $status, string $message, ?string $reason = null, array $extra = [])
    {
        parent::__construct($message);
        $this->status = $status;
        $this->reason = $reason;
        $this->extra = $extra;
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

    /**
     * JSON for static, auth-protected data: strong ETag from the body, `private, no-cache` (always revalidate),
     * and 304 with an empty body when the client already has this version.
     * @param mixed $data
     */
    public static function jsonCached($data): void
    {
        $body = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $etag = '"' . md5($body) . '"';
        // session_start() adds anti-cache headers of its own; replace them.
        header_remove('Pragma');
        header_remove('Expires');
        header('Cache-Control: private, no-cache');
        header('ETag: ' . $etag);

        foreach (explode(',', (string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) as $candidate) {
            // Tolerate weak validators and the "-gzip" suffix some servers append to ETags.
            $candidate = preg_replace('/^\s*(W\/)?"([^"]*?)(-gzip)?"\s*$/', '"$2"', $candidate);
            if ($candidate === $etag) {
                http_response_code(304);
                exit;
            }
        }
        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo $body;
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
