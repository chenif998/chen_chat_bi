import postgres from 'postgres';

let client: ReturnType<typeof postgres> | null = null;

export function getDbClient() {
  if (client) return client;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing. Please set it in .env.local.');
  }

  client = postgres(connectionString, { ssl: 'require' });
  return client;
}
