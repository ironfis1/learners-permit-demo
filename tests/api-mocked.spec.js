// TestPlan v3 C4, I1-I3 - deterministic assertions that depend on mocking
// POST /api/recommendation (the server-side route added in Day 2), not
// api.anthropic.com directly - the browser never calls Anthropic anymore.
const { test, expect } = require("@playwright/test");
const { resetState } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await resetState(page);
});

test.describe("C4 - confidence badge color thresholds (mocked)", () => {
  const cases = [
    { confidence: 54, expectedClassHint: "rust" },
    { confidence: 55, expectedClassHint: "amber" },
    { confidence: 79, expectedClassHint: "amber" },
    { confidence: 80, expectedClassHint: "teal" },
  ];

  for (const { confidence, expectedClassHint } of cases) {
    test(`confidence=${confidence} renders a ${expectedClassHint}-toned badge`, async ({ page }) => {
      await page.route("**/api/recommendation", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ recommendation: "Test action.", reasoning: "Test reasoning.", confidence }),
        })
      );
      await page.evaluate((id) => selectDecision(id), 1);
      await page.locator("#get-rec-btn").click();
      const badge = page.locator(".confidence-badge");
      await expect(badge).toContainText(`Confidence: ${confidence}`);
      const style = await badge.getAttribute("style");
      // var(--teal)/var(--amber)/var(--rust) are resolved inline via the
      // template in renderRecommendationBlock() - check the raw CSS var name
      // rather than a computed color, since jsdom-free Playwright renders
      // real CSS and computed rgb() values would make this brittle.
      const cssVarByHint = { teal: "--teal", amber: "--amber", rust: "--rust" };
      expect(style).toContain(cssVarByHint[expectedClassHint]);
    });
  }
});

test.describe("I - Error Handling (mocked)", () => {
  test("I1: HTTP error response shows the error message and a Retry button", async ({ page }) => {
    await page.route("**/api/recommendation", (route) =>
      route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Upstream failed." }) })
    );
    await page.evaluate((id) => selectDecision(id), 2);
    await page.locator("#get-rec-btn").click();
    // Day 5 live-regression run flaked here once against production (passed on
    // CI's built-in retry) - real network/render latency the local suite never
    // sees, per the QA-lead review's own prediction. Longer timeout, not a
    // logic change.
    await expect(page.locator(".error-msg")).toContainText("Upstream failed.", { timeout: 10000 });
    await expect(page.locator("button.get-rec-btn", { hasText: "Retry" })).toBeVisible();
  });

  test("I2: malformed JSON response is caught gracefully, no unhandled exception", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await page.route("**/api/recommendation", (route) =>
      route.fulfill({ status: 200, contentType: "text/plain", body: "not json{{{" })
    );
    await page.evaluate((id) => selectDecision(id), 3);
    await page.locator("#get-rec-btn").click();
    await expect(page.locator(".error-msg")).toBeVisible();
    await expect(page.locator("button.get-rec-btn", { hasText: "Retry" })).toBeVisible();
    expect(pageErrors).toHaveLength(0);
  });

  test("I3: Retry after a failure succeeds once the mock is fixed", async ({ page }) => {
    let callCount = 0;
    await page.route("**/api/recommendation", (route) => {
      callCount += 1;
      if (callCount === 1) {
        return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Try again." }) });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ recommendation: "Dispatch tonight.", reasoning: "Because.", confidence: 90 }),
      });
    });
    await page.evaluate((id) => selectDecision(id), 4);
    await page.locator("#get-rec-btn").click();
    await expect(page.locator(".error-msg")).toBeVisible();
    await page.locator("button.get-rec-btn", { hasText: "Retry" }).click();
    await expect(page.locator(".rec-action")).toHaveText("Dispatch tonight.");
    await expect(page.locator(".error-msg")).toHaveCount(0);
  });
});
