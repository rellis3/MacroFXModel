// js/nasdaqSessions.js
//
// DST-aware session/window helpers for the NASDAQ Liquidity Continuation
// Framework. The NY Confirmation window (14:20-14:35 UK time) and the Gate 2
// London-lunch run time are specified in *local wall-clock* time, which
// shifts in UTC terms across BST/GMT and EDT/EST. Using a fixed UTC offset
// would silently mis-time the gates twice a year — so every conversion here
// goes through Intl's real IANA timezone database instead.

function zonedParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return {
    year: +map.year, month: +map.month, day: +map.day,
    hour: map.hour === '24' ? 0 : +map.hour, minute: +map.minute, second: +map.second,
  };
}

// Local wall-clock 'YYYY-MM-DD' date for a UTC instant in a given zone.
export function localDateString(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// {hour, minute} wall-clock for a UTC instant in a given zone.
export function localHourMinute(date, timeZone) {
  const p = zonedParts(date, timeZone);
  return { hour: p.hour, minute: p.minute };
}

// Converts a local wall-clock ('YYYY-MM-DD', 'HH:MM') in `timeZone` to the
// corresponding UTC instant, correctly handling DST via fixed-point iteration
// on the zone's offset (converges in 1-2 passes; offset is a step function).
export function zonedTimeToUtc(isoDate, hhmm, timeZone) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm, 0);
  let t = target;
  for (let i = 0; i < 2; i++) {
    const zp = zonedParts(new Date(t), timeZone);
    const zpAsUtc = Date.UTC(zp.year, zp.month - 1, zp.day, zp.hour, zp.minute, zp.second);
    t = target - (zpAsUtc - t);
  }
  return new Date(t);
}

// True/false: is UTC instant `date` within [start,end) local wall-clock time
// in `timeZone`, on the local calendar day `date` falls on?
export function isWithinWindow(date, timeZone, start, end) {
  const isoDate = localDateString(date, timeZone);
  const winStart = zonedTimeToUtc(isoDate, start, timeZone);
  const winEnd = zonedTimeToUtc(isoDate, end, timeZone);
  return date >= winStart && date < winEnd;
}

// Slices a timestamp-ordered bar array (each bar needs a `.t` field — ms
// since epoch, UTC) to a single session window on local calendar day
// `isoDate`. `session` is one of the SESSIONS entries from nasdaqConfig.js.
export function sliceSession(bars, isoDate, session) {
  const start = zonedTimeToUtc(isoDate, session.start, session.tz).getTime();
  const end = zonedTimeToUtc(isoDate, session.end, session.tz).getTime();
  return bars.filter(b => b.t >= start && b.t < end);
}

// Distinct local calendar days (in `timeZone`) spanned by a timestamped bar
// array — used to iterate session-by-session over an intraday history.
export function distinctLocalDates(bars, timeZone) {
  const seen = new Set();
  const out = [];
  for (const b of bars) {
    const d = localDateString(new Date(b.t), timeZone);
    if (!seen.has(d)) { seen.add(d); out.push(d); }
  }
  return out;
}
