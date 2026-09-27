// Workforce Management System - Enterprise Admin & Manager Portal Controller

let calendar = null;
let editingShiftId = null;
let selectedDate = null;
let allShifts = [];
let allEmployees = [];
let allReports = [];
let allLeaveRequests = [];
let shiftStatusChartInstance = null;
let employeeHoursChartInstance = null;

// ===================================================
// Authentication & Session Controller
// ===================================================
function logout() {
  localStorage.clear();
  window.location.href = "admin-login.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  initClock();
  initGreeting();
  await loadDashboardStats();
  await loadDashboardData();
  await loadEmployees();
  await loadNotifications();
  handleUrlRouting();
});

function handleUrlRouting() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("/admin/employees/add")) {
    showSection("employeesSection");
    openAddEmployeeModal();
  } else if (path.includes("/admin/employees")) {
    showSection("employeesSection");
  } else if (path.includes("/admin/shifts")) {
    showSection("shiftsSection");
  } else if (path.includes("/admin/attendance")) {
    showSection("attendanceSection");
  } else if (path.includes("/admin/reports")) {
    showSection("reportsSection");
  } else if (path.includes("/admin/leave")) {
    showSection("leaveSection");
  }
}

// Live Clock Ticker
function initClock() {
  const clockEl = document.getElementById("liveClockText");
  if (!clockEl) return;

  const update = () => {
    const now = new Date();
    const options = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    clockEl.textContent = now.toLocaleDateString('en-US', options);
  };

  update();
  setInterval(update, 1000);
}

// Dynamic Day Greeting
function initGreeting() {
  const greetingEl = document.getElementById("welcomeGreeting");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userName = user.username || "Administrator";
  const userRole = user.role === "manager" ? "Manager" : "Administrator";

  const userDisplay = document.getElementById("headerUserName");
  const roleDisplay = document.getElementById("headerUserRole");
  if (userDisplay) userDisplay.textContent = userName;
  if (roleDisplay) roleDisplay.textContent = userRole;

  const initials = userName.substring(0, 2).toUpperCase() || "AD";
  const avatarEl = document.getElementById("headerUserAvatar");
  if (avatarEl) avatarEl.textContent = initials;

  if (greetingEl) {
    const hour = new Date().getHours();
    let timeStr = "Good evening";
    if (hour < 12) timeStr = "Good morning";
    else if (hour < 18) timeStr = "Good afternoon";
    greetingEl.innerHTML = `${timeStr}, ${userName} 👋`;
  }
}

// ===================================================
// Navigation Controller
// ===================================================
function showSection(section) {
  document.querySelectorAll("main section").forEach(sec => sec.classList.add("hidden"));
  document.querySelectorAll(".sidebar li").forEach(li => li.classList.remove("active"));

  const activeNav = document.getElementById("nav-" + section);
  if (activeNav) activeNav.classList.add("active");

  const targetSection = document.getElementById(section + "Section");
  if (targetSection) targetSection.classList.remove("hidden");

  // Lazy load section data
  if (section === "dashboard") {
    loadDashboardStats();
    loadDashboardData();
  } else if (section === "employees") {
    loadEmployees();
  } else if (section === "shifts") {
    if (!calendar) {
      initCalendar();
    } else {
      setTimeout(() => calendar.updateSize(), 60);
    }
    loadShiftEmployeeDatalist();
    loadShifts();
  } else if (section === "attendance") {
    loadAttendanceRecords();
  } else if (section === "leave") {
    loadAdminLeaveRequests();
  } else if (section === "reports") {
    refreshReports();
  } else if (section === "admin") {
    loadUsers();
    loadAuditLogs();
  }
}

function openAddEmployeeForm() {
  showSection("employees");
  toggleEmployeeAddForm(true);
}

function quickCreateShiftModal() {
  showSection("shifts");
  const form = document.getElementById("shiftFormTitle");
  if (form) {
    form.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("title")?.focus();
  }
}

// ===================================================
// 1. Dashboard Stats & Analytics
// ===================================================
async function loadDashboardStats() {
  try {
    const stats = await api("/admin/dashboard-stats");
    if (!stats || stats.error) return;

    animateNumber("statTotalEmployees", stats.total_employees || 0);
    animateNumber("statActiveEmployees", stats.active_employees || 0);
    animateNumber("statPresentToday", stats.present_today || 0);
    animateNumber("statPunchedInNow", stats.punched_in_now || 0);
    animateNumber("statAbsentToday", stats.absent_today || 0);
    animateNumber("statOnLeave", stats.leave_today || 0);
    animateNumber("statPendingLeaves", stats.pending_leave_requests || 0);
    animateNumber("statTodayShifts", stats.today_scheduled || 0);

    const hoursEl = document.getElementById("statCompletedHours");
    if (hoursEl) {
      hoursEl.innerHTML = `${(stats.total_working_hours || 0).toFixed(1)}<span style="font-size:1.1rem; color:var(--text-soft);">h</span>`;
    }

    const otEl = document.getElementById("statTotalOvertime");
    if (otEl) {
      otEl.innerHTML = `${(stats.total_overtime || 0).toFixed(1)}<span style="font-size:1.1rem; color:var(--text-soft);">h</span>`;
    }
  } catch (err) {
    console.error("Dashboard stats load error:", err);
  }
}

async function loadDashboardData() {
  try {
    const [employees, shifts, reports] = await Promise.all([
      api("/admin/employees"),
      api("/admin/shifts"),
      api("/admin/reports")
    ]);

    allEmployees = Array.isArray(employees) ? employees : [];
    allShifts = Array.isArray(shifts) ? shifts : [];
    allReports = Array.isArray(reports) ? reports : [];

    renderDashboardCharts(allShifts, allReports);
    renderDashboardRoster(allShifts);
    renderAdminVerificationQueue(allShifts);
  } catch (err) {
    console.error("Dashboard data load error:", err);
  }
}

function animateNumber(elementId, targetValue, duration = 800) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const startValue = parseInt(el.textContent, 10) || 0;
  if (startValue === targetValue) {
    el.textContent = targetValue;
    return;
  }

  const startTime = performance.now();
  const step = (currentTime) => {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const current = Math.floor(progress * (targetValue - startValue) + startValue);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = targetValue;
  };
  requestAnimationFrame(step);
}

// Render Doughnut & Bar Charts
function renderDashboardCharts(shifts, reports) {
  renderShiftStatusChart(shifts);
  renderEmployeeHoursChart(reports);
}

function renderShiftStatusChart(shifts) {
  const canvas = document.getElementById("shiftStatusChart");
  if (!canvas || typeof Chart === "undefined") return;

  if (shiftStatusChartInstance) shiftStatusChartInstance.destroy();

  const completed = shifts.filter(s => s.attendance_status === "completed" || s.attendance_status === "present").length;
  const scheduled = shifts.filter(s => (s.attendance_status || "scheduled") === "scheduled").length;
  const leave = shifts.filter(s => s.attendance_status === "leave").length;
  const punched = shifts.filter(s => s.attendance_status === "punched_in" || s.attendance_status === "punched_out").length;

  const ctx = canvas.getContext("2d");
  shiftStatusChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Present / Completed", "Scheduled", "Punched In / Review", "On Leave"],
      datasets: [{
        data: [completed, scheduled, punched, leave],
        backgroundColor: ["#10b981", "#06b6d4", "#f59e0b", "#f43f5e"],
        borderColor: "rgba(14, 21, 51, 0.8)",
        borderWidth: 3,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#cbd5e1", padding: 12, font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: 600 } }
        }
      }
    }
  });
}

function renderEmployeeHoursChart(reports) {
  const canvas = document.getElementById("employeeHoursChart");
  if (!canvas || typeof Chart === "undefined") return;

  if (employeeHoursChartInstance) employeeHoursChartInstance.destroy();

  const ctx = canvas.getContext("2d");
  const sorted = [...reports].sort((a, b) => (b.completed_hours || 0) - (a.completed_hours || 0)).slice(0, 6);
  const labels = sorted.map(r => r.name || r.employee_id);
  const data = sorted.map(r => r.completed_hours || 0);

  employeeHoursChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.length > 0 ? labels : ["No data"],
      datasets: [{
        label: "Hours Logged",
        data: data.length > 0 ? data : [0],
        backgroundColor: "rgba(99, 102, 241, 0.7)",
        borderColor: "#818cf8",
        borderWidth: 1.5,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, grid: { color: "rgba(255, 255, 255, 0.06)" }, ticks: { color: "#94a3b8" } },
        x: { grid: { display: false }, ticks: { color: "#cbd5e1" } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// Live Shift Roster Widget on Dashboard
function renderDashboardRoster(shifts) {
  const tbody = document.getElementById("dashboardRosterBody");
  if (!tbody) return;

  if (!shifts || shifts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:28px; color:var(--text-muted);">No shifts scheduled yet. Click <b>"Assign Shift"</b> to create rosters.</td></tr>`;
    return;
  }

  const displayShifts = shifts.slice(0, 10);

  tbody.innerHTML = displayShifts.map(shift => {
    const empName = shift.employee_name || shift.employee_id || "Unassigned";
    const initials = empName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase() || "EM";
    const status = shift.attendance_status || "scheduled";

    let statusClass = "status-scheduled";
    let statusText = status.toUpperCase();

    if (status === "present" || status === "completed") {
      statusClass = "status-completed";
      statusText = "✅ Present";
    } else if (status === "punched_in") {
      statusClass = "status-leave";
      statusText = "⏳ Punched In";
    } else if (status === "punched_out") {
      statusClass = "status-scheduled";
      statusText = "⏱️ Punched Out";
    } else if (status === "leave") {
      statusClass = "status-leave";
      statusText = shift.leave_type || "Leave";
    }

    return `
      <tr>
        <td>
          <div class="employee-cell">
            <div class="avatar-sm">${initials}</div>
            <div>
              <div style="font-weight:700; color:white;">${empName}</div>
              <div style="font-size:11px; color:var(--text-muted);">ID: ${shift.employee_id || "-"}</div>
            </div>
          </div>
        </td>
        <td><span style="font-weight:600;">${shift.title}</span></td>
        <td>${formatDateForInput(shift.shift_date)}</td>
        <td><span style="color:var(--text-soft);">${formatTimeForInput(shift.start_time)} - ${formatTimeForInput(shift.end_time)}</span></td>
        <td><span class="badge-status ${statusClass}"><span style="width:6px; height:6px; border-radius:50%; background:currentColor;"></span>${statusText}</span></td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            ${(status === "punched_in" || status === "punched_out") ? `
              <button class="btn-sm btn-primary" style="background:linear-gradient(135deg, #10b981, #059669); font-weight:700;" onclick="confirmAttendanceAction('${shift.id}', 'present')" title="Confirm Present">
                ✅ Confirm Present
              </button>
              <button class="btn-sm danger-btn" onclick="confirmAttendanceAction('${shift.id}', 'absent')" title="Mark Absent">
                ❌ Absent
              </button>
            ` : (status === "scheduled") ? `
              <button class="btn-sm btn-primary" onclick="confirmAttendanceAction('${shift.id}', 'present')" title="Mark Present">✓ Present</button>
              <button class="btn-sm btn-secondary" onclick="confirmAttendanceAction('${shift.id}', 'leave')" title="Mark Leave">Leave</button>
            ` : `
              <span style="font-size:12px; color:var(--accent-emerald); font-weight:700;">Verified Present</span>
            `}
            <button class="btn-sm btn-danger" style="padding:4px 8px; font-size:11px; display:inline-flex; align-items:center; gap:4px;" onclick="openDeleteShiftModal('${shift.id}', '${(shift.title || '').replace(/'/g, "\\'")}', '${empName.replace(/'/g, "\\'")}', '${formatDateForInput(shift.shift_date)}')" title="Delete shift from database">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Attendance Verification Queue
function renderAdminVerificationQueue(shifts) {
  const card = document.getElementById("adminVerificationQueueCard");
  const list = document.getElementById("pendingPunchList");
  const countEl = document.getElementById("pendingPunchCount");
  if (!card || !list) return;

  const pending = shifts.filter(s => s.attendance_status === "punched_in" || s.attendance_status === "punched_out");
  if (countEl) countEl.textContent = pending.length;

  if (pending.length === 0) {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
  list.innerHTML = pending.map(shift => {
    const empName = shift.employee_name || shift.employee_id || "Staff";
    const punchIn = shift.punch_in_time ? new Date(shift.punch_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Pending";
    const punchOut = shift.punch_out_time ? new Date(shift.punch_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "In Progress";

    return `
      <div style="background:rgba(255,255,255,0.06); border:1px solid rgba(245, 158, 11, 0.3); border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-weight:700; color:white; font-size:15px;">${empName} <span style="font-size:12px; color:var(--accent-cyan); font-weight:600;">(ID: ${shift.employee_id})</span></div>
          <div style="font-size:13px; color:var(--text-soft); margin-top:2px;">
            <b>${shift.title}</b> • Scheduled: ${shift.start_time} - ${shift.end_time} • Punch In: <span style="color:#34d399; font-weight:700;">${punchIn}</span> • Punch Out: <span style="color:#38bdf8;">${punchOut}</span>
            ${Number(shift.late_minutes) > 0 ? `<span style="color:#f87171; font-weight:700; margin-left:8px;">(${shift.late_minutes}m Late)</span>` : ""}
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn-sm btn-primary" style="background:linear-gradient(135deg, #10b981, #059669); font-weight:700;" onclick="confirmAttendanceAction('${shift.id}', 'present')">
            ✅ Confirm Present
          </button>
          <button class="btn-sm btn-secondary" onclick="confirmAttendanceAction('${shift.id}', 'late')">
            ⚠️ Mark Late
          </button>
          <button class="btn-sm danger-btn" onclick="confirmAttendanceAction('${shift.id}', 'absent')">
            ❌ Mark Absent
          </button>
        </div>
      </div>
    `;
  }).join("");
}

async function confirmAttendanceAction(shiftId, status) {
  const result = await api(`/admin/attendance/${shiftId}/confirm`, "PUT", { status });
  if (result.error) {
    showToast(result.error, "error");
    return;
  }
  showToast(result.message || `Attendance confirmed as ${status.toUpperCase()}`, "success");
  await loadDashboardStats();
  await loadDashboardData();
  await loadAttendanceRecords();
}

// ===================================================
// 2. Employee Directory & Registration Controller
// ===================================================
async function loadEmployees() {
  const data = await api("/admin/employees");
  if (data.error) {
    showToast(data.error, "error");
    return;
  }

  allEmployees = Array.isArray(data) ? data : [];
  renderEmployeeGrid(allEmployees);
  populateShiftEmployeeDatalist(allEmployees);
}

function renderEmployeeGrid(employees) {
  const grid = document.getElementById("employeeGrid");
  if (!grid) return;

  if (employees.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:40px; color:var(--text-muted);">
        No employees found matching criteria. Click <b>"Add New Employee"</b> to register personnel.
      </div>
    `;
    return;
  }

  grid.innerHTML = employees.map(emp => {
    const initials = emp.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase() || "EM";
    const safeName = (emp.name || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
    const safeRole = (emp.role || "Employee").replace(/'/g, "\\'").replace(/"/g, "&quot;");
    const safeId = (emp.id || "").replace(/'/g, "\\'");
    const pct = emp.attendance_percentage !== undefined ? emp.attendance_percentage : 100;

    return `
      <div class="employee-card" id="emp-card-${emp.id}">
        <div class="employee-card-header">
          <div class="employee-card-avatar">${initials}</div>
          <div class="employee-card-title">
            <h3>${emp.name}</h3>
            <span class="role-pill">${emp.designation || emp.role || "Staff"}</span>
          </div>
        </div>

        <div class="employee-details-list">
          <p><b>Staff ID:</b> <span style="color:#38bdf8; font-weight:700;">${emp.id}</span></p>
          <p><b>Department:</b> <span>${emp.department || "Operations"}</span></p>
          <p><b>Email:</b> <span style="font-size:12px;">${emp.email || "-"}</span></p>
          <p><b>Contact:</b> <span>${emp.phone || "-"}</span></p>
          <p><b>Attendance %:</b> <span style="color:${pct >= 75 ? '#34d399' : '#f87171'}; font-weight:700;">${pct}%</span></p>
        </div>

        <div class="employee-card-actions" style="display:flex; gap:8px;">
          <button class="btn-sm btn-primary" style="flex:1;" onclick="quickAssignShift('${safeId}')">
            📅 Assign Shift
          </button>
          <button class="btn-sm btn-danger" style="display:inline-flex; align-items:center; gap:5px;" onclick="openDeleteEmployeeModal('${safeId}', '${safeName}', '${safeRole}')" title="Delete employee from database">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function filterEmployees() {
  const query = document.getElementById("employeeSearchInput")?.value.toLowerCase().trim() || "";
  const deptFilter = document.getElementById("empFilterDept")?.value || "";

  let filtered = allEmployees;

  if (deptFilter) {
    filtered = filtered.filter(e => (e.department || "").toLowerCase() === deptFilter.toLowerCase());
  }

  if (query) {
    filtered = filtered.filter(e =>
      (e.name && e.name.toLowerCase().includes(query)) ||
      (e.id && String(e.id).toLowerCase().includes(query)) ||
      (e.role && e.role.toLowerCase().includes(query)) ||
      (e.department && e.department.toLowerCase().includes(query))
    );
  }

  renderEmployeeGrid(filtered);
}

function toggleEmployeeAddForm(forceOpen = null) {
  const container = document.getElementById("addEmployeeFormContainer");
  if (!container) return;

  const isHidden = container.classList.contains("hidden");
  const shouldOpen = forceOpen !== null ? forceOpen : isHidden;

  if (shouldOpen) {
    showSection("employees");
    container.classList.remove("hidden");
    document.getElementById("emp_name")?.focus();
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    container.classList.add("hidden");
  }
}

// Add New Employee Action
async function addEmployee() {
  const name = document.getElementById("emp_name")?.value.trim();
  const email = document.getElementById("emp_email")?.value.trim();
  const phone = document.getElementById("emp_phone")?.value.trim();
  const dob = document.getElementById("emp_dob")?.value;
  const gender = document.getElementById("emp_gender")?.value;
  const address = document.getElementById("emp_address")?.value.trim();
  const department = document.getElementById("emp_department")?.value;
  const role = document.getElementById("emp_role")?.value.trim();
  const designation = document.getElementById("emp_designation")?.value.trim();
  const joining_date = document.getElementById("emp_joining_date")?.value;
  const employment_type = document.getElementById("emp_employment_type")?.value;
  const manager = document.getElementById("emp_manager")?.value.trim();
  const emergency_name = document.getElementById("emp_emergency_name")?.value.trim();
  const emergency_relation = document.getElementById("emp_emergency_relation")?.value.trim();
  const emergency_phone = document.getElementById("emp_emergency_phone")?.value.trim();

  if (!name) {
    showToast("Please enter employee's full name", "error");
    return;
  }

  const btn = document.getElementById("saveEmployeeBtn");
  const originalText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "Creating Employee & Generating ID...";
  }

  try {
    const result = await api("/admin/employees", "POST", {
      name, email, phone, dob, gender, address, department, role,
      designation, joining_date, employment_type, manager,
      emergency_name, emergency_relation, emergency_phone
    });

    if (result.error) {
      showToast(result.error, "error");
      return;
    }

    // Show Success Modal with Generated ID and Password
    document.getElementById("successEmpName").textContent = result.employee.name;
    document.getElementById("successEmpId").textContent = result.employee.id;
    document.getElementById("successEmpPwd").textContent = result.temporary_password;
    document.getElementById("successEmpEmail").textContent = result.employee.email;
    document.getElementById("employeeSuccessModal").classList.remove("hidden");

    // Clear form inputs
    ["emp_name", "emp_email", "emp_phone", "emp_dob", "emp_address", "emp_role", "emp_designation", "emp_manager", "emp_emergency_name", "emp_emergency_relation", "emp_emergency_phone"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    toggleEmployeeAddForm(false);
    await loadEmployees();
    await loadDashboardStats();
    await loadDashboardData();
  } catch (err) {
    console.error("Employee create error:", err);
    showToast("Failed to create employee", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

function closeEmployeeSuccessModal() {
  document.getElementById("employeeSuccessModal")?.classList.add("hidden");
}

// Quick prefill for assigning shift to specific employee
function quickAssignShift(employeeId) {
  showSection("shifts");
  const empInput = document.getElementById("employee_id");
  if (empInput) {
    empInput.value = employeeId;
    empInput.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("date")?.focus();
  }
}

// Employee Deletion Handlers
let pendingDeleteEmpId = null;

function openDeleteEmployeeModal(id, name, role) {
  pendingDeleteEmpId = id;
  const modal = document.getElementById("deleteEmployeeModal");
  const nameEl = document.getElementById("deleteModalEmpName");
  const idEl = document.getElementById("deleteModalEmpId");

  if (nameEl) nameEl.textContent = name;
  if (idEl) idEl.textContent = `ID: ${id}`;
  if (modal) modal.classList.remove("hidden");
}

function closeDeleteEmployeeModal() {
  pendingDeleteEmpId = null;
  const modal = document.getElementById("deleteEmployeeModal");
  if (modal) modal.classList.add("hidden");
}

async function executeDeleteEmployee() {
  if (!pendingDeleteEmpId) return;

  const btn = document.getElementById("confirmDeleteEmpBtn");
  const originalText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "Deleting...";
  }

  try {
    const result = await api(`/admin/employees/${encodeURIComponent(pendingDeleteEmpId)}`, "DELETE");

    if (result.error) {
      showToast(result.error, "error");
      return;
    }

    showToast(result.message || "Employee deleted successfully", "success");
    closeDeleteEmployeeModal();

    await loadEmployees();
    await loadDashboardStats();
    await loadDashboardData();
    if (typeof loadUsers === "function") await loadUsers();
  } catch (err) {
    showToast("Server error while deleting employee", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

function populateShiftEmployeeDatalist(employees) {
  const datalist = document.getElementById("employeeIds");
  if (datalist && Array.isArray(employees)) {
    datalist.innerHTML = employees.map(emp => `
      <option value="${emp.id}">${emp.name} (ID: ${emp.id} - ${emp.department || "General"})</option>
    `).join("");
  }
}

async function loadShiftEmployeeDatalist() {
  const employees = await api("/admin/employees");
  if (!employees.error) {
    populateShiftEmployeeDatalist(employees);
  }
}

// ===================================================
// 3. Shift Management & Scheduling FullCalendar
// ===================================================
function initCalendar() {
  const el = document.getElementById("calendar");
  if (!el || typeof FullCalendar === "undefined") return;

  calendar = new FullCalendar.Calendar(el, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek"
    },
    dateClick(info) {
      showDateShifts(info.dateStr);
    },
    eventClick(info) {
      showShiftDetails(info.event.extendedProps);
    }
  });

  calendar.render();
}

function getColor() {
  const colors = ["#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#E91E63", "#00BCD4"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function applyShiftPreset(preset) {
  const titleEl = document.getElementById("title");
  const startEl = document.getElementById("start");
  const endEl = document.getElementById("end");

  if (preset === "morning") {
    if (titleEl) titleEl.value = "Morning Shift";
    if (startEl) startEl.value = "09:00";
    if (endEl) endEl.value = "18:00";
  } else if (preset === "evening") {
    if (titleEl) titleEl.value = "Evening Shift";
    if (startEl) startEl.value = "14:00";
    if (endEl) endEl.value = "23:00";
  } else if (preset === "night") {
    if (titleEl) titleEl.value = "Night Shift";
    if (startEl) startEl.value = "22:00";
    if (endEl) endEl.value = "07:00";
  }
}

function resetShiftForm() {
  editingShiftId = null;
  const titleEl = document.getElementById("shiftFormTitle");
  const saveBtn = document.getElementById("saveShiftButton");
  const cancelBtn = document.getElementById("cancelEditButton");

  if (titleEl) titleEl.textContent = "Create Shift Assignment";
  if (saveBtn) saveBtn.textContent = "Assign Shift";
  if (cancelBtn) cancelBtn.style.display = "none";

  ["title", "employee_id", "date", "start", "end", "shiftDepartment"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

async function saveShift() {
  const title = document.getElementById("title")?.value.trim();
  const employee_id = document.getElementById("employee_id")?.value.trim();
  const date = document.getElementById("date")?.value;
  const start = document.getElementById("start")?.value;
  const end = document.getElementById("end")?.value;
  const break_duration = document.getElementById("shiftBreakDuration")?.value;
  const department = document.getElementById("shiftDepartment")?.value.trim();

  if (!title || !employee_id || !date || !start || !end) {
    showToast("Please fill all required shift fields", "error");
    return;
  }

  const endpoint = editingShiftId ? `/admin/shifts/${editingShiftId}` : "/admin/shifts";
  const method = editingShiftId ? "PUT" : "POST";

  const result = await api(endpoint, method, {
    title,
    employee_id,
    date,
    start,
    end,
    break_duration,
    department
  });

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  showToast(editingShiftId ? "Shift updated successfully" : "Shift assigned successfully to employee", "success");
  resetShiftForm();
  await loadShifts();
  await loadDashboardData();
  await loadDashboardStats();
}

function editShift(shiftId) {
  const shift = allShifts.find(s => String(s.id) === String(shiftId));
  if (!shift) return;

  editingShiftId = shiftId;
  const titleEl = document.getElementById("shiftFormTitle");
  const saveBtn = document.getElementById("saveShiftButton");
  const cancelBtn = document.getElementById("cancelEditButton");

  if (titleEl) titleEl.textContent = "Edit Shift Assignment";
  if (saveBtn) saveBtn.textContent = "Save Changes";
  if (cancelBtn) cancelBtn.style.display = "inline-block";

  const titleField = document.getElementById("title");
  const empIdField = document.getElementById("employee_id");
  const dateField = document.getElementById("date");
  const startField = document.getElementById("start");
  const endField = document.getElementById("end");

  if (titleField) titleField.value = shift.title || "";
  if (empIdField) empIdField.value = shift.employee_id || "";
  if (dateField) dateField.value = formatDateForInput(shift.shift_date);
  if (startField) startField.value = formatTimeForInput(shift.start_time);
  if (endField) endField.value = formatTimeForInput(shift.end_time);

  document.getElementById("shiftFormTitle")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// Shift Deletion Handlers
let pendingDeleteShiftId = null;

function openDeleteShiftModal(shiftId, title = "", empName = "", date = "") {
  pendingDeleteShiftId = shiftId;

  if ((!title || !empName) && Array.isArray(allShifts)) {
    const s = allShifts.find(x => String(x.id) === String(shiftId));
    if (s) {
      title = title || s.title || "Shift";
      empName = empName || s.employee_name || s.employee_id || "Employee";
      date = date || formatDateForInput(s.shift_date);
    }
  }

  const modal = document.getElementById("deleteShiftModal");
  const titleEl = document.getElementById("deleteModalShiftTitle");
  const empEl = document.getElementById("deleteModalShiftEmp");
  const dateEl = document.getElementById("deleteModalShiftDate");

  if (titleEl) titleEl.textContent = title || "Shift";
  if (empEl) empEl.textContent = empName || "Assigned Staff";
  if (dateEl) dateEl.textContent = date || "Scheduled Date";
  if (modal) modal.classList.remove("hidden");
}

function closeDeleteShiftModal() {
  pendingDeleteShiftId = null;
  const modal = document.getElementById("deleteShiftModal");
  if (modal) modal.classList.add("hidden");
}

async function executeDeleteShift() {
  if (!pendingDeleteShiftId) return;

  const btn = document.getElementById("confirmDeleteShiftBtn");
  const originalText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "Deleting...";
  }

  const shiftId = pendingDeleteShiftId;

  try {
    const result = await api(`/admin/shifts/${shiftId}`, "DELETE");

    if (result.error) {
      showToast(result.error, "error");
      return;
    }

    if (String(editingShiftId) === String(shiftId)) {
      resetShiftForm();
    }

    const detailsEl = document.getElementById("shiftDetails");
    if (detailsEl) {
      detailsEl.innerHTML = `
        <h3 style="margin-top:0;">Shift Details</h3>
        <p style="color:var(--text-muted);">Click any event or date on the calendar to inspect shift assignments.</p>
      `;
    }

    showToast("Shift deleted successfully from database", "success");
    closeDeleteShiftModal();

    await loadShifts();
    await loadDashboardData();
    await loadDashboardStats();
    if (selectedDate) showDateShifts(selectedDate);
  } catch (err) {
    showToast("Server error while deleting shift", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

async function deleteShift(shiftId) {
  openDeleteShiftModal(shiftId);
}

async function loadShifts() {
  const data = await api("/admin/shifts");
  if (data.error) {
    showToast(data.error, "error");
    return;
  }

  allShifts = Array.isArray(data) ? data : [];

  if (calendar) {
    calendar.removeAllEvents();
    allShifts.forEach(shift => {
      calendar.addEvent({
        title: `${shift.employee_name || shift.employee_id}: ${shift.title}`,
        start: `${formatDateForInput(shift.shift_date)}T${formatTimeForInput(shift.start_time)}`,
        end: `${formatDateForInput(shift.shift_date)}T${formatTimeForInput(shift.end_time)}`,
        color: getColor(),
        extendedProps: {
          id: shift.id,
          employee: shift.employee_name || shift.employee_id,
          employee_id: shift.employee_id,
          title: shift.title,
          date: formatDateForInput(shift.shift_date),
          start: shift.start_time,
          end: shift.end_time
        }
      });
    });
  }

  renderShiftList();
}

function showShiftDetails(shift) {
  if (shift.date) {
    selectedDate = shift.date;
    updateSelectedDateLabel();
  }

  const detailsEl = document.getElementById("shiftDetails");
  if (!detailsEl) return;

  detailsEl.innerHTML = `
    <h3 style="margin-top:0;">Shift Details</h3>
    <div class="date-nav">
      <button class="btn-secondary btn-sm" onclick="changeSelectedDate(-1)">← Prev Day</button>
      <span id="selectedDateLabel" class="date-badge">${formatSelectedDateLabel(selectedDate)}</span>
      <button class="btn-secondary btn-sm" onclick="changeSelectedDate(1)">Next Day →</button>
    </div>
    <div class="shift-box">
      <div style="font-size:16px; font-weight:700; color:white; margin-bottom:4px;">${shift.employee || "Staff"}</div>
      <p style="margin:2px 0;"><b>Shift:</b> ${shift.title}</p>
      <p style="margin:2px 0;"><b>Date:</b> ${shift.date}</p>
      <p style="margin:2px 0;"><b>Time:</b> ${shift.start} - ${shift.end}</p>
      <div class="shift-actions">
        <button class="btn-sm btn-primary" onclick="editShift('${shift.id}')">Edit</button>
        <button class="btn-sm danger-btn" onclick="openDeleteShiftModal('${shift.id}')">Delete</button>
      </div>
    </div>
  `;

  scrollToShiftDetails();
}

async function showDateShifts(date) {
  selectedDate = date;
  updateSelectedDateLabel();

  const detailsEl = document.getElementById("shiftDetails");
  if (!detailsEl) return;

  const filtered = allShifts.filter(shift => formatDateForInput(shift.shift_date) === date);

  if (filtered.length === 0) {
    detailsEl.innerHTML = `
      <h3 style="margin-top:0;">Shifts on ${date}</h3>
      <div class="date-nav">
        <button class="btn-secondary btn-sm" onclick="changeSelectedDate(-1)">← Prev Day</button>
        <span id="selectedDateLabel" class="date-badge">${formatSelectedDateLabel(selectedDate)}</span>
        <button class="btn-secondary btn-sm" onclick="changeSelectedDate(1)">Next Day →</button>
      </div>
      <p style="color:var(--text-muted);">No shifts scheduled on this date.</p>
    `;
    scrollToShiftDetails();
    return;
  }

  detailsEl.innerHTML =
    `<h3 style="margin-top:0;">Shifts on ${date}</h3>
    <div class="date-nav">
      <button class="btn-secondary btn-sm" onclick="changeSelectedDate(-1)">← Prev Day</button>
      <span id="selectedDateLabel" class="date-badge">${formatSelectedDateLabel(selectedDate)}</span>
      <button class="btn-secondary btn-sm" onclick="changeSelectedDate(1)">Next Day →</button>
    </div>` +
    filtered.map(shift => `
      <div class="shift-box">
        <div style="font-weight:700; color:white;">${shift.employee_name || shift.employee_id}</div>
        <p style="margin:2px 0;"><b>${shift.title}</b> • ${shift.start_time} - ${shift.end_time}</p>
        <div class="shift-actions">
          <button class="btn-sm btn-primary" onclick="editShift('${shift.id}')">Edit</button>
          <button class="btn-sm danger-btn" onclick="openDeleteShiftModal('${shift.id}')">Delete</button>
        </div>
      </div>
    `).join("");

  scrollToShiftDetails();
}

function changeSelectedDate(dayOffset) {
  if (!selectedDate) return;
  const nextDate = new Date(`${selectedDate}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + dayOffset);
  const nextDateString = nextDate.toISOString().slice(0, 10);
  showDateShifts(nextDateString);
}

function updateSelectedDateLabel() {
  const label = document.getElementById("selectedDateLabel");
  if (label) label.textContent = formatSelectedDateLabel(selectedDate);
}

function formatSelectedDateLabel(dateValue) {
  if (!dateValue) return "No date selected";
  return `Date: ${dateValue}`;
}

function formatDateForInput(dateValue) {
  return String(dateValue).slice(0, 10);
}

function formatTimeForInput(timeValue) {
  return String(timeValue).slice(0, 5);
}

function renderShiftList() {
  const searchInput = document.getElementById("shiftSearchEmployeeId");
  const keyword = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const listEl = document.getElementById("shiftList");
  if (!listEl) return;

  const filteredShifts = keyword
    ? allShifts.filter(shift => String(shift.employee_id || "").toLowerCase().includes(keyword) || String(shift.employee_name || "").toLowerCase().includes(keyword))
    : allShifts;

  if (filteredShifts.length === 0) {
    listEl.innerHTML = "<p style='color:var(--text-muted);'>No matching shifts found.</p>";
    return;
  }

  listEl.innerHTML = filteredShifts.map(shift => `
    <div class="shift-box">
      <div style="font-weight:700; color:white;">${shift.employee_name || shift.employee_id || "Employee"}</div>
      <p style="margin:2px 0; font-size:12px; color:var(--text-soft);">ID: ${shift.employee_id || "-"} • ${shift.title}</p>
      <p style="margin:2px 0; font-size:13px;">Date: ${formatDateForInput(shift.shift_date)} (${shift.start_time} - ${shift.end_time})</p>
      <div class="shift-actions">
        <button class="btn-sm btn-primary" onclick="editShift('${shift.id}')">Edit</button>
        <button class="btn-sm danger-btn" onclick="openDeleteShiftModal('${shift.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}

function openShiftList() {
  const section = document.getElementById("createdShiftSection");
  if (!section) return;
  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToShiftDetails() {
  document.getElementById("shiftDetails")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===================================================
// 4. Attendance Management Section
// ===================================================
async function loadAttendanceRecords() {
  const tbody = document.getElementById("adminAttendanceTableBody");
  if (!tbody) return;

  const data = await api("/admin/attendance");
  if (data.error) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:#f87171; padding:20px;">${data.error}</td></tr>`;
    return;
  }

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--text-muted);">No attendance records found yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(record => {
    const punchIn = record.punch_in_time ? new Date(record.punch_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-";
    const punchOut = record.punch_out_time ? new Date(record.punch_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-";
    const status = record.attendance_status || "scheduled";

    let statusClass = "status-scheduled";
    if (status === "present" || status === "completed") statusClass = "status-completed";
    else if (status === "punched_in" || status === "punched_out") statusClass = "status-leave";
    else if (status === "absent") statusClass = "danger-btn";

    return `
      <tr>
        <td>${formatDateForInput(record.shift_date)}</td>
        <td><b>${record.employee_name || "Staff"}</b></td>
        <td><code style="color:#38bdf8;">${record.employee_id}</code></td>
        <td>${record.title}</td>
        <td><span style="color:var(--text-soft);">${formatTimeForInput(record.start_time)} - ${formatTimeForInput(record.end_time)}</span></td>
        <td><span style="color:#34d399; font-weight:700;">${punchIn}</span></td>
        <td><span style="color:#38bdf8; font-weight:700;">${punchOut}</span></td>
        <td><b>${record.working_hours || 0} hrs</b></td>
        <td>${Number(record.late_minutes) > 0 ? `<span style="color:#f87171; font-weight:700;">${record.late_minutes}m</span>` : "0m"}</td>
        <td><span class="badge-status ${statusClass}">${status.toUpperCase()}</span></td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn-sm btn-primary" onclick="confirmAttendanceAction('${record.id}', 'present')" title="Mark Present">✓ Present</button>
            <button class="btn-sm btn-secondary" onclick="confirmAttendanceAction('${record.id}', 'late')" title="Mark Late">Late</button>
            <button class="btn-sm btn-secondary" onclick="confirmAttendanceAction('${record.id}', 'half_day')" title="Half Day">Half Day</button>
            <button class="btn-sm danger-btn" onclick="confirmAttendanceAction('${record.id}', 'absent')" title="Mark Absent">Absent</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// ===================================================
// 5. Leave Management Section
// ===================================================
async function loadAdminLeaveRequests(filter = "all") {
  const tbody = document.getElementById("adminLeaveTableBody");
  if (!tbody) return;

  const data = await api("/admin/leave");
  if (data.error) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#f87171; padding:20px;">${data.error}</td></tr>`;
    return;
  }

  allLeaveRequests = Array.isArray(data) ? data : [];
  let displayList = allLeaveRequests;

  if (filter !== "all") {
    displayList = allLeaveRequests.filter(l => l.status === filter);
  }

  if (displayList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">No ${filter !== 'all' ? filter : ''} leave applications found.</td></tr>`;
    return;
  }

  tbody.innerHTML = displayList.map(req => {
    const isPending = req.status === "pending";
    const statusClass = req.status === "approved" ? "status-completed" : req.status === "rejected" ? "danger-btn" : "status-leave";

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:white;">${req.employee_name}</div>
          <div style="font-size:11px; color:#38bdf8;">ID: ${req.employee_id}</div>
        </td>
        <td>${req.employee_dept || "Operations"}</td>
        <td><span class="badge-status" style="background:rgba(245, 158, 11, 0.2); color:#fcd34d;">${req.leave_type}</span></td>
        <td>${formatDateForInput(req.start_date)}</td>
        <td>${formatDateForInput(req.end_date)}</td>
        <td style="max-width:240px; font-size:13px; color:#cbd5e1;">${req.reason || "-"}</td>
        <td><span class="badge-status ${statusClass}">${req.status.toUpperCase()}</span></td>
        <td>
          ${isPending ? `
            <input id="leave_remarks_${req.id}" placeholder="Manager feedback..." style="padding:6px 10px; font-size:12px; border-radius:6px; background:rgba(255,255,255,0.06); border:1px solid var(--border-subtle); color:white; width:140px;">
          ` : `
            <span style="font-size:12px; color:var(--text-soft);">${req.admin_remarks || "-"}</span>
          `}
        </td>
        <td>
          ${isPending ? `
            <div style="display:flex; gap:6px;">
              <button class="btn-sm btn-primary" onclick="handleLeaveDecision('${req.id}', 'approve')">✅ Approve</button>
              <button class="btn-sm danger-btn" onclick="handleLeaveDecision('${req.id}', 'reject')">❌ Reject</button>
            </div>
          ` : `
            <span style="font-size:12px; color:var(--text-muted);">Resolved</span>
          `}
        </td>
      </tr>
    `;
  }).join("");
}

function filterLeaveRequests(status) {
  loadAdminLeaveRequests(status);
}

async function handleLeaveDecision(leaveId, decision) {
  const remarksInput = document.getElementById(`leave_remarks_${leaveId}`);
  const remarks = remarksInput ? remarksInput.value.trim() : "";

  const endpoint = `/admin/leave/${leaveId}/${decision}`;
  const result = await api(endpoint, "PUT", { remarks });

  if (result.error) {
    showToast(result.error, "error");
    return;
  }

  showToast(`Leave request ${decision === 'approve' ? 'approved' : 'rejected'} successfully`, "success");
  await loadAdminLeaveRequests();
  await loadDashboardStats();
}

// ===================================================
// 6. Reports & CSV Export
// ===================================================
async function refreshReports() {
  const tbody = document.getElementById("adminReportsTableBody");
  if (!tbody) return;

  const data = await api("/admin/reports");
  if (data.error) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#f87171; padding:20px;">${data.error}</td></tr>`;
    return;
  }

  allReports = Array.isArray(data) ? data : [];

  if (allReports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-muted);">No reports data available.</td></tr>`;
    return;
  }

  tbody.innerHTML = allReports.map(r => `
    <tr>
      <td>
        <div style="font-weight:700; color:white;">${r.name || "Employee"}</div>
        <div style="font-size:11px; color:#38bdf8;">ID: ${r.employee_id}</div>
      </td>
      <td>${r.department || "General"}</td>
      <td>${r.role || "Staff"}</td>
      <td><span style="color:#34d399; font-weight:700;">${r.completed_hours || 0} hrs</span></td>
      <td><span style="color:#fcd34d; font-weight:700;">${r.overtime_hours || 0} hrs</span></td>
      <td>${r.leave_taken || 0}</td>
      <td>${r.pending_shifts || 0}</td>
      <td><b>${r.total_assigned_shifts || 0}</b></td>
    </tr>
  `).join("");
}

function exportReportsToCSV() {
  if (!allReports || allReports.length === 0) {
    showToast("No report data available to export", "error");
    return;
  }

  const headers = ["Employee ID", "Full Name", "Department", "Role", "Completed Hours", "Overtime Hours", "Leaves Taken", "Pending Shifts", "Total Assigned Shifts"];
  const rows = allReports.map(r => [
    `"${r.employee_id}"`,
    `"${r.name}"`,
    `"${r.department || 'General'}"`,
    `"${r.role || 'Staff'}"`,
    r.completed_hours || 0,
    r.overtime_hours || 0,
    r.leave_taken || 0,
    r.pending_shifts || 0,
    r.total_assigned_shifts || 0
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Workforce_Report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("Productivity report exported to CSV!", "success");
}

// ===================================================
// 7. Security, Users & Audit Logs
// ===================================================
async function loadUsers() {
  const data = await api("/users");
  const list = document.getElementById("userList");
  if (!list) return;

  if (data.error) {
    list.innerHTML = `<p style="color:#f87171;">${data.error}</p>`;
    return;
  }

  list.innerHTML = data.map(user => `
    <div class="shift-box">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:700; color:white; font-size:15px;">${user.username}</div>
          <div style="font-size:12px; color:var(--text-soft);">${user.email || "No email"} • ID: ${user.id} ${user.employee_id ? `(Staff ID: ${user.employee_id})` : ""}</div>
        </div>
        <span class="role-pill">${user.role || "user"}</span>
      </div>
      <div style="margin-top:10px;">
        <button class="btn-sm btn-secondary" onclick="prefillResetUser('${user.id}')">Reset Password</button>
      </div>
    </div>
  `).join("");
}

function prefillResetUser(userId) {
  showSection("admin");
  document.getElementById("reset_user_id").value = userId;
  document.getElementById("reset_password").focus();
}

async function resetUserPassword() {
  const userId = document.getElementById("reset_user_id").value.trim();
  const password = document.getElementById("reset_password").value;
  const msg = document.getElementById("adminMsg");

  if (!userId || !password) {
    showToast("Please enter User ID and new password", "error");
    return;
  }

  const result = await api(`/users/${userId}/password`, "PUT", { password });
  if (result.error) {
    showToast(result.error, "error");
    if (msg) { msg.style.color = "#f43f5e"; msg.innerText = result.error; }
    return;
  }

  showToast("Password updated successfully!", "success");
  if (msg) { msg.style.color = "#10b981"; msg.innerText = "Password override applied!"; }
  document.getElementById("reset_password").value = "";
  await loadUsers();
}

async function loadAuditLogs() {
  const tbody = document.getElementById("auditLogsBody");
  if (!tbody) return;

  const logs = await api("/admin/audit-logs");
  if (logs.error) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#f87171;">${logs.error}</td></tr>`;
    return;
  }

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">No audit logs recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.slice(0, 50).map(log => `
    <tr>
      <td style="font-size:12px; color:var(--text-soft);">${new Date(log.created_at).toLocaleString()}</td>
      <td><b>${log.username || "System"}</b></td>
      <td><span class="badge-status" style="background:rgba(99, 102, 241, 0.2); color:#a5b4fc;">${log.action}</span></td>
      <td>${log.entity_type} ${log.entity_id ? `(${log.entity_id})` : ""}</td>
      <td style="font-size:12px; color:#cbd5e1; max-width:280px; overflow:hidden; text-overflow:ellipsis;">${log.details || "-"}</td>
    </tr>
  `).join("");
}

// ===================================================
// 8. In-App Notifications
// ===================================================
function toggleNotificationDropdown() {
  const dd = document.getElementById("notificationDropdown");
  if (!dd) return;
  dd.classList.toggle("hidden");
  if (!dd.classList.contains("hidden")) {
    loadNotifications();
  }
}

async function loadNotifications() {
  const list = document.getElementById("notificationList");
  const badge = document.getElementById("unreadNotificationBadge");
  if (!list) return;

  const notifications = await api("/notifications");
  if (!Array.isArray(notifications) || notifications.length === 0) {
    list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">No notifications yet</div>`;
    if (badge) badge.classList.add("hidden");
    return;
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  list.innerHTML = notifications.map(n => `
    <div class="notification-item ${!n.is_read ? 'unread' : ''}" onclick="markNotificationRead('${n.id}')">
      <div style="font-weight:700; color:white; font-size:13px;">${n.title}</div>
      <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">${n.message}</div>
      <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">${new Date(n.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
    </div>
  `).join("");
}

async function markNotificationRead(id) {
  await api(`/notifications/${id}/read`, "PUT");
  await loadNotifications();
}

async function markAllNotificationsRead() {
  await api("/notifications/read-all", "PUT");
  await loadNotifications();
  showToast("All notifications marked as read", "info");
}

// Global Toast Notifications
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
      <span>${message}</span>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}
