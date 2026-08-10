const rateLimit = require("express-rate-limit");

const HOUR_MS = 1000 * 60 * 60;

// Per-session limiter: keyed on the signed session cookie set in session.js.
// This is the primary control, since it follows a real visitor around
// regardless of IP (shared office networks, mobile carriers, etc.) without
// being easy to churn the way an IP can be.
const perSessionLimiter = rateLimit({
  windowMs: HOUR_MS,
  max: Number(process.env.RATE_LIMIT_PER_SESSION_PER_HOUR || 15),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.sessionId || "no-session",
  message: { error: "Rate limit reached for this session. Try again later." },
});

// Per-IP limiter: a second layer in case sessions get churned (cookies
// cleared, private browsing, etc.). Looser than the per-session limit since
// it's meant to catch abuse patterns, not normal multi-tab browsing.
const perIpLimiter = rateLimit({
  windowMs: HOUR_MS,
  max: Number(process.env.RATE_LIMIT_PER_IP_PER_HOUR || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit reached for this network. Try again later." },
});

module.exports = { perSessionLimiter, perIpLimiter };
