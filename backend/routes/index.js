const express = require("express");
let bcrypt;
try {
  bcrypt = require("bcryptjs");
} catch (e) {
  bcrypt = require("bcrypt");
}
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { sendWelcomeEmail } = require("../services/emailService");
const { createNotification, getNotifications, markNotificationAsRead, markAllNotificationsAsRead } = require("../services/notificationService");
const { logAudit } = require("../services/auditService");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_jwt_key_2026";

// ===================================================
// Authentication & Authorization Middlewares
// ===================================================
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Authentication token required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Session invalid or expired. Please log in again." });
    req.user = user;
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access forbidden: Requires ${roles.join(" or ")} privilege` });
    }
    next();
  };
}

// ===================================================
// Helper: Generate Unique Employee ID
// Format: EMP<YYYY><3-digit sequence>, e.g. EMP2026001
// ===================================================
async function generateEmployeeId() {
  const currentYear = new Date().getFullYear();
  const prefix = `EMP${currentYear}`;
  
  const [rows] = await pool.execute(
    "SELECT id FROM employees WHERE id LIKE ? ORDER BY id DESC LIMIT 1",
    [`${prefix}%`]
  );

  if (rows.length === 0) {
    return `${prefix}001`;
  }

  const lastId = rows[0].id;
  const lastSeq = parseInt(lastId.replace(prefix, ""), 10);
  const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

// Generate random secure temporary password
function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let pwd = "Emp@";
  for (let i = 0; i < 6; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

// ===================================================
// 1. Role-Based Authentication Routes
// ===================================================

// Admin / Manager Login
router.post("/auth/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE (username = ? OR email = ?) AND (role = 'admin' OR role = 'manager')",
      [username, username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid admin credentials or unauthorized role" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, employee_id: user.employee_id },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    await logAudit({ userId: user.id, username: user.username, action: "ADMIN_LOGIN", entityType: "user", entityId: user.id, req });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        portal: "admin"
      }
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Employee Login
router.post("/auth/employee/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Employee ID and password are required" });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE (username = ? OR employee_id = ? OR email = ?) AND role = 'employee'",
      [username, username, username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Employee account not found or access restricted" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid Employee ID or password" });
    }

    // Lookup employee profile details
    let empProfile = null;
    if (user.employee_id) {
      const [empRows] = await pool.execute("SELECT * FROM employees WHERE id = ?", [user.employee_id]);
      if (empRows.length > 0) empProfile = empRows[0];
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: "employee", employee_id: user.employee_id },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    await logAudit({ userId: user.id, username: user.username, action: "EMPLOYEE_LOGIN", entityType: "user", entityId: user.id, req });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: "employee",
        employee_id: user.employee_id,
        employee_name: empProfile ? empProfile.name : user.username,
        department: empProfile ? empProfile.department : "General",
        designation: empProfile ? empProfile.designation : "Staff",
        must_change_password: Boolean(user.must_change_password),
        portal: "employee"
      }
    });
  } catch (err) {
    console.error("Employee login error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Universal Login Gateway (Auto-detects role and directs to proper portal)
router.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username/ID and password are required" });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE username = ? OR employee_id = ? OR email = ?",
      [username, username, username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    let empProfile = null;
    if (user.employee_id) {
      const [empRows] = await pool.execute("SELECT * FROM employees WHERE id = ?", [user.employee_id]);
      if (empRows.length > 0) empProfile = empRows[0];
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role || "employee", employee_id: user.employee_id },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || "employee",
        employee_id: user.employee_id,
        employee_name: empProfile ? empProfile.name : user.username,
        department: empProfile ? empProfile.department : "General",
        designation: empProfile ? empProfile.designation : "Staff",
        must_change_password: Boolean(user.must_change_password),
        portal: user.role === "admin" || user.role === "manager" ? "admin" : "employee"
      }
    });
  } catch (err) {
    console.error("Universal login error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Force Password Change (First login or self-service)
router.post("/auth/change-password", auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.trim().length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });

    const user = rows[0];

    // If current password provided, verify it
    if (current_password) {
      const match = await bcrypt.compare(current_password, user.password);
      if (!match) {
        return res.status(400).json({ error: "Current password does not match" });
      }
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await pool.execute(
      "UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?",
      [hashed, user.id]
    );

    await logAudit({ userId: user.id, username: user.username, action: "PASSWORD_CHANGED", entityType: "user", entityId: user.id, req });

    res.json({ message: "Password updated successfully. You can now use your new password." });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get Current User Profile
router.get("/auth/me", auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, username, email, role, employee_id, must_change_password, status FROM users WHERE id = ?",
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });

    const user = rows[0];
    let empProfile = null;
    if (user.employee_id) {
      const [empRows] = await pool.execute("SELECT * FROM employees WHERE id = ?", [user.employee_id]);
      if (empRows.length > 0) empProfile = empRows[0];
    }

    res.json({
      user: {
        ...user,
        must_change_password: Boolean(user.must_change_password),
        profile: empProfile
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================
// 2. Admin Employee Registration & Management
// ===================================================

// Add New Employee (Generates ID, temporary password, sends email)
router.post(["/admin/employees", "/employees"], auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      dob,
      gender,
      address,
      department,
      role,
      designation,
      joining_date,
      employment_type,
      manager,
      emergency_name,
      emergency_relation,
      emergency_phone,
      custom_id
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Employee full name is required" });
    }

    // Auto-generate or use custom Employee ID
    const employeeId = custom_id && custom_id.trim() ? custom_id.trim() : await generateEmployeeId();

    // Check unique ID
    const [existingEmp] = await pool.execute("SELECT id FROM employees WHERE id = ?", [employeeId]);
    if (existingEmp.length > 0) {
      return res.status(400).json({ error: `Employee ID "${employeeId}" already exists. Please use a unique ID.` });
    }

    // Format email or auto-generate fallback
    const validEmail = email && email.trim()
      ? email.trim()
      : `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.${employeeId.toLowerCase()}@workforce.com`;

    // Check unique email in users
    const [existingUser] = await pool.execute("SELECT id FROM users WHERE email = ? OR username = ?", [validEmail, employeeId]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: `An account with email or username already exists.` });
    }

    // Generate secure temporary password
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 1. Insert into employees
    await pool.execute(
      `INSERT INTO employees (
        id, name, email, phone, dob, gender, address, department, role,
        designation, joining_date, employment_type, manager, emergency_name,
        emergency_relation, emergency_phone, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [
        employeeId,
        name.trim(),
        validEmail,
        phone || null,
        dob || null,
        gender || null,
        address || null,
        department || "Operations",
        role || "Staff",
        designation || role || "Associate",
        joining_date || new Date().toISOString().slice(0, 10),
        employment_type || "Full-Time",
        manager || null,
        emergency_name || null,
        emergency_relation || null,
        emergency_phone || null
      ]
    );

    // 2. Insert into users with must_change_password = 1
    const [userResult] = await pool.execute(
      `INSERT INTO users (username, password, email, role, employee_id, must_change_password, status, created_at)
       VALUES (?, ?, ?, 'employee', ?, 1, 'active', NOW())`,
      [employeeId, hashedPassword, validEmail, employeeId]
    );

    // 3. Dispatch Email
    const loginUrl = `${req.protocol}://${req.get("host")}/employee-login.html`;
    await sendWelcomeEmail({
      name: name.trim(),
      email: validEmail,
      employeeId,
      tempPassword,
      loginUrl
    });

    // 4. Create Initial Welcome Notification
    await createNotification({
      userId: userResult.insertId,
      employeeId,
      title: "Welcome to Workforce Hub",
      message: `Your account (ID: ${employeeId}) has been successfully provisioned. Please change your temporary password after logging in.`,
      type: "account_created"
    });

    // 5. Audit Log
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: "CREATE_EMPLOYEE",
      entityType: "employee",
      entityId: employeeId,
      details: { name, department, role, email: validEmail },
      req
    });

    res.status(201).json({
      message: `Employee "${name}" created successfully. Login credentials generated and dispatched.`,
      employee_id: employeeId,
      employee: {
        id: employeeId,
        name: name.trim(),
        email: validEmail,
        department: department || "Operations",
        designation: designation || role || "Associate",
        role: role || "Staff"
      },
      temporary_password: tempPassword,
      login_url: loginUrl
    });
  } catch (err) {
    console.error("Error creating employee:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get All Employees (with metrics & current shift status)
router.get(["/admin/employees", "/employees"], auth, async (req, res) => {
  try {
    const [employees] = await pool.execute(
      `SELECT e.*,
        (SELECT COUNT(*) FROM shifts s WHERE s.employee_id = e.id) as total_shifts,
        (SELECT COUNT(*) FROM shifts s WHERE s.employee_id = e.id AND s.attendance_status IN ('completed', 'present')) as attended_shifts,
        (SELECT title FROM shifts s WHERE s.employee_id = e.id AND s.shift_date = CURDATE() LIMIT 1) as today_shift,
        (SELECT attendance_status FROM shifts s WHERE s.employee_id = e.id AND s.shift_date = CURDATE() LIMIT 1) as today_status
       FROM employees e
       ORDER BY e.created_at DESC, e.id DESC`
    );

    // Calculate attendance percentage for each employee
    const enriched = employees.map(emp => {
      const total = Number(emp.total_shifts) || 0;
      const attended = Number(emp.attended_shifts) || 0;
      const pct = total > 0 ? Math.round((attended / total) * 100) : 100;
      return {
        ...emp,
        attendance_percentage: pct
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error("Error fetching employees:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get Single Employee Profile
router.get("/admin/employees/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute("SELECT * FROM employees WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Employee not found" });

    const employee = rows[0];
    const [recentShifts] = await pool.execute(
      "SELECT * FROM shifts WHERE employee_id = ? ORDER BY shift_date DESC LIMIT 10",
      [id]
    );

    res.json({
      employee,
      recent_shifts: recentShifts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Employee Profile
router.put("/admin/employees/:id", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, dob, gender, address, department,
      role, designation, employment_type, manager,
      emergency_name, emergency_relation, emergency_phone, status
    } = req.body;

    const [existing] = await pool.execute("SELECT * FROM employees WHERE id = ?", [id]);
    if (existing.length === 0) return res.status(404).json({ error: "Employee not found" });

    await pool.execute(
      `UPDATE employees SET
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        dob = COALESCE(?, dob),
        gender = COALESCE(?, gender),
        address = COALESCE(?, address),
        department = COALESCE(?, department),
        role = COALESCE(?, role),
        designation = COALESCE(?, designation),
        employment_type = COALESCE(?, employment_type),
        manager = COALESCE(?, manager),
        emergency_name = COALESCE(?, emergency_name),
        emergency_relation = COALESCE(?, emergency_relation),
        emergency_phone = COALESCE(?, emergency_phone),
        status = COALESCE(?, status)
       WHERE id = ?`,
      [
        name, email, phone, dob, gender, address, department,
        role, designation, employment_type, manager,
        emergency_name, emergency_relation, emergency_phone, status,
        id
      ]
    );

    await logAudit({ userId: req.user.id, username: req.user.username, action: "UPDATE_EMPLOYEE", entityType: "employee", entityId: id, details: req.body, req });

    res.json({ message: "Employee details updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Employee (Cascading delete)
router.delete(["/admin/employees/:id", "/employees/:id"], auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { id } = req.params;

    const [employees] = await pool.execute("SELECT id, name FROM employees WHERE id = ?", [id]);
    if (employees.length === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const empName = employees[0].name;

    // 1. Delete associated shifts
    await pool.execute("DELETE FROM shifts WHERE employee_id = ?", [id]);

    // 2. Delete leave requests
    await pool.execute("DELETE FROM leave_requests WHERE employee_id = ?", [id]);

    // 3. Delete notifications
    await pool.execute("DELETE FROM notifications WHERE employee_id = ?", [id]);

    // 4. Delete user login account (safeguard: never delete admin accounts)
    await pool.execute("DELETE FROM users WHERE (employee_id = ? OR username = ?) AND role = 'employee'", [id, id]);

    // 5. Delete employee record
    await pool.execute("DELETE FROM employees WHERE id = ?", [id]);

    await logAudit({ userId: req.user.id, username: req.user.username, action: "DELETE_EMPLOYEE", entityType: "employee", entityId: id, details: { name: empName }, req });

    res.json({
      message: `Employee "${empName}" (ID: ${id}) deleted permanently from database.`,
      deletedId: id
    });
  } catch (err) {
    console.error("Delete employee error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===================================================
// 3. Shift Management & Scheduling
// ===================================================

// Create Shift / Assign Shift
router.post(["/admin/shifts", "/shifts"], auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { employee_id, date, start, end, title, break_duration, department } = req.body;

    if (!employee_id || !date || !start || !end) {
      return res.status(400).json({ error: "Missing required fields (employee_id, date, start, end)" });
    }

    // Verify employee exists
    const [employees] = await pool.execute("SELECT id, name, department FROM employees WHERE id = ?", [employee_id]);
    if (employees.length === 0) {
      return res.status(404).json({ error: "Selected employee not found" });
    }
    const emp = employees[0];

    // Conflict Check: Check if employee already has an overlapping shift on the same date
    const [conflicts] = await pool.execute(
      `SELECT id, title, start_time, end_time FROM shifts
       WHERE employee_id = ? AND shift_date = ?
       AND ((start_time < ? AND end_time > ?) OR (start_time >= ? AND start_time < ?))`,
      [employee_id, date, end, start, start, end]
    );

    if (conflicts.length > 0) {
      return res.status(409).json({
        error: `Schedule conflict: ${emp.name} already has an assigned shift "${conflicts[0].title}" (${conflicts[0].start_time} - ${conflicts[0].end_time}) on this date.`
      });
    }

    const shiftTitle = title || "Day Shift";
    const shiftDept = department || emp.department || "Operations";
    const breakDur = break_duration || "1 Hour";

    const [result] = await pool.execute(
      `INSERT INTO shifts (title, employee_id, shift_date, start_time, end_time, break_duration, department, attendance_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', NOW())`,
      [shiftTitle, employee_id, date, start, end, breakDur, shiftDept]
    );

    // Notify Employee
    await createNotification({
      employeeId: employee_id,
      title: "New Shift Assigned",
      message: `You have been assigned to ${shiftTitle} on ${date} (${start} - ${end}).`,
      type: "shift_assigned"
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: "ASSIGN_SHIFT",
      entityType: "shift",
      entityId: result.insertId,
      details: { employee_id, date, title: shiftTitle },
      req
    });

    res.status(201).json({
      message: `Shift assigned successfully to ${emp.name}`,
      shiftId: result.insertId
    });
  } catch (err) {
    console.error("Create shift error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get All Shifts
router.get(["/admin/shifts", "/shifts"], auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT s.*, e.name as employee_name, e.department as employee_dept
       FROM shifts s
       LEFT JOIN employees e ON s.employee_id = e.id
       ORDER BY s.shift_date DESC, s.start_time ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Shift
router.put(["/admin/shifts/:id", "/shifts/:id"], auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, shift_date, date, start_time, start, end_time, end, employee_id, break_duration, department } = req.body;

    const [shifts] = await pool.execute("SELECT * FROM shifts WHERE id = ?", [id]);
    if (shifts.length === 0) return res.status(404).json({ error: "Shift not found" });

    const shift = shifts[0];
    const newDate = shift_date || date || shift.shift_date;
    const newStart = start_time || start || shift.start_time;
    const newEnd = end_time || end || shift.end_time;
    const newTitle = title || shift.title;
    const newEmpId = employee_id || shift.employee_id;
    const newBreak = break_duration || shift.break_duration;
    const newDept = department || shift.department;

    await pool.execute(
      `UPDATE shifts SET
        title = ?,
        employee_id = ?,
        shift_date = ?,
        start_time = ?,
        end_time = ?,
        break_duration = ?,
        department = ?
       WHERE id = ?`,
      [newTitle, newEmpId, newDate, newStart, newEnd, newBreak, newDept, id]
    );

    // Notify employee of modification
    if (newEmpId) {
      await createNotification({
        employeeId: newEmpId,
        title: "Shift Updated",
        message: `Your shift "${newTitle}" on ${newDate} has been updated (${newStart} - ${newEnd}).`,
        type: "shift_updated"
      });
    }

    res.json({ message: "Shift updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Shift
router.delete(["/admin/shifts/:id", "/shifts/:id"], auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.execute("DELETE FROM shifts WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Shift not found" });
    }

    await logAudit({ userId: req.user.id, username: req.user.username, action: "DELETE_SHIFT", entityType: "shift", entityId: id, req });

    res.json({ message: "Shift deleted successfully from database" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================
// 4. Punch-In / Punch-Out System (Server Timestamps)
// ===================================================

// Employee Punch In
router.post("/attendance/punch-in", auth, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: "No employee profile associated with this account" });
    }

    const { shift_id } = req.body;
    let activeShift = null;

    if (shift_id) {
      const [shifts] = await pool.execute(
        "SELECT * FROM shifts WHERE id = ? AND employee_id = ?",
        [shift_id, employeeId]
      );
      if (shifts.length > 0) activeShift = shifts[0];
    }

    if (!activeShift) {
      // Find shift scheduled for today or matching current date window
      const [shifts] = await pool.execute(
        `SELECT * FROM shifts
         WHERE employee_id = ? AND (shift_date = CURDATE() OR ABS(DATEDIFF(shift_date, CURDATE())) <= 1)
         ORDER BY ABS(DATEDIFF(shift_date, CURDATE())) ASC, start_time ASC`,
        [employeeId]
      );

      if (shifts.length === 0) {
        return res.status(400).json({
          error: "No scheduled shift found for today. You can only punch in for an admin-assigned shift."
        });
      }

      activeShift = shifts.find(s => s.attendance_status !== "completed" && s.attendance_status !== "leave" && s.attendance_status !== "present") || shifts[0];
    }

    if (activeShift.punch_in_time || activeShift.attendance_status === "punched_in" || activeShift.attendance_status === "present") {
      return res.status(400).json({ error: "You have already punched in for this shift." });
    }

    // Calculate late minutes by comparing scheduled start_time with current time
    const now = new Date();
    const [schedH, schedM] = String(activeShift.start_time).split(":").map(Number);
    const schedDate = new Date();
    schedDate.setHours(schedH, schedM, 0, 0);

    let lateMinutes = 0;
    if (now > schedDate) {
      lateMinutes = Math.floor((now - schedDate) / (1000 * 60));
    }

    await pool.execute(
      `UPDATE shifts SET
        punch_in_time = NOW(),
        late_minutes = ?,
        attendance_status = 'punched_in'
       WHERE id = ?`,
      [lateMinutes, activeShift.id]
    );

    // Notify Managers
    await createNotification({
      title: "Employee Punched In",
      message: `${req.user.username} punched in for "${activeShift.title}" at ${now.toLocaleTimeString()}.${lateMinutes > 10 ? ` (${lateMinutes}m Late)` : ""}`,
      type: "punch_in"
    });

    res.json({
      message: "Punched in successfully! Attendance submitted for admin review.",
      punch_in_time: now.toISOString(),
      late_minutes: lateMinutes,
      shift_id: activeShift.id
    });
  } catch (err) {
    console.error("Punch-in error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Employee Punch Out
router.post("/attendance/punch-out", auth, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: "No employee profile associated with this account" });
    }

    const { shift_id } = req.body;
    let shift = null;

    if (shift_id) {
      const [shifts] = await pool.execute(
        "SELECT * FROM shifts WHERE id = ? AND employee_id = ? AND punch_in_time IS NOT NULL AND punch_out_time IS NULL",
        [shift_id, employeeId]
      );
      if (shifts.length > 0) shift = shifts[0];
    }

    if (!shift) {
      // Find active shift with punch_in_time and no punch_out_time
      const [shifts] = await pool.execute(
        `SELECT * FROM shifts
         WHERE employee_id = ? AND punch_in_time IS NOT NULL AND punch_out_time IS NULL
         ORDER BY punch_in_time DESC
         LIMIT 1`,
        [employeeId]
      );

      if (shifts.length === 0) {
        return res.status(400).json({
          error: "Cannot punch out. You must punch in first before completing your shift."
        });
      }
      shift = shifts[0];
    }

    const now = new Date();
    const punchIn = new Date(shift.punch_in_time);

    // Calculate total working hours
    const diffSeconds = Math.max(0, Math.floor((now - punchIn) / 1000));
    const workingHours = parseFloat((diffSeconds / 3600).toFixed(2));

    // Calculate scheduled duration
    const [sh, sm] = String(shift.start_time).split(":").map(Number);
    const [eh, em] = String(shift.end_time).split(":").map(Number);
    let schedHours = eh - sh + (em - sm) / 60;
    if (schedHours < 0) schedHours += 24;

    const overtime = parseFloat(Math.max(0, workingHours - schedHours).toFixed(2));

    await pool.execute(
      `UPDATE shifts SET
        punch_out_time = NOW(),
        working_hours = ?,
        overtime_hours = ?,
        attendance_status = 'punched_out'
       WHERE id = ?`,
      [workingHours, overtime, shift.id]
    );

    // Notify Managers
    await createNotification({
      title: "Employee Punched Out",
      message: `${req.user.username} punched out for "${shift.title}". Total logged: ${workingHours} hrs (Overtime: ${overtime} hrs).`,
      type: "punch_out"
    });

    res.json({
      message: "Punched out successfully. Work hours recorded.",
      punch_out_time: now.toISOString(),
      working_hours: workingHours,
      overtime_hours: overtime
    });
  } catch (err) {
    console.error("Punch-out error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===================================================
// 5. Admin Attendance Management & Verification
// ===================================================

// Get Attendance Records
router.get("/admin/attendance", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT s.*, e.name as employee_name, e.department as employee_dept
       FROM shifts s
       JOIN employees e ON s.employee_id = e.id
       ORDER BY s.shift_date DESC, s.start_time DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Confirms Attendance (Present / Absent / Late / Half Day)
router.put(["/admin/attendance/:id/confirm", "/attendance/:id/confirm"], auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body; // status: present, absent, late, half_day, completed

    const targetStatus = status || "present";

    // Auto-calculate working hours if punch times exist
    const [shifts] = await pool.execute("SELECT * FROM shifts WHERE id = ?", [id]);
    if (shifts.length === 0) return res.status(404).json({ error: "Shift record not found" });

    const shift = shifts[0];
    let hours = shift.working_hours;

    if ((!hours || Number(hours) === 0) && shift.start_time && shift.end_time) {
      const [sh, sm] = String(shift.start_time).split(":").map(Number);
      const [eh, em] = String(shift.end_time).split(":").map(Number);
      let diff = eh - sh + (em - sm) / 60;
      if (diff < 0) diff += 24;
      hours = parseFloat(diff.toFixed(2));
    }

    await pool.execute(
      `UPDATE shifts SET
        attendance_status = ?,
        admin_confirmed = 1,
        admin_remarks = ?,
        working_hours = ?
       WHERE id = ?`,
      [targetStatus, remarks || "Verified by Administrator", hours, id]
    );

    // Notify employee of confirmation
    if (shift.employee_id) {
      await createNotification({
        employeeId: shift.employee_id,
        title: "Attendance Confirmed",
        message: `Your shift on ${shift.shift_date} has been confirmed as ${targetStatus.toUpperCase()} by management.`,
        type: "attendance_confirmed"
      });
    }

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: "CONFIRM_ATTENDANCE",
      entityType: "shift",
      entityId: id,
      details: { status: targetStatus, remarks },
      req
    });

    res.json({ message: `Attendance marked as ${targetStatus.toUpperCase()} successfully` });
  } catch (err) {
    console.error("Confirm attendance error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Legacy attendance update endpoint for backwards compatibility
router.post("/attendance", auth, async (req, res) => {
  try {
    const { shift_id, status, leave_type } = req.body;
    if (!shift_id || !status) {
      return res.status(400).json({ error: "shift_id and status are required" });
    }

    const [shifts] = await pool.execute("SELECT * FROM shifts WHERE id = ?", [shift_id]);
    if (shifts.length === 0) return res.status(404).json({ error: "Shift not found" });

    const shift = shifts[0];
    let workingHours = shift.working_hours || 0;

    if (status === "present" || status === "completed") {
      const [sh, sm] = String(shift.start_time).split(":").map(Number);
      const [eh, em] = String(shift.end_time).split(":").map(Number);
      let diff = eh - sh + (em - sm) / 60;
      if (diff < 0) diff += 24;
      workingHours = parseFloat(diff.toFixed(2));
    }

    await pool.execute(
      `UPDATE shifts SET
        attendance_status = ?,
        leave_type = ?,
        working_hours = ?,
        admin_confirmed = 1
       WHERE id = ?`,
      [status, leave_type || null, workingHours, shift_id]
    );

    res.json({ message: "Attendance updated", completed_hours: workingHours });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================
// 6. Leave Management System
// ===================================================

// Employee: Submit Leave Request
router.post("/employee/leave", auth, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) return res.status(400).json({ error: "No employee profile linked to user" });

    const { leave_type, start_date, end_date, reason } = req.body;
    if (!leave_type || !start_date || !end_date || !reason) {
      return res.status(400).json({ error: "All leave fields (leave_type, start_date, end_date, reason) are required" });
    }

    if (new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ error: "End date must be on or after start date" });
    }

    const [result] = await pool.execute(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [employeeId, leave_type, start_date, end_date, reason]
    );

    // Notify Admins
    await createNotification({
      title: "New Leave Request",
      message: `${req.user.username} submitted a ${leave_type} request for ${start_date} to ${end_date}.`,
      type: "leave_requested"
    });

    res.status(201).json({
      message: "Leave application submitted successfully. Awaiting managerial review.",
      leaveId: result.insertId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee: Get My Leave Requests
router.get("/employee/leave", auth, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) return res.status(400).json({ error: "No employee profile linked" });

    const [rows] = await pool.execute(
      "SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY id DESC",
      [employeeId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: View All Leave Requests
router.get("/admin/leave", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT lr.*, e.name as employee_name, e.department as employee_dept, e.role as employee_role
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       ORDER BY lr.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Approve Leave Request
router.put("/admin/leave/:id/approve", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const [leaves] = await pool.execute("SELECT * FROM leave_requests WHERE id = ?", [id]);
    if (leaves.length === 0) return res.status(404).json({ error: "Leave request not found" });

    const leave = leaves[0];

    await pool.execute(
      `UPDATE leave_requests SET
        status = 'approved',
        admin_remarks = ?,
        reviewed_by = ?,
        reviewed_at = NOW()
       WHERE id = ?`,
      [remarks || "Approved", req.user.id, id]
    );

    // Update any scheduled shifts during this leave window to 'leave'
    await pool.execute(
      `UPDATE shifts SET
        attendance_status = 'leave',
        leave_type = ?
       WHERE employee_id = ? AND shift_date BETWEEN ? AND ?`,
      [leave.leave_type, leave.employee_id, leave.start_date, leave.end_date]
    );

    // Notify Employee
    await createNotification({
      employeeId: leave.employee_id,
      title: "Leave Request Approved",
      message: `Your ${leave.leave_type} request from ${leave.start_date} to ${leave.end_date} has been approved.${remarks ? ` Remarks: ${remarks}` : ""}`,
      type: "leave_approved"
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: "APPROVE_LEAVE",
      entityType: "leave_request",
      entityId: id,
      details: { employee_id: leave.employee_id, remarks },
      req
    });

    res.json({ message: "Leave request approved successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Reject Leave Request
router.put("/admin/leave/:id/reject", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const [leaves] = await pool.execute("SELECT * FROM leave_requests WHERE id = ?", [id]);
    if (leaves.length === 0) return res.status(404).json({ error: "Leave request not found" });

    const leave = leaves[0];

    await pool.execute(
      `UPDATE leave_requests SET
        status = 'rejected',
        admin_remarks = ?,
        reviewed_by = ?,
        reviewed_at = NOW()
       WHERE id = ?`,
      [remarks || "Rejected", req.user.id, id]
    );

    // Notify Employee
    await createNotification({
      employeeId: leave.employee_id,
      title: "Leave Request Declined",
      message: `Your ${leave.leave_type} request from ${leave.start_date} to ${leave.end_date} was not approved.${remarks ? ` Reason: ${remarks}` : ""}`,
      type: "leave_rejected"
    });

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: "REJECT_LEAVE",
      entityType: "leave_request",
      entityId: id,
      details: { employee_id: leave.employee_id, remarks },
      req
    });

    res.json({ message: "Leave request rejected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================
// 7. Employee Self-Service Endpoints
// ===================================================

// Employee Profile
router.get("/employee/profile", auth, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) return res.status(400).json({ error: "No employee profile linked" });

    const [rows] = await pool.execute("SELECT * FROM employees WHERE id = ?", [employeeId]);
    if (rows.length === 0) return res.status(404).json({ error: "Employee profile not found" });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Schedule
router.get("/employee/schedule", auth, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) return res.status(400).json({ error: "No employee profile linked" });

    const [rows] = await pool.execute(
      "SELECT * FROM shifts WHERE employee_id = ? ORDER BY shift_date DESC, start_time ASC",
      [employeeId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Attendance History & Summary
router.get("/employee/attendance", auth, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) return res.status(400).json({ error: "No employee profile linked" });

    const [shifts] = await pool.execute(
      "SELECT * FROM shifts WHERE employee_id = ? ORDER BY shift_date DESC, start_time DESC",
      [employeeId]
    );

    const totalShifts = shifts.length;
    const attended = shifts.filter(s => s.attendance_status === "present" || s.attendance_status === "completed").length;
    const absent = shifts.filter(s => s.attendance_status === "absent").length;
    const leave = shifts.filter(s => s.attendance_status === "leave").length;
    const late = shifts.filter(s => Number(s.late_minutes) > 0).length;
    const totalHours = shifts.reduce((acc, s) => acc + (Number(s.working_hours) || 0), 0);
    const totalOvertime = shifts.reduce((acc, s) => acc + (Number(s.overtime_hours) || 0), 0);
    const attendancePct = totalShifts > 0 ? Math.round((attended / totalShifts) * 100) : 100;

    res.json({
      summary: {
        total_shifts: totalShifts,
        attended,
        absent,
        leave,
        late,
        total_hours: parseFloat(totalHours.toFixed(2)),
        total_overtime: parseFloat(totalOvertime.toFixed(2)),
        attendance_percentage: attendancePct
      },
      shifts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee Personal Reports
router.get("/employee/reports", auth, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) return res.status(400).json({ error: "No employee profile linked" });

    const [shifts] = await pool.execute(
      "SELECT * FROM shifts WHERE employee_id = ? ORDER BY shift_date DESC",
      [employeeId]
    );

    const [leaves] = await pool.execute(
      "SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY id DESC",
      [employeeId]
    );

    const totalShifts = shifts.length;
    const attended = shifts.filter(s => s.attendance_status === "present" || s.attendance_status === "completed").length;
    const totalHours = shifts.reduce((acc, s) => acc + (Number(s.working_hours) || 0), 0);
    const avgHours = attended > 0 ? (totalHours / attended).toFixed(1) : 0;
    const totalOvertime = shifts.reduce((acc, s) => acc + (Number(s.overtime_hours) || 0), 0);
    const lateArrivals = shifts.filter(s => Number(s.late_minutes) > 0).length;

    const approvedLeaves = leaves.filter(l => l.status === "approved").length;
    const pendingLeaves = leaves.filter(l => l.status === "pending").length;
    const rejectedLeaves = leaves.filter(l => l.status === "rejected").length;

    res.json({
      total_scheduled: totalShifts,
      total_attended: attended,
      attendance_percentage: totalShifts > 0 ? Math.round((attended / totalShifts) * 100) : 100,
      total_hours: parseFloat(totalHours.toFixed(2)),
      avg_hours: Number(avgHours),
      total_overtime: parseFloat(totalOvertime.toFixed(2)),
      late_arrivals: lateArrivals,
      leaves_summary: {
        total: leaves.length,
        approved: approvedLeaves,
        pending: pendingLeaves,
        rejected: rejectedLeaves
      },
      records: shifts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================
// 8. Admin Reports & Dashboard Overview Stats
// ===================================================

router.get("/admin/dashboard-stats", auth, requireRole("admin", "manager"), async (req, res) => {
  try {
    const [totalEmp] = await pool.execute("SELECT COUNT(*) as count FROM employees");
    const [activeEmp] = await pool.execute("SELECT COUNT(*) as count FROM employees WHERE status = 'active'");
    
    // Shifts today
    const [todayShifts] = await pool.execute("SELECT * FROM shifts WHERE shift_date = CURDATE()");
    const presentToday = todayShifts.filter(s => s.attendance_status === "present" || s.attendance_status === "completed").length;
    const absentToday = todayShifts.filter(s => s.attendance_status === "absent").length;
    const leaveToday = todayShifts.filter(s => s.attendance_status === "leave").length;
    const punchedInNow = todayShifts.filter(s => s.attendance_status === "punched_in").length;

    // Pending Leaves
    const [pendingLeaves] = await pool.execute("SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending'");

    // Total hours logged
    const [hoursSum] = await pool.execute(
      "SELECT SUM(working_hours) as total_hours, SUM(overtime_hours) as total_overtime FROM shifts WHERE attendance_status IN ('present', 'completed', 'punched_out')"
    );

    res.json({
      total_employees: totalEmp[0].count,
      active_employees: activeEmp[0].count,
      today_scheduled: todayShifts.length,
      present_today: presentToday,
      absent_today: absentToday,
      leave_today: leaveToday,
      punched_in_now: punchedInNow,
      pending_leave_requests: pendingLeaves[0].count,
      total_working_hours: parseFloat(Number(hoursSum[0].total_hours || 0).toFixed(1)),
      total_overtime: parseFloat(Number(hoursSum[0].total_overtime || 0).toFixed(1))
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Aggregated Reports
router.get(["/admin/reports", "/reports"], auth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         e.id as employee_id,
         e.name,
         e.department,
         e.role,
         SUM(CASE WHEN s.attendance_status IN ('completed', 'present') THEN s.working_hours ELSE 0 END) as completed_hours,
         SUM(CASE WHEN s.attendance_status IN ('completed', 'present') THEN s.overtime_hours ELSE 0 END) as overtime_hours,
         SUM(CASE WHEN s.attendance_status = 'leave' THEN 1 ELSE 0 END) as leave_taken,
         SUM(CASE WHEN s.attendance_status = 'scheduled' THEN 1 ELSE 0 END) as pending_shifts,
         COUNT(s.id) as total_assigned_shifts
       FROM employees e
       LEFT JOIN shifts s ON e.id = s.employee_id
       GROUP BY e.id, e.name, e.department, e.role
       ORDER BY completed_hours DESC`
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================
// 9. Notifications API
// ===================================================

router.get("/notifications", auth, async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    const userId = req.user.id;
    const notifications = await getNotifications({ userId, employeeId, limit: 30 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/notifications/:id/read", auth, async (req, res) => {
  try {
    const { id } = req.params;
    await markNotificationAsRead(id, req.user.employee_id, req.user.id);
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/notifications/read-all", auth, async (req, res) => {
  try {
    await markAllNotificationsAsRead(req.user.employee_id, req.user.id);
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================
// 10. Audit Logs & User Account Administration
// ===================================================

router.get("/admin/audit-logs", auth, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/users", auth, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, username, email, role, employee_id, must_change_password, status FROM users ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/users/:id/password", auth, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.trim().length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const hashed = await bcrypt.hash(password, 10);
    await pool.execute("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?", [hashed, id]);

    res.json({ message: "Password override applied successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
