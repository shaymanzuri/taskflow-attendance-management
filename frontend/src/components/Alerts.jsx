import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api.js";
import { dayDiff, fmtDay, todayStr } from "../services/format.js";

// כמה ימים לפני תאריך היעד להתחיל להתריע לחייל
export const ALERT_DAYS = 2;

// קוראים לזה אחרי כל שינוי במשימות כדי שההתראות יתעדכנו מיד
export const notifyTasksChanged = () => window.dispatchEvent(new Event("tasks-changed"));

const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

export function buildAlerts(role, tasks) {
  const today = todayStr();
  const alerts = [];

  if (role === "commander") {
    const waiting = tasks.filter((t) => t.status === "submitted").length;
    const late = tasks.filter((t) => t.status === "open" && t.due_date && t.due_date < today).length;
    if (waiting)
      alerts.push({
        id: `submitted:${waiting}`,
        level: "info",
        count: waiting,
        text: `${waiting} ${waiting === 1 ? "משימה ממתינה" : "משימות ממתינות"} לאישור שלך`,
      });
    if (late)
      alerts.push({
        id: `late:${late}`,
        level: "late",
        count: late,
        text: `${late} ${late === 1 ? "משימה באיחור" : "משימות באיחור"}`,
      });
    return alerts;
  }

  for (const t of tasks) {
    if (t.status !== "open" || !t.due_date) continue;
    const diff = dayDiff(t.due_date, today);
    if (diff < 0) {
      alerts.push({
        id: `${t.id}:late`,
        level: "late",
        count: 1,
        text: `${t.title} – באיחור של ${plural(-diff, "יום", "ימים")}`,
      });
    } else if (diff === 0) {
      alerts.push({ id: `${t.id}:0`, level: "soon", count: 1, text: `${t.title} – היום יום היעד` });
    } else if (diff <= ALERT_DAYS) {
      alerts.push({
        id: `${t.id}:${diff}`,
        level: "soon",
        count: 1,
        text: `${t.title} – נשאר ${plural(diff, "יום אחד", "ימים")} (יעד ${fmtDay(t.due_date)})`,
      });
    }
  }
  return alerts;
}

export function useTaskAlerts(user) {
  const [alerts, setAlerts] = useState([]);
  const load = useCallback(() => {
    const loader = user.role === "commander" ? api.allTasks : api.myTasks;
    loader()
      .then((tasks) => setAlerts(buildAlerts(user.role, tasks)))
      .catch(() => {});
  }, [user.role]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    window.addEventListener("tasks-changed", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("tasks-changed", load);
    };
  }, [load]);

  return alerts;
}

export const alertCount = (alerts) => alerts.reduce((sum, a) => sum + a.count, 0);

export function AlertBanner({ alerts, onOpen }) {
  const [hidden, setHidden] = useState("");
  const signature = alerts.map((a) => a.id).join("|");
  if (alerts.length === 0 || hidden === signature) return null;
  return (
    <div className="alerts" role="status">
      <ul>
        {alerts.map((a) => (
          <li key={a.id} className={a.level}>
            {a.text}
          </li>
        ))}
      </ul>
      <div className="alerts-actions">
        <button className="btn small" onClick={onOpen}>
          למשימות
        </button>
        <button className="btn small ghost" onClick={() => setHidden(signature)}>
          הסתרה
        </button>
      </div>
    </div>
  );
}
