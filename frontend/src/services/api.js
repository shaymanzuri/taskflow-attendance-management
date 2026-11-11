const BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "unit_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

async function request(path, { method = "GET", body, params } = {}) {
  const qs = params
    ? "?" +
      new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== "" && v != null)
      )
    : "";
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path + qs, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("אין חיבור לשרת");
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/login" && path !== "/register") {
    setToken(null);
    window.dispatchEvent(new Event("unauthorized"));
  }
  if (!res.ok) throw new Error(data.error || "אירעה שגיאה");
  return data;
}

export const api = {
  login: (username, password, as) =>
    request("/login", { method: "POST", body: { username, password, as } }),
  register: (full_name, username, password) =>
    request("/register", { method: "POST", body: { full_name, username, password } }),
  me: () => request("/me"),
  changePassword: (old_password, new_password) =>
    request("/me/password", { method: "POST", body: { old_password, new_password } }),

  setPhoto: (photo) => request("/me/photo", { method: "POST", body: { photo } }),

  checkIn: (status) => request("/attendance/check-in", { method: "POST", body: { status } }),
  changeStatus: (status) => request("/attendance/status", { method: "POST", body: { status } }),
  checkOut: () => request("/attendance/check-out", { method: "POST" }),
  myAttendance: () => request("/attendance/mine"),
  attendanceNow: () => request("/attendance/today"),
  attendanceReport: (params) => request("/attendance/report", { params }),
  editAttendance: (id, body) =>
    request(`/attendance/${id}`, { method: "PATCH", body }),

  users: () => request("/users"),
  createUser: (body) => request("/users", { method: "POST", body }),
  updateUser: (id, body) => request(`/users/${id}`, { method: "PATCH", body }),

  myTasks: () => request("/tasks/mine"),
  allTasks: () => request("/tasks"),
  createTask: (body) => request("/tasks", { method: "POST", body }),
  completeTask: (id) => request(`/tasks/${id}/complete`, { method: "POST" }),
  setProgress: (id, progress) =>
    request(`/tasks/${id}/progress`, { method: "POST", body: { progress } }),
  addNote: (id, text) => request(`/tasks/${id}/notes`, { method: "POST", body: { text } }),
  approveTask: (id) => request(`/tasks/${id}/approve`, { method: "POST" }),
  rejectTask: (id, reason) => request(`/tasks/${id}/reject`, { method: "POST", body: { reason } }),
  reopenTask: (id) => request(`/tasks/${id}/reopen`, { method: "POST" }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: "DELETE" }),

  audit: () => request("/audit"),
};
