import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  pool!: mysql.Pool;

  async onModuleInit() {
    // Kailangan talagang i-set ang mga env vars (local .env o Render Environment tab) —
    // wala nang "sikretong fallback" na credentials na iba palang database ang tatablan.
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

    if (!DB_HOST || !DB_USER || !DB_PASSWORD) {
      throw new Error(
        'Missing DB env vars — set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (.env locally / Render Environment tab)',
      );
    }

    this.pool = mysql.createPool({
      host: DB_HOST,
      port: +(DB_PORT || 3306),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      connectTimeout: 10000, // huwag munang mag-on ng "walang katapusan na pag-hang"
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // optional: test connection
    const conn = await this.pool.getConnection();
    await conn.ping();
    conn.release();

    console.log('MySQL pool created');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  getPool() {
    return this.pool;
  }
}