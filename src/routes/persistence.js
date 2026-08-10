const express = require("express");
const { query } = require("../db/pool");
const { SCENARIOS } = require("../data/scenarios");
const { requireSession } = require("../middleware/session");

const router = express.Router();

const VALID_CATEGORIES = new Set(Object.keys(require("../data/scenarios").CATEGORIES));
const VALID_OUTCOMES = new Set(["correct", "incorrect"]);

// GET /api/state - hydrates the frontend on page load. Returns reviewed
// decisions only (pending decisions have no server-side row - the server
// never stores in-flight recommendations, only reviewed outcomes).
router.get("/state", async (req, res) => {
  try {
    const result = await query(
      `SELECT scenario_id, category, recommendation, outcome, stage_at_time, reviewed_at
       FROM decisions_log
       ORDER BY reviewed_at DESC`
    );
    const reviewed = result.rows.map((row) => ({
      scenarioId: row.scenario_id,
      category: row.category,
      recommendation: row.recommendation,
      outcome: row.outcome,
      stageAtTime: row.stage_at_time,
      reviewedAt: row.reviewed_at,
    }));
    res.json({ reviewed });
  } catch (err) {
    res.status(502).json({ error: err.message || "Couldn't load state." });
  }
});

// POST /api/review - persists a reviewed decision. Session-gated (Day 2),
// same as the other mutating route. Not rate-limited the way the Anthropic
// call is - this doesn't hit any paid API, and legitimate use can mark up
// to 16 decisions in a single sitting.
router.post("/review", requireSession, express.json(), async (req, res) => {
  const { id, outcome, recommendation, stageAtTime } = req.body || {};
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
  if (typeof stageAtTime !== "string" || !["learner", "supervised", "licensed"].includes(stageAtTime)) {
    return res.status(400).json({ error: "stageAtTime is missing or invalid." });
  }
  if (!VALID_CATEGORIES.has(scenario.category)) {
    return res.status(400).json({ error: "Unknown category." });
  }

  try {
    await query(
      `INSERT INTO decisions_log (scenario_id, category, recommendation, outcome, stage_at_time)
       VALUES ($1, $2, $3, $4, $5)`,
      [scenario.id, scenario.category, JSON.stringify(recommendation), outcome, stageAtTime]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message || "Couldn't save the review." });
  }
});

// POST /api/admin/reset - operational control, not a user feature. Not
// linked from any nav. Truncates the audit history for demo repeatability.
router.post("/admin/reset", requireSession, async (req, res) => {
  try {
    await query("TRUNCATE TABLE decisions_log");
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: err.message || "Couldn't reset." });
  }
});

module.exports = router;
