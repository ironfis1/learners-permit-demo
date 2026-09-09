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

// Pivot to public/broadcast traffic (LinkedIn, not a single recruiter link):
// every row now belongs to the visitor session that created it, so
// concurrent visitors get their own private queue/audit-trail/permit-stage
// instead of sharing one global state (and one visitor can no longer
// permanently revoke a category for everyone else). '' (empty string)
// covers rows written before this column existed - they simply belong to
// no session and won't hydrate for any real visitor, which is fine, they
// were seed/dev data.
const ADD_SESSION_ID_COLUMN_SQL = `
ALTER TABLE decisions_log
  ADD COLUMN IF NOT EXISTS session_id TEXT NOT NULL DEFAULT '';
`;

// Staged-autonomy gap fix, v2: stage (learner/supervised/licensed) used to be
// a pure scorecard label - every decision got the identical two-axis review
// regardless of stage, so "Licensed" never actually changed anything. These
// two columns mark whether EACH axis was set automatically rather than by a
// human, tracked separately since the two axes now automate at different
// stages: auto_judgment true means the response was auto-fetched and
// auto-marked Correct the moment it arrived (Supervised or later - see
// autoRespond() in public/index.html), auto_verification true means Verified
// Execution was checked against the scenario's groundTruthExecution instead
// of a human click (Licensed or later - see autoVerify()). Neither flag
// changes what outcome/verified_execution mean or how they're scored - see
// trackRecord()/isExecutionRevoked() in public/index.html, which read the
// same status/verified_execution values regardless of provenance. Default
// false so existing rows (all human-judged, from before this pivot) aren't
// retroactively reclassified.
const ADD_AUTO_PROVENANCE_COLUMNS_SQL = `
ALTER TABLE decisions_log
  ADD COLUMN IF NOT EXISTS auto_judgment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_verification BOOLEAN NOT NULL DEFAULT false;
`;

async function initDb() {
  await query(CREATE_TABLE_SQL);
  await query(ADD_VERIFIED_EXECUTION_COLUMN_SQL);
  await query(ADD_SESSION_ID_COLUMN_SQL);
  await query(ADD_AUTO_PROVENANCE_COLUMNS_SQL);
  console.log("decisions_log table ready (with verified_execution, session_id, auto_judgment, auto_verification columns).");
}

module.exports = { initDb };
