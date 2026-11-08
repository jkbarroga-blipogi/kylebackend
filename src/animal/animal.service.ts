import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { DatabaseService } from '../database/database.service';

// Shapes returned to the API. Kept identical to the previous TypeORM
// responses: date columns as YYYY-MM-DD strings, joined relations nested
// under their relation names (breed, species).
type SpeciesRow = {
  species_id: number;
  species_name: string;
};

type BreedRow = {
  breed_id: number;
  species_id: number;
  breed_name: string;
  species: { species_id: number; species_name: string } | null;
};

type AnimalRow = {
  animal_id: number;
  breed_id: number;
  animal_name: string;
  sex: string;
  birth_date: string | null;
  color: string | null;
  arrival_date: string;
  adoption_status: string;
  breed?: {
    breed_id: number;
    species_id: number;
    breed_name: string;
  } | null;
};

const ANIMAL_COLUMNS = [
  'breed_id',
  'animal_name',
  'sex',
  'birth_date',
  'color',
  'arrival_date',
  'adoption_status',
] as const;

function mapSpecies(row: RowDataPacket): SpeciesRow {
  const raw = row as Record<string, unknown>;
  return {
    species_id: Number(raw.species_id),
    species_name: String(raw.species_name ?? ''),
  };
}

function mapBreed(row: RowDataPacket): BreedRow {
  const raw = row as Record<string, unknown>;
  const nestedSpecies =
    raw.species_species_id !== null && raw.species_species_id !== undefined
      ? {
          species_id: Number(raw.species_species_id),
          species_name: String(raw.species_species_name ?? ''),
        }
      : null;

  return {
    breed_id: Number(raw.breed_id),
    species_id: Number(raw.species_id),
    breed_name: String(raw.breed_name ?? ''),
    species: nestedSpecies,
  };
}

function mapAnimal(row: RowDataPacket): AnimalRow {
  const raw = row as Record<string, unknown>;

  const nestedBreed =
    raw.breed_breed_id !== null && raw.breed_breed_id !== undefined
      ? {
          breed_id: Number(raw.breed_breed_id),
          species_id: Number(raw.breed_species_id),
          breed_name: String(raw.breed_breed_name ?? ''),
        }
      : null;

  const base = {
    animal_id: Number(raw.animal_id),
    breed_id: Number(raw.breed_id),
    animal_name: String(raw.animal_name ?? ''),
    sex: String(raw.sex ?? ''),
    birth_date:
      raw.birth_date === null || raw.birth_date === undefined
        ? null
        : String(raw.birth_date),
    color:
      raw.color === null || raw.color === undefined
        ? null
        : String(raw.color),
    arrival_date: String(raw.arrival_date ?? ''),
    adoption_status: String(raw.adoption_status ?? ''),
  };

  return nestedBreed ? { ...base, breed: nestedBreed } : base;
}

const ANIMAL_REQUIRED = ['breed_id', 'animal_name', 'sex', 'arrival_date'] as const;

type AnimalRecord = Record<string, unknown>;

/** Shared guard used by both create and update so no client payload reaches SQL unvalidated. */
function validateAnimalPayload(data: unknown, creating: boolean): string[] {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new BadRequestException('Send a JSON object');
  }

  const body = data as AnimalRecord;
  const unknownField = Object.keys(body).find(
    (key) => !(ANIMAL_COLUMNS as readonly string[]).includes(key),
  );

  if (unknownField !== undefined) {
    throw new BadRequestException(`Unknown field: ${unknownField}`);
  }

  if (creating) {
    const missing = ANIMAL_REQUIRED.filter(
      (key) => body[key] === undefined || body[key] === null,
    );

    if (missing.length) {
      throw new BadRequestException(
        `Required: ${ANIMAL_REQUIRED.join(', ')}`,
      );
    }
  }

  const hasFields = Object.keys(body).length > 0;

  if (creating && !hasFields) {
    throw new BadRequestException('Send a JSON object');
  }

  for (const key of Object.keys(body)) {
    const value = body[key];

    if (value === undefined) {
      throw new BadRequestException(
        `${key} must contain a value or be omitted`,
      );
    }

    if (key === 'color') {
      if (value === null) {
        continue;
      }

      if (typeof value !== 'string') {
        throw new BadRequestException(`${key} must be text`);
      }

      continue;
    }

    if (key.endsWith('_id')) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
        throw new BadRequestException(`${key} must be a number`);
      }

      continue;
    }

    if (key.endsWith('_date')) {
      if (typeof value !== 'string') {
        throw new BadRequestException(
          `${key} must be a valid YYYY-MM-DD date`,
        );
      }

      const date = new Date(`${value}T00:00:00.000Z`);
      const isIsoDateString =
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isNaN(date.getTime()) === false &&
        date.toISOString().slice(0, 10) === value;

      if (!isIsoDateString) {
        throw new BadRequestException(
          `${key} must be a valid YYYY-MM-DD date`,
        );
      }

      continue;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${key} must be text`);
    }

    if (!value.trim()) {
      throw new BadRequestException(`${key} cannot be empty`);
    }
  }

  return Object.keys(body);
}

@Injectable()
export class AnimalService {
  constructor(private readonly db: DatabaseService) {}

  // Handle duplicate values and foreign-key errors
  private async lookupWrite<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      const code = (
        error as { driverError?: { code?: string } }
      ).driverError?.code;

      if (code === 'ER_DUP_ENTRY') {
        throw new ConflictException('Duplicate value');
      }

      if (code === 'ER_ROW_IS_REFERENCED_2') {
        throw new ConflictException(
          'Another record still uses this record',
        );
      }

      if (code === 'ER_NO_REFERENCED_ROW_2') {
        throw new BadRequestException(
          'A referenced ID does not exist',
        );
      }

      throw error;
    }
  }

  private pool() {
    return this.db.getPool();
  }

  // ================= SPECIES METHODS =================

  // POST
  async createSpecies(data: unknown) {
    const value = (data as { species_name?: unknown })?.species_name;

    return this.lookupWrite(async () => {
      const [result] = await this.pool().execute<ResultSetHeader>(
        'INSERT INTO `Species` (`species_name`) VALUES (?)',
        [value as string],
      );

      return this.findOneSpecies(Number(result.insertId));
    });
  }

  // GET all
  async findAllSpecies() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT * FROM `Species`',
    );

    return rows.map(mapSpecies);
  }

  // GET by ID
  async findOneSpecies(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid ID');
    }

    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT * FROM `Species` WHERE `species_id` = ?',
      [id],
    );

    if (!rows[0]) {
      throw new NotFoundException('Species not found');
    }

    return mapSpecies(rows[0]);
  }

  // PUT
  async updateSpecies(
    id: number,
    data: { species_name: string },
  ) {
    const name = data?.species_name;

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 50
    ) {
      throw new BadRequestException(
        'species_name must contain 1 to 50 characters',
      );
    }

    await this.findOneSpecies(id);

    await this.lookupWrite(() =>
      this.pool().execute('UPDATE `Species` SET `species_name` = ? WHERE `species_id` = ?', [
        name.trim(),
        id,
      ]),
    );

    return this.findOneSpecies(id);
  }

  // DELETE
  async removeSpecies(id: number) {
    await this.findOneSpecies(id);

    await this.lookupWrite(() =>
      this.pool().execute('DELETE FROM `Species` WHERE `species_id` = ?', [
        id,
      ]),
    );

    return {
      deleted: true,
      species_id: id,
    };
  }

  // ================= BREED METHODS =================

  // POST
  async createBreed(data: unknown) {
    const speciesId = (data as { species_id?: unknown })?.species_id;
    const breedName = (data as { breed_name?: unknown })?.breed_name;

    return this.lookupWrite(async () => {
      const [result] = await this.pool().execute<ResultSetHeader>(
        'INSERT INTO `Breed` (`species_id`, `breed_name`) VALUES (?, ?)',
        [speciesId as number, String(breedName ?? '')],
      );

      return this.findOneBreed(Number(result.insertId));
    });
  }

  // GET all
  async findAllBreeds() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT `b`.`breed_id`, `b`.`species_id`, `b`.`breed_name`, `s`.`species_id` AS `species_species_id`, `s`.`species_name` AS `species_species_name` FROM `Breed` `b` LEFT JOIN `Species` `s` ON `s`.`species_id` = `b`.`species_id`',
    );

    return rows.map(mapBreed);
  }

  // GET by ID
  async findOneBreed(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid ID');
    }

    const [rows] = await this.pool().execute<RowDataPacket[]>(
      'SELECT `b`.`breed_id`, `b`.`species_id`, `b`.`breed_name`, `s`.`species_id` AS `species_species_id`, `s`.`species_name` AS `species_species_name` FROM `Breed` `b` LEFT JOIN `Species` `s` ON `s`.`species_id` = `b`.`species_id` WHERE `b`.`breed_id` = ?',
      [id],
    );

    if (!rows[0]) {
      throw new NotFoundException('Breed not found');
    }

    return mapBreed(rows[0]);
  }

  // PUT
  async updateBreed(
    id: number,
    data: {
      breed_name?: string;
      species_id?: number;
    },
  ) {
    const patch: { breed_name?: string; species_id?: number } = {};

    if (data?.breed_name !== undefined) {
      if (
        typeof data.breed_name !== 'string' ||
        !data.breed_name.trim() ||
        data.breed_name.trim().length > 100
      ) {
        throw new BadRequestException(
          'breed_name must contain 1 to 100 characters',
        );
      }

      patch.breed_name = data.breed_name.trim();
    }

    if (data?.species_id !== undefined) {
      await this.findOneSpecies(data.species_id);
      patch.species_id = data.species_id;
    }

    if (!Object.keys(patch).length) {
      throw new BadRequestException(
        'No valid fields to update',
      );
    }

    await this.findOneBreed(id);

    const columns = Object.keys(patch) as string[];
    const assignments = columns
      .map((column) => `\`${column}\` = ?`)
      .join(', ');
    const values = columns.map(
      (column) => patch[column as keyof typeof patch],
    );

    await this.lookupWrite(() =>
      this.pool().execute(
        `UPDATE \`Breed\` SET ${assignments} WHERE \`breed_id\` = ?`,
        [...(values as (string | number | null)[]), id],
      ),
    );

    return this.findOneBreed(id);
  }

  // DELETE
  async removeBreed(id: number) {
    await this.findOneBreed(id);

    await this.lookupWrite(() =>
      this.pool().execute('DELETE FROM `Breed` WHERE `breed_id` = ?', [id]),
    );

    return {
      deleted: true,
      breed_id: id,
    };
  }

  // ================= ANIMAL METHODS =================

  private animalSelect(where: string) {
    return `SELECT \`a\`.\`animal_id\`, \`a\`.\`breed_id\`, \`a\`.\`animal_name\`, \`a\`.\`sex\`, DATE_FORMAT(\`a\`.\`birth_date\`, '%Y-%m-%d') AS \`birth_date\`, DATE_FORMAT(\`a\`.\`arrival_date\`, '%Y-%m-%d') AS \`arrival_date\`, \`a\`.\`color\`, \`a\`.\`adoption_status\`, \`b\`.\`breed_id\` AS \`breed_breed_id\`, \`b\`.\`species_id\` AS \`breed_species_id\`, \`b\`.\`breed_name\` AS \`breed_breed_name\` FROM \`Animal\` \`a\` LEFT JOIN \`Breed\` \`b\` ON \`b\`.\`breed_id\` = \`a\`.\`breed_id\`${where}`;
  }

  // POST
  async create(data: unknown) {
    const keys = validateAnimalPayload(data, true);
    const body = data as AnimalRecord;

    return this.lookupWrite(async () => {
      const columns = keys
        .map((column) => `\`${column}\``)
        .join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(
        (column) => body[column] as string | number | null,
      );

      const [result] = await this.pool().execute<ResultSetHeader>(
        `INSERT INTO \`Animal\` (${columns}) VALUES (${placeholders})`,
        values,
      );

      return this.findOne(Number(result.insertId));
    });
  }

  // GET all
  async findAll() {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      this.animalSelect(''),
    );

    return rows.map(mapAnimal);
  }

  // GET by ID
  async findOne(id: number) {
    const [rows] = await this.pool().execute<RowDataPacket[]>(
      this.animalSelect(' WHERE `a`.`animal_id` = ?'),
      [id],
    );

    if (!rows[0]) {
      throw new NotFoundException('Animal not found');
    }

    return mapAnimal(rows[0]);
  }

  // PUT
  async update(id: number, data: unknown) {
    const keys = validateAnimalPayload(data, false);

    if (!keys.length) {
      throw new BadRequestException('No valid fields to update');
    }

    const body = data as AnimalRecord;

    await this.lookupWrite(() => {
      const assignments = keys
        .map((column) => `\`${column}\` = ?`)
        .join(', ');
      const values = keys.map(
        (column) => body[column] as string | number | null,
      );

      return this.pool().execute(
        `UPDATE \`Animal\` SET ${assignments} WHERE \`animal_id\` = ?`,
        [...values, id],
      );
    });

    return this.findOne(id);
  }

  // DELETE
  async remove(id: number) {
    const animal = await this.findOne(id);

    await this.pool().execute(
      'DELETE FROM `Animal` WHERE `animal_id` = ?',
      [id],
    );

    return animal;
  }
}
