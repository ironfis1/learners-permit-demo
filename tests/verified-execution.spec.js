// Two-Axis Trust Model gap closure: Judgment Accuracy (graded, gradual) and
// Verified Execution (binary - did the claimed action actually happen,
// checked against real state) are separate axes. A single Verified
// Execution failure is an instant, permanent, automatic revoke for that
// category, regardless of the accuracy score - no averaging, no tolerance.
// These tests exercise that mechanic directly against the app's own global
// functions (review, stageFor, trackRecord) and against real persisted
// state via GET /api/state / POST /api/admin/reset, per the pattern already
// established in tests/logic.spec.js.
const { test, expect } = require("@playwright/test");
const { resetState } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await resetState(page);
});

test.describe("Verified Execution - instant, permanent, binary revoke", () => {
  test("VE1: a Verified Execution failure instantly revokes a category regardless of high accuracy elsewhere in it", async ({ page }) => {
    const result = await page.evaluate(async () => {
      // Build a high-accuracy dispatch record first - would normally reach
      // Supervised/Licensed.
      for (const id of [1, 2, 3]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 90 };
        await review(id, true, "confirmed");
      }
      const stageBeforeFailure = stageFor("dispatch");
      const trackBeforeFailure = trackRecord("dispatch");

      // A 4th dispatch decision is judgment-correct (accuracy would go to
      // 4/4 = 100%, i.e. Licensed) but its claimed action is reported as a
      // Verified Execution failure - a fabrication.
      state[4].recommendation = { recommendation: "x", reasoning: "y", confidence: 90 };
      await review(4, true, "failed");

      return {
        stageBeforeFailure,
        trackBeforeFailure,
        stageAfterFailure: stageFor("dispatch"),
        trackAfterFailure: trackRecord("dispatch"),
      };
    });

    expect(result.stageBeforeFailure).toBe("supervised");
    expect(result.stageAfterFailure).toBe("revoked");
    // The accuracy math underneath is untouched by the revoke - it would
    // otherwise read as Licensed (4/4, 100%). Verified Execution overrides
    // it outright rather than averaging into it.
    expect(result.trackAfterFailure).toEqual({ total: 4, correct: 4, accuracy: 100 });
  });

  test("VE1b: orthogonality - a judgment-incorrect decision can still be Verified-Execution-confirmed, and vice versa, without conflating the two axes", async ({ page }) => {
    const result = await page.evaluate(async () => {
      state[5].recommendation = { recommendation: "x", reasoning: "y", confidence: 60 };
      await review(5, false, "confirmed"); // judgment wrong, execution fine
      state[6].recommendation = { recommendation: "x", reasoning: "y", confidence: 60 };
      await review(6, true, "failed"); // judgment right, execution fabricated
      return { stage: stageFor("invoice"), track: trackRecord("invoice") };
    });
    // Judgment accuracy still reflects 1/2 correct even though the category
    // is revoked - the two axes are computed independently.
    expect(result.track).toEqual({ total: 2, correct: 1, accuracy: 50 });
    expect(result.stage).toBe("revoked");
  });

  test("VE1c: revoking one category via Verified Execution failure leaves other categories unaffected", async ({ page }) => {
    const result = await page.evaluate(async () => {
      state[9].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(9, true, "failed"); // refund category fabrication
      return {
        refund: stageFor("refund"),
        dispatch: stageFor("dispatch"),
        invoice: stageFor("invoice"),
        escalation: stageFor("escalation"),
      };
    });
    expect(result.refund).toBe("revoked");
    expect(result.dispatch).toBe("learner");
    expect(result.invoice).toBe("learner");
    expect(result.escalation).toBe("learner");
  });

  test("VE2: a Verified Execution revoke persists across a full page reload / GET /api/state hydration", async ({ page }) => {
    await page.evaluate(async () => {
      state[13].recommendation = { recommendation: "x", reasoning: "y", confidence: 80 };
      await review(13, true, "failed"); // escalation category fabrication
    });

    await expect
      .poll(async () => page.evaluate(() => stageFor("escalation")))
      .toBe("revoked");

    await page.reload();
    await page.waitForFunction(() => typeof stageFor === "function" && Object.keys(state).length > 0);
    // Give hydrateFromServer's async fetch a moment to resolve and re-render.
    await page.waitForFunction(() => {
      const s1 = state[13];
      return s1 && s1.verifiedExecution === "failed";
    });

    const stageAfterReload = await page.evaluate(() => stageFor("escalation"));
    expect(stageAfterReload).toBe("revoked");

    // Confirm it came from the server, not client memory - a fresh GET
    // /api/state independently reports the failure too.
    const apiState = await page.evaluate(async () => (await fetch("/api/state")).json());
    expect(apiState.revokedCategories).toContain("escalation");
    const row = apiState.reviewed.find((r) => r.scenarioId === 13);
    expect(row.verifiedExecution).toBe("failed");
  });

  test("VE3: the UI shows both the true accuracy stats and a clear revoke-reason banner, not a silently stale number", async ({ page }) => {
    await page.evaluate(async () => {
      for (const id of [1, 2, 3]) {
        state[id].recommendation = { recommendation: "x", reasoning: "y", confidence: 90 };
        await review(id, true, "confirmed");
      }
      state[4].recommendation = { recommendation: "x", reasoning: "y", confidence: 90 };
      await review(4, true, "failed");
    });

    const dispatchCard = page.locator(".permit-card", { hasText: "Emergency Dispatch" });
    await expect(dispatchCard.locator(".stamp")).toHaveText("Permit Revoked");
    await expect(dispatchCard).toHaveClass(/revoked/);
    // Accuracy stats stay real, not zeroed or hidden.
    await expect(dispatchCard.locator(".stats")).toContainText("4/4 correct");
    await expect(dispatchCard.locator(".stats")).toContainText("100% accuracy");
    // A distinct, explicit revoke-reason banner is present alongside those
    // stats - the old bug this closes was a stage badge changing while the
    // stats silently went stale with no explanation.
    await expect(dispatchCard.locator(".exec-banner")).toContainText("PERMIT REVOKED");
    await expect(dispatchCard.locator(".exec-banner")).toContainText("VERIFIED EXECUTION FAILURE");
    await expect(dispatchCard.locator(".revoke-btn")).toBeDisabled();
  });

  test("VE4: admin reset clears the Verified-Execution-revoked state along with everything else", async ({ page }) => {
    await page.evaluate(async () => {
      state[1].recommendation = { recommendation: "x", reasoning: "y", confidence: 90 };
      await review(1, true, "failed");
    });
    await expect
      .poll(async () => page.evaluate(() => stageFor("dispatch")))
      .toBe("revoked");

    await resetState(page); // goto("/") -> POST /api/admin/reset -> reload, per tests/helpers.js

    const stageAfterReset = await page.evaluate(() => stageFor("dispatch"));
    expect(stageAfterReset).toBe("learner");

    const apiState = await page.evaluate(async () => (await fetch("/api/state")).json());
    expect(apiState.reviewed).toEqual([]);
    expect(apiState.revokedCategories).toEqual([]);

    const dispatchCard = page.locator(".permit-card", { hasText: "Emergency Dispatch" });
    await expect(dispatchCard.locator(".stamp")).toHaveText("Learner's Permit");
    await expect(dispatchCard.locator(".exec-banner")).toHaveCount(0);
  });
});

test.describe("Verified Execution - review UI controls", () => {
  test("VE5: the review panel exposes Judgment and Verified Execution as two independent controls, and only submits once both are set", async ({ page }) => {
    await page.route("**/api/recommendation", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ recommendation: "Dispatch tonight.", reasoning: "Because.", confidence: 90 }),
      })
    );
    await page.evaluate((id) => selectDecision(id), 1);
    await page.locator("#get-rec-btn").click();

    await expect(page.locator(".review-axis")).toHaveCount(2);
    await expect(page.locator(".review-btn.correct")).toBeVisible();
    await expect(page.locator(".review-btn.exec-failed")).toBeVisible();

    // Setting only Judgment does not submit the review yet.
    await page.locator(".review-btn.correct").click();
    await expect(page.locator(".review-result")).toHaveCount(0);
    await expect(page.locator(".review-btn.correct")).toHaveClass(/selected/);

    // Setting Verified Execution too completes the submission.
    await page.locator(".review-btn.exec-failed").click();
    await expect(page.locator(".review-result")).toContainText("FAILED");
    await expect(page.locator(".review-result")).toContainText("correct");
  });
});
