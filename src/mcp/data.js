// Read-only data helpers backing the MCP tools. Deliberately reuse the same
// server-side trusted data (SCENARIOS/CATEGORIES) and the same Postgres pool
// that the HTTP API already uses - no new data paths, no new injection
// surface, matching Day 4 Part B's scope decision.
const { query } = require("../db/pool");
const { CATEGORIES, SCENARIOS } = require("../data/scenarios");

const VALID_CATEGORIES = new Set(Object.keys(CATEGORIES));

// Returns a Map of scenarioId -> latest reviewed row, and the full ordered
// (newest-first) list of reviewed rows, both derived from decisions_log.
// A scenario can only be reviewed once in this app's normal flow, but this
// takes the latest row per scenario defensively in case of a re-review.
async function loadReviewedState() {
  const result = await query(
    `SELECT scenario_id, category, recommendation, outcome, stage_at_time, verified_execution, reviewed_at
     FROM decisions_log
     ORDER BY reviewed_at DESC`
  );
  const byScenarioId = new Map();
  for (const row of result.rows) {
    if (!byScenarioId.has(row.scenario_id)) {
      byScenarioId.set(row.scenario_id, row);
    }
  }
  return { byScenarioId, orderedRows: result.rows };
}

function trackRecord(category, byScenarioId) {
  const items = SCENARIOS.filter((s) => s.category === category)
    .map((s) => byScenarioId.get(s.id))
    .filter(Boolean);
  const total = items.length;
  const correct = items.filter((r) => r.outcome === "correct").length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  return { total, correct, accuracy };
}

// Two-Axis Trust Model: Verified Execution is binary and does not average
// with Judgment Accuracy - a single persisted verified_execution='failed'
// row anywhere in a category is an instant, permanent revoke for that
// category, independent of whatever the accuracy percentage says. This is
// now a real, persisted check (src/db/init.js added the column) rather than
// the client-only flag this file's old comment described.
function isExecutionRevoked(category, byScenarioId) {
  return SCENARIOS.some(
    (s) => s.category === category && byScenarioId.get(s.id) && byScenarioId.get(s.id).verified_execution === "failed"
  );
}

function stageFor(category, byScenarioId) {
  if (isExecutionRevoked(category, byScenarioId)) return "revoked";
  const { total, accuracy } = trackRecord(category, byScenarioId);
  if (total >= 4 && accuracy >= 90) return "licensed";
  if (total >= 3 && accuracy >= 70) return "supervised";
  return "learner";
}

async function listPendingDecisions() {
  const { byScenarioId } = await loadReviewedState();
  return SCENARIOS.filter((s) => !byScenarioId.has(s.id)).map((s) => ({
    id: s.id,
    category: s.category,
    location: s.location,
    title: s.title,
  }));
}

async function getDecision(id) {
  const scenario = SCENARIOS.find((s) => s.id === Number(id));
  if (!scenario) return null;
  const { byScenarioId } = await loadReviewedState();
  const reviewed = byScenarioId.get(scenario.id);
  return {
    id: scenario.id,
    category: scenario.category,
    location: scenario.location,
    title: scenario.title,
    context: scenario.context,
    options: scenario.options,
    status: reviewed ? reviewed.outcome : "pending",
    recommendation: reviewed ? reviewed.recommendation : null,
    verifiedExecution: reviewed ? reviewed.verified_execution : null,
    reviewedAt: reviewed ? reviewed.reviewed_at : null,
  };
}

async function getPermitStatus(category) {
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(`Unknown category "${category}". Valid categories: ${[...VALID_CATEGORIES].join(", ")}`);
  }
  const { byScenarioId } = await loadReviewedState();
  const { total, correct, accuracy } = trackRecord(category, byScenarioId);
  const verifiedExecutionFailure = isExecutionRevoked(category, byScenarioId);
  return {
    category,
    // "revoked" is distinct from "learner": a category with 0 reviews (or
    // low accuracy) is legitimately "learner"; a category with a fabricated/
    // failed claimed action is "revoked" - permanently, regardless of
    // accuracy - and that distinction must survive out to this tool, not
    // just the HTTP API, per the Two-Axis Trust Model.
    stage: stageFor(category, byScenarioId),
    totalReviewed: total,
    correct,
    accuracy,
    verifiedExecutionFailure,
  };
}

async function getAuditTrail(category) {
  if (category && !VALID_CATEGORIES.has(category)) {
    throw new Error(`Unknown category "${category}". Valid categories: ${[...VALID_CATEGORIES].join(", ")}`);
  }
  const { orderedRows } = await loadReviewedState();
  const filtered = category ? orderedRows.filter((r) => r.category === category) : orderedRows;
  return filtered.map((row) => {
    const scenario = SCENARIOS.find((s) => s.id === row.scenario_id);
    return {
      id: row.scenario_id,
      category: row.category,
      location: scenario ? scenario.location : null,
      title: scenario ? scenario.title : null,
      recommendation: row.recommendation,
      outcome: row.outcome,
      stageAtTime: row.stage_at_time,
      verifiedExecution: row.verified_execution,
      reviewedAt: row.reviewed_at,
    };
  });
}

module.exports = { listPendingDecisions, getDecision, getPermitStatus, getAuditTrail, VALID_CATEGORIES };
