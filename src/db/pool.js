const { Pool } = require("pg");

// Upsun doesn't inject a single connection-string env var - it exposes
// discrete POSTGRESQL_* vars per the "postgresql" relationship in
// .upsun/config.yaml. The .environment file at the app root (auto-sourced
// by Upsun) assembles those into DATABASE_URL, per Upsun's documented
// pattern for Node apps. Locally, set DATABASE_URL directly in .env against
// whatever Postgres instance you're using for dev.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "No DATABASE_URL set - persistence endpoints will fail until a Postgres connection string is configured."
  );
}

const pool = connectionString
  ? new Pool({ connectionString })
  : null;

async function query(text, params) {
  if (!pool) {
    throw new Error("Database is not configured (no connection string).");
  }
  return pool.query(text, params);
}

module.exports = { pool, query };
