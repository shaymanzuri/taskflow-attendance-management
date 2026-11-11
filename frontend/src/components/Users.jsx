import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api.js";
import Avatar from "./Avatar.jsx";

const EMPTY = { full_name: "", username: "", password: "" };

export default function Users() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [showPw, setShowPw] = useState(false);

  const load = useCallback(
    () => api.users().then(setUsers).catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.createUser(form);
      setNotice(`החייל ${form.full_name} נוצר. שם משתמש: ${form.username.toLowerCase()}`);
      setForm(EMPTY);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u) {
    setError("");
    setNotice("");
    try {
      await api.updateUser(u.id, { active: !u.active });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function resetPassword(u) {
    const password = window.prompt(`סיסמה חדשה עבור ${u.full_name} (לפחות 6 תווים):`);
    if (!password) return;
    setError("");
    setNotice("");
    try {
      await api.updateUser(u.id, { password });
      setNotice(`הסיסמה של ${u.full_name} הוחלפה`);
    } catch (e) {
      setError(e.message);
    }
  }

  const soldiers = (users || []).filter((u) => u.role === "user");

  return (
    <section>
      <h2>יצירת חייל חדש</h2>
      <form className="task-form" onSubmit={create}>
        <label>
          שם מלא
          <input value={form.full_name} onChange={set("full_name")} required />
        </label>
        <label>
          שם משתמש
          <input
            value={form.username}
            onChange={set("username")}
            autoComplete="off"
            autoCapitalize="none"
            required
          />
        </label>
        <label>
          סיסמה
          <input
            type={showPw ? "text" : "password"}
            value={form.password}
            onChange={set("password")}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
          הצגת הסיסמה
        </label>
        <button className="btn primary" disabled={busy}>
          יצירת חייל
        </button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <h2>החיילים ({soldiers.length})</h2>
      {!users ? (
        <p className="muted">טוען…</p>
      ) : soldiers.length === 0 ? (
        <p className="empty">עדיין לא נוצרו חיילים. מלא את הטופס למעלה כדי ליצור את הראשון.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>שם</th>
                <th>שם משתמש</th>
                <th>מצב</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {soldiers.map((u) => (
                <tr key={u.id} className={u.active ? "" : "inactive"}>
                  <td>
                    <span className="name-cell">
                      <Avatar name={u.full_name} photo={u.photo} size={32} />
                      {u.full_name}
                    </span>
                  </td>
                  <td dir="ltr" style={{ textAlign: "right" }}>{u.username}</td>
                  <td>
                    <span className={`pill ${u.active ? "on" : "off"}`}>
                      {u.active ? "פעיל" : "מושבת"}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button className="btn small ghost" onClick={() => resetPassword(u)}>
                      החלפת סיסמה
                    </button>
                    <button className="btn small ghost" onClick={() => toggleActive(u)}>
                      {u.active ? "השבתה" : "הפעלה"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
