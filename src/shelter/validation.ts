import { BadRequestException } from '@nestjs/common';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { DatabaseService } from '../database/database.service';
import { translateSqlError } from '../database/sql-errors';
import type { TableConfig } from './table.config';

export function checkId(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new BadRequestException('ID must be a positive integer');
  }
}

/**
 * Field gate for every generic CRUD write: unknown keys, types, blanks,
 * and date shapes are validated here before any SQL is generated.
 */
export function fields(
  config: TableConfig,
  body: unknown,
  creating: boolean,
) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Send a JSON object');
  }

  const data = body as Record<string, unknown>;
  const keys = Object.keys(data);

  const allowed = [
    ...config.required,
    ...config.optional,
    ...(config.defaults ?? []),
  ];

  if (!keys.length || keys.some(key => !allowed.includes(key))) {
    throw new BadRequestException('Empty body or unknown field');
  }

  if (
    creating &&
    config.required.some(key => !keys.includes(key))
  ) {
    throw new BadRequestException(
      `Required: ${config.required.join(', ')}`,
    );
  }

  const values = keys.map(key => {
    const value = data[key];

    if (value === null && config.optional.includes(key)) {
      return null;
    }

    if (key.endsWith('_id')) {
      if (typeof value !== 'number') {
        throw new BadRequestException(`${key} must be a number`);
      }

      checkId(value);
      return value;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${key} must be text`);
    }

    if (!config.optional.includes(key) && !value.trim()) {
      throw new BadRequestException(`${key} cannot be empty`);
    }

    if (key.endsWith('_date')) {
      const date = new Date(`${value}T00:00:00.000Z`);

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        value < '1000-01-01' ||
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      ) {
        throw new BadRequestException(
          `${key} must be a valid YYYY-MM-DD date`,
        );
      }
    }

    return value;
  });

  return { keys, values };
}

// One place translates MySQL errors during responses: normal CRUD and
// the adoption transaction family reuse the shared sql-errors table.
export function rethrowDbError(error: unknown): never {
  const mapped = translateSqlError(error);

  if (mapped !== null) {
    throw mapped;
  }

  throw error;
}

export async function query<T extends RowDataPacket[] | ResultSetHeader>(
  db: DatabaseService,
  sql: string,
  values: (string | number | null)[] = [],
): Promise<T> {
  try {
    const [result] = await db.getPool().execute<T>(
      sql,
      values,
    );

    return result;
  } catch (error) {
    rethrowDbError(error);
  }
}
