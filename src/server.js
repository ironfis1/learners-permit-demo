require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");

const { issueSessionOnGet } = require("./middleware/session");
const recommendationRoute = require("./routes/recommendation");
const persistenceRoute = require("./routes/persistence");
const mcpRoute = require("./mcp/server");
const { initDb } = require("./db/init");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

// Day 5 burst/spend sanity check surfaced this: Upsun's router sits in front
// of the app as a reverse proxy, so without telling Express that, req.ip is
// always the router's own address - every visitor, not just concurrent ones,
// collapses into a single bucket for perIpLimiter (see
// src/middleware/rateLimit.js), which is keyed on req.ip via
// express-rate-limit's default keyGenerator. Confirmed directly: two
// separate sessions with two different (spoofed) client IPs drained the
// *same* RateLimit-Remaining counter instead of getting their own. In
// production that means the per-IP limit silently behaves as one shared cap
// across all concurrent traffic, not a per-visitor one - exactly the kind of
// thing that trips during a real recruiter-traffic burst.
//
// `1` = trust exactly one hop (Upsun's own router) so express derives req.ip
// from the X-Forwarded-For entry that router sets, and no further back than
// that. Deliberately not `true` (trust every hop) - express-rate-limit's own
// validation flags that as ERR_ERL_PERMISSIVE_TRUST_PROXY, since it lets a
// client trivially spoof its own X-Forwarded-For to dodge the limiter
// entirely. If Upsun's routing layer is ever more than one hop deep, this
// number needs to grow to match - it's a hop *count*, not a boolean.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));

app.use(cookieParser(SESSION_SECRET));
app.use(issueSessionOnGet); // silently issues a session cookie on GET requests only

app.use("/api", recommendationRoute);
app.use("/api", persistenceRoute);
app.use("/", mcpRoute); // registers POST/GET/DELETE /mcp

app.use(express.static(path.join(__dirname, "..", "public")));

async function start() {
  try {
    await initDb();
  } catch (err) {
    console.error(
      "Database init failed - /api/state, /api/review, and /api/admin/reset will return 502 until this is fixed:",
      err.message
    );
  }

  app.listen(PORT, () => {
    console.log(`Learner's Permit demo listening on port ${PORT}`);
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn(
        "ANTHROPIC_API_KEY is not set - /api/recommendation will return 502 until it is."
      );
    }
    if (!process.env.DATABASE_URL) {
      console.warn(
        "No DATABASE_URL set - persistence endpoints will return 502 until it is."
      );
    }
  });
}

start();
