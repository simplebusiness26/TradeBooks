import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString?: string) {
  const url = connectionString ?? env().DATABASE_URL;
  const client = postgres(url, {
    max: env().NODE_ENV === 'test' ? 4 : 10,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  });
  return drizzle(client, { schema, casing: 'snake_case' });
}

/**
 * Module-level singleton. Next.js hot reload re-evaluates modules, so the
 * connection pool is stashed on globalThis in development.
 */
const globalForDb = globalThis as unknown as { __tradebooksDb?: Database };

export function getDb(): Database {
  if (!globalForDb.__tradebooksDb) {
    globalForDb.__tradebooksDb = createDatabase();
  }
  return globalForDb.__tradebooksDb;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
}) as Database;
