# Learner's Permit — Live Decision Console

The Learner's Permit demo, wrapped as a real Node/Express app so it can run outside a Claude.ai artifact context and eventually deploy to Upsun. Originally a standalone HTML artifact (`learners_permit_demo.html`); this repo is the multi-day build that turns it into a deployable, testable, publicly-shareable app.

## Run it

```
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY and DATABASE_URL (any local/hosted Postgres instance)
npm start
```

Visit `http://localhost:3000` (or whatever `PORT` is set to). "Get Recommendation" now works from any browser, not just inside a Claude.ai artifact - the API call is server-side as of Day 2. Reviewed decisions persist to Postgres as of Day 3; run `npm run seed` against a clean database to pre-populate realistic demo data.

## Security note (Day 2)

Before this app is ever deployed somewhere publicly reachable:

1. Set a hard spend/usage cap on the Anthropic API key in the [Anthropic console](https://console.anthropic.com/) - this is a manual step, not something the code can enforce, and it's the backstop if the app-level rate limits below get bypassed somehow.
2. Set a real `SESSION_SECRET` (not the `dev-secret-change-me` default) via `openssl rand -hex 32`.
3. Confirm `RATE_LIMIT_PER_SESSION_PER_HOUR` / `RATE_LIMIT_PER_IP_PER_HOUR` are set to sane values for the deployment (defaults: 15/hour per session, 30/hour per IP).

**Confirmation this was done before Day 3's public deploy:** _(fill in once done)_

## Deploying to Upsun (Day 3)

`.upsun/config.yaml` defines a `nodejs:20` app with a small `postgresql:16` service bound via the `postgresql` relationship. Upsun doesn't inject a single `DATABASE_URL` - the `.environment` file at the repo root assembles one at container start from the discrete `POSTGRESQL_*` vars the relationship exposes (Upsun's documented pattern; see comments in that file).

Secrets are never committed to `.upsun/config.yaml` (it's in Git). Set them as project variables before or after the first push:

```
upsun variable:create --level project --name ANTHROPIC_API_KEY --value <your key> --sensitive true
upsun variable:create --level project --name SESSION_SECRET --value "$(openssl rand -hex 32)" --sensitive true
# optional, defaults are already sane:
upsun variable:create --level project --name RATE_LIMIT_PER_SESSION_PER_HOUR --value 15
upsun variable:create --level project --name RATE_LIMIT_PER_IP_PER_HOUR --value 30
```

Then push and get the live URL:

```
upsun push
upsun url
```

To seed realistic demo data on the live environment: `upsun ssh -- "npm run seed"`.

To wipe history for a clean demo run: `curl -X POST https://<live-url>/api/admin/reset` (after loading the page once in a browser first, so a session cookie exists - same session gate as every other mutating route).

## Status

This is a work-in-progress, multi-day build. Full spec: `Upsun_Trial_LearnersPermit_Plan_v3.md` and the per-day spec files (`Day1-Wrap-App.md` through `Day5-Polish-CostCheck-Outreach.md`) in the Drive LearnersPermit folder.

- **Day 1:** wrapped in Express, folder scaffolding for later days, local run parity with the original artifact.
- **Day 2:** `/api/recommendation` route holds the Anthropic key server-side and builds the prompt from the server's own trusted scenario data (client sends only a scenario id). Silent session-cookie gate plus per-session/per-IP rate limiting protect the route without adding any friction for a real visitor - see `Day2-Server-Side-API-Controls.md` for the full reasoning. Spend cap on the Anthropic key itself is a manual step, tracked above, not yet done.
- **Day 3 (this commit):** real persistence via a small Upsun-managed PostgreSQL service (`decisions_log` table). `GET /api/state` hydrates the frontend on load; `POST /api/review` writes through on every review; `POST /api/admin/reset` is an unlinked operational control for demo repeatability. `npm run seed` populates realistic demo data on demand. Deployed to Upsun - see above. Note: the existing 39-case test plan's J1 case ("reload = clean slate") and Section 3's reset language are now stale and need updating for Day 4, since reload now shows real persisted history and reset is the new explicit action.
- **Day 4:** MCP server, preview-environment data-cloning demo, CI gate (also owns the test-plan update noted above).
- **Day 5:** stability/cost check, final regression pass, proactive outreach handoff.
