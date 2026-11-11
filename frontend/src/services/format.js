export const TZ = "Asia/Jerusalem";

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("he-IL", { timeZone: TZ }) : "—";

export const fmtTime = (iso) =>
  iso
    ? new Date(iso).toLocaleTimeString("he-IL", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const fmtDateTime = (iso) =>
  iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : "—";

// משך בין שני זמנים (אם אין סיום, עד עכשיו) בפורמט ש:ד
export function duration(start, end) {
  if (!start) return "—";
  const to = end ? new Date(end) : new Date();
  const mins = Math.max(0, Math.round((to - new Date(start)) / 60000));
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

// ערך עבור input מסוג datetime-local (שעון מקומי של הדפדפן)
export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export const toDateInput = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ייצוא ל-CSV שנפתח נכון באקסל בעברית (BOM)
export function downloadCsv(filename, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// תאריך של היום (YYYY-MM-DD) לפי שעון ישראל
export const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

// הפרש בימים בין שני תאריכים בפורמט YYYY-MM-DD (a - b)
export const dayDiff = (a, b) =>
  Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);

// הצגת תאריך YYYY-MM-DD
export const fmtDay = (ymd) => (ymd ? fmtDate(ymd + "T12:00:00") : "—");

export const ATT_STATUSES = [
  { id: "base", label: "בבסיס" },
  { id: "sick", label: "מחלה" },
  { id: "vacation", label: "חופשה" },
  { id: "duty_out", label: "מחוץ לבסיס בתפקיד" },
];
export const statusLabel = (id) => ATT_STATUSES.find((s) => s.id === (id || "base"))?.label || "—";

// מקטין תמונה לריבוע (חיתוך מרכזי) ומחזיר data URL קטן לשמירה ב-MongoDB
export function fileToAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("יש לבחור קובץ תמונה"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas
        .getContext("2d")
        .drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("לא ניתן לקרוא את התמונה"));
    };
    img.src = url;
  });
}
