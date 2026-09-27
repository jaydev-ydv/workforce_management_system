const pool = require("../config/db");

async function createNotification({ userId = null, employeeId = null, title, message, type = "general" }) {
  try {
    const [result] = await pool.execute(
      `INSERT INTO notifications (user_id, employee_id, title, message, type, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, 0, NOW())`,
      [userId, employeeId, title, message, type]
    );
    return result.insertId;
  } catch (err) {
    console.error("Failed to create notification:", err.message);
    return null;
  }
}

async function getNotifications({ userId = null, employeeId = null, limit = 50 }) {
  try {
    let query = "SELECT * FROM notifications WHERE 1=1";
    const params = [];

    if (employeeId && userId) {
      query += " AND (employee_id = ? OR user_id = ?)";
      params.push(employeeId, userId);
    } else if (employeeId) {
      query += " AND employee_id = ?";
      params.push(employeeId);
    } else if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }

    query += " ORDER BY id DESC LIMIT ?";
    params.push(limit);

    const [rows] = await pool.query(query, params);
    return rows;
  } catch (err) {
    console.error("Failed to fetch notifications:", err.message);
    return [];
  }
}

async function markNotificationAsRead(id, employeeId = null, userId = null) {
  try {
    let query = "UPDATE notifications SET is_read = 1 WHERE id = ?";
    const params = [id];

    if (employeeId && userId) {
      query += " AND (employee_id = ? OR user_id = ?)";
      params.push(employeeId, userId);
    } else if (employeeId) {
      query += " AND employee_id = ?";
      params.push(employeeId);
    } else if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }

    await pool.execute(query, params);
    return true;
  } catch (err) {
    console.error("Failed to mark notification as read:", err.message);
    return false;
  }
}

async function markAllNotificationsAsRead(employeeId = null, userId = null) {
  try {
    let query = "UPDATE notifications SET is_read = 1 WHERE 1=1";
    const params = [];

    if (employeeId && userId) {
      query += " AND (employee_id = ? OR user_id = ?)";
      params.push(employeeId, userId);
    } else if (employeeId) {
      query += " AND employee_id = ?";
      params.push(employeeId);
    } else if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }

    await pool.execute(query, params);
    return true;
  } catch (err) {
    console.error("Failed to mark all notifications read:", err.message);
    return false;
  }
}

module.exports = {
  createNotification,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
};
