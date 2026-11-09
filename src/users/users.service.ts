import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { DatabaseService } from '../database/database.service';
import { translateSqlError } from '../database/sql-errors';
import * as bcrypt from 'bcryptjs';

type Actor = { id: number; role: string };

type UserMutationFields = {
  username?: string;
  password?: string;
  email?: string | null;
};

@Injectable()
export class UsersService {
  constructor(private db: DatabaseService) {}

  private pool() {
    return this.db.getPool();
  }

  /** Single execution path for user queries: maps driver errors to HTTP outcomes. */
  private async run<T extends RowDataPacket[] | ResultSetHeader>(
    sql: string,
    values: (string | number | null)[] = [],
  ): Promise<T> {
    try {
      const [result] = await this.pool().execute<T>(sql, values);
      return result;
    } catch (error) {
      const mapped = translateSqlError(error);

      if (mapped !== null) {
        throw mapped;
      }

      throw error;
    }
  }

  async createUser(username: string, password: string, email?: string, role = 'user') {
    const hashed = await bcrypt.hash(password, 10);
    const normalizedEmail = email?.trim().toLowerCase() || null;

    const result = await this.run<ResultSetHeader>(
      `INSERT INTO users (username, password, role, email) VALUES (?, ?, ?, ?)`,
      [username, hashed, role, normalizedEmail],
    );

    return { id: result.insertId, username, email: normalizedEmail, role };
  }

  async findByUsername(username: string) {
    return this.findByIdentifier(username);
  }

  async findByIdentifier(identifier: string) {
    const loginId = identifier.trim();
    const rows = await this.run<any[]>(
      `SELECT id, username, email, password, role, refresh_token FROM users WHERE username = ? OR email = ?`,
      [loginId, loginId.toLowerCase()],
    );

    return rows[0];
  }

  async findById(id: number) {
    const rows = await this.run<any[]>(
      `SELECT id, username, email, role, created_at FROM users WHERE id = ?`,
      [id],
    );

    return rows[0];
  }

  async getAll() {
    const rows = await this.run<any[]>(
      `SELECT id, username, email, role, created_at FROM users`,
    );

    return rows;
  }

  /**
   * Roles are assigned through the token layer only. HTTP clients may
   * change their own username and password; admins may do it for others.
   */
  async updateUser(
    id: number,
    partial: UserMutationFields,
    actor: Actor,
  ) {
    if (actor.role !== 'admin' && actor.id !== id) {
      throw new NotFoundException('User not found');
    }

    const body = (partial ?? {}) as Record<string, unknown>;
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(body)) {
      if ((key === 'username' || key === 'password') && typeof value === 'string' && value.trim()) {
        fields.push(`${key} = ?`);
        values.push(
          key === 'password' ? await bcrypt.hash(value, 10) : value.trim(),
        );
        continue;
      }

      if (key === 'email') {
        if (value === null) {
          fields.push('email = ?');
          values.push(null);
          continue;
        }
        if (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
          fields.push('email = ?');
          values.push(value.trim().toLowerCase());
          continue;
        }
        throw new BadRequestException('Unknown field: email');
      }

      throw new BadRequestException(`Unknown field: ${key}`);
    }

    if (fields.length === 0) return await this.findById(id);

    values.push(id);

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

    await this.run(sql, values);

    return this.findById(id);
  }

  async deleteUser(id: number) {
    const res = await this.run<any>(
      `DELETE FROM users WHERE id = ?`,
      [id],
    );

    return { affectedRows: res.affectedRows };
  }

  async setRefreshToken(id: number, refreshToken: string | null) {
    await this.run(
      `UPDATE users SET refresh_token = ? WHERE id = ?`,
      [refreshToken, id],
    );
  }

  async findByRefreshToken(refreshToken: string) {
    const rows = await this.run<any[]>(
      `SELECT id, username, role FROM users WHERE refresh_token = ?`,
      [refreshToken],
    );

    return rows[0];
  }
}
