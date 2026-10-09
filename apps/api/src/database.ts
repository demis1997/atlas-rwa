import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
export interface Database {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  close(): Promise<void>;
}
export async function openDatabase(url?: string): Promise<Database> {
  if (url) {
    // A dedicated connection keeps BEGIN/COMMIT on one session. One local indexer owns writes.
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    return {
      query: (sql, values) => client.query(sql, values),
      close: () => client.end(),
    };
  }
  const db = new PGlite(process.env.ATLAS_DB_PATH || undefined);
  await db.waitReady;
  return {
    query: (sql, values) => db.query(sql, values),
    close: () => db.close(),
  };
}
export async function migrate(db: Database) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS blocks (chain_id text NOT NULL, number bigint NOT NULL, hash text NOT NULL, parent_hash text NOT NULL, PRIMARY KEY(chain_id,number))`,
    `CREATE TABLE IF NOT EXISTS events (chain_id text NOT NULL, block_number bigint NOT NULL, block_hash text NOT NULL, tx_hash text NOT NULL, log_index integer NOT NULL, address text NOT NULL, name text NOT NULL, args jsonb NOT NULL, PRIMARY KEY(chain_id,block_hash,tx_hash,log_index))`,
    `CREATE TABLE IF NOT EXISTS transactions (chain_id text NOT NULL, hash text NOT NULL, status text NOT NULL CHECK(status IN ('submitted','pending','confirmed','reverted','reorganized')), block_number bigint, block_hash text, PRIMARY KEY(chain_id,hash))`,
    `CREATE TABLE IF NOT EXISTS investors (wallet text PRIMARY KEY, label text NOT NULL, reference text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS audit (id bigserial PRIMARY KEY, action text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE INDEX IF NOT EXISTS events_order ON events(chain_id,block_number,log_index)`,
  ];
  for (const sql of statements) await db.query(sql);
}
