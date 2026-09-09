// TestPlan v4 Groups D, E, F, G - the staged-autonomy algorithm, instant
// revoke, and cross-category isolation, updated for the 3-tier automation
// model: Learner is fully manual (response, Judgment, Verified Execution);
// Supervised auto-fetches responses and auto-marks Judgment on arrival,
// leaving Verified Execution manual; Licensed automates both axes. review()
// is still async and still writes through to POST /api/review, same as
// before - each call is awaited inside the evaluated function, so by the
// time page.evaluate() resolves, the write has actually landed, not just
// the client-side state update.
//
// /api/recommendation is blocked (never resolves) for every test in this
// file. These tests manipulate state and call review()/setJudgment()/
// setVerification() directly, exactly like the original suite did, and
// several of them deliberately cross a category into Supervised or Licensed
// as a side effect of that. The moment a category crosses either threshold,
// the app's own auto-drain pool starts fetching recommendations for that
// category's remaining scenarios in the background (see maybeAutoDrainAll()
// in public/index.html) - without the block, those background fetches would
// race this file's direct state manipulation and its assertions about exact
// accuracy numbers.
const { test, expect } = require("@playwright/test");
const { resetState, blockRecommendation } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await blockRecommendation(page);
  await resetState(page);
});

test.describe("Group D - Review / Marking", () => {
  test("D1: mark correct updates status and dot", async ({ page }) => {
    const result = await page.evaluate(async () => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(1, true);
      return state[1].status;
    });
    expect(result).toBe("correct");
  });

  test("D2: mark incorrect updates status", async ({ page }) => {
    const result = await page.evaluate(async () => {
      state[2].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(2, false);
      return state[2].status;
    });
    expect(result).toBe("incorrect");
  });

  test("D3: re-selecting a reviewed decision shows recorded outcome, not a fresh Get Recommendation button", async ({ page }) => {
    await page.evaluate(async () => {
      state[3].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(3, true);
    });
    await page.evaluate(() => { selectDecision(3); });
    await expect(page.locator(".review-result.correct")).toBeVisible();
    await expect(page.locator("#get-rec-btn")).toHaveCount(0);
  });

  test("D4: setting only Judgment resolves the status immediately but leaves the decision in the queue", async ({ page }) => {
    const result = await page.evaluate(() => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      setJudgment(1, true, false);
      return { status: state[1].status, verifiedExecution: state[1].verifiedExecution, resolved: isResolved(1) };
    });
    expect(result).toEqual({ status: "correct", verifiedExecution: null, resolved: false });
    // 23 total scenarios - none resolved yet, so the queue is untouched.
    await expect(page.locator(".decision-row")).toHaveCount(23);
  });

  test("D5: setting Verified Execution after Judgment resolves the decision and removes it from the queue", async ({ page }) => {
    await page.evaluate(() => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      setJudgment(1, true, false);
      setVerification(1, true, false);
    });
    const resolved = await page.evaluate(() => isResolved(1));
    expect(resolved).toBe(true);
    await expect(page.locator(".decision-row")).toHaveCount(22);
    await expect(page.locator("#queue-count")).toHaveText("22 pending");
  });

  test("D6: a decision only appears in the audit trail once both axes are set", async ({ page }) => {
    await page.evaluate(() => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      setJudgment(1, true, false);
    });
    await expect(page.locator(".audit-row")).toHaveCount(0);
    await page.evaluate(() => { setVerification(1, true, false); });
    await expect(page.locator(".audit-row")).toHaveCount(1);
  });
});

test.describe("Group E - Trust-Building Algorithm (exact sequences)", () => {
  test("E1: three correct dispatch reviews reach Supervised", async ({ page }) => {
    const stage = await page.evaluate(async () => {
      for (const id of [1, 2, 3]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, true);
      }
      return stageFor("dispatch");
    });
    expect(stage).toBe("supervised");
  });

  test("E2: a perfect 4/4 dispatch record reaches Licensed", async ({ page }) => {
    const stage = await page.evaluate(async () => {
      for (const id of [1, 2, 3, 4]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, true);
      }
      return stageFor("dispatch");
    });
    expect(stage).toBe("licensed");
  });

  test("E3: 2/3 invoice accuracy (67%) stays Learner's Permit despite total >= 3", async ({ page }) => {
    const result = await page.evaluate(async () => {
      state[5].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(5, false);
      state[6].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(6, true);
      state[7].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(7, true);
      return { stage: stageFor("invoice"), track: trackRecord("invoice") };
    });
    expect(result.track).toEqual({ total: 3, correct: 2, accuracy: 67 });
    expect(result.stage).toBe("learner");
  });

  test("E4: 3/4 refund accuracy (75%) reaches Supervised", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const outcomes = [[9, true], [10, false], [11, true], [12, true]];
      for (const [id, correct] of outcomes) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, correct);
      }
      return { stage: stageFor("refund"), track: trackRecord("refund") };
    });
    expect(result.track).toEqual({ total: 4, correct: 3, accuracy: 75 });
    expect(result.stage).toBe("supervised");
  });

  test("E5: once a category reaches Supervised, its remaining decisions show a Pending marker while auto-response is in flight", async ({ page }) => {
    await page.evaluate(async () => {
      for (const id of [1, 2, 3]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, true);
      }
    });
    // /api/recommendation is blocked in this file, so the auto-drain pool's
    // fetch for dispatch's two remaining scenarios (4 and 17) starts but
    // never completes - a stable window to assert the Pending marker
    // renders, rather than racing a fetch that would actually finish.
    await expect
      .poll(async () => page.evaluate(() => Boolean(state[4].inFlight || state[17].inFlight)))
      .toBe(true);
    await expect(page.locator(".pending-badge")).not.toHaveCount(0);
    // The two in-flight scenarios are still unresolved and still in the
    // queue - only Judgment/Verified Execution resolution removes a row,
    // not merely being picked up by the pool.
    const stillQueued = await page.evaluate(() => !isResolved(4) && !isResolved(17));
    expect(stillQueued).toBe(true);
  });
});

test.describe("Group F - Instant Revoke (exact sequences)", () => {
  test("F1: revoke on a fresh category is a no-op (button already disabled)", async ({ page }) => {
    await page.evaluate(() => { renderPermits(); });
    const disabled = await page
      .locator(".permit-card .revoke-btn")
      .first()
      .isDisabled();
    expect(disabled).toBe(true);
  });

  test("F2/F3: revoke after reaching Supervised locks the stage at Learner's Permit even after further correct reviews", async ({ page }) => {
    const result = await page.evaluate(async () => {
      for (const id of [1, 2, 3]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, true);
      }
      const stageBeforeRevoke = stageFor("dispatch");
      revoke("dispatch");
      const stageAfterRevoke = stageFor("dispatch");
      state[4].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(4, true);
      const stageAfterFurtherReview = stageFor("dispatch");
      return { stageBeforeRevoke, stageAfterRevoke, stageAfterFurtherReview, track: trackRecord("dispatch") };
    });
    expect(result.stageBeforeRevoke).toBe("supervised");
    expect(result.stageAfterRevoke).toBe("learner");
    expect(result.stageAfterFurtherReview).toBe("learner"); // F3: no reinstatement path (D-02)
    expect(result.track).toEqual({ total: 4, correct: 4, accuracy: 100 }); // math still updates underneath
  });

  test("F4: revoking dispatch leaves other categories untouched", async ({ page }) => {
    const result = await page.evaluate(async () => {
      for (const id of [1, 2, 3]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, true);
      }
      revoke("dispatch");
      return { invoice: stageFor("invoice"), refund: stageFor("refund"), escalation: stageFor("escalation") };
    });
    expect(result).toEqual({ invoice: "learner", refund: "learner", escalation: "learner" });
  });
});

test.describe("Group G - Cross-Category Isolation", () => {
  test("G1: advancing dispatch to Supervised leaves other categories at Learner's Permit, 0/0", async ({ page }) => {
    const result = await page.evaluate(async () => {
      for (const id of [1, 2, 3]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
        await review(id, true);
      }
      return {
        dispatch: { stage: stageFor("dispatch"), track: trackRecord("dispatch") },
        invoice: { stage: stageFor("invoice"), track: trackRecord("invoice") },
      };
    });
    expect(result.dispatch.stage).toBe("supervised");
    expect(result.invoice).toEqual({ stage: "learner", track: { total: 0, correct: 0, accuracy: 0 } });
  });

  test("G2: revoking dispatch does not affect other categories' revoke flags", async ({ page }) => {
    const result = await page.evaluate(async () => {
      revoke("dispatch");
      return { dispatch: stageFor("dispatch"), invoice: stageFor("invoice") };
    });
    expect(result.dispatch).toBe("learner");
    expect(result.invoice).toBe("learner"); // never revoked, still learner by default (0 reviews)
  });
});
