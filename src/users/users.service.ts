import { Injectable, NotFoundException } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private db: DatabaseService) {}

  private pool() {
    return this.db.getPool();
  }

  async createUser(username: string, password: string, role = 'user') {
    const hashed = await bcrypt.hash(password, 10);

    const [result] = await this.pool().execute<ResultSetHeader>(
      `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
      [username, hashed, role],
    );

    return { id: result.insertId, username, role };
  }

  async findByUsername(username: string) {
    const [rows] = await this.pool().execute<any[]>(
      `SELECT id, username, password, role, refresh_token FROM users WHERE username = ?`,
      [username],
    );

    return rows[0];
  }

  async findById(id: number) {
    const [rows] = await this.pool().execute<any[]>(
      `SELECT id, username, role, created_at FROM users WHERE id = ?`,
      [id],
    );

    return rows[0];
  }

  async getAll() {
    const [rows] = await this.pool().execute<any[]>(
      `SELECT id, username, role, created_at FROM users`,
    );

    return rows;
  }

  async updateUser(
    id: number,
    partial: { username?: string; password?: string; role?: string },
  ) {
    const fields: string[] = [];
    const values: any[] = [];

    if (partial.username) {
      fields.push('username = ?');
      values.push(partial.username);
    }

    if (partial.password) {
      fields.push('password = ?');
      values.push(await bcrypt.hash(partial.password, 10));
    }

    if (partial.role) {
      fields.push('role = ?');
      values.push(partial.role);
    }

    if (fields.length === 0) return await this.findById(id);

    values.push(id);

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;

    await this.pool().execute(sql, values);

    return this.findById(id);
  }

  async deleteUser(id: number) {
    const [res] = await this.pool().execute<any>(
      `DELETE FROM users WHERE id = ?`,
      [id],
    );

    return { affectedRows: res.affectedRows };
  }

  async setRefreshToken(id: number, refreshToken: string | null) {
    await this.pool().execute(
      `UPDATE users SET refresh_token = ? WHERE id = ?`,
      [refreshToken, id],
    );
  }

  async findByRefreshToken(refreshToken: string) {
    const [rows] = await this.pool().execute<any[]>(
      `SELECT id, username, role FROM users WHERE refresh_token = ?`,
      [refreshToken],
    );

    return rows[0];
  }
}