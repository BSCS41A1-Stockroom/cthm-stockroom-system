const express = require("express");
const cors = require("cors");
require("dotenv").config();

const borrowRoutes = require("./routes/borrowRoutes");
const calendarRoutes = require("./routes/calendarRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS."));
  },
}));
app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => {
  res.send("CTHM Stockroom Backend Running");
});

app.use("/api/borrowings", borrowRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/inventory", inventoryRoutes);

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
