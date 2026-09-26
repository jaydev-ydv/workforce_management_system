const pool = require("./db");

async function columnExists(tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) as count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return rows[0].count > 0;
}

async function runMigrations() {
  console.log("🔄 Starting database schema migration...");

  try {
    // 1. Employees Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS employees (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        age INT NULL,
        experience INT NULL,
        role VARCHAR(100) NULL,
        phone VARCHAR(30) NULL
      )
    `);

    // Check if id column is INT and alter to VARCHAR(50) if needed
    const [empIdType] = await pool.execute(`
      SELECT DATA_TYPE FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'id'
    `);
    if (empIdType.length > 0 && empIdType[0].DATA_TYPE === "int") {
      console.log("Altering employees.id to VARCHAR(50)...");
      await pool.execute("ALTER TABLE employees MODIFY COLUMN id VARCHAR(50) NOT NULL");
    }

    // Add extra employee columns
    const employeeCols = [
      { name: "email", type: "VARCHAR(150) NULL" },
      { name: "dob", type: "DATE NULL" },
      { name: "gender", type: "VARCHAR(20) NULL" },
      { name: "address", type: "TEXT NULL" },
      { name: "department", type: "VARCHAR(100) NULL DEFAULT 'General'" },
      { name: "designation", type: "VARCHAR(100) NULL" },
      { name: "joining_date", type: "DATE NULL" },
      { name: "employment_type", type: "VARCHAR(50) NULL DEFAULT 'Full-Time'" },
      { name: "manager", type: "VARCHAR(100) NULL" },
      { name: "emergency_name", type: "VARCHAR(100) NULL" },
      { name: "emergency_relation", type: "VARCHAR(50) NULL" },
      { name: "emergency_phone", type: "VARCHAR(30) NULL" },
      { name: "status", type: "VARCHAR(20) NOT NULL DEFAULT 'active'" },
      { name: "created_at", type: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP" }
    ];

    for (const col of employeeCols) {
      if (!(await columnExists("employees", col.name))) {
        await pool.execute(`ALTER TABLE employees ADD COLUMN ${col.name} ${col.type}`);
        console.log(`Added column employees.${col.name}`);
      }
    }

    // 2. Users Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(150) NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'employee',
        employee_id VARCHAR(50) NULL
      )
    `);

    const userCols = [
      { name: "employee_id", type: "VARCHAR(50) NULL" },
      { name: "must_change_password", type: "TINYINT(1) NOT NULL DEFAULT 0" },
      { name: "status", type: "VARCHAR(20) NOT NULL DEFAULT 'active'" },
      { name: "created_at", type: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP" }
    ];

    for (const col of userCols) {
      if (!(await columnExists("users", col.name))) {
        await pool.execute(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
        console.log(`Added column users.${col.name}`);
      }
    }

    // 3. Shifts Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS shifts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(150) NULL,
        employee_id VARCHAR(50) NULL,
        shift_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        attendance_status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
        leave_type VARCHAR(50) NULL
      )
    `);

    const shiftCols = [
      { name: "break_duration", type: "VARCHAR(50) NULL DEFAULT '1 Hour'" },
      { name: "department", type: "VARCHAR(100) NULL" },
      { name: "punch_in_time", type: "DATETIME NULL" },
      { name: "punch_out_time", type: "DATETIME NULL" },
      { name: "working_hours", type: "DECIMAL(5,2) NOT NULL DEFAULT 0.00" },
      { name: "overtime_hours", type: "DECIMAL(5,2) NOT NULL DEFAULT 0.00" },
      { name: "late_minutes", type: "INT NOT NULL DEFAULT 0" },
      { name: "admin_confirmed", type: "TINYINT(1) NOT NULL DEFAULT 0" },
      { name: "admin_remarks", type: "TEXT NULL" },
      { name: "created_at", type: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP" }
    ];

    for (const col of shiftCols) {
      if (!(await columnExists("shifts", col.name))) {
        await pool.execute(`ALTER TABLE shifts ADD COLUMN ${col.name} ${col.type}`);
        console.log(`Added column shifts.${col.name}`);
      }
    }

    // 4. Leave Requests Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL,
        leave_type VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        reason TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        admin_remarks TEXT NULL,
        reviewed_by INT NULL,
        reviewed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Notifications Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        employee_id VARCHAR(50) NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'general',
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 6. Audit Logs Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        username VARCHAR(100) NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(100) NULL,
        details TEXT NULL,
        ip_address VARCHAR(50) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure default admin user exists
    const bcrypt = require("bcrypt");
    const [adminUser] = await pool.execute("SELECT id FROM users WHERE username = 'admin' LIMIT 1");
    if (adminUser.length === 0) {
      const hashed = await bcrypt.hash("admin123", 10);
      await pool.execute(
        "INSERT INTO users (username, password, email, role, status) VALUES ('admin', ?, 'admin@workforce.com', 'admin', 'active')",
        [hashed]
      );
      console.log("Created initial default admin account: admin / admin123");
    }

    console.log("✅ Database schema migration completed successfully!");
  } catch (err) {
    console.error("❌ Migration error:", err);
    throw err;
  }
}

module.exports = runMigrations;

if (require.main === module) {
  runMigrations().then(() => process.exit(0)).catch(() => process.exit(1));
}
