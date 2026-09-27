const express = require("express");
const cors = require("cors");
const path = require("path");

const routes = require("./routes");

const app = express();

app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// API
app.use("/api", routes);

// Portal Routes
app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/admin-login.html"));
});

app.get("/employee/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/employee-login.html"));
});

// Admin Portal Sub-routes
app.get([
  "/admin",
  "/admin/dashboard",
  "/admin/employees",
  "/admin/employees/add",
  "/admin/shifts",
  "/admin/attendance",
  "/admin/reports",
  "/admin/leave"
], (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dashboard.html"));
});

// Employee Portal Sub-routes
app.get([
  "/employee",
  "/employee/dashboard",
  "/employee/schedule",
  "/employee/attendance",
  "/employee/reports",
  "/employee/leave",
  "/employee/profile"
], (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/employee-portal.html"));
});

// Default route
app.get("/", (req, res) => {
  const indexPath = path.join(__dirname, "../frontend/index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.json({ message: "Workforce Management backend is running 🚀" });
    }
  });
});

// ❤️ HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Backend running successfully 🚀"
  });
});


// ❌ 404 HANDLER
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});


module.exports = app;