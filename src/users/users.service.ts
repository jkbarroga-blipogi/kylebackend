import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { DatabaseService } from '../database/database.service';
import { translateSqlError } from '../database/sql-errors';
import * as bcrypt from 'bcryptjs';

type Actor = { id: number; role: string };

type UserMutationFields = {
  username?: string;
  password?: string;
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

  async createUser(username: string, password: string, role = 'user') {
    const hashed = await bcrypt.hash(password, 10);

    const result = await this.run<ResultSetHeader>(
      `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
      [username, hashed, role],
    );

    return { id: result.insertId, username, role };
  }

  async findByUsername(username: string) {
    const rows = await this.run<any[]>(
      `SELECT id, username, password, role, refresh_token FROM users WHERE username = ?`,
      [username],
    );

    return rows[0];
  }

  async findById(id: number) {
    const rows = await this.run<any[]>(
      `SELECT id, username, role, created_at FROM users WHERE id = ?`,
      [id],
    );

    return rows[0];
  }

  async getAll() {
    const rows = await this.run<any[]>(
      `SELECT id, username, role, created_at FROM users`,
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
    const values: (string | number)[] = [];

    for (const [key, value] of Object.entries(body)) {
      if ((key === 'username' || key === 'password') && typeof value === 'string' && value.trim()) {
        fields.push(`${key} = ?`);
        values.push(
          key === 'password' ? await bcrypt.hash(value, 10) : value.trim(),
        );
        continue;
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
    const [rows] = await this.run<any[]>(
      `SELECT id, username, role FROM users WHERE refresh_token = ?`,
      [refreshToken],
    );

    return rows[0];
  }
}
