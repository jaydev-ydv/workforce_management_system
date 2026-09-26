require("dotenv").config();

const app = require("./app");

const runMigrations = require("./config/migrate");

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.warn("⚠️ Migration notice:", err.message);
  }

  if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  }
}

start();

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
  process.exit(1);
});