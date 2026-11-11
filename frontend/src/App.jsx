import { useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Login from "./components/Login.jsx";
import Attendance from "./components/Attendance.jsx";
import Tasks from "./components/Tasks.jsx";
import Users from "./components/Users.jsx";
import Account from "./components/Account.jsx";
import Calendar from "./components/Calendar.jsx";
import { AlertBanner, alertCount, useTaskAlerts } from "./components/Alerts.jsx";
import { api, getToken, setToken } from "./services/api.js";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (getToken()) {
      api
        .me()
        .then(setUser)
        .catch(() => setToken(null))
        .finally(() => setLoading(false));
    }
    const onUnauthorized = () => setUser(null);
    window.addEventListener("unauthorized", onUnauthorized);
    return () => window.removeEventListener("unauthorized", onUnauthorized);
  }, []);

  function handleLogin({ token, user }) {
    setToken(token);
    setUser(user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  if (loading) return <p className="center-note">טוען…</p>;
  if (!user) return <Login onLogin={handleLogin} />;

  // מסך נפרד לכל תפקיד
  return user.role === "commander" ? (
    <CommanderScreen user={user} onLogout={logout} onUser={setUser} />
  ) : (
    <SoldierScreen user={user} onLogout={logout} onUser={setUser} />
  );
}

function Shell({ user, tabs, onLogout, alerts }) {
  const [tab, setTab] = useState(tabs[0].id);
  const current = tabs.find((t) => t.id === tab) || tabs[0];
  return (
    <div className={`app ${user.role}`}>
      <Header user={user} tabs={tabs} active={current.id} onTab={setTab} onLogout={onLogout} />
      <AlertBanner alerts={alerts} onOpen={() => setTab("tasks")} />
      <main>{current.render()}</main>
    </div>
  );
}

function SoldierScreen({ user, onLogout, onUser }) {
  const alerts = useTaskAlerts(user);
  const tabs = [
    { id: "attendance", label: "נוכחות", render: () => <Attendance user={user} /> },
    {
      id: "tasks",
      label: "המשימות שלי",
      badge: alertCount(alerts),
      render: () => <Tasks user={user} />,
    },
    { id: "calendar", label: "לוח שנה", render: () => <Calendar user={user} /> },
    { id: "account", label: "החשבון שלי", render: () => <Account user={user} onUpdate={onUser} /> },
  ];
  return <Shell user={user} tabs={tabs} onLogout={onLogout} alerts={alerts} />;
}

function CommanderScreen({ user, onLogout, onUser }) {
  const alerts = useTaskAlerts(user);
  const tabs = [
    { id: "attendance", label: "נוכחות", render: () => <Attendance user={user} /> },
    {
      id: "tasks",
      label: "משימות",
      badge: alertCount(alerts),
      render: () => <Tasks user={user} />,
    },
    { id: "calendar", label: "לוח שנה", render: () => <Calendar user={user} /> },
    { id: "users", label: "חיילים", render: () => <Users /> },
    { id: "account", label: "החשבון שלי", render: () => <Account user={user} onUpdate={onUser} /> },
  ];
  return <Shell user={user} tabs={tabs} onLogout={onLogout} alerts={alerts} />;
}
