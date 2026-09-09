// TestPlan v4 Groups A, B, H, I - static rendering, queue interaction, the
// audit trail, and (new) the auto-drain automation itself. Updated for the
// 3-tier automation model: 23 scenarios across 4 categories (dispatch 5,
// invoice 8, refund 5, escalation 5), a queue that drops a decision once
// BOTH axes are resolved, and Supervised/Licensed stages that kick off
// background auto-processing the moment a category crosses their
// threshold - not just on a manual click anymore.
//
// Groups A/B/H drive state directly (review()/setJudgment()/
// setVerification()), same pattern as tests/logic.spec.js, so
// /api/recommendation is blocked by default in this file's top-level
// beforeEach to keep that background auto-processing from racing their
// assertions. Group I exists specifically to watch that automation run to
// completion, so it swaps the block for a real (mocked) response.
const { test, expect } = require("@playwright/test");
const { resetState, mockRecommendation, blockRecommendation } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await blockRecommendation(page);
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

  test("A3: queue shows all 23 decisions, 23 pending", async ({ page }) => {
    await expect(page.locator(".decision-row")).toHaveCount(23);
    await expect(page.locator("#queue-count")).toHaveText("23 pending");
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

  test("B3: all 23 scenarios render correct title/location/category on selection", async ({ page }) => {
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

  test("B4: reviewing 3 decisions decrements the pending count from 23 to 20", async ({ page }) => {
    await page.evaluate(async () => {
      for (const id of [1, 2, 3]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, true);
      }
    });
    await expect(page.locator("#queue-count")).toHaveText("20 pending");
  });

  test("B5: a fully resolved decision disappears from the queue; a Judgment-only decision stays with an updated status dot", async ({ page }) => {
    await page.evaluate(() => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      setJudgment(1, true, false); // Judgment only - stays queued
      state[2].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      setJudgment(2, false, false);
      setVerification(2, true, false); // both axes - resolved, drops out
    });
    await expect(page.locator(".decision-row")).toHaveCount(22);
    const row1 = page.locator(".decision-row", { hasText: "Wasp nest reported in daycare play yard" });
    await expect(row1.locator(".status-dot")).toHaveClass(/correct/);
    const row2 = page.locator(".decision-row", { hasText: "Bee swarm near restaurant patio during dinner service" });
    await expect(row2).toHaveCount(0);
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

test.describe("Group I - Auto-Drain (Supervised/Licensed automation)", () => {
  test.beforeEach(async ({ page }) => {
    // Override the file-level block with a real (mocked, instant) response
    // - these tests exist specifically to watch the auto-drain pool
    // actually run to completion.
    await page.unroute("**/api/recommendation");
    await mockRecommendation(page);
  });

  // Dispatch has 5 total scenarios (1, 2, 3, 4, 17). Auto-judgment at
  // Supervised always marks Correct unconditionally (the response arriving
  // IS the Judgment - see autoRespond() in public/index.html), so a category
  // seeded at 100% accuracy races straight through Supervised into Licensed
  // the instant one more auto-judgment lands (3/3 -> 4/4 both still 100%,
  // and 4/4 already clears the Licensed bar). To actually observe the
  // Supervised state - auto-response/auto-judgment landing while Verified
  // Execution stays manual - the seed needs headroom below the 90% Licensed
  // threshold that survives the auto-drain adding more (always-correct)
  // items. Seeding 3 correct + 1 incorrect (75% at total 4) leaves exactly
  // one scenario (17) for auto-drain to pick up; even after it resolves
  // auto-correct, accuracy only reaches 80% (4/5) - still short of 90%, and
  // dispatch has no scenarios left to auto-process, so it stays parked at
  // Supervised instead of cascading into Licensed.
  test("I1: Supervised auto-fetches responses and auto-marks Judgment, leaving Verified Execution manual and the decision in the queue", async ({ page }) => {
    await page.evaluate(async () => {
      // Order matters here: 4 has to resolve manually BEFORE the category
      // crosses into Supervised (which happens on the 3rd-reviewed item,
      // total>=3 and accuracy>=70), or the auto-drain pool would start
      // racing to auto-fetch a response for 4 at the same time this loop
      // is about to manually resolve it. Reviewing 4 first, then 1/2/3,
      // keeps accuracy under the 70% threshold until the very last call -
      // 4 incorrect (0%) -> +1 correct (50%) -> +2 correct (67%, still
      // below 70) -> +3 correct (75%, crosses into Supervised) - so by the
      // time the category becomes Supervised, every manually-seeded
      // scenario is already fully resolved and only 17 is left pending.
      const outcomes = [[4, false], [1, true], [2, true], [3, true]];
      for (const [id, correct] of outcomes) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, correct);
      }
    });
    expect(await page.evaluate(() => stageFor("dispatch"))).toBe("supervised");

    // Scenario 17 is the only one left pending - the auto-drain pool should
    // resolve its Judgment on its own.
    await expect
      .poll(async () => page.evaluate(() => state[17].status !== "pending"))
      .toBe(true);
    const details = await page.evaluate(() => ({
      status: state[17].status,
      autoJudgment: state[17].autoJudgment,
      verifiedExecution: state[17].verifiedExecution,
      resolved: isResolved(17),
      stage: stageFor("dispatch"),
    }));
    expect(details).toEqual({ status: "correct", autoJudgment: true, verifiedExecution: null, resolved: false, stage: "supervised" });

    await page.evaluate(() => selectDecision(17));
    await expect(page.locator(".auto-note")).toContainText("Judgment auto-marked Correct");
    await expect(page.locator(".review-btn.exec-confirmed")).toBeVisible();
  });

  test("I2: manually confirming Verified Execution on an auto-judged Supervised decision resolves it and removes it from the queue", async ({ page }) => {
    await page.evaluate(async () => {
      // Order matters here: 4 has to resolve manually BEFORE the category
      // crosses into Supervised (which happens on the 3rd-reviewed item,
      // total>=3 and accuracy>=70), or the auto-drain pool would start
      // racing to auto-fetch a response for 4 at the same time this loop
      // is about to manually resolve it. Reviewing 4 first, then 1/2/3,
      // keeps accuracy under the 70% threshold until the very last call -
      // 4 incorrect (0%) -> +1 correct (50%) -> +2 correct (67%, still
      // below 70) -> +3 correct (75%, crosses into Supervised) - so by the
      // time the category becomes Supervised, every manually-seeded
      // scenario is already fully resolved and only 17 is left pending.
      const outcomes = [[4, false], [1, true], [2, true], [3, true]];
      for (const [id, correct] of outcomes) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, correct);
      }
    });
    await expect.poll(async () => page.evaluate(() => state[17].status !== "pending")).toBe(true);
    await page.evaluate(() => selectDecision(17));
    await page.locator(".review-btn.exec-confirmed").click();

    const resolved = await page.evaluate(() => isResolved(17));
    expect(resolved).toBe(true);
    expect(await page.evaluate(() => stageFor("dispatch"))).toBe("supervised");
    const row = page.locator(".decision-row", { hasText: "Wasp nest found in assisted living courtyard" });
    await expect(row).toHaveCount(0);
  });

  test("I3: Licensed auto-verification catches a fabricated claim with no human in the loop and revokes the category", async ({ page }) => {
    // Reach Licensed for invoice directly with 4 manual reviews (4/4, 100%)
    // - Supervised is skipped entirely, which exercises the licensed-branch
    // path (a scenario that never touched Supervised still needs BOTH its
    // response and its verification automated from scratch).
    await page.evaluate(async () => {
      for (const id of [5, 6, 7, 8]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 90 };
        await review(id, true);
      }
    });
    expect(await page.evaluate(() => stageFor("invoice"))).toBe("licensed");

    // Scenario 21's groundTruthExecution is "failed" (see
    // src/data/scenarios.js) - the auto-verification sweep should catch it
    // without any manual click and revoke the category.
    await expect
      .poll(async () => page.evaluate(() => stageFor("invoice")), { timeout: 10000 })
      .toBe("revoked");

    const invoiceCard = page.locator(".permit-card", { hasText: "Vendor Invoice" });
    await expect(invoiceCard.locator(".stamp")).toHaveText("Permit Revoked");
    await expect(invoiceCard.locator(".exec-banner")).toContainText("VERIFIED EXECUTION FAILURE");

    // The failed scenario shows a red tag right in the audit trail's
    // collapsed row - not just in the expandable detail.
    const failedRow = page.locator(".audit-row", { hasText: "Vendor banking details changed" });
    await expect(failedRow.locator(".ve-failed-tag")).toContainText("VERIFIED EXECUTION FAILED");

    const st21 = await page.evaluate(() => ({
      status: state[21].status,
      autoJudgment: state[21].autoJudgment,
      verifiedExecution: state[21].verifiedExecution,
      autoVerification: state[21].autoVerification,
    }));
    expect(st21).toEqual({ status: "correct", autoJudgment: true, verifiedExecution: "failed", autoVerification: true });
  });

  test("I4: resetting the demo restores the page without requiring a manual refresh", async ({ page }) => {
    await page.evaluate(async () => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(1, true);
    });
    await expect(page.locator("#queue-count")).toHaveText("22 pending");

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".reset-btn").click();

    // No page.reload() anywhere in this test - if resetMyDemo() still threw
    // partway through (the old `state = {}` bug), this would hang on the
    // stale "22 pending" text instead of updating on its own.
    await expect(page.locator("#queue-count")).toHaveText("23 pending");
    await expect(page.locator(".audit-row")).toHaveCount(0);
    const stageAfterReset = await page.evaluate(() => stageFor("dispatch"));
    expect(stageAfterReset).toBe("learner");
  });
});
