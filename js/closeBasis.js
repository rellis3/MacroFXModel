/**
 * What a "Today" move is measured from, and the day it describes.
 *
 * The daily market bundle (/api/drill-series) holds completed daily closes and is rebuilt once a day, so on a Monday morning its last bar is Friday's.
 * Reading "last bar over the one before" as "today" showed Friday's move (gold -3.6%) beside a live price, and a market with no bar for the latest
 * day (the VIX on 2026-10-30) quietly fell back to an older day, so one column mixed days.
 *
 * closeMove picks the basis for one market:
 *   live : the live price against the last completed daily close, "since Fri close". Used only when a live, non-stale price is loaded.
 *   bars : the last bar over the one before, labelled with that day ("Fri"). The fallback when there is no live price.
 *   none : the market has no bar for the latest close (or no data): no print. An older day is never used in its place.
 *
 * Pure. Tested in js/closeBasis.test.mjs.
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 864e5;

/** The Europe/London calendar date of an instant, 'YYYY-MM-DD'. */
export function londonDate(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  return p;
}

/** 'today' for the current London date, a weekday ('Fri') within the last six days, else '30 Oct'. */
export function dayWord(iso, nowMs = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '';
  const today = londonDate(nowMs);
  if (iso.slice(0, 10) === today) return 'today';
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]), n = Date.parse(`${today}T00:00:00Z`);
  const age = (n - t) / DAY;
  if (age > 0 && age <= 6) return WEEKDAYS[new Date(t).getUTCDay()];
  return `${+m[3]} ${MONTHS[+m[2] - 1]}`;
}

/**
 * One market's move since its last completed close.
 * last/lastDate: the market's last non-empty bar. prev: the bar before it. latestDate: the newest date anywhere in the bundle.
 * live/liveStale: the live price and its stale flag, when one is loaded.
 */
export function closeMove({ last, prev = null, lastDate = null, latestDate = null, live = null, liveStale = false, nowMs = Date.now() } = {}) {
  const none = why => ({ d1: null, basis: 'none', noPrint: true, asOf: lastDate, label: '', why });
  if (!Number.isFinite(last) || last === 0) return none('empty');
  if (latestDate && lastDate && lastDate < latestDate) return none('stale');
  if (Number.isFinite(live) && live > 0 && !liveStale && lastDate && lastDate !== londonDate(nowMs)) {
    return { d1: (live / last - 1) * 100, basis: 'live', noPrint: false, asOf: lastDate, label: `since ${dayWord(lastDate, nowMs)} close` };
  }
  if (Number.isFinite(prev) && prev !== 0) return { d1: (last / prev - 1) * 100, basis: 'bars', noPrint: false, asOf: lastDate, label: dayWord(lastDate, nowMs) };
  return none('single');
}

/** One sentence for the footnote under a table of closeMove rows ({ d1Basis, d1AsOf }). Short on purpose. */
export function basisNote(rows, nowMs = Date.now()) {
  const r = (rows ?? []).filter(Boolean), live = r.filter(x => x.d1Basis === 'live'), bars = r.filter(x => x.d1Basis === 'bars'), none = r.filter(x => x.d1Basis === 'none');
  if (!r.length) return '';
  const out = [];
  if (live.length) out.push(`Moves run from the live price to the last daily close (${dayWord(live[0].d1AsOf, nowMs)}).`);
  if (bars.length) out.push(`${bars.length === r.length ? 'No live price is loaded, so each' : 'Where no live price is loaded, each'} move is that market's last full day, dated.`);
  if (none.length) out.push('No print: no bar for the latest close.');
  return out.join(' ');
}
