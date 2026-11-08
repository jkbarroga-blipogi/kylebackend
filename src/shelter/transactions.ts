import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RowDataPacket } from 'mysql2';
import type { ResultSetHeader } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import type { DatabaseService } from '../database/database.service';
import { configFor } from './table.config';
import type { TableConfig } from './table.config';
import { checkId, fields } from './validation';
import * as crud from './crud';
import { inTx } from './tx';

type AdoptionStatusRow = { adoption_status: unknown };

/** Locks the Animal row to keep two requests from taking the same animal at once. */
async function lockAnimalRow(conn: PoolConnection, animalId: number) {
  const [animalRows] = await conn.execute<RowDataPacket[]>(
    'SELECT `animal_id`, `adoption_status` FROM `Animal` WHERE `animal_id` = ? FOR UPDATE',
    [animalId],
  );

  const animal = animalRows[0] as AdoptionStatusRow | undefined;

  if (!animal) {
    throw new BadRequestException('Animal not found');
  }

  return animal;
}

async function assertAnimalNotAdopted(
  conn: PoolConnection,
  animalId: number,
  adoptionStatus: unknown,
) {
  const [adoptionRows] = await conn.execute<RowDataPacket[]>(
    'SELECT `adoption_id` FROM `Adoption` WHERE `animal_id` = ? LIMIT 1 FOR UPDATE',
    [animalId],
  );

  if (
    adoptionRows.length ||
    String(adoptionStatus ?? '').trim().toLowerCase() ===
      'adopted'
  ) {
    throw new ConflictException(
      'This animal has already been adopted by someone else',
    );
  }
}

function isAdoptedApplicationStatus(status: unknown) {
  return ['adopted', 'completed'].includes(
    String(status ?? '').trim().toLowerCase(),
  );
}

async function assertNoOtherAdoptedApplication(
  conn: PoolConnection,
  animalId: number,
  ignoreApplicationId: number,
) {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT \`application_id\` FROM \`Adoption_Application\`
     WHERE \`animal_id\` = ?
       AND \`application_id\` <> ?
       AND COALESCE(LOWER(TRIM(\`application_status\`)), '')
           IN ('adopted', 'completed')
     LIMIT 1 FOR UPDATE`,
    [animalId, ignoreApplicationId],
  );

  if (rows.length) {
    throw new ConflictException(
      'This animal already has an adopted application',
    );
  }
}

// Marks the animal "Adopted" and closes the other open applications.
async function markAnimalAdopted(
  conn: PoolConnection,
  animalId: number,
  keepApplicationId: number,
) {
  await conn.execute(
    'UPDATE `Animal` SET `adoption_status` = ? WHERE `animal_id` = ?',
    ['Adopted', animalId],
  );

  await conn.execute(
    `UPDATE \`Adoption_Application\`
     SET \`application_status\` = ?
     WHERE \`animal_id\` = ?
       AND \`application_id\` <> ?
       AND COALESCE(LOWER(TRIM(\`application_status\`)), '')
           NOT IN ('adopted', 'completed', 'rejected', 'cancelled', 'canceled')`,
    ['Rejected', animalId, keepApplicationId],
  );
}

// Returns the animal to "Available" when no adoption record remains
// and no other application reached "adopted"/"completed".
async function releaseAnimalIfUnadopted(
  conn: PoolConnection,
  animalId: number,
  ignoreApplicationId: number,
) {
  const [adoptionRows] = await conn.execute<RowDataPacket[]>(
    'SELECT `adoption_id` FROM `Adoption` WHERE `animal_id` = ? LIMIT 1',
    [animalId],
  );

  const [applicationRows] = await conn.execute<RowDataPacket[]>(
    `SELECT \`application_id\` FROM \`Adoption_Application\`
     WHERE \`animal_id\` = ?
       AND \`application_id\` <> ?
       AND COALESCE(LOWER(TRIM(\`application_status\`)), '')
           IN ('adopted', 'completed')
     LIMIT 1`,
    [animalId, ignoreApplicationId],
  );

  if (!adoptionRows.length && !applicationRows.length) {
    await conn.execute(
      'UPDATE `Animal` SET `adoption_status` = ? WHERE `animal_id` = ?',
      ['Available', animalId],
    );
  }
}

function buildInsert(c: Pick<TableConfig, 'table'>, keys: string[]) {
  const columns = keys.map(key => `\`${key}\``).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  return `INSERT INTO \`${c.table}\` (${columns})
  VALUES (${placeholders})`;
}

function buildUpdate(c: Pick<TableConfig, 'table' | 'id'>, keys: string[]) {
  const assignments = keys
    .map(key => `\`${key}\` = ?`)
    .join(', ');
  return `UPDATE \`${c.table}\`
  SET ${assignments}
  WHERE \`${c.id}\` = ?`;
}

// POST adoption: one animal, one adoption record. The animal is
// marked "Adopted" within the same transaction.
export async function createAdoption(db: DatabaseService, body: unknown) {
  const c = configFor('adoption');
  const { keys, values } = fields(c, body, true);
  const animalId = Number(values[keys.indexOf('animal_id')]);

  const insertId = await inTx(db, async conn => {
    const animal = await lockAnimalRow(conn, animalId);
    await assertAnimalNotAdopted(
      conn,
      animalId,
      animal.adoption_status,
    );

    const [result] = await conn.execute<ResultSetHeader>(
      buildInsert(c, keys),
      values,
    );

    await conn.execute(
      'UPDATE `Animal` SET `adoption_status` = ? WHERE `animal_id` = ?',
      ['Adopted', animalId],
    );

    return Number(result.insertId);
  });

  return crud.findOne(db, 'adoption', insertId);
}

// PUT adoption: when the animal changes, verify the new animal is
// still available before writing the adoption record.
export async function updateAdoption(db: DatabaseService, id: number, body: unknown) {
  const c = configFor('adoption');
  const { keys, values } = fields(c, body, false);
  checkId(id);

  await inTx(db, async conn => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT `animal_id` FROM `Adoption` WHERE `adoption_id` = ? FOR UPDATE',
      [id],
    );

    if (!rows[0]) {
      throw new NotFoundException('Record not found');
    }

    const oldAnimalId = Number(rows[0].animal_id);
    const animalIndex = keys.indexOf('animal_id');
    const newAnimalId =
      animalIndex === -1 ? oldAnimalId : Number(values[animalIndex]);

    if (newAnimalId !== oldAnimalId) {
      const animal = await lockAnimalRow(conn, newAnimalId);
      await assertAnimalNotAdopted(
        conn,
        newAnimalId,
        animal.adoption_status,
      );
    }

    await conn.execute<ResultSetHeader>(
      buildUpdate(c, keys),
      [...values, id],
    );

    if (newAnimalId !== oldAnimalId) {
      const [remaining] = await conn.execute<RowDataPacket[]>(
        'SELECT `adoption_id` FROM `Adoption` WHERE `animal_id` = ? AND `adoption_id` <> ? LIMIT 1',
        [oldAnimalId, id],
      );

      if (!remaining.length) {
        await conn.execute(
          'UPDATE `Animal` SET `adoption_status` = ? WHERE `animal_id` = ?',
          ['Available', oldAnimalId],
        );
      }
    }

    // Any animal that owns an adoption record stays "Adopted".
    await conn.execute(
      'UPDATE `Animal` SET `adoption_status` = ? WHERE `animal_id` = ?',
      ['Adopted', newAnimalId],
    );
  });

  return crud.findOne(db, 'adoption', id);
}

// DELETE adoption: restores "Available" when no other adoption
// record remains for the animal.
export async function removeAdoption(db: DatabaseService, id: number) {
  checkId(id);

  await inTx(db, async conn => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT `animal_id` FROM `Adoption` WHERE `adoption_id` = ? FOR UPDATE',
      [id],
    );

    if (!rows[0]) {
      throw new NotFoundException('Record not found');
    }

    const animalId = Number(rows[0].animal_id);

    await conn.execute(
      'DELETE FROM `Adoption` WHERE `adoption_id` = ?',
      [id],
    );

    const [remaining] = await conn.execute<RowDataPacket[]>(
      'SELECT `adoption_id` FROM `Adoption` WHERE `animal_id` = ? LIMIT 1',
      [animalId],
    );

    if (!remaining.length) {
      await conn.execute(
        'UPDATE `Animal` SET `adoption_status` = ? WHERE `animal_id` = ?',
        ['Available', animalId],
      );
    }
  });

  return { deleted: true, id };
}

// POST adoption application: blocked when the animal is already
// adopted (Adoption record, "Adopted" status, or adopted application).
export async function createAdoptionApplication(db: DatabaseService, body: unknown) {
  const c = configFor('adoption-application');
  const { keys, values } = fields(c, body, true);
  const animalId = Number(values[keys.indexOf('animal_id')]);
  const statusIndex = keys.indexOf('application_status');
  const status =
    statusIndex === -1 ? 'Pending' : values[statusIndex];

  const insertId = await inTx(db, async conn => {
    const animal = await lockAnimalRow(conn, animalId);
    await assertAnimalNotAdopted(
      conn,
      animalId,
      animal.adoption_status,
    );
    await assertNoOtherAdoptedApplication(conn, animalId, 0);

    const [result] = await conn.execute<ResultSetHeader>(
      buildInsert(c, keys),
      values,
    );

    if (isAdoptedApplicationStatus(status)) {
      await markAnimalAdopted(conn, animalId, result.insertId);
    }

    return Number(result.insertId);
  });

  return crud.findOne(db, 'adoption-application', insertId);
}

// PUT adoption application: flipping the status to "adopted" closes
// the other applications and marks the animal.
export async function updateAdoptionApplication(db: DatabaseService, id: number, body: unknown) {
  const c = configFor('adoption-application');
  const { keys, values } = fields(c, body, false);
  checkId(id);

  await inTx(db, async conn => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT `animal_id`, `application_status` FROM `Adoption_Application` WHERE `application_id` = ? FOR UPDATE',
      [id],
    );

    if (!rows[0]) {
      throw new NotFoundException('Record not found');
    }

    const oldAnimalId = Number(rows[0].animal_id);
    const oldStatus = String(rows[0].application_status ?? '');

    const animalIndex = keys.indexOf('animal_id');
    const statusIndex = keys.indexOf('application_status');

    const newAnimalId =
      animalIndex === -1
        ? oldAnimalId
        : Number(values[animalIndex]);
    const newStatus =
      statusIndex === -1
        ? oldStatus
        : String(values[statusIndex]);

    const wasFinal = isAdoptedApplicationStatus(oldStatus);
    const isFinal = isAdoptedApplicationStatus(newStatus);

    const animal = await lockAnimalRow(conn, newAnimalId);

    // Animal reassignment requires the new animal to still be available.
    if (newAnimalId !== oldAnimalId) {
      await assertAnimalNotAdopted(
        conn,
        newAnimalId,
        animal.adoption_status,
      );
    }

    if (newAnimalId !== oldAnimalId || isFinal) {
      await assertNoOtherAdoptedApplication(
        conn,
        newAnimalId,
        id,
      );
    }

    await conn.execute<ResultSetHeader>(
      buildUpdate(c, keys),
      [...values, id],
    );

    if (newAnimalId !== oldAnimalId && wasFinal) {
      await releaseAnimalIfUnadopted(conn, oldAnimalId, id);
    }

    if (isFinal) {
      await markAnimalAdopted(conn, newAnimalId, id);
    } else if (wasFinal && newAnimalId === oldAnimalId) {
      await releaseAnimalIfUnadopted(conn, newAnimalId, id);
    }
  });

  return crud.findOne(db, 'adoption-application', id);
}

// DELETE adoption application: when the deleted application was the
// adopted one, return the animal to "Available" if no other basis exists.
export async function removeAdoptionApplication(db: DatabaseService, id: number) {
  checkId(id);

  await inTx(db, async conn => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      'SELECT `animal_id`, `application_status` FROM `Adoption_Application` WHERE `application_id` = ? FOR UPDATE',
      [id],
    );

    if (!rows[0]) {
      throw new NotFoundException('Record not found');
    }

    const animalId = Number(rows[0].animal_id);
    const wasFinal = isAdoptedApplicationStatus(
      rows[0].application_status,
    );

    await conn.execute(
      'DELETE FROM `Adoption_Application` WHERE `application_id` = ?',
      [id],
    );

    if (wasFinal) {
      await releaseAnimalIfUnadopted(conn, animalId, id);
    }
  });

  return { deleted: true, id };
}
