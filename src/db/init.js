const { query } = require("./pool");

// Small init script, run on boot. No migration framework at this scale - one
// table, IF NOT EXISTS is enough.
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS decisions_log (
  id SERIAL PRIMARY KEY,
  scenario_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  recommendation JSONB NOT NULL,
  outcome TEXT NOT NULL,
  stage_at_time TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function initDb() {
  await query(CREATE_TABLE_SQL);
  console.log("decisions_log table ready.");
}

module.exports = { initDb };
