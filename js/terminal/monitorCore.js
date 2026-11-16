// js/terminal/monitorCore.js: the MONITOR tab's rules, pure (no DOM, no fetch). A monitor is a list of markets the owner picked, drawn as a dense table
// with live columns: last, 24h change, range used against the forecast, the options-implied size against the forecast sigma, the morning card's read,
// the next high-impact release and how old the quote is. Several named monitors can be saved for the whole desk (js/deskMonitors.js is the server half).
//
// Every column is a DESCRIPTION: how big a move is expected, how much of it has been used, how old the number is. The morning card's read is the card as
// written (direction is context only, never a signal: the Evidence Book's cb/news/direction entries are null or underpowered), and the header says so.
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
  { id: 'dawn', label: 'Morning read', help: 'The morning card\'s lean, as written. A description of the card; direction claims are context only (null in the Evidence Book), never a signal.', align: 'l' },
  { id: 'next', label: 'Next release', help: 'The next high-impact release for either currency of the pair (US for indices, metals and energy).', align: 'l' },
  { id: 'age', label: 'Age', help: 'How old the quote is. Amber after 10 minutes and red after an hour while the market is open; "shut" at the weekend.', align: 'r' },
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

/** The next high-impact release for the market's currencies. events = [{ country, event, impact, ms|time }]. */
export function nextEventFor(inst, events, now) {
  const want = new Set(eventCcys(inst));
  let best = null;
  for (const e of Array.isArray(events) ? events : []) {
    const ms = Number(e.ms ?? Date.parse(e.time));
    if (!Number.isFinite(ms) || ms < now - 5 * 60000 || !/high/i.test(e.impact ?? '')) continue;
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

/** The morning card's read for a market as a word and the share, from /api/global-read cards (direction.story.pUp / nLive). */
export function dawnOf(card) {
  const st = card?.direction?.story;
  if (!st || !st.nLive || !fin(st.pUp)) return null;
  const p = +st.pUp, edge = Math.abs(p - 0.5);
  if (edge < 0.02) return { word: 'Two-way', pct: null, sign: 0 };
  return { word: p > 0.5 ? 'Up' : 'Down', pct: Math.round(Math.max(p, 1 - p) * 100), sign: p > 0.5 ? 1 : -1 };
}

/**
 * One row per market. in: { items, bars: { INST: { bars, asOf } }, vc: /api/vol-clock, global: /api/global-read, events: [...], now, closed }
 * Missing pieces are null, never invented: a market the forecast does not cover shows a dash with the reason in `why`.
 */
export function buildRows({ items, bars = {}, vc = null, global = null, events = [], now = Date.now(), closed = false } = {}) {
  const tiles = new Map((vc?.tiles ?? []).map(t => [t.sym, t]));
  return (items ?? []).map(inst => {
    const b = bars[inst], lc = lastAndChange(b?.bars), t = tiles.get(inst);
    const used = t?.clock && fin(t.clock.used) ? +t.clock.used : null;
    const ev = nextEventFor(inst, events, now);
    return {
      inst, label: instLabel(inst), last: lc.last, chgPct: lc.chgPct,
      used, usedMode: t?.clock?.mode ?? null, ratio: fin(t?.ratio) ? +t.ratio : null, tag: t?.tag ?? null,
      dawn: dawnOf(global?.cards?.[inst]),
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
    dawn: r => (r.dawn ? r.dawn.sign * (r.dawn.pct ?? 50) : null), next: r => r.next?.ms ?? null, age: r => r.age?.min ?? null,
  }[col];
  if (!key) return rows.slice();
  const val = r => { const v = key(r); return v == null || (typeof v === 'number' && !Number.isFinite(v)) ? null : v; };
  return rows.slice().sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
  });
}

/** The rows as the table shows them, for CSV export (plain text cells, same order as COLUMNS). */
export function rowsToTable(rows) {
  const head = COLUMNS.map(c => c.label);
  const body = rows.map(r => [
    `${r.inst} (${r.label})`, fmtPrice(r.last), fmtPct(r.chgPct), r.used == null ? '' : `${Math.round(r.used * 100)}%`,
    r.ratio == null ? '' : r.ratio.toFixed(2), r.dawn ? `${r.dawn.word}${r.dawn.pct ? ` ${r.dawn.pct}%` : ''}` : '',
    r.next ? `${r.next.ccy} ${r.next.label} ${r.next.when}` : '', r.age.text,
  ]);
  return { head, body };
}
