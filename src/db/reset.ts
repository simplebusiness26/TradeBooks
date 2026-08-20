import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { createDatabase } from './client';

/**
 * Drops every application table and the migration journal so `db:migrate`
 * rebuilds from scratch. Development helper only.
 */
async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DB_RESET !== 'yes') {
    console.error('Refusing to reset a production database. Set ALLOW_DB_RESET=yes to override.');
    process.exit(1);
  }
  const db = createDatabase();
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema public cascade`);
  await db.execute(sql`create schema public`);
  console.log('Database reset. Run `npm run db:migrate` next.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
