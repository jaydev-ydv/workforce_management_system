-- Workforce Management System - Database Schema
-- Run this once against your MySQL database (local or cloud) before using the app.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(150),
  role VARCHAR(50) NOT NULL DEFAULT 'employee'
);

CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  age INT,
  experience INT,
  role VARCHAR(100),
  phone VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150),
  employee_id VARCHAR(50),
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  attendance_status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  leave_type VARCHAR(50),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- Create a first login user so you can sign in after deployment.
-- Password below is "admin123" — CHANGE IT after your first login.
-- (This hash was generated with bcrypt, 10 rounds.)
INSERT INTO users (username, password, email, role)
VALUES ('admin', '$2b$10$jLRt4KvG.i0jYF7dbAigGet0FzWa4XctZHBF1qwltM6UDse/BORC6', 'admin@example.com', 'admin');
