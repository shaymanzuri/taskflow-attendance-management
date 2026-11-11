import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import { fmtDay, todayStr } from "../services/format.js";
import { hebrewDayLabel, hebrewMonthLabel, holidaysOn } from "../services/holidays.js";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;

const STATE_LABEL = { open: "פתוחה", late: "באיחור", submitted: "ממתינה לאישור", done: "בוצעה" };
function state(t, today) {
  if (t.status === "done") return "done";
  if (t.status === "submitted") return "submitted";
  return t.due_date < today ? "late" : "open";
}

export default function Calendar({ user }) {
  const commander = user.role === "commander";
  const today = todayStr();
  const [ty, tm] = today.split("-").map(Number);
  const [cursor, setCursor] = useState({ y: ty, m: tm - 1 });
  const [selected, setSelected] = useState(today);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (commander ? api.allTasks() : api.myTasks()).then(setTasks).catch((e) => setError(e.message));
  }, [commander]);

  const { days, offset } = useMemo(() => {
    const { y, m } = cursor;
    const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const offset = new Date(Date.UTC(y, m, 1)).getUTCDay(); // 0 = ראשון
    const days = Array.from({ length: count }, (_, i) => {
      const d = i + 1;
      return { d, key: ymd(y, m, d), weekday: (offset + i) % 7, holidays: holidaysOn(y, m, d) };
    });
    return { days, offset };
  }, [cursor]);

  // משימה מופיעה בכל יום בין תאריך ההתחלה לתאריך היעד
  const tasksByDay = useMemo(() => {
    const map = {};
    for (const day of days) {
      map[day.key] = tasks.filter(
        (t) => t.due_date && (t.start_date || t.due_date) <= day.key && day.key <= t.due_date
      );
    }
    return map;
  }, [days, tasks]);

  const shift = (delta) =>
    setCursor(({ y, m }) => {
      const d = new Date(Date.UTC(y, m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  const title = new Date(Date.UTC(cursor.y, cursor.m, 1)).toLocaleDateString("he-IL", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
  const hebStart = hebrewMonthLabel(cursor.y, cursor.m, 1);
  const hebEnd = hebrewMonthLabel(cursor.y, cursor.m, days.length);
  const sel = days.find((d) => d.key === selected);

  return (
    <section>
      <div className="cal-head">
        <button className="btn small" onClick={() => shift(-1)} aria-label="חודש קודם">
          ›
        </button>
        <div className="cal-title">
          <h2>{title}</h2>
          <span className="muted">{hebStart === hebEnd ? hebStart : `${hebStart} – ${hebEnd}`}</span>
        </div>
        <button className="btn small" onClick={() => shift(1)} aria-label="חודש הבא">
          ‹
        </button>
        <button
          className="btn small ghost"
          onClick={() => {
            setCursor({ y: ty, m: tm - 1 });
            setSelected(today);
          }}
        >
          היום
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="cal-grid" role="grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-dow" role="columnheader">
            {w}
          </div>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`e${i}`} className="cal-cell empty" />
        ))}
        {days.map((day) => {
          const list = tasksByDay[day.key];
          const hol = day.holidays;
          const cls = [
            "cal-cell",
            day.weekday >= 5 ? "weekend" : "",
            day.key === today ? "today" : "",
            day.key === selected ? "selected" : "",
            hol.some((h) => h.type === "holiday") ? "holiday" : "",
          ].join(" ");
          return (
            <button
              key={day.key}
              className={cls}
              onClick={() => setSelected(day.key)}
              aria-label={fmtDay(day.key)}
              aria-pressed={day.key === selected}
            >
              <span className="cal-num">
                <strong>{day.d}</strong>
                <small>{hebrewDayLabel(cursor.y, cursor.m, day.d)}</small>
              </span>
              {hol.slice(0, 2).map((h) => (
                <span key={h.name} className={`cal-hol ${h.type}`}>
                  {h.name}
                </span>
              ))}
              {list.slice(0, 2).map((t) => (
                <span key={t.id} className={`chip ${state(t, today)}`}>
                  {commander ? `${t.assignee_name}: ` : ""}
                  {t.title}
                </span>
              ))}
              {list.length > 2 && <span className="chip more">+{list.length - 2}</span>}
            </button>
          );
        })}
      </div>

      <div className="cal-legend">
        <span className="cal-hol holiday">חג</span>
        <span className="cal-hol chol">חול המועד</span>
        <span className="cal-hol minor">מועד</span>
        <span className="cal-hol fast">צום</span>
        <span className="cal-hol memorial">זיכרון</span>
        <span className="chip open">משימה</span>
        <span className="chip late">באיחור</span>
        <span className="chip submitted">ממתינה לאישור</span>
        <span className="chip done">בוצעה</span>
      </div>

      {sel && (
        <div className="cal-detail">
          <h2>{fmtDay(sel.key)}</h2>
          {sel.holidays.length === 0 && (tasksByDay[sel.key] || []).length === 0 && (
            <p className="muted">אין אירועים או משימות ביום הזה.</p>
          )}
          {sel.holidays.map((h) => (
            <p key={h.name}>
              <span className={`cal-hol ${h.type}`}>{h.name}</span>
            </p>
          ))}
          <ul className="cal-tasks">
            {(tasksByDay[sel.key] || []).map((t) => {
              const st = state(t, today);
              return (
                <li key={t.id}>
                  <span className={`chip ${st}`}>{STATE_LABEL[st]}</span>{" "}
                  <strong>{t.title}</strong>
                  {commander && <span className="muted"> · {t.assignee_name}</span>}
                  <span className="muted">
                    {" "}
                    · {t.start_date && t.start_date !== t.due_date
                      ? `${fmtDay(t.start_date)} – ${fmtDay(t.due_date)}`
                      : `יעד ${fmtDay(t.due_date)}`}{" "}
                    · {t.progress}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
