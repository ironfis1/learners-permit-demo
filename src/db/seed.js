// Seeds a handful of realistic reviewed decisions so a live demo has
// interesting data on demand, without relying on organic clicking.
// Run with: node src/db/seed.js
require("dotenv").config();
const { query } = require("./pool");
const { initDb } = require("./init");

const SEED_ROWS = [
  // dispatch
  {
    scenarioId: 1,
    category: "dispatch",
    recommendation: {
      recommendation: "Dispatch tonight.",
      reasoning: "A daycare reopening at 6:45 AM leaves no safe window to wait, and a wasp nest near a play yard is a same-day liability risk regardless of account history.",
      confidence: 88,
    },
    outcome: "correct",
    stageAtTime: "learner",
  },
  {
    scenarioId: 2,
    category: "dispatch",
    recommendation: {
      recommendation: "Dispatch tonight.",
      reasoning: "An active swarm during peak dinner service is already affecting guest experience and could escalate to a health-department call if left overnight.",
      confidence: 82,
    },
    outcome: "correct",
    stageAtTime: "learner",
  },
  {
    scenarioId: 3,
    category: "dispatch",
    recommendation: {
      recommendation: "Dispatch tonight.",
      reasoning: "Rodent activity near an electrical panel at a 24/7 facility with two prior tickets is a repeat pattern worth treating as urgent, not routine.",
      confidence: 74,
    },
    outcome: "incorrect",
    stageAtTime: "supervised",
  },

  // invoice
  {
    scenarioId: 5,
    category: "invoice",
    recommendation: {
      recommendation: "Approve.",
      reasoning: "Pricing is consistent with the last two orders from the same distributor and well above the manager auto-approval threshold only in dollar terms, not risk terms.",
      confidence: 79,
    },
    outcome: "correct",
    stageAtTime: "learner",
  },
  {
    scenarioId: 6,
    category: "invoice",
    recommendation: {
      recommendation: "Approve.",
      reasoning: "Rush shipping after two sting incidents in one week is a safety response, not discretionary spend, and the premium is a small fraction of the total.",
      confidence: 85,
    },
    outcome: "correct",
    stageAtTime: "supervised",
  },
  {
    scenarioId: 7,
    category: "invoice",
    recommendation: {
      recommendation: "Hold for manager review.",
      reasoning: "A third repair this quarter approaching 70% of the vehicle's value is a replace-vs-repair decision, not a routine approval.",
      confidence: 91,
    },
    outcome: "correct",
    stageAtTime: "supervised",
  },

  // refund
  {
    scenarioId: 9,
    category: "refund",
    recommendation: {
      recommendation: "Offer free re-treatment instead.",
      reasoning: "The guarantee window covers this exact situation, and a re-treatment resolves the customer's actual problem without giving up the revenue on a clean account.",
      confidence: 76,
    },
    outcome: "correct",
    stageAtTime: "learner",
  },
  {
    scenarioId: 11,
    category: "refund",
    recommendation: {
      recommendation: "Approve credit.",
      reasoning: "Work was completed and the customer is satisfied with the result; a small credit for a first-time lateness complaint costs less than the relationship risk of refusing.",
      confidence: 80,
    },
    outcome: "correct",
    stageAtTime: "supervised",
  },

  // escalation
  {
    scenarioId: 13,
    category: "escalation",
    recommendation: {
      recommendation: "Escalate to a manager.",
      reasoning: "A public-review threat tied to a same-day demand is a reputational risk that needs a manager's judgment on whether to bend the schedule, not a scripted auto-resolution.",
      confidence: 70,
    },
    outcome: "correct",
    stageAtTime: "learner",
  },
  {
    scenarioId: 14,
    category: "escalation",
    recommendation: {
      recommendation: "Escalate to a manager.",
      reasoning: "Conflicting accounts between a tenant and landlord over a signed work order is a liability question, not something the standard script is built to resolve.",
      confidence: 83,
    },
    outcome: "correct",
    stageAtTime: "supervised",
  },
];

async function seed() {
  await initDb();
  await query("TRUNCATE TABLE decisions_log");
  for (const row of SEED_ROWS) {
    await query(
      `INSERT INTO decisions_log (scenario_id, category, recommendation, outcome, stage_at_time)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.scenarioId, row.category, JSON.stringify(row.recommendation), row.outcome, row.stageAtTime]
    );
  }
  console.log(`Seeded ${SEED_ROWS.length} reviewed decisions.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
