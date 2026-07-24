const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("CTHM Stockroom Backend Running");
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});