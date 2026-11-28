// js/terminal/monitorCore.js: the MONITOR tab's rules, pure (no DOM, no fetch). A monitor is a list of markets the owner picked, drawn as a dense table
// with live columns: last, 24h change, range used against the forecast, the options-implied size against the forecast sigma, the desk book's call,
// how far price is from the card's entry zone and invalidation (in u), the next high-impact release and how old the quote is. Several named monitors can be saved for the whole desk (js/deskMonitors.js is the server half).
//
// Every column is a DESCRIPTION: how big a move is expected, how much of it has been used, how old the number is. The desk call is the morning book's card
// as written (direction is context only, never a signal: the Evidence Book's cb/news/direction entries are null or underpowered), and the header says so.
// Review 2026-11-27: the column was labelled the morning card's lean but read the global read's pUp ("Two-way" for USDCAD, the book's B+ long; "Down 52%"
// for NZDUSD, which has no card); it now reads the desk book's own cards.
import { ALL_INSTRUMENTS, instLabel } from './commandCore.js';
import { legsOf } from './pairView.js';

export const MAX_LISTS = 8;
export const MAX_ITEMS = 40;
export const NAME_MAX = 40;

export const STARTERS = [
  { name: 'FX majors', items: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'] },
  { name: 'Indices, gold and oil', items: ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100', 'GOLD', 'SILVER', 'WTI', 'BTCUSD'] },
];
export const starterByName = n => STARTERS.find(s => s.name.toLowerCase() === String(n ?? '').trim().toLowerCase()) ?? null;

export const isKnown = w => ALL_INSTRUMENTS.includes(String(w ?? '').toUpperCase());
export const cleanName = s => String(s ?? '').replace(/[<>"&]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

/** Keep known markets only, upper-cased, in order, no repeats, at most MAX_ITEMS. { items, dropped } */
export function cleanItems(list, known = isKnown) {
  const items = [], dropped = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const w = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!w || !known(w)) { if (w) dropped.push(w); continue; }
    if (items.includes(w)) continue;
    if (items.length >= MAX_ITEMS) { dropped.push(w); continue; }
    items.push(w);
  }
  return { items, dropped };
}

/** The server's stored shape: { v:1, lists:[{ name, items, updated }] }. Anything that does not validate is dropped. */
export function sanitizeStore(raw) {
  const out = [], seen = new Set();
  for (const l of Array.isArray(raw?.lists) ? raw.lists : []) {
    const name = cleanName(l?.name); if (!name || seen.has(name.toLowerCase()) || starterByName(name)) continue;
    const { items } = cleanItems(l?.items); if (!items.length) continue;
    seen.add(name.toLowerCase());
    out.push({ name, items, updated: typeof l?.updated === 'string' ? l.updated.slice(0, 30) : null });
    if (out.length >= MAX_LISTS) break;
  }
  return { v: 1, lists: out };
}

// ── columns ──
export const COLUMNS = [
  { id: 'inst', label: 'Market', help: 'Click a row to select it: the Pair page, chart and Replay follow when linked selection is on.', align: 'l' },
  { id: 'last', label: 'Last', help: 'The latest price from the terminal\'s own OANDA bars (mid).', align: 'r' },
  { id: 'chg', label: '24h', help: 'Change against the close 24 hours before the latest bar. While a market is shut it is the last day of trading.', align: 'r' },
  { id: 'used', label: 'Range used', help: 'How much of the forecast day\'s median range has been used so far (100% = the median). While a market is shut: the last finished session. Only for markets the forecast covers.', align: 'r' },
  { id: 'iv', label: 'IV / σ', help: 'The options-implied daily sigma divided by the forecast sigma. Above the band: options price more movement than the lines assume; below: less. How much, not which way. Only the markets with an implied-vol number.', align: 'r' },
  { id: 'call', label: 'Desk call', help: 'The morning desk book\'s card for this market, as written: its direction, conviction grade and size. A dash when the book has no card for it. Direction is context only (null in the Evidence Book), never a signal.', align: 'l' },
  { id: 'entry', label: 'To entry', help: 'How far price is from the card\'s entry zone, in u (the day\'s usual move from the open: half the p50 range). "in zone" when price is inside it. Only markets with a sized card.', align: 'r' },
  { id: 'inval', label: 'To invalid', help: 'How much room price has before the card\'s invalidation level, in u. "through" when price is already past it. Only markets with a sized card.', align: 'r' },
  { id: 'next', label: 'Next release', help: 'The next release for either currency of the pair (US for indices, metals and energy), at the importance picked beside the monitor: headline releases only (rate decisions, CPI, jobs, GDP, ISM/PMI, retail sales), every high-impact one, or high and medium.', align: 'l' },
  { id: 'age', label: 'Quote age', help: 'How old the last price is. Amber after 10 minutes and red after an hour while the market is open; "shut" at the weekend.', align: 'r' },
];

const CCY_OF = { US: 'USD', EU: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', GB: 'GBP', UK: 'GBP', JP: 'JPY', CH: 'CHF', AU: 'AUD', CA: 'CAD', NZ: 'NZD' };
/** The currencies whose releases matter for a market: both legs of an FX pair, otherwise USD. */
export function eventCcys(inst) { const l = legsOf(inst); return l && l[0] ? [l[0], l[1]] : ['USD']; }

const fin = v => v != null && v !== '' && Number.isFinite(+v);
/** The close of the latest bar, and the close of the bar at or before 24h earlier. bars = [{ time (s), close, forming? }] ascending. */
export function lastAndChange(bars) {
  if (!Array.isArray(bars) || !bars.length) return { last: null, chgPct: null, at: null };
  const b = bars[bars.length - 1], last = +b.close;
  if (!fin(last)) return { last: null, chgPct: null, at: null };
  const target = b.time - 86400;
  let ref = null;
  for (let i = bars.length - 1; i >= 0; i--) if (bars[i].time <= target) { ref = +bars[i].close; break; }
  return { last, chgPct: fin(ref) && ref > 0 ? (last / ref - 1) * 100 : null, at: b.time * 1000 };
}

export function fmtPrice(n) {
  if (!fin(n)) return '–';
  const a = Math.abs(+n);
  return (+n).toLocaleString('en-GB', { minimumFractionDigits: a >= 1000 ? 1 : a >= 100 ? 2 : a >= 10 ? 3 : 5, maximumFractionDigits: a >= 1000 ? 1 : a >= 100 ? 2 : a >= 10 ? 3 : 5 });
}
export const fmtPct = (n, d = 2) => (fin(n) ? `${+n >= 0 ? '+' : '−'}${Math.abs(+n).toFixed(d)}%` : '–');

/** Age of a quote in plain words and a state: shut (market closed), fresh, amber, red. */
export function ageOf(atMs, now, closed) {
  if (!fin(atMs)) return { text: '–', state: 'none', min: null };
  const min = Math.max(0, (now - atMs) / 60000);
  const text = min < 1 ? 'now' : min < 90 ? `${Math.round(min)}m` : min < 2880 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`;
  return { text, state: closed ? 'shut' : min < 10 ? 'fresh' : min < 60 ? 'amber' : 'red', min };
}

// The importance filter for "Next release" (review 2026-11-27: the column showed Japan's "Large Scale Retail Sales" ahead of ISM).
// headline = rated high AND one of the releases that move a whole currency; regional prints (German states' CPI) never count as headline.
export const IMPACTS = [
  { id: 'headline', label: 'headline releases' },
  { id: 'high', label: 'all high impact' },
  { id: 'medium', label: 'high and medium' },
];
const HEADLINE = /\b(non[- ]?farm|payrolls|unemployment rate|employment change|jobless claims|cpi|consumer price|pce|gdp|ism|pmi|retail sales|rate decision|interest rate|cash rate|bank rate|monetary policy|policy rate|fomc|press conference)\b/i;
const REGIONAL = /\b(baden|bavaria|brandenburg|hesse|north rhine|saxony|large scale|implicit price|regional)\b/i;
export function impactOk(e, level = 'high') {
  const im = String(e?.impact ?? '');
  if (level === 'medium') return /high|medium/i.test(im);
  if (!/high/i.test(im)) return false;
  return level === 'headline' ? HEADLINE.test(e?.event ?? '') && !REGIONAL.test(e?.event ?? '') : true;
}
/** The next release for the market's currencies at the chosen importance (default: every high-impact one). events = [{ country, event, impact, ms|time }]. */
export function nextEventFor(inst, events, now, level = 'high') {
  const want = new Set(eventCcys(inst));
  let best = null;
  for (const e of Array.isArray(events) ? events : []) {
    const ms = Number(e.ms ?? Date.parse(e.time));
    if (!Number.isFinite(ms) || ms < now - 5 * 60000 || !impactOk(e, level)) continue;
    const ccy = CCY_OF[String(e.country ?? '').toUpperCase()];
    if (!ccy || !want.has(ccy)) continue;
    if (!best || ms < best.ms) best = { ms, ccy, label: String(e.event ?? '').slice(0, 60) };
  }
  return best;
}
export function inWords(ms, now) {
  const m = Math.round((ms - now) / 60000);
  if (m < 0) return 'now';
  if (m < 60) return `in ${m}m`;
  if (m < 48 * 60) return `in ${Math.round(m / 60)}h`;
  return `in ${Math.round(m / 1440)}d`;
}

const SIGN = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
const WORD = { STRONG_LONG: 'Strong long', LONG: 'Long', SHORT: 'Short', STRONG_SHORT: 'Strong short', FLAT: 'Flat' };
/** The desk book's call for a market: { word, grade, size, sign } from its card ({ rating, conviction, size }), or null when the book has no card. */
export function deskCallOf(card) {
  if (!card?.rating) return null;
  const sign = SIGN[card.rating] ?? 0, size = fin(card.size) ? +card.size : null;
  return { word: WORD[card.rating] ?? String(card.rating).replace(/_/g, ' ').toLowerCase(), grade: card.conviction ? String(card.conviction) : null, size: sign ? size : null, sign };
}
/**
 * How far price is from a sized card's entry zone and invalidation, in u, from the plan check the desk run attaches (planCheck: zone, invalid, u).
 * entry: 0 inside the zone, else the gap to the nearest edge (side 'above' | 'below' the zone). invalid: the room before the invalidation, signed
 * so that <= 0 means price is already through it. Nulls where the card has no such level.
 */
export function planDistance(card, last) {
  const pc = card?.planCheck, dir = SIGN[card?.rating] ?? 0;
  if (!pc || !dir || !fin(last) || !fin(pc.u) || !(+pc.u > 0)) return null;
  const u = +pc.u, z = Array.isArray(pc.zone) && pc.zone.length === 2 && pc.zone.every(fin) ? [Math.min(...pc.zone), Math.max(...pc.zone)] : null;
  const entry = z ? (last >= z[0] && last <= z[1] ? { u: 0, side: 'in' } : last < z[0] ? { u: (z[0] - last) / u, side: 'below' } : { u: (last - z[1]) / u, side: 'above' }) : null;
  const invalid = fin(pc.invalid) ? (dir > 0 ? last - pc.invalid : pc.invalid - last) / u : null;
  return { entry, invalid, ok: pc.ok !== false };
}

/**
 * One row per market. in: { items, bars: { INST: { bars, asOf } }, vc: /api/vol-clock, cards: the desk book's cards (rating, conviction, size, planCheck), events: [...], now, closed, impact }
 * Missing pieces are null, never invented: a market the forecast does not cover shows a dash with the reason in `why`.
 */
export function buildRows({ items, bars = {}, vc = null, cards = {}, events = [], now = Date.now(), closed = false, impact = 'high' } = {}) {
  const tiles = new Map((vc?.tiles ?? []).map(t => [t.sym, t]));
  return (items ?? []).map(inst => {
    const b = bars[inst], lc = lastAndChange(b?.bars), t = tiles.get(inst);
    const used = t?.clock && fin(t.clock.used) ? +t.clock.used : null;
    const ev = nextEventFor(inst, events, now, impact);
    return {
      inst, label: instLabel(inst), last: lc.last, chgPct: lc.chgPct,
      used, usedMode: t?.clock?.mode ?? null, ratio: fin(t?.ratio) ? +t.ratio : null, tag: t?.tag ?? null,
      call: deskCallOf(cards?.[inst]), dist: planDistance(cards?.[inst], lc.last),
      next: ev ? { ...ev, when: inWords(ev.ms, now) } : null,
      age: ageOf(lc.at ?? b?.asOf, now, closed),
      why: { used: t ? null : 'the forecast does not cover this market', iv: t && !fin(t.ratio) ? 'no implied-vol number for this market' : t ? null : 'no implied-vol number for this market' },
    };
  });
}

/** Sort rows by a column id; empty values always last. dir = 1 ascending, -1 descending. */
export function sortRows(rows, col, dir = 1) {
  const key = {
    inst: r => r.inst, last: r => r.last, chg: r => r.chgPct, used: r => r.used, iv: r => r.ratio,
    call: r => (r.call ? r.call.sign * (r.call.size ?? 0.01) : null), entry: r => r.dist?.entry?.u ?? null, inval: r => r.dist?.invalid ?? null,
    next: r => r.next?.ms ?? null, age: r => r.age?.min ?? null,
  }[col];
  if (!key) return rows.slice();
  const val = r => { const v = key(r); return v == null || (typeof v === 'number' && !Number.isFinite(v)) ? null : v; };
  return rows.slice().sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
  });
}

export const callText = c => `${c.word}${c.grade && c.sign ? `, ${c.grade}${/^[a-z]/.test(c.grade) ? ' conviction' : ''}` : ''}${c.size != null ? ` · size ${c.size}` : ''}`;
export const entryText = d => (!d?.entry ? '' : d.entry.side === 'in' ? 'in zone' : `${d.entry.u.toFixed(1)}u ${d.entry.side}`);
export const invalText = d => (d?.invalid == null ? '' : d.invalid <= 0 ? 'through' : `${d.invalid.toFixed(1)}u`);
/** The rows as the table shows them, for CSV export (plain text cells, same order as COLUMNS). */
export function rowsToTable(rows) {
  const head = COLUMNS.map(c => c.label);
  const body = rows.map(r => [
    `${r.inst} (${r.label})`, fmtPrice(r.last), fmtPct(r.chgPct), r.used == null ? '' : `${Math.round(r.used * 100)}%`,
    r.ratio == null ? '' : r.ratio.toFixed(2), r.call ? callText(r.call) : '', entryText(r.dist), invalText(r.dist),
    r.next ? `${r.next.ccy} ${r.next.label} ${r.next.when}` : '', r.age.text,
  ]);
  return { head, body };
}
