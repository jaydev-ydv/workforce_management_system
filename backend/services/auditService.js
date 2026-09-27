const pool = require("../config/db");

async function logAudit({ userId = null, username = null, action, entityType, entityId = null, details = null, req = null }) {
  try {
    let ip = null;
    if (req) {
      ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;
      if (!userId && req.user) {
        userId = req.user.id;
        username = req.user.username;
      }
    }

    const detailStr = typeof details === "object" ? JSON.stringify(details) : details;

    await pool.execute(
      `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, username, action, entityType, String(entityId || ""), detailStr, ip]
    );
  } catch (err) {
    console.error("Audit log error:", err.message);
  }
}

module.exports = {
  logAudit
};
