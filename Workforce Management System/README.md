# workforce_management_system

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/database-MySQL-blue.svg)](https://www.mysql.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

An enterprise-grade, full-stack **Workforce Management System** engineered with **two role-isolated portals**:
1. **Admin / Manager Portal** (`/admin/login`, `/admin/dashboard`)
2. **Employee Portal** (`/employee/login`, `/employee/dashboard`)

The system provides complete lifecycle management for organizations—from automated employee provisioning and shift roster planning to live punch-in/out tracking, attendance verification, time-off requests, and audit logging.

---

## 🌟 Key Features

### 1. Dual Role-Based Authentication & Portal Isolation
- **Separate Login Portals**:
  - `/admin/login` (`admin-login.html`): Exclusively authenticates administrators and managers.
  - `/employee/login` (`employee-login.html`): Exclusively authenticates staff members using their unique Employee ID.
- **Route Guards**:
  - Automatic redirect to `/employee/dashboard` if an employee attempts to access administrative pages.
  - Automatic redirect to the respective login screen for unauthenticated requests.
- **Mandatory First-Login Password Change**:
  - Newly provisioned employee accounts require an immediate password change (min. 6 characters) before access is granted.

### 2. Automated Employee Provisioning Flow
- Admin captures Personal Details, Employment Information, and Emergency Contacts.
- System automatically generates:
  - Unique sequential **Employee ID** (e.g., `EMP2026001`, `EMP2026002`).
  - Cryptographically secure **temporary password**.
- Password is securely hashed using **bcrypt**.
- Onboarding credentials are dispatched to the employee's email via **Nodemailer** (with simulated fallback logging for local dev).

### 3. Admin & Manager Portal
- **10 Dynamic KPI Stat Cards**: Total Employees, Active Employees, Present Today, Absent Today, On Leave Today, Scheduled Today, Punched In Now, Pending Leaves, Total Hours Logged, and Overtime Hours.
- **Staff Directory**: Search, department filters, attendance rate badges, and cascading employee deletion.
- **Shift Management & Scheduler**: Interactive **FullCalendar** view, shift presets (Morning, Evening, Night), and automated schedule conflict detection.
- **Attendance Verification Queue**: Live punch log inspection allowing managers to confirm attendance as `PRESENT`, `LATE`, `HALF DAY`, or `ABSENT`.
- **Leave Management Desk**: One-click review with approval, rejection, and remarks—automatically marking shifts within the approved window as excused leave.
- **Reports & Audit Trail**: Visual **Chart.js** analytics, one-click CSV export, and full audit logs tracking all managerial actions.

### 4. Employee Self-Service Portal
- **8 Dedicated Navigation Tabs**:
  1. **Dashboard**: Live clock, greeting, profile pill tags, today's shift desk, and attendance KPI cards.
  2. **My Schedule**: Read-only FullCalendar interactive view and list view with status indicators.
  3. **Attendance**: Historical punch-in/out records with filters (`Today`, `This Week`, `This Month`, `All`).
  4. **Reports**: Hours worked summary, overtime breakdown, monthly hours chart, and CSV export.
  5. **Leave Requests**: Time-off application form (Sick, Casual, Annual, Emergency) and status tracker.
  6. **Notifications**: System announcements and personal alerts with unread counter.
  7. **Profile**: Personal contact details, emergency contacts, and self-service password update form.
  8. **Logout**: Secure session termination.
- **Server-Authoritative Punch In & Out**:
  - Uses database `NOW()` timestamps to prevent client-side clock tampering.
  - Automatically calculates late arrival minutes and overtime hours.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend** | Node.js, Express.js, JWT (`jsonwebtoken`), bcryptjs, mysql2, nodemailer |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+), FullCalendar v6, Chart.js |
| **Database** | MySQL (with automated schema migration) |
| **Security** | Role-based authorization middleware, parameterized SQL queries, password hashing |

---

## 🗄️ Database Architecture

The relational database (`workforce`) contains the following primary tables:

- **`users`**: Login credentials, bcrypt password hashes, role assignment, and `must_change_password` flag.
- **`employees`**: Primary personnel records with unique alphanumeric IDs (`EMP...`).
- **`shifts`**: Scheduled shifts, punch-in/out timestamps, hours worked, late minutes, and attendance statuses.
- **`leave_requests`**: Time-off applications with approval statuses and manager remarks.
- **`notifications`**: In-app alerts for shift assignments, punch recordings, attendance verifications, and leaves.
- **`audit_logs`**: System audit trail tracking all managerial modifications for compliance.

*Note: Migrations run automatically when starting the backend server.*

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or later)
- [MySQL](https://www.mysql.com/) server running locally or remotely

### 2. Clone the Repository
```bash
git clone https://github.com/jaydev-ydv/workforce_management_system.git
cd workforce_management_system
```

### 3. Configure Environment Variables
Navigate to the `backend` folder and create a `.env` file based on `.env.example`:
```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=workforce
JWT_SECRET=supersecretjwtkey_workforce_pro_2026

# Optional: SMTP Configuration for Live Email Dispatch
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM="Workforce Hub <noreply@workforcehub.com>"
```

### 4. Install Dependencies & Run
```bash
cd backend
npm install
node server.js
```
The server will start on `http://localhost:5000` and automatically verify or create the database schema.

---

## 🌐 Portal Routes

| Portal | URL | Description |
| :--- | :--- | :--- |
| **Landing Page** | `http://localhost:5000/index.html` | Entry point with links to both portals |
| **Admin Login** | `http://localhost:5000/admin/login` | Administrator & Manager sign-in |
| **Admin Dashboard** | `http://localhost:5000/admin/dashboard` | Main administrative control center |
| **Employee Login** | `http://localhost:5000/employee/login` | Employee sign-in using Employee ID |
| **Employee Portal** | `http://localhost:5000/employee/dashboard` | Employee self-service workspace |

---

## 🔐 Default Credentials

### Admin / Manager Account
- **Username**: `admin`
- **Password**: `admin123`
- **Role**: `Administrator`

### Sample Provisioned Employee Account
- **Employee ID**: `EMP2026004`
- **Password**: `ClaireSecurePass2026!`
- **Role**: `Staff Member` (Operations)

---

## 📡 REST API Summary

### Authentication
- `POST /api/auth/admin/login` — Admin & Manager login
- `POST /api/auth/employee/login` — Employee portal login
- `POST /api/auth/change-password` — Change password
- `GET /api/auth/me` — Current session data

### Administrator & Manager Endpoints
- `GET /api/admin/dashboard-stats` — 10 organizational KPIs
- `POST /api/admin/employees` — Add employee (auto ID + temp password)
- `GET /api/admin/employees` — List all employees
- `DELETE /api/admin/employees/:id` — Delete employee (cascading)
- `POST /api/admin/shifts` — Create/assign shift with conflict check
- `GET /api/admin/attendance` — View attendance verification queue
- `PUT /api/admin/attendance/:id/confirm` — Confirm attendance status
- `GET /api/admin/leave` — Review leave applications
- `PUT /api/admin/leave/:id/approve` — Approve leave request
- `PUT /api/admin/leave/:id/reject` — Reject leave request
- `GET /api/admin/audit-logs` — Audit log history

### Employee Self-Service Endpoints
- `GET /api/employee/profile` — View personal employee profile
- `GET /api/employee/schedule` — View assigned shifts
- `POST /api/attendance/punch-in` — Punch in for today's shift
- `POST /api/attendance/punch-out` — Punch out and calculate hours
- `GET /api/employee/attendance` — Attendance history & summary
- `GET /api/employee/reports` — Personal performance report
- `POST /api/employee/leave` — Submit time-off application
- `GET /api/employee/leave` — View leave application status
- `GET /api/notifications` — Notification inbox

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).