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

module.exports = { issueSessionOnGet, requireSession, SESSION_COOKIE };
