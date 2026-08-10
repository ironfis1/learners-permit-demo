# Learner's Permit — Live Decision Console

The Learner's Permit demo, wrapped as a real Node/Express app so it can run outside a Claude.ai artifact context and eventually deploy to Upsun. Originally a standalone HTML artifact (`learners_permit_demo.html`); this repo is the multi-day build that turns it into a deployable, testable, publicly-shareable app.

## Run it

```
npm install
npm start
```

Visit `http://localhost:3000` (or whatever `PORT` is set to).

## Status

This is a work-in-progress, multi-day build. Full spec: `Upsun_Trial_LearnersPermit_Plan_v3.md` and the per-day spec files (`Day1-Wrap-App.md` through `Day5-Polish-CostCheck-Outreach.md`) in the Drive LearnersPermit folder.

- **Day 1 (this commit):** wrapped in Express, folder scaffolding for later days, local run parity with the original artifact. The "Get Recommendation" button still calls `api.anthropic.com` directly and only works inside a Claude.ai artifact context — that's expected, not a bug. Fixing it is Day 2's job.
- **Day 2:** move the API call server-side, add session gating + rate limiting + spend cap.
- **Day 3:** add real persistence (Upsun-managed PostgreSQL), deploy to Upsun.
- **Day 4:** MCP server, preview-environment data-cloning demo, CI gate.
- **Day 5:** stability/cost check, final regression pass, proactive outreach handoff.
