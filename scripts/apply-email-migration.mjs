import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';

dotenv.config({ quiet: true });
const apply = process.argv.includes('--apply');
const sql = await readFile(new URL('../migrations/002-users-email.sql', import.meta.url), 'utf8');
const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
const port = Number(DB_PORT || 3306);
if (![DB_HOST, DB_USER, DB_PASSWORD, DB_NAME].every(value => typeof value === 'string' && value) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Configure the backend database environment variables first.');

let connection;
try {
  connection = await mysql.createConnection({ host: DB_HOST, port, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, connectTimeout: 10000 });
  await connection.query('SET SESSION lock_wait_timeout = 10');
  const [columns] = await connection.execute(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email'`);
  const [indexes] = await connection.execute(`SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_email'`);
  const hasColumn = columns.length > 0;
  const hasIndex = indexes.length > 0;
  if (hasColumn && columns[0].COLUMN_TYPE !== 'varchar(255)') throw new Error('An unexpected email column exists. Review the schema before migrating.');
  if (hasColumn && hasIndex) {
    console.log('Email migration: already applied');
  } else if (hasColumn && !hasIndex) {
    const statement = 'ALTER TABLE `users` ADD UNIQUE KEY `uq_users_email` (`email`)';
    if (apply) { await connection.query(statement); console.log('Email index: applied'); }
    else console.log(`Email index: pending\n${statement};`);
  } else {
    const statement = sql.trim().replace(/;$/, '');
    if (apply) { await connection.query(statement); console.log('Email migration: applied'); }
    else console.log(`Email migration: pending\n${statement};`);
  }
  if (!apply && !(hasColumn && hasIndex)) console.log('Review complete. Use --apply to execute pending steps.');
  else if (apply) console.log('Migration applied. Run without --apply to verify all steps are present.');
} catch (error) {
  console.error(error.code ? `Migration failed (${error.code}). Completed DDL steps remain applied.` : error.message);
  process.exitCode = 1;
} finally { if (connection) await connection.end(); }
