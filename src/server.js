const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");

const { issueSessionOnGet } = require("./middleware/session");
const recommendationRoute = require("./routes/recommendation");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

app.use(cookieParser(SESSION_SECRET));
app.use(issueSessionOnGet); // silently issues a session cookie on GET requests only

app.use("/api", recommendationRoute);

app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`Learner's Permit demo listening on port ${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "ANTHROPIC_API_KEY is not set - /api/recommendation will return 502 until it is."
    );
  }
});
