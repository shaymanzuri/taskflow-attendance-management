// חגים ומועדים לפי הלוח העברי. החישוב נעשה בדפדפן (Intl) ולכן אינו תלוי באינטרנט.
const heb = new Intl.DateTimeFormat("en-u-ca-hebrew", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const hebDay = new Intl.DateTimeFormat("he-u-ca-hebrew", { timeZone: "UTC", day: "numeric" });
const hebMonthYear = new Intl.DateTimeFormat("he-u-ca-hebrew", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

const DAY = 86400000;
const noon = (y, m, d) => new Date(Date.UTC(y, m, d, 12)); // m מתחיל מ-0

function parts(date) {
  const o = {};
  for (const p of heb.formatToParts(date)) o[p.type] = p.value;
  return { day: Number(o.day), month: o.month, weekday: date.getUTCDay() };
}

// 5 באייר, עם ההזזות: שישי/שבת -> חמישי, שני -> שלישי
const isIndependence = ({ day, month, weekday: w }) =>
  month === "Iyar" &&
  ((day === 5 && w === 3) || (day === 4 && w === 4) || (day === 3 && w === 4) || (day === 6 && w === 2));

// type: holiday (יום חג) | chol (חול המועד) | minor (מועד) | fast (צום) | memorial (זיכרון)
export function holidaysOn(y, m, d) {
  const date = noon(y, m, d);
  const { day, month, weekday: w } = parts(date);
  const out = [];
  const add = (name, type) => out.push({ name, type });

  switch (month) {
    case "Tishri":
      if (day <= 2) add("ראש השנה", "holiday");
      if ((day === 3 && w !== 6) || (day === 4 && w === 0)) add("צום גדליה", "fast");
      if (day === 10) add("יום כיפור", "holiday");
      if (day === 15) add("סוכות", "holiday");
      if (day >= 16 && day <= 20) add("חול המועד סוכות", "chol");
      if (day === 21) add("הושענא רבה", "chol");
      if (day === 22) add("שמיני עצרת / שמחת תורה", "holiday");
      break;
    case "Kislev":
      if (day >= 25) add(`חנוכה – נר ${day - 24}`, "minor");
      break;
    case "Tevet":
      if (day <= 3) {
        const kislevLength = parts(new Date(date.getTime() - day * DAY)).day; // 29 או 30
        const n = kislevLength - 24 + day;
        if (n <= 8) add(`חנוכה – נר ${n}`, "minor");
      }
      break;
    case "Shevat":
      if (day === 15) add("ט״ו בשבט", "minor");
      break;
    case "Adar I":
      if (day === 14) add("פורים קטן", "minor");
      break;
    case "Adar":
    case "Adar II":
      if ((day === 13 && w !== 6) || (day === 11 && w === 4)) add("תענית אסתר", "fast");
      if (day === 14) add("פורים", "minor");
      if (day === 15) add("שושן פורים", "minor");
      break;
    case "Nisan":
      if (day === 14) add("ערב פסח", "minor");
      if (day === 15) add("פסח", "holiday");
      if (day >= 16 && day <= 20) add("חול המועד פסח", "chol");
      if (day === 21) add("שביעי של פסח", "holiday");
      // יום השואה: 27 בניסן, שישי -> חמישי, ראשון -> שני
      if ((day === 27 && w !== 5 && w !== 0) || (day === 26 && w === 4) || (day === 28 && w === 1))
        add("יום השואה", "memorial");
      break;
    case "Iyar": {
      if (isIndependence({ day, month, weekday: w })) add("יום העצמאות", "minor");
      if (isIndependence(parts(new Date(date.getTime() + DAY)))) add("יום הזיכרון", "memorial");
      if (day === 18) add("ל״ג בעומר", "minor");
      if (day === 28) add("יום ירושלים", "minor");
      break;
    }
    case "Sivan":
      if (day === 6) add("שבועות", "holiday");
      break;
    case "Tamuz":
      if ((day === 17 && w !== 6) || (day === 18 && w === 0)) add("י״ז בתמוז", "fast");
      break;
    case "Av":
      if ((day === 9 && w !== 6) || (day === 10 && w === 0)) add("תשעה באב", "fast");
      break;
    default:
  }
  return out;
}

export const hebrewDayLabel = (y, m, d) => hebDay.format(noon(y, m, d));
export const hebrewMonthLabel = (y, m, d) => hebMonthYear.format(noon(y, m, d));
