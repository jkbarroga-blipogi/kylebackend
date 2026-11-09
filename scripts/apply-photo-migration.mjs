import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';

dotenv.config({ quiet: true });
const apply = process.argv.includes('--apply');
const sql = await readFile(new URL('../migrations/003-animal-photo.sql', import.meta.url), 'utf8');
const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
const port = Number(DB_PORT || 3306);
if (![DB_HOST, DB_USER, DB_PASSWORD, DB_NAME].every(value => typeof value === 'string' && value) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Configure the backend database environment variables first.');

let connection;
try {
  connection = await mysql.createConnection({ host: DB_HOST, port, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, connectTimeout: 10000 });
  await connection.query('SET SESSION lock_wait_timeout = 10');
  const [columns] = await connection.execute(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Animal' AND COLUMN_NAME = 'image_url'`);
  const hasColumn = columns.length > 0;
  if (hasColumn && columns[0].COLUMN_TYPE !== 'longtext') throw new Error('An unexpected image_url column exists. Review the schema before migrating.');
  if (hasColumn) {
    console.log('Animal photo migration: already applied');
  } else {
    const statement = sql.trim().replace(/;$/, '');
    if (apply) { await connection.query(statement); console.log('Animal photo migration: applied'); }
    else console.log(`Animal photo migration: pending\n${statement};`);
  }
  if (!apply && !hasColumn) console.log('Review complete. Use --apply to execute pending steps.');
  else if (apply && !hasColumn) console.log('Migration applied. Run without --apply to verify all steps are present.');
} catch (error) {
  console.error(error.code ? `Migration failed (${error.code}). Completed DDL steps remain applied.` : error.message);
  process.exitCode = 1;
} finally { if (connection) await connection.end(); }
