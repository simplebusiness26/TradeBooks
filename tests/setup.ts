import { config } from 'dotenv';

// Tests always run against the dedicated test database described in .env.test.
config({ path: '.env.test', override: true });
(process.env as Record<string, string>).NODE_ENV = 'test';
