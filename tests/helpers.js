// Shared helpers for the Playwright suite. All specs assume a running
// instance of the app (see playwright.config.js's webServer) backed by a
// real, disposable Postgres database - see TestPlan v3 Section 2: opening
// the static HTML directly no longer works post-Day-3, since the page
// fetches GET /api/state on load before its first render.

// Reset persisted state to a clean slate before a test. Matches TestPlan
// v3's K3 exactly: load the page (so a session cookie exists), call the
// admin reset endpoint, reload so the frontend re-hydrates from the now-
// empty database. This replaces v2's "reload = clean slate" assumption -
// see Section 3 of TestPlan v3 for why reload alone no longer resets
// anything.
async function resetState(page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const res = await fetch("/api/admin/reset", { method: "POST" });
    if (!res.ok) {
      throw new Error(`Reset failed: ${res.status} ${await res.text()}`);
    }
  });
  await page.reload();
}

module.exports = { resetState };
