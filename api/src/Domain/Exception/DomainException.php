<?php

declare(strict_types=1);

namespace App\Domain\Exception;

/** Base type for every domain invariant violation. */
abstract class DomainException extends \DomainException
{
}
