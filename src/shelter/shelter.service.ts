import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { DatabaseService } from '../database/database.service';

type TableConfig = {
  table: string;
  id: string;
  required: string[];
  optional: string[];
  defaults?: string[];
};

const TABLES: Record<string, TableConfig> = {
  adopter: {
    table: 'Adopter',
    id: 'adopter_id',
    required: ['first_name', 'last_name', 'phone', 'address'],
    optional: ['email'],
  },

  staff: {
    table: 'Staff',
    id: 'staff_id',
    required: ['first_name', 'last_name', 'position'],
    optional: ['phone', 'email'],
  },

  'adoption-application': {
    table: 'Adoption_Application',
    id: 'application_id',
    required: [
      'animal_id',
      'adopter_id',
      'staff_id',
      'application_date',
    ],
    optional: [],
    defaults: ['application_status'],
  },

  'medical-record': {
    table: 'Medical_Record',
    id: 'medical_record_id',
    required: ['animal_id', 'staff_id', 'record_date'],
    optional: ['diagnosis', 'treatment', 'notes'],
  },

  adoption: {
    table: 'Adoption',
    id: 'adoption_id',
    required: [
      'application_id',
      'animal_id',
      'adopter_id',
      'staff_id',
      'adoption_date',
    ],
    optional: [],
  },
};

@Injectable()
export class ShelterService {
  constructor(private readonly db: DatabaseService) {}

  private config(resource: string) {
    if (!Object.prototype.hasOwnProperty.call(TABLES, resource)) {
      throw new NotFoundException('Unknown resource');
    }

    return TABLES[resource];
  }

  private checkId(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('ID must be a positive integer');
    }
  }

  private fields(
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

        this.checkId(value);
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

  private async query<T extends RowDataPacket[] | ResultSetHeader>(
    sql: string,
    values: (string | number | null)[] = [],
  ): Promise<T> {
    try {
      const [result] = await this.db.getPool().execute<T>(
        sql,
        values,
      );

      return result;
    } catch (error) {
      const code = (error as { code?: string }).code;

      if (code === 'ER_DUP_ENTRY') {
        throw new ConflictException('A unique value is already used');
      }

      if (code === 'ER_NO_REFERENCED_ROW_2') {
        throw new BadRequestException(
          'A referenced ID does not exist',
        );
      }

      if (code === 'ER_ROW_IS_REFERENCED_2') {
        throw new ConflictException(
          'Another record still uses this record',
        );
      }

      if (
        [
          'ER_DATA_TOO_LONG',
          'ER_BAD_NULL_ERROR',
          'ER_TRUNCATED_WRONG_VALUE',
          'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
        ].includes(code ?? '')
      ) {
        throw new BadRequestException(
          'Check field values, lengths, and dates',
        );
      }

      throw error;
    }
  }

  // GET: all records
  findAll(resource: string) {
    const c = this.config(resource);

    return this.query<RowDataPacket[]>(
      `SELECT * FROM \`${c.table}\` ORDER BY \`${c.id}\``,
    );
  }

  // GET: one record
  async findOne(resource: string, id: number) {
    const c = this.config(resource);
    this.checkId(id);

    const rows = await this.query<RowDataPacket[]>(
      `SELECT * FROM \`${c.table}\` WHERE \`${c.id}\` = ?`,
      [id],
    );

    if (!rows[0]) {
      throw new NotFoundException('Record not found');
    }

    return rows[0];
  }

  // POST
  async create(resource: string, body: unknown) {
    const c = this.config(resource);
    const { keys, values } = this.fields(c, body, true);

    const columns = keys.map(key => `\`${key}\``).join(', ');
    const placeholders = keys.map(() => '?').join(', ');

    const result = await this.query<ResultSetHeader>(
      `INSERT INTO \`${c.table}\` (${columns})
       VALUES (${placeholders})`,
      values,
    );

    return this.findOne(resource, result.insertId);
  }

  // PUT: update the supplied fields
  async update(resource: string, id: number, body: unknown) {
    const c = this.config(resource);
    const { keys, values } = this.fields(c, body, false);

    await this.findOne(resource, id);

    const assignments = keys
      .map(key => `\`${key}\` = ?`)
      .join(', ');

    await this.query<ResultSetHeader>(
      `UPDATE \`${c.table}\`
       SET ${assignments}
       WHERE \`${c.id}\` = ?`,
      [...values, id],
    );

    return this.findOne(resource, id);
  }

  // DELETE
  async remove(resource: string, id: number) {
    const c = this.config(resource);
    this.checkId(id);

    const result = await this.query<ResultSetHeader>(
      `DELETE FROM \`${c.table}\` WHERE \`${c.id}\` = ?`,
      [id],
    );

    if (!result.affectedRows) {
      throw new NotFoundException('Record not found');
    }

    return { deleted: true, id };
  }
}