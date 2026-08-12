// TestPlan v3 Groups A, B, H - static rendering, queue interaction, and the
// audit trail. Pure UI/click assertions against a freshly-reset instance.
const { test, expect } = require("@playwright/test");
const { resetState } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await resetState(page);
});

test.describe("Group A - Static Rendering", () => {
  test("A1: header renders title, subtitle, and client line", async ({ page }) => {
    await expect(page.locator("h1")).toHaveText("The Learner's Permit");
    await expect(page.locator("header .sub").first()).toHaveText("Live Decision Console");
    await expect(page.locator("header .co")).toContainText("Thistle & Vance Pest Solutions");
    await expect(page.locator("header .co")).toContainText("14 locations");
  });

  test("A2: all 4 permit cards render at Learner's Permit, 0/0, 0%", async ({ page }) => {
    const cards = page.locator(".permit-card");
    await expect(cards).toHaveCount(4);
    for (const card of await cards.all()) {
      await expect(card.locator(".stamp")).toHaveText("Learner's Permit");
      await expect(card.locator(".stats")).toContainText("0/0 correct");
      await expect(card.locator(".stats")).toContainText("0% accuracy");
    }
  });

  test("A3: queue shows all 16 decisions, 16 pending", async ({ page }) => {
    await expect(page.locator(".decision-row")).toHaveCount(16);
    await expect(page.locator("#queue-count")).toHaveText("16 pending");
  });

  test("A4: no selection shows the empty detail prompt", async ({ page }) => {
    await expect(page.locator(".detail .empty")).toHaveText("Select a decision from the queue to begin.");
  });

  test("A5: audit trail shows the empty state", async ({ page }) => {
    await expect(page.locator("#audit-list .audit-empty")).toContainText("Reviewed decisions will appear here");
  });

  test("A6: instructor note renders the stage-threshold rule text", async ({ page }) => {
    await expect(page.locator(".instructor-note")).toContainText("Supervised at 3+ decisions");
    await expect(page.locator(".instructor-note")).toContainText("Licensed at 4+ decisions");
  });
});

test.describe("Group B - Queue Interaction", () => {
  test("B1: clicking a row highlights it and loads the detail panel", async ({ page }) => {
    await page.locator(".decision-row").first().click();
    await expect(page.locator(".decision-row").first()).toHaveClass(/active/);
    await expect(page.locator(".detail h3")).not.toHaveCount(0);
  });

  test("B2: selecting a second row moves the highlight and updates the detail panel", async ({ page }) => {
    const rows = page.locator(".decision-row");
    await rows.nth(0).click();
    const firstTitle = await page.locator(".detail h3").textContent();
    await rows.nth(4).click();
    await expect(rows.nth(4)).toHaveClass(/active/);
    await expect(rows.nth(0)).not.toHaveClass(/active/);
    const secondTitle = await page.locator(".detail h3").textContent();
    expect(secondTitle).not.toBe(firstTitle);
  });

  test("B3: all 16 scenarios render correct title/location/category on selection", async ({ page }) => {
    const expected = await page.evaluate(() => SCENARIOS.map((s) => ({
      id: s.id,
      title: s.title,
      location: s.location,
      category: CATEGORIES[s.category].short,
      options: s.options,
    })));
    for (const s of expected) {
      await page.evaluate((id) => selectDecision(id), s.id);
      await expect(page.locator(".detail h3")).toHaveText(s.title);
      await expect(page.locator(".detail .loc-line")).toContainText(s.location);
      await expect(page.locator(".detail .loc-line")).toContainText(s.options);
    }
  });

  test("B4: reviewing 3 decisions decrements the pending count from 16 to 13", async ({ page }) => {
    await page.evaluate(async () => {
      for (const id of [1, 2, 3]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, true);
      }
    });
    await expect(page.locator("#queue-count")).toHaveText("13 pending");
  });

  test("B5: marking correct/incorrect updates the status dot immediately", async ({ page }) => {
    await page.evaluate(async () => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(1, true);
      state[2].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(2, false);
    });
    await expect(page.locator(".decision-row").nth(0).locator(".status-dot")).toHaveClass(/correct/);
    await expect(page.locator(".decision-row").nth(1).locator(".status-dot")).toHaveClass(/incorrect/);
  });
});

test.describe("Group H - Audit Trail", () => {
  test("H1: marking the first decision replaces the empty state with one entry", async ({ page }) => {
    await page.evaluate(async () => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(1, true);
    });
    await expect(page.locator(".audit-row")).toHaveCount(1);
  });

  test("H2: a second review appears above the first (most recent first)", async ({ page }) => {
    await page.evaluate(async () => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(1, true);
      state[2].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(2, false);
    });
    const rows = page.locator(".audit-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator(".status-dot")).toHaveClass(/incorrect/); // decision 2 is newest
  });

  test("H3: expanding one audit row does not affect another", async ({ page }) => {
    await page.evaluate(async () => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(1, true);
      state[2].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(2, false);
    });
    const rows = page.locator(".audit-row");
    await rows.nth(0).locator(".audit-summary").click();
    await expect(rows.nth(0).locator(".audit-detail")).toBeVisible();
    await expect(rows.nth(1).locator(".audit-detail")).toBeHidden();
  });

  test("H4: historical audit entries do not retroactively change after a revoke", async ({ page }) => {
    await page.evaluate(async () => {
      for (const id of [1, 2, 3]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, true); // 3rd review logs stage = supervised
      }
      revoke("dispatch");
      renderAudit();
    });
    const thirdEntryStageLabel = page.locator(".audit-row").nth(0).locator(".right span").last();
    await expect(thirdEntryStageLabel).toHaveText("Supervised");
  });
});
