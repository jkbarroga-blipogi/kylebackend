import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';

dotenv.config({ quiet: true });
const apply = process.argv.includes('--apply');
const sql = await readFile(new URL('../migrations/001-adopter-self-service.sql', import.meta.url), 'utf8');
const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean);
const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
const port = Number(DB_PORT || 3306);
if (![DB_HOST, DB_USER, DB_PASSWORD, DB_NAME].every(value => typeof value === 'string' && value) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Configure the backend database environment variables first.');

let connection;
try {
  connection = await mysql.createConnection({ host: DB_HOST, port, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, connectTimeout: 10000 });
  await connection.query('SET SESSION lock_wait_timeout = 10');
  const [columns] = await connection.execute(`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'Adopter' AND COLUMN_NAME = 'user_id')
    OR (TABLE_NAME = 'Adoption_Application' AND COLUMN_NAME = 'staff_id'))`);
  const [indexes] = await connection.execute(`SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Adopter' AND INDEX_NAME = 'uq_adopter_user'`);
  const [foreignKeys] = await connection.execute(`SELECT REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Adopter' AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME IS NOT NULL`);
  const owner = columns.find(column => column.TABLE_NAME === 'Adopter');
  const staff = columns.find(column => column.TABLE_NAME === 'Adoption_Application');
  if (!staff || staff.COLUMN_TYPE !== 'int') throw new Error('Unexpected application staff column. Review the schema before migrating.');
  if (owner && (owner.COLUMN_TYPE !== 'int' || owner.IS_NULLABLE !== 'YES' || indexes.length !== 1 || indexes[0].NON_UNIQUE !== 0 || indexes[0].COLUMN_NAME !== 'user_id')) throw new Error('An unexpected ownership column or index exists. Review the schema before migrating.');
  if (foreignKeys.length && (foreignKeys.length !== 1 || foreignKeys[0].REFERENCED_TABLE_NAME !== 'users' || foreignKeys[0].REFERENCED_COLUMN_NAME !== 'id')) throw new Error('An unexpected ownership foreign key exists.');
  const needed = [!owner, !foreignKeys.length, staff.IS_NULLABLE !== 'YES'];
  for (let index = 0; index < statements.length; index++) {
    if (!needed[index]) { console.log(`Step ${index + 1}: already applied`); continue; }
    if (apply) { await connection.query(statements[index]); console.log(`Step ${index + 1}: applied`); }
    else console.log(`Step ${index + 1}: pending\n${statements[index]};`);
  }
  if (!apply) console.log('Review complete. Use --apply to execute pending steps.');
  else console.log('Migration applied. Run without --apply to verify all steps are present.');
} catch (error) {
  // Driver messages can contain connection details. Return only their stable code.
  console.error(error.code ? `Migration failed (${error.code}). Completed DDL steps remain applied.` : error.message);
  process.exitCode = 1;
} finally { if (connection) await connection.end(); }
