// See TestPlan v3 Section 2/10: every spec requires a real running instance
// of the app backed by a real Postgres database - there's no static-file
// fallback anymore (the page fetches GET /api/state before its first
// render). By default this config starts the app itself via `npm start`
// against a local/CI database, so `DATABASE_URL` must already be set in the
// environment before `npx playwright test` runs.
//
// Day 5 (U3/U4): set LIVE_BASE_URL to point the whole suite at an already-
// deployed instance (e.g. the live Upsun URL) instead of spinning up a local
// server - this is what "regression pass against the live deployment, not
// just localhost" requires, per the QA-lead review in Day5 spec. Note this
// runs the real reset/review flow against whatever database that URL is
// backed by - reseed afterward if you point this at anything demo-facing.
const { defineConfig, devices } = require("@playwright/test");

const LIVE_BASE_URL = process.env.LIVE_BASE_URL;
const PORT = process.env.PORT || 3100;
const BASE_URL = LIVE_BASE_URL || `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: false, // shared database state (see resetState in beforeEach) - keep runs serialized to avoid cross-test interference
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: LIVE_BASE_URL
    ? undefined // pointing at an already-deployed instance - nothing to boot locally
    : {
        command: "npm start",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
        env: {
          PORT: String(PORT),
          // No ANTHROPIC_API_KEY on purpose - none of the gated specs
          // (logic/ui/api-mocked) ever call the real Anthropic route; C4/I1-I3
          // mock POST /api/recommendation directly instead.
        },
      },
});
