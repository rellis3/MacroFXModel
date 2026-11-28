// js/terminal/mediaCore.js: the pure half of the MEDIA section (js/terminal/mediaView.js: the desk terminal's Media tab and Helix's MEDIA panel). No DOM, no fetch.
// Days are London days. Within a day the programmes run in broadcast order: morning, short, afternoon, evening, weekly, specials, the visual guide.
// Description only: a row is a title, a programme, a length and a date.

export const PART_ORDER = ['morning', 'short', 'afternoon', 'evening', 'weekly', 'special', 'guide', 'podcast'];
export const PART_LABEL = { morning: 'MORNING', short: 'SHORT', afternoon: 'AFTERNOON', evening: 'EVENING', weekly: 'WEEKLY', special: 'SPECIAL', guide: 'GUIDE', podcast: 'PODCAST' };
export const SPEEDS = [1, 1.25, 1.5];
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let FMT = null;                       // one formatter, made once
/** The London date (YYYY-MM-DD) of an ISO time, or null. */
export function londonDate(iso) {
  const ms = Date.parse(iso ?? ''); if (!Number.isFinite(ms)) return null;
  FMT ??= new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
  return FMT.format(new Date(ms));
}
/** 'Fri 27 Nov' for '2026-11-27' (the year is added when it is not `thisYear`). */
export function dayLabel(ymd, thisYear = null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? ''); if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DOW[d.getUTCDay()]} ${+m[3]} ${MON[+m[2] - 1]}${thisYear && +m[1] !== +thisYear ? ` ${m[1]}` : ''}`;
}
/** London clock time 'HH:MM' of an ISO time. */
export function londonTime(iso) {
  const ms = Date.parse(iso ?? ''); if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
}
const rank = p => { const i = PART_ORDER.indexOf(p); return i < 0 ? PART_ORDER.length : i; };

/** Items grouped by London day, newest day first; within a day by programme order, then by time. -> [{ day, label, items }] */
export function groupByDay(items, thisYear = null) {
  const by = new Map();
  for (const x of items ?? []) { const d = londonDate(x?.at); if (!d) continue; if (!by.has(d)) by.set(d, []); by.get(d).push(x); }
  return [...by.keys()].sort().reverse().map(day => ({ day, label: dayLabel(day, thisYear),
    items: by.get(day).sort((a, b) => rank(a.part) - rank(b.part) || Date.parse(a.at) - Date.parse(b.at)) }));
}

/** Filter: part ('' = all), from / to (London dates, inclusive, '' = open), q (words that must all be in the title, any case). */
export function filterItems(items, { part = '', from = '', to = '', q = '' } = {}) {
  const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return (items ?? []).filter(x => {
    if (part && x.part !== part) return false;
    const d = londonDate(x.at); if (!d) return false;
    if (from && d < from) return false; if (to && d > to) return false;
    const t = String(x.title ?? '').toLowerCase();
    return words.every(w => t.includes(w));
  });
}
/** The programmes present in a list, in broadcast order (for the filter). */
export const partsIn = items => PART_ORDER.filter(p => (items ?? []).some(x => x.part === p));

/** '4:31', '1:02:05', '' */
export function clock(sec) {
  const s = Math.floor(Number(sec)); if (!Number.isFinite(s) || s < 0) return '';
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

// ── YouTube: every address is built from a checked id ──
export const isVideoId = id => YT_ID.test(String(id ?? ''));
export const thumbUrl = id => (isVideoId(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '');
export const embedUrl = id => (isVideoId(id) ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1` : '');
export const watchUrl = (id, format) => (!isVideoId(id) ? '' : format === 'short' ? `https://youtube.com/shorts/${id}` : `https://youtu.be/${id}`);

// ── the podcast player ──
/** Where to resume an episode: the saved position, unless it is in the first 5 s or the last 10 s (then from the start). */
export function resumeAt(saved, duration) {
  const s = Number(saved); if (!Number.isFinite(s) || s < 5) return 0;
  const d = Number(duration); if (Number.isFinite(d) && d > 0 && s > d - 10) return 0;
  return s;
}
/** The next speed in SPEEDS after `now` (wraps). */
export const nextSpeed = now => SPEEDS[(SPEEDS.indexOf(+now) + 1) % SPEEDS.length];
/** The saved positions kept small: at most `max` episodes, the most recently played first. map = { id: { t, at } } */
export function trimPositions(map, max = 60) {
  const e = Object.entries(map && typeof map === 'object' ? map : {}).filter(([, v]) => v && Number.isFinite(+v.t)).sort((a, b) => (+b[1].at || 0) - (+a[1].at || 0)).slice(0, max);
  return Object.fromEntries(e);
}
/** A same-site path or an https address, else '' (the page never follows anything else). */
export const safeSrc = u => (/^\/api\/helix\/podcast\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.mp3$/.test(String(u ?? '')) ? u : '');
