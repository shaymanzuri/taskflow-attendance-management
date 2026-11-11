import { useState } from "react";
import { api } from "../services/api.js";
import { fileToAvatar } from "../services/format.js";
import Avatar from "./Avatar.jsx";

export default function Account({ user, onUpdate }) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMsg, setPhotoMsg] = useState("");
  const [photoErr, setPhotoErr] = useState("");

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function savePhoto(photo) {
    setPhotoBusy(true);
    setPhotoMsg("");
    setPhotoErr("");
    try {
      const res = await api.setPhoto(photo);
      onUpdate?.({ ...user, photo: res.photo });
      setPhotoMsg(res.photo ? "התמונה נשמרה" : "התמונה הוסרה");
    } catch (err) {
      setPhotoErr(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await savePhoto(await fileToAvatar(file));
    } catch (err) {
      setPhotoErr(err.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (newPw !== again) {
      setError("הסיסמאות החדשות אינן זהות");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(oldPw, newPw);
      setNotice("הסיסמה הוחלפה ונשמרה. בכניסה הבאה השתמש בסיסמה החדשה.");
      setOldPw("");
      setNewPw("");
      setAgain("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>החשבון שלי</h2>
      <p className="muted">
        {user.full_name} · שם משתמש: <span dir="ltr">{user.username}</span>
      </p>

      <h2>תמונת פרופיל</h2>
      <div className="photo-edit">
        <Avatar name={user.full_name} photo={user.photo} size={96} />
        <div className="photo-actions">
          <label className="btn file-btn">
            {user.photo ? "החלפת תמונה" : "העלאת תמונה"}
            <input type="file" accept="image/*" onChange={pickPhoto} disabled={photoBusy} hidden />
          </label>
          {user.photo && (
            <button className="btn ghost" onClick={() => savePhoto(null)} disabled={photoBusy}>
              הסרת תמונה
            </button>
          )}
          {photoErr && <p className="error">{photoErr}</p>}
          {photoMsg && <p className="notice">{photoMsg}</p>}
        </div>
      </div>

      <h2>החלפת סיסמה</h2>
      <form className="account-form" onSubmit={submit}>
        <label>
          סיסמה נוכחית
          <input
            type="password"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          סיסמה חדשה (לפחות 6 תווים)
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>
        <label>
          הקלדה חוזרת של הסיסמה החדשה
          <input
            type="password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="btn primary" disabled={busy}>
          שמירת סיסמה חדשה
        </button>
      </form>
    </section>
  );
}
