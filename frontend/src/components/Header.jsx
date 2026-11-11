import { useEffect, useState } from "react";
import Avatar from "./Avatar.jsx";
import { TZ } from "../services/format.js";

function HeaderClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hclock" role="timer" aria-label="השעה עכשיו">
      <strong>{now.toLocaleTimeString("he-IL", { timeZone: TZ })}</strong>
      <span>
        {now.toLocaleDateString("he-IL", {
          timeZone: TZ,
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </span>
    </div>
  );
}

export default function Header({ user, tabs, active, onTab, onLogout }) {
  return (
    <header className="top">
      <div className="brand">
        <strong>נוכחות ומשימות</strong>
        <span className={`role-badge ${user.role}`}>
          {user.role === "commander" ? "מפקד" : "חייל"}
        </span>
      </div>

      <HeaderClock />

      <nav aria-label="ניווט ראשי">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab ${active === t.id ? "active" : ""}`}
            aria-current={active === t.id ? "page" : undefined}
            onClick={() => onTab(t.id)}
          >
            {t.label}
            {t.badge > 0 && <span className="badge">{t.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="who">
        <Avatar name={user.full_name} photo={user.photo} size={34} />
        <span>{user.full_name}</span>
        <button className="btn ghost" onClick={onLogout}>
          התנתקות
        </button>
      </div>
    </header>
  );
}
