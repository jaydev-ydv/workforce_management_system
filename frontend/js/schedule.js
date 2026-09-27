const token = localStorage.getItem("token");

if (!token) {
  window.location.href = "index.html";
}

let calendar;
let editingShiftId = null;
let selectedDate = null;
let employeeDirectory = [];

function goDashboard() {
  window.location.href = "dashboard.html";
}

function scrollToShiftList() {
  const section = document.getElementById("createdShiftSection");
  if (!section) {
    return;
  }

  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openShiftList() {
  const section = document.getElementById("createdShiftSection");
  if (!section) {
    return;
  }

  section.classList.remove("hidden");
  scrollToShiftList();
}

function scrollToShiftDetails() {
  const section = document.getElementById("shiftDetails");
  if (!section) {
    return;
  }

  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getColor() {
  const colors = ["#4CAF50", "#2196F3", "#FF9800", "#9C27B0", "#E91E63"];
  return colors[Math.floor(Math.random() * colors.length)];
}

document.addEventListener("DOMContentLoaded", async () => {
  initCalendar();
  await loadEmployees();
  await loadShifts();
});

function initCalendar() {
  const el = document.getElementById("calendar");

  calendar = new FullCalendar.Calendar(el, {
    initialView: "dayGridMonth",
    dateClick(info) {
      showDateShifts(info.dateStr);
    },
    eventClick(info) {
      showShiftDetails(info.event.extendedProps);
    }
  });

  calendar.render();
}

async function loadEmployees() {
  const employees = await api("/employees");
  const list = document.getElementById("employeeIds");

  if (employees.error) {
    list.innerHTML = "";
    return;
  }

  employeeDirectory = employees;
  list.innerHTML = employees.map(employee => `
    <option value="${employee.id}">${employee.name}</option>
  `).join("");
}

function resetShiftForm() {
  editingShiftId = null;
  document.getElementById("shiftFormTitle").textContent = "Create Shift";
  document.getElementById("saveShiftButton").textContent = "Create Shift";
  document.getElementById("cancelEditButton").style.display = "none";
  document.getElementById("title").value = "";
  document.getElementById("employee_id").value = "";
  document.getElementById("date").value = "";
  document.getElementById("start").value = "";
  document.getElementById("end").value = "";
}

async function saveShift() {
  const title = document.getElementById("title").value.trim();
  const employee_id = document.getElementById("employee_id").value.trim();
  const date = document.getElementById("date").value;
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;

  if (!title || !employee_id || !date || !start || !end) {
    alert("Select a shift type, enter employee ID, and fill all shift fields");
    return;
  }

  if (start >= end) {
    alert("End time must be later than start time");
    return;
  }

  const endpoint = editingShiftId ? `/shifts/${editingShiftId}` : "/shifts";
  const method = editingShiftId ? "PUT" : "POST";

  const result = await api(endpoint, method, {
    title,
    employee_id,
    date,
    start,
    end
  });

  if (result.error) {
    alert(result.error);
    return;
  }

  alert(editingShiftId ? "Shift updated successfully" : "Shift assigned successfully");
  resetShiftForm();
  await loadShifts();
}

function editShift(shiftId, shiftsCache = window.currentShifts || []) {
  const shift = shiftsCache.find(item => String(item.id) === String(shiftId));

  if (!shift) {
    alert("Shift not found");
    return;
  }

  editingShiftId = shift.id;
  document.getElementById("shiftFormTitle").textContent = "Edit Shift";
  document.getElementById("saveShiftButton").textContent = "Update Shift";
  document.getElementById("cancelEditButton").style.display = "inline-block";
  document.getElementById("title").value = shift.title || "";
  document.getElementById("employee_id").value = shift.employee_id || "";
  document.getElementById("date").value = formatDateForInput(shift.shift_date);
  document.getElementById("start").value = formatTimeForInput(shift.start_time);
  document.getElementById("end").value = formatTimeForInput(shift.end_time);
}

async function deleteShift(shiftId) {
  if (!confirm("Delete this shift?")) {
    return;
  }

  const result = await api(`/shifts/${shiftId}`, "DELETE");

  if (result.error) {
    alert(result.error);
    return;
  }

  if (String(editingShiftId) === String(shiftId)) {
    resetShiftForm();
  }

  document.getElementById("shiftDetails").innerHTML = `
    <h3>Shift Details</h3>
    <p>Click a date or event</p>
  `;

  alert("Shift deleted successfully");
  await loadShifts();
}

async function loadShifts() {
  const data = await api("/shifts");

  if (data.error) {
    document.getElementById("shiftList").innerHTML = `<p>${data.error}</p>`;
    return;
  }

  window.currentShifts = data;
  calendar.removeAllEvents();
  renderShiftList();

  data.forEach(shift => {
    calendar.addEvent({
      title: `${shift.employee_name || shift.employee_id}: ${shift.title}`,
      start: `${shift.shift_date}T${shift.start_time}`,
      end: `${shift.shift_date}T${shift.end_time}`,
      color: getColor(),
      extendedProps: {
        id: shift.id,
        employee: shift.employee_name || shift.employee_id,
        employee_id: shift.employee_id,
        title: shift.title,
        date: shift.shift_date,
        start: shift.start_time,
        end: shift.end_time
      }
    });
  });
}

function showShiftDetails(shift) {
  if (shift.date) {
    selectedDate = shift.date;
    updateSelectedDateLabel();
  }

  document.getElementById("shiftDetails").innerHTML = `
    <h3>Shift Details</h3>
    <div class="date-nav">
      <button onclick="changeSelectedDate(-1)">Previous Day</button>
      <span id="selectedDateLabel" class="date-badge">${formatSelectedDateLabel(selectedDate)}</span>
      <button onclick="changeSelectedDate(1)">Next Day</button>
    </div>
    <div class="shift-box">
      <b>Employee:</b> ${shift.employee || "-"}<br>
      <b>Shift:</b> ${shift.title}<br>
      <b>Date:</b> ${shift.date}<br>
      <b>Time:</b> ${shift.start} - ${shift.end}<br>
      <div class="shift-actions">
        <button onclick="editShift('${shift.id}')">Edit</button>
        <button class="danger-btn" onclick="deleteShift('${shift.id}')">Delete</button>
      </div>
    </div>
  `;

  scrollToShiftDetails();
}

async function showDateShifts(date) {
  selectedDate = date;
  updateSelectedDateLabel();

  const data = await api("/shifts");

  if (data.error) {
    document.getElementById("shiftDetails").innerHTML = `<p>${data.error}</p>`;
    return;
  }

  const filtered = data.filter(shift => shift.shift_date === date);

  if (filtered.length === 0) {
    document.getElementById("shiftDetails").innerHTML = `
      <h3>Shifts on ${date}</h3>
      <div class="date-nav">
        <button onclick="changeSelectedDate(-1)">Previous Day</button>
        <span id="selectedDateLabel" class="date-badge">${formatSelectedDateLabel(selectedDate)}</span>
        <button onclick="changeSelectedDate(1)">Next Day</button>
      </div>
      <p>No shifts on ${date}</p>
    `;
    scrollToShiftDetails();
    return;
  }

  document.getElementById("shiftDetails").innerHTML =
    `<h3>Shifts on ${date}</h3>
    <div class="date-nav">
      <button onclick="changeSelectedDate(-1)">Previous Day</button>
      <span id="selectedDateLabel" class="date-badge">${formatSelectedDateLabel(selectedDate)}</span>
      <button onclick="changeSelectedDate(1)">Next Day</button>
    </div>` +
    filtered.map(shift => `
      <div class="shift-box">
        <b>${shift.employee_name || shift.employee_id}</b><br>
        ${shift.title}<br>
        ${shift.start_time} - ${shift.end_time}<br>
        <div class="shift-actions">
          <button onclick="editShift('${shift.id}')">Edit</button>
          <button class="danger-btn" onclick="deleteShift('${shift.id}')">Delete</button>
        </div>
      </div>
    `).join("");

  scrollToShiftDetails();
}

function changeSelectedDate(dayOffset) {
  if (!selectedDate) {
    return;
  }

  const nextDate = new Date(`${selectedDate}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + dayOffset);
  const nextDateString = nextDate.toISOString().slice(0, 10);

  showDateShifts(nextDateString);
}

function updateSelectedDateLabel() {
  const label = document.getElementById("selectedDateLabel");
  if (!label) {
    return;
  }

  label.textContent = formatSelectedDateLabel(selectedDate);
}

function formatSelectedDateLabel(dateValue) {
  if (!dateValue) {
    return "No date selected";
  }

  return `Selected Date: ${dateValue}`;
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
  const shifts = window.currentShifts || [];

  const filteredShifts = keyword
    ? shifts.filter(shift => String(shift.employee_id || "").toLowerCase().includes(keyword))
    : shifts;

  if (filteredShifts.length === 0) {
    document.getElementById("shiftList").innerHTML = "<p>No shifts found for that employee ID.</p>";
    return;
  }

  document.getElementById("shiftList").innerHTML = filteredShifts.map(shift => `
    <div class="shift-box">
      <b>${shift.employee_name || shift.employee_id || "Unknown Employee"}</b><br>
      <b>Employee ID:</b> ${shift.employee_id || "-"}<br>
      ${shift.title}<br>
      Date: ${shift.shift_date}<br>
      Time: ${shift.start_time} - ${shift.end_time}<br>
      <div class="shift-actions">
        <button onclick="editShift('${shift.id}')">Edit</button>
        <button class="danger-btn" onclick="deleteShift('${shift.id}')">Delete</button>
      </div>
    </div>
  `).join("");
}
