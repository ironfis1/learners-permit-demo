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
