const API = "http://localhost:5000/api";
let isLogin = true;

function toggleForm() {
  isLogin = !isLogin;
  renderAuthMode();
}

function setLoginRole(role) {
  const adminTab = document.getElementById("tabAdmin");
  const empTab = document.getElementById("tabEmployee");

  if (role === 'admin') {
    document.getElementById("username").value = "admin";
    document.getElementById("password").value = "admin123";
    if (adminTab) {
      adminTab.style.background = "linear-gradient(135deg, #6366f1, #06b6d4)";
      adminTab.style.border = "none";
    }
    if (empTab) {
      empTab.style.background = "rgba(255,255,255,0.08)";
      empTab.style.border = "1px solid rgba(255,255,255,0.14)";
    }
  } else {
    document.getElementById("username").value = "101";
    document.getElementById("password").value = "emp123";
    if (empTab) {
      empTab.style.background = "linear-gradient(135deg, #10b981, #06b6d4)";
      empTab.style.border = "none";
    }
    if (adminTab) {
      adminTab.style.background = "rgba(255,255,255,0.08)";
      adminTab.style.border = "1px solid rgba(255,255,255,0.14)";
    }
  }
}

function renderAuthMode() {
  document.getElementById("formTitle").innerText = isLogin ? "Login" : "Register";
  document.getElementById("submitBtn").innerText = isLogin ? "Login" : "Register";
  document.getElementById("email").classList.toggle("hidden", isLogin);
  document.getElementById("toggleText").innerText = isLogin ? "New user?" : "Already registered?";
  document.getElementById("toggleLink").innerText = isLogin ? "Register here" : "Login here";
}

// 🔐 MAIN
async function handleAuth() {
  document.getElementById("msg").innerText = "";

  if (isLogin) await login();
  else await register();
}

// 🔑 LOGIN
async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch(API + "/auth/login", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok && data.token) {
      localStorage.setItem("token", data.token);
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }

      // ✅ ROLE-BASED REDIRECT
      if (data.user && data.user.role === "employee") {
        window.location.href = "employee-portal.html";
      } else {
        window.location.href = "dashboard.html";
      }
    } else {
      document.getElementById("msg").innerText = data.error || "Login failed";
    }
  } catch {
    document.getElementById("msg").innerText = "Server error";
  }
}

// 📝 REGISTER
async function register() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const email = document.getElementById("email").value;

  try {
    const res = await fetch(API + "/auth/register", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ username, password, email })
    });

    if (res.ok) {
      if (!isLogin) {
        isLogin = true;
        renderAuthMode();
      }

      document.getElementById("password").value = "";
      document.getElementById("msg").style.color = "green";
      document.getElementById("msg").innerText = "Registered successfully. Please login.";
    } else {
      document.getElementById("msg").innerText = "Registration failed";
    }
  } catch {
    document.getElementById("msg").innerText = "Server error";
  }
}

renderAuthMode();
