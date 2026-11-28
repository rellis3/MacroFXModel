/**
 * Option expiry dates and times, one rule for every panel (Desk Terminal Options tab review, 27 Nov 2026).
 *
 *   cmeCodeExpiry(code, refIso)   CME option code -> its expiry date ('YYYY-MM-DD'), or null when the code is not one
 *                                 we can decode (the caller then keeps capture date + DTE).
 *   expiryCutoffMs(iso, pair, code)  the moment an expiry stops trading (epoch ms), by product.
 *   isExpired(iso, pair, nowMs, code)  true once that moment has passed: the book is gone and its lines are not levels.
 *   dteOf(todayIso, iso)          days to expiry, calendar days from today's date (0 on the expiry day), for every market.
 *   usMarketHoliday(iso)          the US exchange holidays that move an expiry (New Year, MLK, Presidents, Good Friday,
 *                                 Memorial, Juneteenth, Independence, Labor, Thanksgiving, Christmas; weekend dates observed).
 *
 * Why codes, not DTE: QuikStrike's DTE is rounded from fractional days, so an expiry late in the US day (index weeklies at
 * 15:00 Chicago, gold at 12:30 Chicago) comes out one day long, and capture date + DTE lands a day late. On 27 Nov 2026 that
 * put the E3DZ6 weekly (Thu 17 Dec) on 18 Dec, where it took the ESZ6 quarterly's slot, so the largest S&P book vanished
 * from the path. FX expiries (09:00 Chicago) round the other way and were right. Pure; tested in js/optionExpiry.test.mjs.
 */
const DAY = 864e5;
const MONTHS = 'FGHJKMNQUVXZ';
const iso = t => new Date(t).toISOString().slice(0, 10);
const utc = (y, m, d) => Date.UTC(y, m, d);
const dow = s => new Date(`${s}T12:00:00Z`).getUTCDay();
export const addDaysIso = (s, n) => iso(Date.parse(`${s}T00:00:00Z`) + n * DAY);
export const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);

function nthWeekday(y, m, wd, n) {            // n-th weekday wd (0 Sun..6 Sat) of month m (0-based); null if the month has fewer
  const first = new Date(utc(y, m, 1)).getUTCDay(), d = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
  return d <= new Date(utc(y, m + 1, 0)).getUTCDate() ? iso(utc(y, m, d)) : null;
}
function lastWeekday(y, m, wd) { const last = new Date(utc(y, m + 1, 0)); const back = (last.getUTCDay() - wd + 7) % 7; return iso(last.getTime() - back * DAY); }
function easter(y) {                          // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(utc(y, mo - 1, da));
}
const observed = s => { const w = dow(s); return w === 6 ? addDaysIso(s, -1) : w === 0 ? addDaysIso(s, 1) : s; };
const HOL = new Map();
function holidays(y) {
  if (HOL.has(y)) return HOL.get(y);
  const s = new Set([
    observed(iso(utc(y, 0, 1))), nthWeekday(y, 0, 1, 3), nthWeekday(y, 1, 1, 3), addDaysIso(easter(y), -2), lastWeekday(y, 4, 1),
    ...(y >= 2022 ? [observed(iso(utc(y, 5, 19)))] : []), observed(iso(utc(y, 6, 4))), nthWeekday(y, 8, 1, 1), nthWeekday(y, 10, 4, 4), observed(iso(utc(y, 11, 25))),
  ]);
  HOL.set(y, s); return s;
}
/** A US exchange holiday (the full closures; early closes are trading days). */
export const usMarketHoliday = s => holidays(+String(s).slice(0, 4)).has(s);
export const isBusinessDay = s => ![0, 6].includes(dow(s)) && !usMarketHoliday(s);
const prevBusinessDay = s => { let d = addDaysIso(s, -1); while (!isBusinessDay(d)) d = addDaysIso(d, -1); return d; };
const onOrBeforeBusinessDay = s => (s && !isBusinessDay(s) ? prevBusinessDay(s) : s);
function lastBusinessDay(y, m) { return onOrBeforeBusinessDay(iso(utc(y, m + 1, 0))); }

function yearOf(digit, refIso) {
  const ry = +String(refIso ?? new Date().toISOString()).slice(0, 4);
  let y = Math.floor(ry / 10) * 10 + digit;
  if (y < ry - 2) y += 10; else if (y > ry + 8) y -= 10;
  return y;
}
const WD = { A: 1, B: 2, C: 3, D: 4 };      // CME equity-index weekly letters: Monday, Tuesday, Wednesday, Thursday

/**
 * CME option code -> expiry date. Decoded families (the ones in the nightly book whose DTE lands a day late):
 *   E-mini S&P   ES<m><y> quarterly / monthly (3rd Friday) · EW<m><y> end of month (last business day) · EW<n> n-th Friday ·
 *                E<n>A..E<n>D n-th Monday..Thursday
 *   E-mini Nasdaq  NQ<m><y> (3rd Friday) · NE<m><y> end of month · QN<n> n-th Friday · Q<n>A..Q<n>D n-th Monday..Thursday
 *   Gold         OG<n> n-th Friday weekly · OG<m><y> monthly (4th last business day of the month before; a Friday or the
 *                day before a holiday moves to the business day before)
 * A holiday moves a weekly or end-of-month expiry to the business day before. Anything else -> null.
 */
export function cmeCodeExpiry(code, refIso) {
  const m = /^([A-Z0-9]+?)([FGHJKMNQUVXZ])(\d)$/.exec(String(code ?? '').trim().toUpperCase()); if (!m) return null;
  const [, root, ml, yd] = m, mo = MONTHS.indexOf(ml), y = yearOf(+yd, refIso);
  let r;
  if (root === 'ES' || root === 'NQ') return onOrBeforeBusinessDay(nthWeekday(y, mo, 5, 3));
  if (root === 'EW' || root === 'NE') return lastBusinessDay(y, mo);
  if ((r = /^(?:EW|QN)([1-5])$/.exec(root))) return onOrBeforeBusinessDay(nthWeekday(y, mo, 5, +r[1]));
  if ((r = /^(?:E|Q)([1-5])([ABCD])$/.exec(root))) return onOrBeforeBusinessDay(nthWeekday(y, mo, WD[r[2]], +r[1]));
  if ((r = /^OG([1-5])$/.exec(root))) return onOrBeforeBusinessDay(nthWeekday(y, mo, 5, +r[1]));
  if (root === 'OG') {
    const py = mo === 0 ? y - 1 : y, pm = mo === 0 ? 11 : mo - 1;
    let d = lastBusinessDay(py, pm); for (let k = 0; k < 3; k++) d = prevBusinessDay(d);
    if (dow(d) === 5 || !isBusinessDay(addDaysIso(d, 1)) && dow(addDaysIso(d, 1)) !== 6) d = prevBusinessDay(d);
    return d;
  }
  return null;
}

/** Product class of a book's pair key ('EUR/USD', 'XAU/USD', 'SPX500_USD', 'WTICO_USD' ...). */
export function productOf(pair) {
  const p = String(pair ?? '').toUpperCase();
  if (/^(XAU|XAG|XCU|XPT|XPD|GOLD|SILVER|COPPER)/.test(p)) return 'metal';
  if (/NAS100|SPX500|US30|US2000|^NQ$|^ES$|^SPX$/.test(p)) return 'index';
  if (/WTI|BCO|BRENT|NATGAS|CORN|SOY|WHEAT/.test(p)) return 'energy';
  return 'fx';
}
// local expiry time by product: [hour, minute, zone]
const CUT = { fx: [10, 0, 'America/New_York'], metal: [12, 30, 'America/Chicago'], index: [15, 0, 'America/Chicago'], indexAm: [8, 30, 'America/Chicago'], energy: [13, 30, 'America/Chicago'] };
/** Wall time in a zone -> epoch ms. */
export function zonedMs(dayIso, hh, mm, tz) {
  const guess = Date.parse(`${dayIso}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const w = new Date(guess).toLocaleString('en-GB', { timeZone: tz, hourCycle: 'h23' }), n = /^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})/.exec(w);
  if (!n) return guess;
  return guess - (Date.UTC(+n[3], +n[2] - 1, +n[1], +n[4], +n[5], +n[6]) - guess);
}
/** When an expiry stops trading (FX 10:00 New York, gold 12:30 Chicago, index weeklies 15:00 Chicago, the ES/NQ quarterly 08:30 Chicago). */
export function expiryCutoffMs(dayIso, pair, code = null) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayIso ?? ''))) return null;
  let k = productOf(pair);
  if (k === 'index' && /^(ES|NQ)[FGHJKMNQUVXZ]\d$/.test(String(code ?? ''))) k = 'indexAm';
  const [h, m, tz] = CUT[k];
  return zonedMs(dayIso, h, m, tz);
}
export function isExpired(dayIso, pair, nowMs = Date.now(), code = null) {
  const t = expiryCutoffMs(dayIso, pair, code); return t != null && nowMs >= t;
}
/** Calendar days from today's date to the expiry date: one rule for every market (0 on the day). */
export const dteOf = (todayIso, dayIso) => Math.max(0, dayDiff(dayIso, todayIso));
/** London calendar date of a moment. */
export const londonDate = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
/** One book's expiry date: from the code when it decodes, else capture date + DTE (a weekend moved to the Friday). */
export function bookExpiry(captureIso, dte, code = null) {
  const c = cmeCodeExpiry(code, captureIso); if (c) return c;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(captureIso ?? '')) || !Number.isFinite(+dte)) return null;
  const d = addDaysIso(captureIso, Math.round(+dte)), w = dow(d);
  return w === 6 ? addDaysIso(d, -1) : w === 0 ? addDaysIso(d, -2) : d;
}
