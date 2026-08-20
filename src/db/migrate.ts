import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { loadEnv } from '@/lib/env';

async function main() {
  const environment = loadEnv();
  const client = postgres(environment.DATABASE_URL, { max: 1, onnotice: () => {} });
  const database = drizzle(client);
  await migrate(database, { migrationsFolder: './drizzle' });
  await client.end();
  console.log('Migrations applied.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
