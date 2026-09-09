// Shared helpers for the Playwright suite. All specs assume a running
// instance of the app (see playwright.config.js's webServer) backed by a
// real, disposable Postgres database - see TestPlan v3 Section 2: opening
// the static HTML directly no longer works post-Day-3, since the page
// fetches GET /api/state on load before its first render.

// Reset persisted state to a clean slate before a test. Matches TestPlan
// v3's K3 in spirit, updated for the public-launch/session-scoping pivot:
// POST /api/admin/reset now requires ADMIN_RESET_TOKEN (see
// src/middleware/session.js) and is no longer the right endpoint for a
// per-test reset. Each Playwright test already gets its own browser
// context and therefore its own session cookie, so its rows are already
// isolated from every other test's (see src/routes/persistence.js) - this
// just belt-and-suspenders clears the calling session's own rows via the
// visitor-facing POST /api/reset, the same route the page's "Reset My
// Demo" button hits. Load the page first (so a session cookie exists),
// reset, then reload so the frontend re-hydrates from the now-empty state.
async function resetState(page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const res = await fetch("/api/reset", { method: "POST" });
    if (!res.ok) {
      throw new Error(`Reset failed: ${res.status} ${await res.text()}`);
    }
  });
  await page.reload();
}

// TestPlan v4 (3-tier automation model): Supervised and Licensed both fetch
// POST /api/recommendation in the background via the app's own auto-drain
// pool the moment a category crosses into either stage - not just on a
// manual "Get Recommendation" click anymore. Route mocking has to account
// for that everywhere, not just in tests that click the button.
//
// Call this BEFORE resetState() in a test's setup - page.route() persists
// across the goto()/reload() resetState() does, but only if it was
// registered before that navigation happens.

// Mocks POST /api/recommendation with an immediate, canned response - use
// for tests that want the real fetch flow (a manual "Get Recommendation"
// click, or the auto-drain pool actually completing) to resolve
// deterministically and instantly instead of hitting the real Anthropic API.
async function mockRecommendation(page, overrides = {}) {
  const body = Object.assign(
    { recommendation: "Dispatch tonight.", reasoning: "Because the situation warrants it.", confidence: 90 },
    overrides
  );
  await page.route("**/api/recommendation", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
  );
}

// Blocks POST /api/recommendation so it never resolves - use for tests that
// drive state directly (via review()/setJudgment()/setVerification(), the
// pattern most of this suite uses) and don't want the auto-drain pool's
// background fetches racing their assertions. A category that crosses into
// Supervised or Licensed during one of these tests will still try to
// auto-drain its remaining scenarios, but the fetch just hangs forever, so
// those scenarios stay untouched and the test's own math stays exact.
async function blockRecommendation(page) {
  await page.route("**/api/recommendation", () => new Promise(() => {}));
}

module.exports = { resetState, mockRecommendation, blockRecommendation };
