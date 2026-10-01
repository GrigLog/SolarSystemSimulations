// Время: юлианские дни, календари, шестидесятеричная запись.

// Юлианский день по календарной дате (астрономическая нумерация лет: 0 = 1 г. до н. э.).
// До 15.10.1582 — юлианский календарь, далее — григорианский.
export function jdFromCalendar(y, m, d, hours = 0) {
  let Y = y, M = m;
  if (M <= 2) { Y -= 1; M += 12; }
  const gregorian = y > 1582 || (y === 1582 && (m > 10 || (m === 10 && d >= 15)));
  let B = 0;
  if (gregorian) { const A = Math.floor(Y / 100); B = 2 - A + Math.floor(A / 4); }
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5 + hours / 24;
}

export function calendarFromJd(jd) {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let A = z;
  const gregorian = z >= 2299161;
  if (gregorian) { const a = Math.floor((z - 1867216.25) / 36524.25); A = z + 1 + a - Math.floor(a / 4); }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E);
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  return { year, month, day, hours: f * 24, gregorian };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function formatJd(jd) {
  const c = calendarFromJd(jd);
  let mins = Math.round(c.hours * 60);
  if (mins >= 1440) mins = 1439;
  const h = Math.floor(mins / 60), mi = mins % 60;
  const era = c.year <= 0 ? `${1 - c.year} до н. э.` : `${c.year}`;
  return `${pad(c.day)}.${pad(c.month)}.${era} ${pad(h)}:${pad(mi)} UT ${c.gregorian ? '(григ.)' : '(юл.)'}`;
}

// Разбор строки «ГГГГ-ММ-ДД[ ЧЧ:ММ]» (год может быть отрицательным, астрономический счёт).
export function parseDate(str) {
  const m = String(str).trim().match(/^(-?\d{1,5})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0'] = m;
  return jdFromCalendar(+y, +mo, +d, +h + +mi / 60);
}

export function isoFromJd(jd) {
  const c = calendarFromJd(jd);
  const mins = Math.min(1439, Math.round(c.hours * 60));
  return `${c.year}-${pad(c.month)}-${pad(c.day)} ${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

// «0;59,8,17,13,12,31» → градусы (десятичные). Поддерживает знак минус.
export function sex(str) {
  const s = String(str).trim();
  const neg = s.startsWith('-');
  const [intPart, frac = ''] = s.replace('-', '').split(';');
  let v = parseFloat(intPart);
  let k = 1 / 60;
  for (const p of frac.split(',').filter(Boolean)) { v += parseFloat(p) * k; k /= 60; }
  return neg ? -v : v;
}

// Год (дробный) по JD — для прецессии и медленных величин.
export const yearFromJd = (jd) => 2000 + (jd - 2451545.0) / 365.25;
export const J2000 = 2451545.0;
