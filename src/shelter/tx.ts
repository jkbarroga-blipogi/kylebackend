import type { PoolConnection } from 'mysql2/promise';
import type { DatabaseService } from '../database/database.service';
import { rethrowDbError } from './validation';

/**
 * Runs one task inside a single transaction on a dedicated connection:
 * begin, run, commit, rollback on failure, always release. This is the
 * only place in the shelter domain touching transaction bookkeeping.
 */
export async function inTx<T>(
  db: DatabaseService,
  task: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn: PoolConnection = await db.getPool().getConnection();

  try {
    await conn.beginTransaction();
    const result = await task(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    rethrowDbError(error);
  } finally {
    conn.release();
  }
}
