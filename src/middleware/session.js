const crypto = require("crypto");

const SESSION_COOKIE = "sid";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

// Silently issues a signed session cookie on GET requests (page loads, static
// assets) - no login, no visible friction. This is what lets a real visitor
// click "Get Recommendation" with zero extra steps: by the time they load the
// page, they already have a session.
function issueSessionOnGet(req, res, next) {
  const existing = req.signedCookies && req.signedCookies[SESSION_COOKIE];
  if (existing) {
    req.sessionId = existing;
    return next();
  }
  if (req.method === "GET") {
    const sid = crypto.randomUUID();
    res.cookie(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: "lax",
      signed: true,
      maxAge: SESSION_MAX_AGE_MS,
    });
    req.sessionId = sid;
  }
  next();
}

// Gate for the recommendation route: a request with no session cookie never
// loaded the page first, so it's treated as a scripted/anonymous hit and
// blocked here rather than silently issued a fresh session on the spot -
// that would defeat the point of requiring a page load at all.
function requireSession(req, res, next) {
  const sid = req.signedCookies && req.signedCookies[SESSION_COOKIE];
  if (!sid) {
    return res.status(429).json({
      error: "No active session. Load the page first, then try again.",
    });
  }
  req.sessionId = sid;
  next();
}

// Gate for the true global-wipe admin route (POST /api/admin/reset). This
// is intentionally a different mechanism from the session cookie above:
// the session cookie identifies "a visitor," not "the operator," and any
// visitor can get one just by loading the page. ADMIN_RESET_TOKEN is a
// separate secret (env var, never sent to the browser, never derived from
// a session) that only the operator holds - a static bearer token compared
// with a constant-time check is the right amount of engineering for a
// single-operator control; a JWT would only add expiry/claims machinery
// nothing here needs. Fails closed: if the server has no token configured,
// every request is rejected rather than silently allowed.
function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_RESET_TOKEN;
  const supplied = req.get("x-admin-token") || "";
  if (!configured) {
    return res.status(503).json({ error: "Admin reset is not configured on this server." });
  }
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(String(configured));
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) {
    return res.status(403).json({ error: "Invalid or missing admin token." });
  }
  next();
}

module.exports = { issueSessionOnGet, requireSession, requireAdmin, SESSION_COOKIE };
