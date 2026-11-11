import { useState } from "react";
import { api } from "../services/api.js";

const ENTRANCES = [
  { id: "user", label: "כניסת חייל" },
  { id: "commander", label: "כניסת מפקד" },
];

export default function Login({ onLogin }) {
  const [entrance, setEntrance] = useState("user");
  const [mode, setMode] = useState("login"); // login | register
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const commander = entrance === "commander";
  const registering = mode === "register" && !commander;

  function pick(id) {
    setEntrance(id);
    setMode("login");
    setError("");
    setPassword("");
  }

  function switchMode(next) {
    setMode(next);
    setError("");
    setPassword("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (registering) {
        onLogin(await api.register(fullName.trim(), username.trim(), password));
      } else {
        onLogin(await api.login(username.trim(), password, entrance));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className={`login-card ${commander ? "commander" : ""}`} onSubmit={submit}>
        <h1>{commander ? "מסך מפקד" : registering ? "הרשמת חייל חדש" : "מסך חייל"}</h1>

        <div className="subtabs" role="tablist" aria-label="סוג כניסה">
          {ENTRANCES.map((en) => (
            <button
              type="button"
              role="tab"
              key={en.id}
              aria-selected={entrance === en.id}
              className={entrance === en.id ? "active" : ""}
              onClick={() => pick(en.id)}
            >
              {en.label}
            </button>
          ))}
        </div>

        {registering && (
          <label>
            שם מלא
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              autoFocus
              required
            />
          </label>
        )}
        <label>
          שם משתמש
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus={!registering}
            required
          />
        </label>
        <label>
          סיסמה
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={registering ? "new-password" : "current-password"}
            minLength={registering ? 6 : undefined}
            required
          />
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="btn primary" disabled={busy}>
          {busy ? "רגע…" : registering ? "הרשמה" : "כניסה"}
        </button>

        {!commander && (
          <button
            type="button"
            className="link-btn"
            onClick={() => switchMode(registering ? "login" : "register")}
          >
            {registering ? "כבר יש לי משתמש – כניסה" : "אין לי משתמש – הרשמה"}
          </button>
        )}
      </form>
    </div>
  );
}
