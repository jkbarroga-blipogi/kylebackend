// Mapping of raw MySQL driver error codes to the HTTP exceptions the
// NestJS surface expects. One table, one place: every service consumes
// this instead of keeping private copies.
import { BadRequestException, ConflictException } from '@nestjs/common';

/** Human-readable outcomes per mapped code. Messages are part of the stable HTTP contract. */
const MESSAGES = {
  duplicate: 'Duplicate value',
  missingReference: 'A referenced ID does not exist',
  stillReferenced: 'Another record still uses this record',
  deadlock: 'The record is busy — please try again',
  dataShape: 'Check field values, lengths, and dates',
} as const;

const DATA_SHAPE_CODES = [
  'ER_DATA_TOO_LONG',
  'ER_BAD_NULL_ERROR',
  'ER_TRUNCATED_WRONG_VALUE',
  'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
];

/**
 * Translates a MySQL driver error into the matching Nest HTTP exception.
 * Reads both raw `code` (mysql2) and `driverError.code` (ORM styles).
 * Returns null when the error is unmapped and should propagate as-is.
 */
export function translateSqlError(error: unknown): unknown | null {
  const shaped = error as { code?: string; driverError?: { code?: string } };
  const code = shaped.code ?? shaped.driverError?.code;

  if (code === 'ER_DUP_ENTRY') {
    return new ConflictException(MESSAGES.duplicate);
  }

  if (code === 'ER_NO_REFERENCED_ROW_2') {
    return new BadRequestException(MESSAGES.missingReference);
  }

  if (code === 'ER_ROW_IS_REFERENCED_2') {
    return new ConflictException(MESSAGES.stillReferenced);
  }

  if (code === 'ER_LOCK_DEADLOCK') {
    return new ConflictException(MESSAGES.deadlock);
  }

  if (DATA_SHAPE_CODES.includes(code ?? '')) {
    return new BadRequestException(MESSAGES.dataShape);
  }

  return null;
}

export function rethrowSqlError(error: unknown): never {
  const mapped = translateSqlError(error);
  if (mapped !== null) {
    throw mapped;
  }
  throw error;
}
