const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Static assets (the wrapped artifact). Routes, db, and mcp modules get
// mounted here in later days — this file intentionally stays minimal for Day 1.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Learner's Permit demo listening on port ${PORT}`);
});
