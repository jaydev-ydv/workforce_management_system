// In production on Vercel, requests use relative /api
// When running locally on independent test ports, fall back to localhost:5000
const API = (window.location.protocol === "file:" || (window.location.hostname === "localhost" && window.location.port !== "5000" && window.location.port !== ""))
  ? "http://localhost:5000/api"
  : "/api";

function getToken() {
  return localStorage.getItem("token");
}

async function api(endpoint, method = "GET", data = null) {
  const res = await fetch(API + endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getToken()
    },
    body: data ? JSON.stringify(data) : null
  });

  if (res.status === 401) {
    localStorage.clear();
    window.location.href = "index.html";
    return { error: "Unauthorized" };
  }

  const payload = await res.json();

  if (!res.ok) {
    return {
      error: payload.error || "Request failed"
    };
  }

  return payload;
}
