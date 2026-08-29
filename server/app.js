const express = require("express");
const cors = require("cors");

const borrowRoutes = require("./routes/borrowRoutes");
const calendarRoutes = require("./routes/calendarRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const reportRoutes = require("./routes/reportRoutes");
const auditRoutes = require("./routes/auditRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const userRoutes = require("./routes/userRoutes");
const jobRoutes = require("./routes/jobRoutes");

const app = express();

const allowedOrigins = (
  process.env.CLIENT_URL || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS."));
    },
  })
);

app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => {
  res.send("CTHM Stockroom Backend Running");
});

app.use("/api/borrowings", borrowRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/jobs", jobRoutes);

app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    error: "BORROWING_PROCESSING_FAILED",
    message:
      process.env.NODE_ENV === "production"
        ? "Unable to process the request."
        : error.message,
  });
});

module.exports = app;
