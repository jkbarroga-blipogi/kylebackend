import { NotFoundException } from '@nestjs/common';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { DatabaseService } from '../database/database.service';
import { configFor } from './table.config';
import { checkId, fields, query } from './validation';

// Generic registry-driven CRUD. Adoption and adoption-application
// routes bypass these and run through shelter/transactions.ts.

export async function findAll(db: DatabaseService, resource: string) {
  const c = configFor(resource);

  return query<RowDataPacket[]>(
    db,
    `SELECT * FROM \`${c.table}\` ORDER BY \`${c.id}\``,
  );
}

export async function findOne(db: DatabaseService, resource: string, id: number) {
  const c = configFor(resource);
  checkId(id);

  const rows = await query<RowDataPacket[]>(
    db,
    `SELECT * FROM \`${c.table}\` WHERE \`${c.id}\` = ?`,
    [id],
  );

  if (!rows[0]) {
    throw new NotFoundException('Record not found');
  }

  return rows[0];
}

export async function create(db: DatabaseService, resource: string, body: unknown) {
  const c = configFor(resource);
  const { keys, values } = fields(c, body, true);

  const columns = keys.map(key => `\`${key}\``).join(', ');
  const placeholders = keys.map(() => '?').join(', ');

  const result = await query<ResultSetHeader>(
    db,
    `INSERT INTO \`${c.table}\` (${columns})
     VALUES (${placeholders})`,
    values,
  );

  return findOne(db, resource, result.insertId);
}

export async function update(db: DatabaseService, resource: string, id: number, body: unknown) {
  const c = configFor(resource);
  const { keys, values } = fields(c, body, false);

  await findOne(db, resource, id);

  const assignments = keys
    .map(key => `\`${key}\` = ?`)
    .join(', ');

  await query<ResultSetHeader>(
    db,
    `UPDATE \`${c.table}\`
     SET ${assignments}
     WHERE \`${c.id}\` = ?`,
    [...values, id],
  );

  return findOne(db, resource, id);
}

export async function remove(db: DatabaseService, resource: string, id: number) {
  const c = configFor(resource);

  checkId(id);

  const result = await query<ResultSetHeader>(
    db,
    `DELETE FROM \`${c.table}\` WHERE \`${c.id}\` = ?`,
    [id],
  );

  if (!result.affectedRows) {
    throw new NotFoundException('Record not found');
  }

  return { deleted: true, id };
}
