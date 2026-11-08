import { vi } from "vitest";
import type { Pool } from "mysql2/promise";
import { DatabaseService } from "../../src/database/database.service";

export type CannedResult =
  | { kind: "rows"; rows: Record<string, unknown>[] }
  | { kind: "header"; insertId: number; affectedRows: number };

/** Normalizes a captured SQL string: collapses whitespace for stable assert equals. */
export function normSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

export type CapturedQuery = { sql: string; params: unknown[] };

function mkConnection() {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn(),
  };
}

/** Inbox of canned results, consumed one per execute call, in call order. */
export function cannedDb(results: CannedResult[]) {
  const conn = mkConnection();
  let callIndex = 0;
  const captured: CapturedQuery[] = [];

  conn.execute.mockImplementation(
    (sql: unknown, params: unknown[] = []) => {
      captured.push({
        sql: normSql(String(sql)),
        params: [...params],
      });

      const result = results[callIndex];
      callIndex += 1;

      if (!result) {
        throw new Error(`Unhandled canned slot for call ${callIndex}`);
      }

      if (result.kind === "rows") {
        return Promise.resolve([result.rows, []]);
      }

      return Promise.resolve([
        { insertId: result.insertId, affectedRows: result.affectedRows },
        [],
      ]);
    },
  );

  const pool = {
    execute: vi.fn((sql: unknown, params: unknown[] = []) =>
      (conn.execute as unknown as (...execArgs: unknown[]) => unknown)(sql, params),
    ),
    getConnection: vi.fn(async () => conn),
    end: vi.fn(async () => undefined),
  } as unknown as Pool;

  const db = new DatabaseService();
  (db as { pool: Pool }).pool = pool;

  return { db, conn, captured, pool };
}
