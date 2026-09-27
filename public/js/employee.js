// ===================================================
// Workforce Management System - Enterprise Employee Portal Controller
// Self-Service Shift View, Live Punch-In/Out, Attendance, Reports & Leaves
// ===================================================

let currentUser = null;
let employeeProfile = null;
let allMyShifts = [];
let allMyAttendance = [];
let allMyLeaves = [];
let allMyNotifications = [];
let todayShiftRecord = null;
let calendarInstance = null;
let hoursChartInstance = null;
let currentAttendanceFilter = "all";

// Toast Engine
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconSvg = type === "success"
    ? `<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#10b981"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`
    : type === "error"
    ? `<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#f43f5e"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>`
    : `<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#06b6d4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 4000);
}

function logout() {
  localStorage.clear();
  window.location.replace("employee-login.html");
}

// Formatters
function formatDate(dateValue) {
  if (!dateValue) return "-";
  return String(dateValue).slice(0, 10);
}

function formatTime(timeValue) {
  if (!timeValue) return "-";
  return String(timeValue).slice(0, 5);
}

function formatDateTime(dtStr) {
  if (!dtStr) return "-";
  try {
    const d = new Date(dtStr);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return String(dtStr).slice(11, 16);
  }
}

// Document Ready
document.addEventListener("DOMContentLoaded", async () => {
  initClock();
  initAuthSession();
  await loadEmployeeProfile();
  await loadEmployeeSchedule();
  await loadEmployeeAttendance();
  await loadEmployeeReports();
  await loadLeaveRequests();
  await loadNotifications();
  handleUrlRouting();
});

function handleUrlRouting() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("/employee/schedule")) {
    showEmployeeTab("emp-schedule");
  } else if (path.includes("/employee/attendance")) {
    showEmployeeTab("emp-attendance");
  } else if (path.includes("/employee/reports")) {
    showEmployeeTab("emp-reports");
  } else if (path.includes("/employee/leave")) {
    showEmployeeTab("emp-leave");
  } else if (path.includes("/employee/profile")) {
    showEmployeeTab("emp-profile");
  } else if (path.includes("/employee/notifications")) {
    showEmployeeTab("emp-notifications");
  }
}

// Live Clock Ticker
function initClock() {
  const clockEl = document.getElementById("liveClockText");
  if (!clockEl) return;

  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  update();
  setInterval(update, 1000);
}

// Session Initialization & First Login Check
function initAuthSession() {
  const userJson = localStorage.getItem("user");
  if (!userJson) {
    window.location.replace("employee-login.html");
    return;
  }

  try {
    currentUser = JSON.parse(userJson);
  } catch (e) {
    currentUser = { username: "Staff Member", role: "employee" };
  }

  // If logged in as admin or manager, allow switching to Admin portal
  if (currentUser.role === "admin" || currentUser.role === "manager") {
    const adminBtn = document.getElementById("adminPortalSwitchBtn");
    if (adminBtn) adminBtn.style.display = "inline-flex";
  }

  const nameEl = document.getElementById("empHeaderName");
  const idEl = document.getElementById("empHeaderId");
  const avatarEl = document.getElementById("empAvatar");

  const displayName = currentUser.employee_name || currentUser.username || "Employee";
  if (nameEl) nameEl.textContent = displayName;
  if (idEl) idEl.textContent = currentUser.employee_id || "Staff";
  if (avatarEl) {
    const initials = displayName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase() || "EM";
    avatarEl.textContent = initials;
  }

  // Check if first-login password change is mandated
  if (currentUser.must_change_password === 1) {
    const modal = document.getElementById("firstLoginModal");
    if (modal) modal.style.display = "flex";
  }
}

// Tab Switching Controller
function showEmployeeTab(tabId) {
  // Update Nav Items
  const navItems = document.querySelectorAll(".portal-nav-item");
  navItems.forEach(item => {
    if (item.getAttribute("data-tab") === tabId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Update Sections
  const tabs = document.querySelectorAll(".portal-tab-content");
  tabs.forEach(tab => {
    tab.style.display = tab.id === `tab-${tabId}` ? "block" : "none";
  });

  // Re-render Calendar if switching to schedule tab
  if (tabId === "emp-schedule") {
    setTimeout(() => {
      initScheduleCalendar();
      if (calendarInstance) calendarInstance.updateSize();
    }, 100);
  }

  // Render chart if switching to reports tab
  if (tabId === "emp-reports") {
    setTimeout(() => {
      renderHoursChart();
    }, 100);
  }
}

// ===================================================
// 1. Employee Profile Controller
// ===================================================
async function loadEmployeeProfile() {
  try {
    const res = await api("/employee/profile");
    if (res.error) {
      console.warn("Could not load employee profile:", res.error);
      return;
    }

    employeeProfile = res;

    // Update Hero elements
    const greetingEl = document.getElementById("punchHeroGreeting");
    if (greetingEl) {
      greetingEl.innerHTML = `Welcome back, ${employeeProfile.name || currentUser.username} 👋`;
    }

    const heroEmpId = document.getElementById("heroEmpId");
    const heroEmpDept = document.getElementById("heroEmpDept");
    const heroEmpRole = document.getElementById("heroEmpRole");
    const heroEmpJoined = document.getElementById("heroEmpJoined");

    if (heroEmpId) heroEmpId.textContent = employeeProfile.id || "-";
    if (heroEmpDept) heroEmpDept.textContent = employeeProfile.department || "General";
    if (heroEmpRole) heroEmpRole.textContent = employeeProfile.designation || employeeProfile.role || "Staff";
    if (heroEmpJoined) heroEmpJoined.textContent = formatDate(employeeProfile.joining_date);

    // Update Profile Tab Fields
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val || "-";
    };

    setVal("profEmpId", employeeProfile.id);
    setVal("profName", employeeProfile.name);
    setVal("profEmail", employeeProfile.email);
    setVal("profPhone", employeeProfile.phone);
    setVal("profDept", employeeProfile.department);
    setVal("profRole", `${employeeProfile.designation || ""} (${employeeProfile.role || "Staff"})`);
    setVal("profEmpType", employeeProfile.employment_type);
    setVal("profManager", employeeProfile.manager);
    setVal("profJoined", formatDate(employeeProfile.joining_date));
    setVal("profAddress", employeeProfile.address);

    setVal("profEmergName", employeeProfile.emergency_name);
    setVal("profEmergRelation", employeeProfile.emergency_relation);
    setVal("profEmergPhone", employeeProfile.emergency_phone);

  } catch (err) {
    console.error("Error loading profile:", err);
  }
}

// ===================================================
// 2. Schedule & Today's Shift Live Desk
// ===================================================
async function loadEmployeeSchedule() {
  try {
    const res = await api("/employee/schedule");
    allMyShifts = Array.isArray(res) ? res : [];

    // Find Today's Shift
    const todayStr = new Date().toISOString().slice(0, 10);
    todayShiftRecord = allMyShifts.find(s => formatDate(s.shift_date) === todayStr) || null;

    renderTodayShiftDesk();
    renderDashboardShiftsTable();
    renderScheduleListView();
    initScheduleCalendar();
  } catch (err) {
    console.error("Error loading schedule:", err);
  }
}

// Render the Live Punch-In/Out Desk
function renderTodayShiftDesk() {
  const statusContainer = document.getElementById("punchStatusContainer");
  const subtextEl = document.getElementById("punchHeroSubtext");
  const btnIn = document.getElementById("btnPunchIn");
  const btnOut = document.getElementById("btnPunchOut");

  if (!statusContainer || !btnIn || !btnOut) return;

  if (!todayShiftRecord) {
    if (subtextEl) subtextEl.textContent = "You do not have any shift assigned by management for today.";
    statusContainer.innerHTML = `
      <div class="status-banner" style="background:rgba(255,255,255,0.06); color:var(--text-soft); border:1px solid var(--border-subtle);">
        <span>No scheduled shifts for today (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}). Enjoy your rest day!</span>
      </div>
    `;
    btnIn.disabled = true;
    btnOut.disabled = true;
    return;
  }

  const shift = todayShiftRecord;
  const shiftTimeStr = `${formatTime(shift.start_time)} - ${formatTime(shift.end_time)}`;
  const status = shift.attendance_status || "scheduled";

  if (subtextEl) {
    subtextEl.innerHTML = `
      <b>${shift.title || "Assigned Shift"}</b> &nbsp;•&nbsp; 🏢 <b>${shift.department || "General"}</b> &nbsp;•&nbsp; ⏰ <b>${shiftTimeStr}</b> (Break: ${shift.break_duration || "1 hour"})
    `;
  }

  const inTimeStr = shift.punch_in_time ? formatDateTime(shift.punch_in_time) : null;
  const outTimeStr = shift.punch_out_time ? formatDateTime(shift.punch_out_time) : null;

  if (status === "scheduled" && !shift.punch_in_time) {
    statusContainer.innerHTML = `
      <div class="status-banner" style="background:rgba(6,182,212,0.15); border:1px solid rgba(6,182,212,0.35); color:var(--accent-cyan);">
        <span>Shift is active today. Click <b>PUNCH IN</b> when you arrive to record your attendance.</span>
      </div>
    `;
    btnIn.disabled = false;
    btnOut.disabled = true;
  } else if (status === "punched_in" || (shift.punch_in_time && !shift.punch_out_time)) {
    statusContainer.innerHTML = `
      <div class="status-banner status-banner-pending">
        <span class="pulse-dot" style="background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></span>
        <span>Punched in at <b>${inTimeStr}</b>.${shift.late_minutes > 0 ? ` (${shift.late_minutes}m Late)` : ""} Remember to click <b>PUNCH OUT</b> when your shift ends.</span>
      </div>
    `;
    btnIn.disabled = true;
    btnOut.disabled = false;
  } else if (status === "punched_out" || status === "completed" || status === "present") {
    const hours = shift.working_hours ? `${shift.working_hours} hrs` : "Logged";
    const confirmedText = shift.admin_confirmed ? "✅ Confirmed by Admin" : "⏳ Pending Admin Verification";
    statusContainer.innerHTML = `
      <div class="status-banner status-banner-confirmed">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#10b981"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        <span>Shift completed! Punch In: <b>${inTimeStr}</b> | Punch Out: <b>${outTimeStr}</b> | Total: <b>${hours}</b> &nbsp;•&nbsp; <i>${confirmedText}</i></span>
      </div>
    `;
    btnIn.disabled = true;
    btnOut.disabled = true;
  } else if (status === "leave") {
    statusContainer.innerHTML = `
      <div class="status-banner" style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); color:var(--accent-amber);">
        <span>🏖️ On Approved Leave (${shift.leave_type || "Leave Record"}). Shift attendance marked as excused.</span>
      </div>
    `;
    btnIn.disabled = true;
    btnOut.disabled = true;
  } else if (status === "absent") {
    statusContainer.innerHTML = `
      <div class="status-banner" style="background:rgba(244,63,94,0.15); border:1px solid rgba(244,63,94,0.4); color:#f43f5e;">
        <span>❌ Recorded as Absent by management for this shift.</span>
      </div>
    `;
    btnIn.disabled = true;
    btnOut.disabled = true;
  }
}

// Action: Handle Punch In
async function handlePunchIn() {
  const btnIn = document.getElementById("btnPunchIn");
  if (btnIn) btnIn.disabled = true;

  try {
    const shiftId = todayShiftRecord ? todayShiftRecord.id : null;
    const res = await api("/attendance/punch-in", "POST", { shift_id: shiftId });
    if (res.error) {
      showToast(res.error, "error");
      if (btnIn) btnIn.disabled = false;
      return;
    }

    showToast(res.message || "Punched in successfully! Timestamp recorded.", "success");
    await loadEmployeeSchedule();
    await loadEmployeeAttendance();
    await loadEmployeeReports();
    await loadNotifications();
  } catch (err) {
    showToast(err.message, "error");
    if (btnIn) btnIn.disabled = false;
  }
}

// Action: Handle Punch Out
async function handlePunchOut() {
  const btnOut = document.getElementById("btnPunchOut");
  if (btnOut) btnOut.disabled = true;

  try {
    const shiftId = todayShiftRecord ? todayShiftRecord.id : null;
    const res = await api("/attendance/punch-out", "POST", { shift_id: shiftId });
    if (res.error) {
      showToast(res.error, "error");
      if (btnOut) btnOut.disabled = false;
      return;
    }

    showToast(`Punched out successfully! ${res.working_hours} hours recorded.`, "success");
    await loadEmployeeSchedule();
    await loadEmployeeAttendance();
    await loadEmployeeReports();
    await loadNotifications();
  } catch (err) {
    showToast(err.message, "error");
    if (btnOut) btnOut.disabled = false;
  }
}

// Render Dashboard Upcoming Shifts Table
function renderDashboardShiftsTable() {
  const tbody = document.getElementById("empDashboardShiftsBody");
  if (!tbody) return;

  if (allMyShifts.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="7" style="text-align:center; padding:28px; color:var(--text-muted);">No shifts assigned yet.</td></tr>
    `;
    return;
  }

  tbody.innerHTML = allMyShifts.slice(0, 5).map(s => {
    return `
      <tr>
        <td><b>${s.title}</b></td>
        <td>${formatDate(s.shift_date)}</td>
        <td><span style="color:var(--text-soft);">${formatTime(s.start_time)} - ${formatTime(s.end_time)}</span></td>
        <td>${s.break_duration || "1h"}</td>
        <td>${renderStatusBadge(s.attendance_status)}</td>
        <td>${s.punch_in_time ? formatDateTime(s.punch_in_time) : "-"}</td>
        <td>${s.punch_out_time ? formatDateTime(s.punch_out_time) : "-"}</td>
      </tr>
    `;
  }).join("");
}

// Helper: Status Badges
function renderStatusBadge(status) {
  const st = String(status || "scheduled").toLowerCase();
  if (st === "present" || st === "completed") {
    return `<span class="badge-status status-completed">Present</span>`;
  } else if (st === "punched_in" || st === "attended") {
    return `<span class="badge-status status-leave" style="color:#fbbf24; border-color:rgba(245,158,11,0.4);">Punched In</span>`;
  } else if (st === "punched_out") {
    return `<span class="badge-status status-in-progress">Punched Out</span>`;
  } else if (st === "late") {
    return `<span class="badge-status status-danger">Late</span>`;
  } else if (st === "half_day" || st === "half day") {
    return `<span class="badge-status status-amber">Half Day</span>`;
  } else if (st === "leave") {
    return `<span class="badge-status status-leave">On Leave</span>`;
  } else if (st === "absent") {
    return `<span class="badge-status status-danger">Absent</span>`;
  }
  return `<span class="badge-status status-scheduled">Scheduled</span>`;
}

// ===================================================
// 3. My Schedule (Calendar & List View)
// ===================================================
function toggleScheduleView(viewType) {
  const calView = document.getElementById("empCalendarView");
  const listView = document.getElementById("empListView");
  const btnCal = document.getElementById("btnViewCalendar");
  const btnList = document.getElementById("btnViewList");

  if (viewType === "calendar") {
    if (calView) calView.style.display = "block";
    if (listView) listView.style.display = "none";
    if (btnCal) { btnCal.className = "btn-sm btn-primary"; }
    if (btnList) { btnList.className = "btn-sm btn-secondary"; }
    if (calendarInstance) calendarInstance.updateSize();
  } else {
    if (calView) calView.style.display = "none";
    if (listView) listView.style.display = "block";
    if (btnCal) { btnCal.className = "btn-sm btn-secondary"; }
    if (btnList) { btnList.className = "btn-sm btn-primary"; }
  }
}

function initScheduleCalendar() {
  const el = document.getElementById("empCalendar");
  if (!el || typeof FullCalendar === "undefined") return;

  if (calendarInstance) {
    calendarInstance.removeAllEvents();
    calendarInstance.addEventSource(mapShiftsToEvents(allMyShifts));
    return;
  }

  calendarInstance = new FullCalendar.Calendar(el, {
    initialView: "dayGridMonth",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay"
    },
    events: mapShiftsToEvents(allMyShifts),
    eventClick: function(info) {
      showToast(`${info.event.title} (${info.event.extendedProps.timeStr})`, "info");
    }
  });

  calendarInstance.render();
}

function mapShiftsToEvents(shifts) {
  return shifts.map(s => {
    const status = s.attendance_status || "scheduled";
    let color = "#06b6d4"; // Cyan scheduled
    if (status === "present" || status === "completed") color = "#10b981"; // Emerald
    else if (status === "punched_in" || status === "attended") color = "#f59e0b"; // Amber
    else if (status === "leave") color = "#8b5cf6"; // Purple
    else if (status === "absent") color = "#ef4444"; // Red

    return {
      id: String(s.id),
      title: `${s.title || "Shift"} (${formatTime(s.start_time)})`,
      start: `${formatDate(s.shift_date)}T${formatTime(s.start_time)}`,
      end: `${formatDate(s.shift_date)}T${formatTime(s.end_time)}`,
      backgroundColor: color,
      borderColor: color,
      extendedProps: {
        department: s.department,
        status: status,
        timeStr: `${formatTime(s.start_time)} - ${formatTime(s.end_time)}`
      }
    };
  });
}

function filterScheduleList(filter) {
  const todayStr = new Date().toISOString().slice(0, 10);
  let filtered = allMyShifts;

  if (filter === "upcoming") {
    filtered = allMyShifts.filter(s => formatDate(s.shift_date) >= todayStr);
  } else if (filter === "past") {
    filtered = allMyShifts.filter(s => formatDate(s.shift_date) < todayStr);
  }

  renderScheduleListFiltered(filtered);
}

function renderScheduleListView() {
  renderScheduleListFiltered(allMyShifts);
}

function renderScheduleListFiltered(shifts) {
  const tbody = document.getElementById("empScheduleListBody");
  if (!tbody) return;

  if (shifts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted);">No shifts match this filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = shifts.map(s => `
    <tr>
      <td><b>${formatDate(s.shift_date)}</b></td>
      <td>${s.title}</td>
      <td>${s.department || "-"}</td>
      <td>${formatTime(s.start_time)}</td>
      <td>${formatTime(s.end_time)}</td>
      <td>${s.break_duration || "1h"}</td>
      <td>${renderStatusBadge(s.attendance_status)}</td>
    </tr>
  `).join("");
}

// ===================================================
// 4. Attendance History & Summary
// ===================================================
async function loadEmployeeAttendance() {
  try {
    const res = await api("/employee/attendance");
    if (res.error) return;

    allMyAttendance = res.shifts || [];
    const summary = res.summary || {};

    // Update attendance KPIs in Dashboard tab
    const rateEl = document.getElementById("kpiAttendanceRate");
    const schedEl = document.getElementById("kpiTotalScheduled");
    const attEl = document.getElementById("kpiTotalAttended");
    const absEl = document.getElementById("kpiAbsentDays");
    const leaveEl = document.getElementById("kpiLeaveDays");
    const hoursEl = document.getElementById("kpiTotalHours");
    const otEl = document.getElementById("kpiOvertimeHours");

    if (rateEl) rateEl.textContent = `${summary.attendance_percentage || 100}%`;
    if (schedEl) schedEl.textContent = summary.total_shifts || 0;
    if (attEl) attEl.textContent = summary.attended || 0;
    if (absEl) absEl.textContent = summary.absent || 0;
    if (leaveEl) leaveEl.textContent = summary.leave || 0;
    if (hoursEl) hoursEl.innerHTML = `${summary.total_hours || 0}<span style="font-size:1.1rem; color:var(--text-soft); font-weight:600;">h</span>`;
    if (otEl) otEl.innerHTML = `${summary.total_overtime || 0}<span style="font-size:1.1rem; color:var(--text-soft); font-weight:600;">h</span>`;

    // Update Attendance Tab summary bar
    const setSummary = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setSummary("attSummaryTotal", summary.total_shifts || 0);
    setSummary("attSummaryAttended", summary.attended || 0);
    setSummary("attSummaryAbsent", summary.absent || 0);
    setSummary("attSummaryLate", summary.late || 0);
    setSummary("attSummaryLeave", summary.leave || 0);
    setSummary("attSummaryHours", `${summary.total_hours || 0}h`);
    setSummary("attSummaryOvertime", `${summary.total_overtime || 0}h`);

    renderAttendanceTable(allMyAttendance);
  } catch (err) {
    console.error("Error loading attendance:", err);
  }
}

function filterAttendanceRange(range) {
  currentAttendanceFilter = range;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  let filtered = allMyAttendance;

  if (range === "today") {
    filtered = allMyAttendance.filter(s => formatDate(s.shift_date) === todayStr);
  } else if (range === "week") {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    const weekStr = oneWeekAgo.toISOString().slice(0, 10);
    filtered = allMyAttendance.filter(s => formatDate(s.shift_date) >= weekStr);
  } else if (range === "month") {
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(now.getDate() - 30);
    const monthStr = oneMonthAgo.toISOString().slice(0, 10);
    filtered = allMyAttendance.filter(s => formatDate(s.shift_date) >= monthStr);
  }

  renderAttendanceTable(filtered);
}

function renderAttendanceTable(records) {
  const tbody = document.getElementById("empAttendanceTableBody");
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="10" style="text-align:center; padding:28px; color:var(--text-muted);">No attendance records found for this period.</td></tr>
    `;
    return;
  }

  tbody.innerHTML = records.map(s => {
    const schedStr = `${formatTime(s.start_time)} - ${formatTime(s.end_time)}`;
    const punchInStr = s.punch_in_time ? formatDateTime(s.punch_in_time) : "-";
    const punchOutStr = s.punch_out_time ? formatDateTime(s.punch_out_time) : "-";
    const hours = s.working_hours ? `${s.working_hours}h` : "-";
    const late = s.late_minutes && Number(s.late_minutes) > 0 ? `${s.late_minutes}m` : "On Time";
    const ot = s.overtime_hours && Number(s.overtime_hours) > 0 ? `${s.overtime_hours}h` : "0h";

    let verifBadge = `<span style="color:var(--text-muted); font-size:12px;">Not Verified</span>`;
    if (s.admin_confirmed) {
      verifBadge = `<span style="color:var(--accent-emerald); font-weight:700; font-size:12px;">✅ Confirmed</span>`;
    } else if (s.punch_in_time) {
      verifBadge = `<span style="color:#fbbf24; font-weight:700; font-size:12px;">⏳ In Review</span>`;
    }

    return `
      <tr>
        <td><b>${formatDate(s.shift_date)}</b></td>
        <td>${s.title}</td>
        <td><span style="color:var(--text-soft);">${schedStr}</span></td>
        <td>${punchInStr}</td>
        <td>${punchOutStr}</td>
        <td><b>${hours}</b></td>
        <td style="${late !== 'On Time' ? 'color:#f43f5e; font-weight:700;' : 'color:var(--text-soft);'}">${late}</td>
        <td style="${ot !== '0h' ? 'color:#fbbf24; font-weight:700;' : 'color:var(--text-soft);'}">${ot}</td>
        <td>${renderStatusBadge(s.attendance_status)}</td>
        <td>${verifBadge}</td>
      </tr>
    `;
  }).join("");
}

// ===================================================
// 5. Reports & Analytics
// ===================================================
async function loadEmployeeReports() {
  try {
    const res = await api("/employee/reports");
    if (res.error) return;

    // Update KPI metrics
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal("repAttendanceRate", `${res.attendance_percentage || 100}%`);
    setVal("repTotalScheduled", res.total_scheduled || 0);
    setVal("repTotalAttended", res.total_attended || 0);
    setVal("repTotalHours", `${res.total_hours || 0}h`);
    setVal("repAvgHours", `${res.avg_hours || 0}h`);
    setVal("repTotalOvertime", `${res.total_overtime || 0}h`);
    setVal("repLateArrivals", res.late_arrivals || 0);
    setVal("repApprovedLeaves", res.leaves_summary?.approved || 0);

    // Populate Report Breakdown Table
    const tbody = document.getElementById("empReportTableBody");
    if (tbody && Array.isArray(res.records)) {
      if (res.records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px;">No shift records available.</td></tr>`;
      } else {
        tbody.innerHTML = res.records.map(s => `
          <tr>
            <td><b>${formatDate(s.shift_date)}</b></td>
            <td>${s.title}</td>
            <td>${formatTime(s.start_time)} - ${formatTime(s.end_time)}</td>
            <td>${s.punch_in_time ? formatDateTime(s.punch_in_time) : "-"}</td>
            <td>${s.punch_out_time ? formatDateTime(s.punch_out_time) : "-"}</td>
            <td><b>${s.working_hours || 0}h</b></td>
            <td>${s.overtime_hours || 0}h</td>
            <td>${renderStatusBadge(s.attendance_status)}</td>
          </tr>
        `).join("");
      }
    }
  } catch (err) {
    console.error("Error loading employee reports:", err);
  }
}

function renderHoursChart() {
  const canvas = document.getElementById("empHoursChart");
  if (!canvas || typeof Chart === "undefined") return;

  const ctx = canvas.getContext("2d");
  if (hoursChartInstance) {
    hoursChartInstance.destroy();
  }

  // Take the last 10 completed shifts
  const recentCompleted = allMyShifts
    .filter(s => s.working_hours && Number(s.working_hours) > 0)
    .slice(-10);

  const labels = recentCompleted.map(s => formatDate(s.shift_date));
  const data = recentCompleted.map(s => Number(s.working_hours) || 0);

  hoursChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.length ? labels : ["No data"],
      datasets: [{
        label: "Logged Working Hours",
        data: data.length ? data : [0],
        backgroundColor: "rgba(16, 185, 129, 0.65)",
        borderColor: "#10b981",
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8" }
        },
        x: {
          grid: { display: false },
          ticks: { color: "#94a3b8" }
        }
      },
      plugins: {
        legend: {
          labels: { color: "#f8fafc" }
        }
      }
    }
  });
}

function exportEmployeeReportCSV() {
  if (allMyAttendance.length === 0) {
    showToast("No attendance data to export", "error");
    return;
  }

  let csv = "Shift Date,Shift Title,Scheduled Start,Scheduled End,Punch In,Punch Out,Working Hours,Late Minutes,Overtime Hours,Attendance Status,Admin Confirmed\n";

  allMyAttendance.forEach(s => {
    const row = [
      formatDate(s.shift_date),
      `"${s.title || ''}"`,
      formatTime(s.start_time),
      formatTime(s.end_time),
      s.punch_in_time ? formatDateTime(s.punch_in_time) : "",
      s.punch_out_time ? formatDateTime(s.punch_out_time) : "",
      s.working_hours || 0,
      s.late_minutes || 0,
      s.overtime_hours || 0,
      s.attendance_status || "scheduled",
      s.admin_confirmed ? "Yes" : "No"
    ];
    csv += row.join(",") + "\n";
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Workforce_Report_${currentUser.employee_id || "Employee"}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("Report exported successfully to CSV!", "success");
}

// ===================================================
// 6. Leave Requests Management
// ===================================================
async function loadLeaveRequests() {
  try {
    const res = await api("/employee/leave");
    allMyLeaves = Array.isArray(res) ? res : [];

    const tbody = document.getElementById("empLeaveHistoryBody");
    if (!tbody) return;

    if (allMyLeaves.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--text-muted);">No leave requests submitted yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = allMyLeaves.map(l => {
      let badgeClass = "status-scheduled";
      if (l.status === "approved") badgeClass = "status-completed";
      else if (l.status === "rejected") badgeClass = "status-danger";

      return `
        <tr>
          <td><b>${l.leave_type}</b></td>
          <td><span style="color:var(--text-soft);">${formatDate(l.start_date)} - ${formatDate(l.end_date)}</span></td>
          <td><span class="badge-status ${badgeClass}">${l.status.toUpperCase()}</span></td>
          <td><span style="font-size:13px; color:var(--text-soft);">${l.admin_remarks || "Awaiting review"}</span></td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Error loading leave requests:", err);
  }
}

async function handleLeaveSubmit(e) {
  e.preventDefault();
  const leave_type = document.getElementById("leaveTypeInput").value;
  const start_date = document.getElementById("leaveStartDate").value;
  const end_date = document.getElementById("leaveEndDate").value;
  const reason = document.getElementById("leaveReasonInput").value;

  if (new Date(start_date) > new Date(end_date)) {
    showToast("End date must be on or after start date", "error");
    return;
  }

  const res = await api("/employee/leave", "POST", {
    leave_type,
    start_date,
    end_date,
    reason
  });

  if (res.error) {
    showToast(res.error, "error");
    return;
  }

  showToast("Leave request submitted successfully for manager review!", "success");
  document.getElementById("empLeaveForm").reset();
  await loadLeaveRequests();
}

// ===================================================
// 7. Notifications Controller
// ===================================================
function toggleEmpNotifications() {
  const dd = document.getElementById("empNotificationDropdown");
  if (!dd) return;
  dd.style.display = dd.style.display === "none" ? "flex" : "none";
}

async function loadNotifications() {
  try {
    const res = await api("/notifications");
    allMyNotifications = Array.isArray(res) ? res : [];

    const unreadCount = allMyNotifications.filter(n => !n.is_read).length;
    const badge = document.getElementById("empNotifBadge");
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = "inline-block";
      } else {
        badge.style.display = "none";
      }
    }

    // Populate Dropdown
    const ddList = document.getElementById("empNotifDropdownList");
    if (ddList) {
      if (allMyNotifications.length === 0) {
        ddList.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-soft); font-size:13px;">No notifications</div>`;
      } else {
        ddList.innerHTML = allMyNotifications.slice(0, 8).map(n => `
          <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="markNotificationRead(${n.id})">
            <div style="font-weight:700; font-size:13px; color:var(--text-main);">${n.title}</div>
            <div style="font-size:12px; color:var(--text-soft); margin-top:2px;">${n.message}</div>
            <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `).join("");
      }
    }

    // Populate Full Notifications Tab
    const fullList = document.getElementById("empNotificationsFullList");
    if (fullList) {
      if (allMyNotifications.length === 0) {
        fullList.innerHTML = `<div style="padding:28px; text-align:center; color:var(--text-muted);">No system announcements or notifications.</div>`;
      } else {
        fullList.innerHTML = allMyNotifications.map(n => `
          <div class="notification-item ${n.is_read ? '' : 'unread'}" style="border:1px solid var(--border-subtle); border-radius:10px; padding:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:700; font-size:14px; color:var(--text-main);">${n.title}</span>
              <span style="font-size:11px; color:var(--text-muted);">${new Date(n.created_at).toLocaleString()}</span>
            </div>
            <p style="font-size:13px; color:var(--text-soft); margin:6px 0 0;">${n.message}</p>
          </div>
        `).join("");
      }
    }
  } catch (err) {
    console.error("Error loading notifications:", err);
  }
}

async function markNotificationRead(id) {
  await api(`/notifications/${id}/read`, "PUT");
  await loadNotifications();
}

async function markAllNotificationsRead() {
  await api("/notifications/read-all", "PUT");
  await loadNotifications();
  showToast("All notifications marked as read", "success");
}

// ===================================================
// 8. Password & Security Management
// ===================================================
async function handleChangePassword(e) {
  e.preventDefault();
  const current_password = document.getElementById("pwCurrent").value;
  const new_password = document.getElementById("pwNew").value;
  const confirm = document.getElementById("pwConfirm").value;

  if (new_password !== confirm) {
    showToast("New passwords do not match", "error");
    return;
  }

  const res = await api("/auth/change-password", "POST", {
    current_password,
    new_password
  });

  if (res.error) {
    showToast(res.error, "error");
    return;
  }

  showToast("Password updated successfully!", "success");
  document.getElementById("empChangePasswordForm").reset();
}

async function handleFirstLoginPassword(e) {
  e.preventDefault();
  const current_password = document.getElementById("flCurrentPw").value;
  const new_password = document.getElementById("flNewPw").value;
  const confirm = document.getElementById("flConfirmPw").value;

  if (new_password !== confirm) {
    showToast("New passwords do not match", "error");
    return;
  }

  const res = await api("/auth/change-password", "POST", {
    current_password,
    new_password
  });

  if (res.error) {
    showToast(res.error, "error");
    return;
  }

  // Update session
  currentUser.must_change_password = 0;
  localStorage.setItem("user", JSON.stringify(currentUser));

  // Hide modal
  const modal = document.getElementById("firstLoginModal");
  if (modal) modal.style.display = "none";

  showToast("Welcome! Temporary password successfully updated.", "success");
}
