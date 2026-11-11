// תמונת פרופיל עגולה. ring: "green" (בבסיס) | "red" (לא נוכח)
export default function Avatar({ name, photo, size = 40, ring = "" }) {
  const initial = (name || "?").trim().charAt(0);
  return (
    <span
      className={`avatar ${ring}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {photo ? <img src={photo} alt="" /> : <span>{initial}</span>}
    </span>
  );
}
