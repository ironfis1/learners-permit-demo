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

// Two-Axis Trust Model gap fix: Verified Execution is a second, binary,
// orthogonal axis from Judgment Accuracy (outcome above). It was never
// persisted - "revoke" used to be a client-only flag that vanished on
// reload. This column makes a fabrication finding durable: 'confirmed' is
// the default (claimed action really happened), 'failed' means a claimed
// action was checked against real state and did NOT happen. A single
// 'failed' row for a category is a permanent, instant revoke for that
// category - see stageFor()/isExecutionRevoked() in public/index.html and
// getPermitStatus() in src/mcp/data.js, both of which now check this column
// before ever consulting the accuracy percentage.
//
// ADD COLUMN IF NOT EXISTS keeps this idempotent on every boot, same
// no-migration-framework posture as the table above; existing rows default
// to 'confirmed' so pre-existing history isn't retroactively flagged.
const ADD_VERIFIED_EXECUTION_COLUMN_SQL = `
ALTER TABLE decisions_log
  ADD COLUMN IF NOT EXISTS verified_execution TEXT NOT NULL DEFAULT 'confirmed';
`;

async function initDb() {
  await query(CREATE_TABLE_SQL);
  await query(ADD_VERIFIED_EXECUTION_COLUMN_SQL);
  console.log("decisions_log table ready (with verified_execution column).");
}

module.exports = { initDb };
