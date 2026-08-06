import { neon, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWebsocket } from "drizzle-orm/neon-serverless";

import { getRuntimeEnv } from "@/lib/runtime-env";

import { schema } from "./schema";

function databaseUrl(allowMissing = false) {
  const url = getRuntimeEnv().DATABASE_URL;

  if (!url) {
    if (allowMissing) {
      return "https://placeholder.invalid";
    }

    throw new Error(
      "DATABASE_URL is required. Run `bun setup` or configure your Neon database first."
    );
  }

  return url;
}

function createHttpDatabase(url: string) {
  return drizzleHttp({
    client: neon(url),
    schema,
  });
}

function createTransactionDatabase(pool: Pool) {
  return drizzleWebsocket({
    client: pool,
    schema,
  });
}

export type Database = ReturnType<typeof createHttpDatabase>;
export type TransactionDatabase = ReturnType<typeof createTransactionDatabase>;
export type DatabaseTransaction = Parameters<
  TransactionDatabase["transaction"]
>[0] extends (transaction: infer T, ...args: never[]) => unknown
  ? T
  : never;

export function getDb(options?: { allowMissing?: boolean }) {
  return createHttpDatabase(databaseUrl(options?.allowMissing));
}

export async function withTransaction<T>(
  callback: (transaction: DatabaseTransaction) => Promise<T>
) {
  const pool = new Pool({ connectionString: databaseUrl() });

  try {
    const database = createTransactionDatabase(pool);

    return await database.transaction(callback);
  } finally {
    await pool.end();
  }
}
