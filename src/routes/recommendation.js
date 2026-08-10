const express = require("express");
const { CATEGORIES, SCENARIOS } = require("../data/scenarios");
const { requireSession } = require("../middleware/session");
const { perSessionLimiter, perIpLimiter } = require("../middleware/rateLimit");

const router = express.Router();

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_VERSION = "2023-06-01";

function buildPrompt(scenario) {
  return `You are an operations decision-support agent for a 14-location pest control company, operating inside "The Learner's Permit" framework: a staged-autonomy system where every recommendation must show its reasoning before it can be trusted.

Category: ${CATEGORIES[scenario.category].label}
Location: ${scenario.location}
Scenario: ${scenario.context}
Available options: ${scenario.options}

Respond with ONLY valid JSON, no markdown formatting, no code fences, no preamble:
{"recommendation": "<the specific action you recommend, in plain operational language, one sentence>", "reasoning": "<2-3 sentences of plain, concrete operational reasoning for why, in the voice of someone who actually runs field operations, not generic risk-speak>", "confidence": <integer 0-100>}`;
}

async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Server is not configured with an Anthropic API key yet.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Anthropic API returned ${response.status}: ${bodyText.slice(0, 200)}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("No response text from Anthropic");

  const clean = textBlock.text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean); // throws on malformed JSON, caught by the route handler

  if (
    typeof parsed.recommendation !== "string" ||
    typeof parsed.reasoning !== "string" ||
    typeof parsed.confidence !== "number"
  ) {
    throw new Error("Anthropic response was valid JSON but missing expected fields");
  }

  return parsed;
}

router.post(
  "/recommendation",
  requireSession,
  perSessionLimiter,
  perIpLimiter,
  express.json(),
  async (req, res) => {
    // Only `id` is ever read from the request body. Category, context, and
    // options always come from the server's own SCENARIOS copy - nothing the
    // client sends can end up in the prompt sent to Anthropic.
    const id = Number(req.body && req.body.id);
    const scenario = SCENARIOS.find((s) => s.id === id);

    if (!scenario) {
      return res.status(400).json({ error: "Unknown or missing scenario id." });
    }

    try {
      const prompt = buildPrompt(scenario);
      const parsed = await callAnthropic(prompt);
      return res.json(parsed);
    } catch (err) {
      return res.status(502).json({
        error: err.message || "Couldn't get a recommendation right now. Try again.",
      });
    }
  }
);

module.exports = router;
