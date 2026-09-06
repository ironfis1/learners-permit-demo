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

module.exports = { resetState };
