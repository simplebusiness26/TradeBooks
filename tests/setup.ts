import { config } from 'dotenv';

// Tests always run against the dedicated test database described in .env.test.
config({ path: '.env.test', override: true });
process.env.NODE_ENV = 'test';
