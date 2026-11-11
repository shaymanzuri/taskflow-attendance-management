import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api.js";
import Avatar from "./Avatar.jsx";
import {
  ATT_STATUSES,
  statusLabel,
  TZ,
  fmtDate,
  fmtTime,
  duration,
  toLocalInput,
  toDateInput,
  downloadCsv,
} from "../services/format.js";

export default function Attendance({ user }) {
  return user.role === "commander" ? <CommanderAttendance /> : <UserAttendance />;
}

function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ------------------------------------------------------------ חייל */
function UserAttendance() {
  const [data, setData] = useState({ open: null, records: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("base");
  const now = useNow();

  const load = useCallback(
    () => api.myAttendance().then(setData).catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      if (data.open) await api.checkOut();
      else await api.checkIn(status);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function pickStatus(id) {
    if (!data.open) return setStatus(id);
    setBusy(true);
    setError("");
    try {
      await api.changeStatus(id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const present = !!data.open;
  const chosen = present ? data.open.status : status;

  return (
    <section>
      <div className="punch-panel">
        <div className="clock" aria-live="off">
          {now.toLocaleTimeString("he-IL", { timeZone: TZ })}
        </div>
        <div className="muted">
          {now.toLocaleDateString("he-IL", {
            timeZone: TZ,
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </div>

        <p className="status-line">
          {present
            ? `נכנסת בשעה ${fmtTime(data.open.check_in)} · ${duration(data.open.check_in)} שעות · ${statusLabel(data.open.status)}`
            : "אינך רשום כנוכח"}
        </p>

        <div className="status-picker" role="radiogroup" aria-label="היכן אתה נמצא">
          {ATT_STATUSES.map((st) => (
            <button
              key={st.id}
              type="button"
              role="radio"
              aria-checked={chosen === st.id}
              className={chosen === st.id ? "active" : ""}
              disabled={busy}
              onClick={() => pickStatus(st.id)}
            >
              {st.label}
            </button>
          ))}
        </div>

        <button
          className={`punch ${present ? "out" : "in"}`}
          onClick={toggle}
          disabled={busy}
        >
          {present ? "רישום יציאה" : "רישום כניסה"}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <h2>ההיסטוריה שלי</h2>
      {data.records.length === 0 ? (
        <p className="empty">עדיין אין רישומים. לחץ על "רישום כניסה" כדי להתחיל.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>תאריך</th>
                <th>כניסה</th>
                <th>יציאה</th>
                <th>משך</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {data.records.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.check_in)}</td>
                  <td>{fmtTime(r.check_in)}</td>
                  <td>{r.check_out ? fmtTime(r.check_out) : <em>עדיין רשום</em>}</td>
                  <td>{duration(r.check_in, r.check_out)}</td>
                  <td>{statusLabel(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------- מפקד */
function CommanderAttendance() {
  const [view, setView] = useState("now");
  return (
    <section>
      <div className="subtabs" role="tablist">
        <button
          role="tab"
          aria-selected={view === "now"}
          className={view === "now" ? "active" : ""}
          onClick={() => setView("now")}
        >
          מי בבסיס
        </button>
        <button
          role="tab"
          aria-selected={view === "report"}
          className={view === "report" ? "active" : ""}
          onClick={() => setView("report")}
        >
          דוח נוכחות
        </button>
      </div>
      {view === "now" ? <NowBoard /> : <Report />}
    </section>
  );
}

function NowBoard() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () => api.attendanceNow().then(setRows).catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p className="muted">טוען…</p>;
  if (rows.length === 0)
    return <p className="empty">אין עדיין חיילים במערכת. הוסף אותם בלשונית "חיילים".</p>;

  const present = rows.filter((r) => r.present).length;

  return (
    <>
      <div className="count-line">
        <strong>{present}</strong> מתוך <strong>{rows.length}</strong> נמצאים בבסיס
      </div>
      <div className="soldier-grid">
        {rows.map((r) => {
          const label = r.present ? "בבסיס" : r.checked_in ? statusLabel(r.status) : "לא נוכח";
          return (
            <article key={r.id} className={`soldier-card ${r.present ? "present" : "absent"}`}>
              <Avatar
                name={r.full_name}
                photo={r.photo}
                size={76}
                ring={r.present ? "green" : "red"}
              />
              <strong>{r.full_name}</strong>
              <span className={`pill ${r.present ? "green" : "red"}`}>{label}</span>
              <small className="muted">
                {r.checked_in
                  ? `נכנס בשעה ${fmtTime(r.since)}`
                  : r.last_check_out
                  ? `יציאה אחרונה ${fmtDate(r.last_check_out)} ${fmtTime(r.last_check_out)}`
                  : "עדיין לא נרשמה נוכחות"}
              </small>
              <small className="muted">משימות פתוחות: {r.open_tasks}</small>
            </article>
          );
        })}
      </div>
    </>
  );
}

function Report() {
  const today = new Date();
  const weekAgo = new Date(Date.now() - 6 * 86400000);
  const [from, setFrom] = useState(toDateInput(weekAgo));
  const [to, setTo] = useState(toDateInput(today));
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState([]);
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.users().then((u) => setUsers(u.filter((x) => x.role === "user")));
  }, []);

  const load = useCallback(() => {
    if (!from || !to) return;
    setError("");
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    end.setDate(end.getDate() + 1);
    api
      .attendanceReport({ start: start.toISOString(), end: end.toISOString(), user_id: userId })
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [from, to, userId]);
  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    downloadCsv(`attendance_${from}_${to}.csv`, [
      ["שם", "תאריך", "כניסה", "יציאה", "משך", "סטטוס"],
      ...rows.map((r) => [
        r.full_name,
        fmtDate(r.check_in),
        fmtTime(r.check_in),
        r.check_out ? fmtTime(r.check_out) : "",
        r.check_out ? duration(r.check_in, r.check_out) : "",
        statusLabel(r.status),
      ]),
    ]);
  }

  return (
    <>
      <div className="filters">
        <label>
          מתאריך
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          עד תאריך
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          חייל
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">כולם</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={exportCsv} disabled={!rows || rows.length === 0}>
          ייצוא לאקסל
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {!rows ? (
        <p className="muted">טוען…</p>
      ) : rows.length === 0 ? (
        <p className="empty">אין רישומים בטווח שנבחר.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>שם</th>
                <th>תאריך</th>
                <th>כניסה</th>
                <th>יציאה</th>
                <th>משך</th>
                <th>סטטוס</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                editing === r.id ? (
                  <EditRow
                    key={r.id}
                    rec={r}
                    onCancel={() => setEditing(null)}
                    onSaved={() => {
                      setEditing(null);
                      load();
                    }}
                  />
                ) : (
                  <tr key={r.id}>
                    <td>{r.full_name}</td>
                    <td>{fmtDate(r.check_in)}</td>
                    <td>{fmtTime(r.check_in)}</td>
                    <td>{r.check_out ? fmtTime(r.check_out) : <em>עדיין רשום</em>}</td>
                    <td>{duration(r.check_in, r.check_out)}</td>
                    <td>{statusLabel(r.status)}</td>
                    <td>
                      <button className="btn small ghost" onClick={() => setEditing(r.id)}>
                        תיקון
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function EditRow({ rec, onCancel, onSaved }) {
  const [ci, setCi] = useState(toLocalInput(rec.check_in));
  const [co, setCo] = useState(toLocalInput(rec.check_out));
  const [st, setSt] = useState(rec.status || "base");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.editAttendance(rec.id, {
        check_in: new Date(ci).toISOString(),
        check_out: co ? new Date(co).toISOString() : null,
        status: st,
        reason,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <tr className="editing">
      <td>{rec.full_name}</td>
      <td colSpan={6}>
        <div className="edit-grid">
          <label>
            כניסה
            <input type="datetime-local" value={ci} onChange={(e) => setCi(e.target.value)} />
          </label>
          <label>
            יציאה
            <input type="datetime-local" value={co} onChange={(e) => setCo(e.target.value)} />
          </label>
          <label>
            סטטוס
            <select value={st} onChange={(e) => setSt(e.target.value)}>
              {ATT_STATUSES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            סיבת התיקון (חובה, נשמרת ביומן)
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="row-actions">
            <button className="btn primary small" onClick={save} disabled={busy || !reason.trim()}>
              שמירת תיקון
            </button>
            <button className="btn ghost small" onClick={onCancel}>
              ביטול
            </button>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
      </td>
    </tr>
  );
}
