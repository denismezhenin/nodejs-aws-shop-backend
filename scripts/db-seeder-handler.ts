import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import type {
  CdkCustomResourceEvent,
  CdkCustomResourceResponse,
} from "aws-lambda";

const SEED_VERSION = "cart-seed-v2";

async function tryConnect(database: string): Promise<Client> {
  const host = process.env.DB_HOST!;
  const port = Number(process.env.DB_PORT ?? 5432);
  const user = process.env.DB_USER!;
  process.stdout.write(`connecting to ${user}@${host}:${port}/${database}\n`);

  const MAX_ATTEMPTS = 8;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    const client = new Client({
      host,
      port,
      user,
      password: process.env.DB_PASSWORD,
      database,
      connectionTimeoutMillis: 10_000,
      ssl: { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      process.stdout.write(`connected to ${database} on attempt ${attempt}\n`);
      return client;
    } catch (err) {
      lastErr = err;
      const elapsed = Date.now() - started;
      process.stderr.write(
        `connect attempt ${attempt} failed after ${elapsed}ms: ${(err as Error).message}\n`,
      );
      try {
        await client.end();
      } catch {}
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
  }
  throw lastErr;
}

async function ensureDatabase(targetDb: string): Promise<void> {
  // CREATE DATABASE cannot run inside a transaction and must be issued from a
  // session connected to a *different* database, so we bootstrap via "postgres".
  const admin = await tryConnect("postgres");
  try {
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [targetDb],
    );
    if (exists.rowCount === 0) {
      process.stdout.write(`creating database ${targetDb}\n`);
      // pg_database.datname is an identifier; quote it to be safe.
      await admin.query(`CREATE DATABASE "${targetDb.replace(/"/g, '""')}"`);
    } else {
      process.stdout.write(`database ${targetDb} already exists\n`);
    }
  } finally {
    await admin.end();
  }
}

async function applySeed(): Promise<number> {
  const seedSql = readFileSync(join(__dirname, "seed.sql"), "utf8");
  const targetDb = process.env.DB_NAME!;
  await ensureDatabase(targetDb);
  const client = await tryConnect(targetDb);
  try {
    await client.query(seedSql);
  } finally {
    await client.end();
  }
  return seedSql.length;
}

export const handler = async (
  event: CdkCustomResourceEvent,
): Promise<CdkCustomResourceResponse> => {
  console.log(`seeder invoked: ${event.RequestType}`);
  if (event.RequestType === "Delete") {
    return { PhysicalResourceId: SEED_VERSION };
  }
  const bytes = await applySeed();
  console.log(`seed complete, ${bytes} bytes applied`);
  return {
    PhysicalResourceId: SEED_VERSION,
    Data: { bytes: String(bytes) },
  };
};
