const express = require("express");
const { query } = require("../db/pool");
const { SCENARIOS } = require("../data/scenarios");
const { requireSession } = require("../middleware/session");

const router = express.Router();

const VALID_CATEGORIES = new Set(Object.keys(require("../data/scenarios").CATEGORIES));
const VALID_OUTCOMES = new Set(["correct", "incorrect"]);
// Two-Axis Trust Model: Verified Execution is binary and separate from the
// Judgment Accuracy outcome above - see src/db/init.js for why this column
// exists and public/index.html's stageFor()/isExecutionRevoked() for how a
// single 'failed' row permanently revokes a category regardless of accuracy.
const VALID_VERIFIED_EXECUTION = new Set(["confirmed", "failed"]);

// GET /api/state - hydrates the frontend on page load. Returns reviewed
// decisions only (pending decisions have no server-side row - the server
// never stores in-flight recommendations, only reviewed outcomes). Also
// returns revokedCategories: categories with at least one persisted
// verified_execution='failed' row - the client uses this (plus the MCP
// get_permit_status tool, see src/mcp/data.js) to distinguish "revoked for
// a fabricated/failed claimed action" from "just low accuracy," both of
// which are visually distinct states now.
router.get("/state", async (req, res) => {
  try {
    const result = await query(
      `SELECT scenario_id, category, recommendation, outcome, stage_at_time, verified_execution, reviewed_at
       FROM decisions_log
       ORDER BY reviewed_at DESC`
    );
    const reviewed = result.rows.map((row) => ({
      scenarioId: row.scenario_id,
      category: row.category,
      recommendation: row.recommendation,
      outcome: row.outcome,
      stageAtTime: row.stage_at_time,
      verifiedExecution: row.verified_execution,
      reviewedAt: row.reviewed_at,
    }));
    const revokedCategories = [...new Set(
      reviewed.filter((r) => r.verifiedExecution === "failed").map((r) => r.category)
    )];
    res.json({ reviewed, revokedCategories });
  } catch (err) {
    res.status(502).json({ error: err.message || "Couldn't load state." });
  }
});

// POST /api/review - persists a reviewed decision. Session-gated (Day 2),
// same as the other mutating route. Not rate-limited the way the Anthropic
// call is - this doesn't hit any paid API, and legitimate use can mark up
// to 16 decisions in a single sitting.
router.post("/review", requireSession, express.json(), async (req, res) => {
  const { id, outcome, recommendation, stageAtTime, verifiedExecution } = req.body || {};
  const scenarioId = Number(id);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);

  if (!scenario) {
    return res.status(400).json({ error: "Unknown or missing scenario id." });
  }
  if (!VALID_OUTCOMES.has(outcome)) {
    return res.status(400).json({ error: "outcome must be 'correct' or 'incorrect'." });
  }
  if (
    !recommendation ||
    typeof recommendation.recommendation !== "string" ||
    typeof recommendation.reasoning !== "string" ||
    typeof recommendation.confidence !== "number"
  ) {
    return res.status(400).json({ error: "recommendation is missing or malformed." });
  }
  if (typeof stageAtTime !== "string" || !["learner", "supervised", "licensed", "revoked"].includes(stageAtTime)) {
    return res.status(400).json({ error: "stageAtTime is missing or invalid." });
  }
  if (!VALID_CATEGORIES.has(scenario.category)) {
    return res.status(400).json({ error: "Unknown category." });
  }
  // Two-Axis Trust Model: Verified Execution is a separate, binary field
  // from `outcome` (Judgment Accuracy) above - they are not conflated into
  // one status. Default to 'confirmed' (no fabrication claimed) for callers
  // that don't send it, but reject anything sent that isn't one of the two
  // valid values - this is the field a single "failed" on ever instantly
  // and permanently revokes the category (see GET /api/state and
  // get_permit_status in src/mcp/data.js).
  const resolvedVerifiedExecution = verifiedExecution === undefined ? "confirmed" : verifiedExecution;
  if (!VALID_VERIFIED_EXECUTION.has(resolvedVerifiedExecution)) {
    return res.status(400).json({ error: "verifiedExecution must be 'confirmed' or 'failed'." });
  }

  try {
    await query(
      `INSERT INTO decisions_log (scenario_id, category, recommendation, outcome, stage_at_time, verified_execution)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [scenario.id, scenario.category, JSON.stringify(recommendation), outcome, stageAtTime, resolvedVerifiedExecution]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message || "Couldn't save the review." });
  }
});

// POST /api/admin/reset - operational control, not a user feature. Not
// linked from any nav. Truncates the audit history for demo repeatability -
// this also clears any verified_execution='failed' rows, so a permanently
// revoked category is un-revoked by a fresh demo reset, same as every other
// piece of persisted state.
router.post("/admin/reset", requireSession, async (req, res) => {
  try {
    await query("TRUNCATE TABLE decisions_log");
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message || "Couldn't reset." });
  }
});

module.exports = router;
