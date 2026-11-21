import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

function resolveDatabaseUrl(): string | undefined {
  const raw =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL;
  if (!raw) return undefined;
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
  return trimmed || undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(resolveDatabaseUrl() || process.env.SQL_HOST);
}

export const createPool = () => {
  if (!global._postgresPool) {
    const databaseUrl = resolveDatabaseUrl();
    if (databaseUrl) {
      const lower = databaseUrl.toLowerCase();
      const disableSsl =
        lower.includes('sslmode=disable') || process.env.PGSSLMODE === 'disable';
      const needsSsl =
        !disableSsl &&
        (lower.includes('.render.com') ||
          lower.includes('sslmode=require') ||
          lower.includes('sslmode=no-verify') ||
          lower.includes('ssl=true') ||
          lower.includes('neon.tech') ||
          lower.includes('supabase.') ||
          lower.includes('railway.app') ||
          process.env.PGSSLMODE === 'require');

      global._postgresPool = new Pool({
        connectionString: databaseUrl,
        ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
        max: 12,
        connectionTimeoutMillis: 15000,
      });
    } else {
      global._postgresPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        max: 12,
        connectionTimeoutMillis: 15000,
      });
    }

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
