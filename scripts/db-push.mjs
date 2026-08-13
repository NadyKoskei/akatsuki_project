#!/usr/bin/env node
/**
 * Applies lib/db/schema.sql to the database in DATABASE_URL.
 *
 *   npm run db:push
 *
 * The schema is idempotent, so running it repeatedly is safe — it's the normal
 * way to apply a change. Run it locally or from CI; the app never issues DDL
 * at request time.
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

// Load .env without a dependency — enough for KEY=value lines.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const url = process.env.DATABASE_URL?.trim();

if (!url || /^your_/i.test(url)) {
  console.error(
    "DATABASE_URL is not set.\n\n" +
      "Supabase: Project Settings -> Database -> Connection string -> URI,\n" +
      "then put it in .env (local) and in the Vercel environment variables (deployed).\n" +
      "Use the connection-pooler URI (port 6543) for serverless.",
  );
  process.exit(1);
}

const schemaPath = path.join(process.cwd(), "lib", "db", "schema.sql");
if (!fs.existsSync(schemaPath)) {
  console.error(`Couldn't find the schema at ${schemaPath}`);
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, "utf8");
const sql = postgres(url, {
  prepare: false,
  ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
  max: 1,
  connect_timeout: 20,
  // DDL arrives as one multi-statement script.
  onnotice: () => {},
});

try {
  console.log("Applying lib/db/schema.sql …");
  await sql.unsafe(schema);

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'chroma_%'
    order by table_name`;

  console.log(`\nDone. ${tables.length} tables present:`);
  for (const t of tables) console.log(`  - ${t.table_name}`);
  console.log("\nChroma will use Postgres wherever DATABASE_URL is set.");
} catch (err) {
  console.error("\nSchema push failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
