// ===================================================
// Vercel Serverless Function Handler
// Workforce Management System
// ===================================================

const app = require("../backend/app");
const migrate = require("../backend/config/migrate");

let migrationPromise = null;

module.exports = async (req, res) => {
  // Lazily run database migrations on serverless cold-start
  if (!migrationPromise) {
    migrationPromise = migrate().catch(err => {
      console.warn("Vercel startup migration note (check DB connection):", err.message);
    });
  }

  // Await migration if running, then dispatch request to Express
  try {
    await migrationPromise;
  } catch (e) {
    // Continue even if initial migration failed so health checks & informative errors work
  }

  return app(req, res);
};
