import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import { schema } from "./schema";

function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type Database = ReturnType<typeof createDatabase>;
export type BatchStatement = Parameters<Database["batch"]>[0][number];

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "The DB binding is missing. Run `wrangler dev`, or check d1_databases in wrangler.jsonc."
    );
  }

  return createDatabase(env.DB);
}

/**
 * D1 has no interactive transaction. A batch is the only atomic unit, and every
 * statement in it must be known before the first one runs. When any statement
 * fails, D1 rolls the whole batch back.
 *
 * Guards therefore live in the schema rather than in a `WHERE` clause: a `WHERE`
 * that matches nothing succeeds quietly, while a violated constraint aborts the
 * batch. See ADR-0016.
 */
export function runBatch(statements: BatchStatement[]) {
  if (statements.length === 0) {
    return Promise.resolve([]);
  }

  return getDb().batch(statements as [BatchStatement, ...BatchStatement[]]);
}
