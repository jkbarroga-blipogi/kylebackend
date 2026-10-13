import { Injectable, NotFoundException } from '@nestjs/common';
import { ResultSetHeader } from 'mysql2';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CategoryService {
  constructor(private db: DatabaseService) {}

  private pool() {
    return this.db.getPool();
  }

  async createCategory(data: { name: string; description?: string }) {
    const { name, description = null } = data;

    const [result] = await this.pool().execute<ResultSetHeader>(
      `INSERT INTO categories (name, description) VALUES (?, ?)`,
      [name, description],
    );

    return { id: result.insertId, name, description };
  }

  async findById(id: number) {
    const [rows] = await this.pool().execute<any[]>(
      `SELECT id, name, description, created_at FROM categories WHERE id = ?`,
      [id],
    );

    if (!rows[0]) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return rows[0];
  }

  async getAll() {
    const [rows] = await this.pool().execute<any[]>(
      `SELECT id, name, description, created_at FROM categories`,
    );

    return rows;
  }

  async updateCategory(
    id: number,
    partial: { name?: string; description?: string },
  ) {
    const fields: string[] = [];
    const values: any[] = [];

    if (partial.name) {
      fields.push('name = ?');
      values.push(partial.name);
    }

    if (partial.description !== undefined) {
      fields.push('description = ?');
      values.push(partial.description);
    }

    if (fields.length === 0) return await this.findById(id);

    values.push(id);

    const sql = `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`;

    await this.pool().execute(sql, values);

    return this.findById(id);
  }

  async deleteCategory(id: number) {
    const [res] = await this.pool().execute<any>(
      `DELETE FROM categories WHERE id = ?`,
      [id],
    );

    return { affectedRows: res.affectedRows };
  }
}