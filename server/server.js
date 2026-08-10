const express = require("express");
const cors = require("cors");
require("dotenv").config();

const borrowRoutes = require("./routes/borrowRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("CTHM Stockroom Backend Running");
});

app.use("/api/borrowings", borrowRoutes);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: "BORROWING_PROCESSING_FAILED",
    message: process.env.NODE_ENV === "production" ? "Unable to process the borrowing request." : error.message,
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
