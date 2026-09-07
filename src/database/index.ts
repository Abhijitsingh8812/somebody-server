import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { config } from '../config';

// Database connection factory for Neon PostgreSQL
let dbClient: ReturnType<typeof drizzle<typeof schema>> | null = null;

export const getDb = () => {
  if (dbClient) return dbClient;

  if (!config.database.url) {
    console.warn('DATABASE_URL is not configured. Database operations will require DATABASE_URL in .env');
  }

  const queryClient = postgres(config.database.url || 'postgres://placeholder:placeholder@localhost:5432/placeholder', {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  });

  dbClient = drizzle(queryClient, { schema });
  return dbClient;
};

export { schema };
