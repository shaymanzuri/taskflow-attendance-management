import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api.js";
import { dayDiff, fmtDateTime, fmtDay, todayStr } from "../services/format.js";
import { notifyTasksChanged } from "./Alerts.jsx";

export default function Tasks({ user }) {
  return user.role === "commander" ? <CommanderTasks /> : <UserTasks />;
}

function useTasks(loader) {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      loader()
        .then((t) => {
          setTasks(t);
          notifyTasksChanged();
        })
        .catch((e) => setError(e.message)),
    [loader]
  );
  useEffect(() => {
    load();
  }, [load]);
  return { tasks, error, setError, load };
}

/* ------------------------------------------------------------ עזרים */
// open | late | submitted | done
function taskState(t) {
  if (t.status === "done") return "done";
  if (t.status === "submitted") return "submitted";
  return t.due_date && t.due_date < todayStr() ? "late" : "open";
}
const STATE_LABEL = { open: "פתוחה", late: "באיחור", submitted: "ממתינה לאישור", done: "בוצעה" };
const STATE_PILL = { open: "off", late: "red", submitted: "info", done: "green" };

function dateRange(t) {
  if (t.start_date && t.start_date !== t.due_date)
    return `${fmtDay(t.start_date)} – ${fmtDay(t.due_date)}`;
  return `יעד: ${fmtDay(t.due_date)}`;
}

function dueNote(t) {
  const diff = dayDiff(t.due_date, todayStr());
  if (diff < 0) return `באיחור של ${-diff === 1 ? "יום" : `${-diff} ימים`}`;
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  return `בעוד ${diff} ימים`;
}

function ProgressBar({ value }) {
  return (
    <div className="progress-row">
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${value}%` }} />
      </div>
      <span className="pct">{value}%</span>
    </div>
  );
}

function Notes({ task, onAdded }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.addNote(task.id, text.trim());
      setText("");
      await onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notes">
      {task.notes.length === 0 ? (
        <p className="muted">אין הערות עדיין.</p>
      ) : (
        <ul>
          {task.notes.map((n, i) => (
            <li key={i} className={n.role}>
              <strong>{n.author}</strong>{" "}
              <span className="muted">{fmtDateTime(n.created_at)}</span>
              <p>{n.text}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="note-form" onSubmit={add}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="כתיבת הערה…"
          maxLength={1000}
        />
        <button className="btn small primary" disabled={busy || !text.trim()}>
          שליחה
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ חייל */
function UserTasks() {
  const { tasks, error, setError, load } = useTasks(api.myTasks);

  if (!tasks) return <p className="muted">{error || "טוען…"}</p>;
  const open = tasks.filter((t) => t.status === "open");
  const submitted = tasks.filter((t) => t.status === "submitted");
  const done = tasks.filter((t) => t.status === "done");

  const list = (items) => (
    <ul className="task-list">
      {items.map((t) => (
        <SoldierTask key={t.id} t={t} reload={load} onError={setError} />
      ))}
    </ul>
  );

  return (
    <section>
      <h2>משימות פתוחות ({open.length})</h2>
      {error && <p className="error">{error}</p>}
      {open.length === 0 ? <p className="empty">אין לך משימות פתוחות.</p> : list(open)}

      {submitted.length > 0 && (
        <>
          <h2>ממתינות לאישור המפקד ({submitted.length})</h2>
          {list(submitted)}
        </>
      )}

      {done.length > 0 && (
        <>
          <h2>בוצעו ({done.length})</h2>
          {list(done)}
        </>
      )}
    </section>
  );
}

function SoldierTask({ t, reload, onError }) {
  const [progress, setProgress] = useState(t.progress);
  const [showNotes, setShowNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = taskState(t);
  const editable = t.status === "open";

  useEffect(() => setProgress(t.progress), [t.progress]);

  async function run(fn) {
    setBusy(true);
    onError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`task-card ${state}`}>
      <div className="task-head">
        <div>
          <strong>{t.title}</strong>
          {t.description && <p className="muted">{t.description}</p>}
          <span className="due">
            {dateRange(t)}
            {editable ? ` · ${dueNote(t)}` : ""}
            {t.status === "done" && t.completed_at ? ` · אושרה ${fmtDateTime(t.completed_at)}` : ""}
          </span>
        </div>
        <span className={`pill ${STATE_PILL[state]}`}>{STATE_LABEL[state]}</span>
      </div>

      <ProgressBar value={editable ? progress : t.progress} />

      {editable && (
        <div className="progress-edit">
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            aria-label="אחוז התקדמות במשימה"
          />
          <button
            className="btn small"
            disabled={busy || progress === t.progress}
            onClick={() => run(() => api.setProgress(t.id, progress))}
          >
            שמירת התקדמות
          </button>
        </div>
      )}

      <div className="task-actions">
        <button className="btn small ghost" onClick={() => setShowNotes((v) => !v)}>
          הערות למפקד ({t.notes.length})
        </button>
        {editable && (
          <button
            className="btn small primary"
            disabled={busy}
            onClick={() =>
              window.confirm("לשלוח את המשימה לאישור המפקד? היא תיסגר רק אחרי שהמפקד יאשר.") &&
              run(() => api.completeTask(t.id))
            }
          >
            סיימתי – שליחה לאישור
          </button>
        )}
      </div>

      {showNotes && <Notes task={t} onAdded={reload} />}
    </li>
  );
}

/* ----------------------------------------------------------- מפקד */
const EMPTY_FORM = { title: "", description: "", assigned_to: "", start_date: "", due_date: "" };

function CommanderTasks() {
  const { tasks, error, setError, load } = useTasks(api.allTasks);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState("open");
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [notesFor, setNotesFor] = useState(null);

  useEffect(() => {
    api.users().then((u) => setUsers(u.filter((x) => x.role === "user" && x.active)));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createTask(form);
      setForm({ ...EMPTY_FORM, assigned_to: form.assigned_to });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(fn) {
    setError("");
    try {
      await fn();
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function reject(t) {
    const reason = window.prompt(`החזרת "${t.title}" לתיקון. סיבה (לא חובה):`);
    if (reason === null) return;
    act(() => api.rejectTask(t.id, reason));
  }

  const waiting = (tasks || []).filter((t) => t.status === "submitted").length;
  const shown = (tasks || []).filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return t.status === "open";
    return t.status === filter;
  });

  return (
    <section>
      <h2>הקצאת משימה</h2>
      <form className="task-form" onSubmit={create}>
        <label>
          כותרת
          <input value={form.title} onChange={set("title")} required />
        </label>
        <label>
          למי
          <select value={form.assigned_to} onChange={set("assigned_to")} required>
            <option value="">בחירת חייל</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          תאריך התחלה (למשימה של כמה ימים)
          <input type="date" value={form.start_date} onChange={set("start_date")} />
        </label>
        <label>
          תאריך יעד
          <input
            type="date"
            value={form.due_date}
            min={form.start_date || undefined}
            onChange={set("due_date")}
            required
          />
        </label>
        <label className="wide">
          פרטים (לא חובה)
          <input value={form.description} onChange={set("description")} />
        </label>
        <button className="btn primary" disabled={busy}>
          הוספת משימה
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="subtabs">
        {[
          ["open", "פתוחות"],
          ["submitted", `ממתינות לאישור${waiting ? ` (${waiting})` : ""}`],
          ["done", "בוצעו"],
          ["all", "הכל"],
        ].map(([id, label]) => (
          <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {!tasks ? (
        <p className="muted">טוען…</p>
      ) : shown.length === 0 ? (
        <p className="empty">אין משימות להצגה.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>משימה</th>
                <th>אחראי</th>
                <th>התקדמות</th>
                <th>מצב</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const state = taskState(t);
                return (
                  <FragmentRows key={t.id}>
                    <tr className={state === "late" ? "overdue" : ""}>
                      <td>
                        <strong>{t.title}</strong>
                        {t.description && <div className="muted">{t.description}</div>}
                        <div className="due">{dateRange(t)}</div>
                      </td>
                      <td>{t.assignee_name}</td>
                      <td className="progress-cell">
                        <ProgressBar value={t.progress} />
                      </td>
                      <td>
                        <span className={`pill ${STATE_PILL[state]}`}>{STATE_LABEL[state]}</span>
                        {t.status === "done" && (
                          <div className="due">{fmtDateTime(t.completed_at)}</div>
                        )}
                      </td>
                      <td className="row-actions">
                        {t.status === "submitted" && (
                          <>
                            <button
                              className="btn small primary"
                              onClick={() => act(() => api.approveTask(t.id))}
                            >
                              אישור
                            </button>
                            <button className="btn small ghost" onClick={() => reject(t)}>
                              החזרה לתיקון
                            </button>
                          </>
                        )}
                        {t.status === "open" && (
                          <button className="btn small" onClick={() => act(() => api.completeTask(t.id))}>
                            סימון כבוצע
                          </button>
                        )}
                        {t.status === "done" && (
                          <button className="btn small ghost" onClick={() => act(() => api.reopenTask(t.id))}>
                            פתיחה מחדש
                          </button>
                        )}
                        <button
                          className="btn small ghost"
                          onClick={() => setNotesFor(notesFor === t.id ? null : t.id)}
                        >
                          הערות ({t.notes.length})
                        </button>
                        <button
                          className="btn small danger"
                          onClick={() =>
                            window.confirm("למחוק את המשימה?") && act(() => api.deleteTask(t.id))
                          }
                        >
                          מחיקה
                        </button>
                      </td>
                    </tr>
                    {notesFor === t.id && (
                      <tr className="editing">
                        <td colSpan={5}>
                          <Notes task={t} onAdded={load} />
                        </td>
                      </tr>
                    )}
                  </FragmentRows>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// עוטף שורות סמוכות בטבלה בלי להוסיף אלמנט ל-DOM
function FragmentRows({ children }) {
  return <>{children}</>;
}
