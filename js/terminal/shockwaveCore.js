// js/terminal/shockwaveCore.js: the pure shaping behind Jarvis's RELEASE SHOCKWAVE hologram (js/terminal/jarvisViewShockwave.js). No DOM, no fetch, no three.js; `now` is always passed in.
//
//   familiesOf(rows)                     the release families the record holds, in the desk's order, with counts (families under MIN_FAMILY releases are left off the buttons)
//   releasesOf(rows, family, now)        that family's printed releases, OLDEST first (depth order: oldest far, newest near)
//   unitFor(rows, family, mkt)           the market's "usual" reaction to this family: the median |30-minute move| over the family (pooled over every family when the family has < MIN_UNIT)
//   resample(path, unit, opts)           one stored minute path (/api/release-layer1/paths: { step, v[271] } from -30 to +240 min, rebased to the release minute) -> line segments in units of
//                                        the usual move, short gaps bridged, long gaps split, every value capped at +-CAP units and the capped points flagged
//   bandStats(lines, opts)               per grid minute: median, 25% and 75% across the family's lines (signed, or of the absolute move in SIZE mode); null where fewer than MIN_BAND lines
//   typical30(rows, family, mkt)         the size of the 30-minute move: median |m30| in the market's own unit, its 25-75% range, n, and the up / down count (description)
//   fanOf(row, paths, units)             ALL MARKETS: the newest release's 19 markets, each a spoke (path from 0 to +240 in units) with its 30-minute size against its usual
//   nextToday(evday, rl, now)            the next release of a family we hold that is due later today (London date): { family, hm }
//   placeLabels(items, W, H, taken)      greedy collision avoidance for the 2D labels
//   shockwaveScript(...)                 the SHOW line read aloud
//
// Units: every path in the record is the market's move since the release minute in its own unit: % of price for FX, indices, gold and bond futures, basis points for the SOFR / Euribor legs
// and their spread, index points for VIX / VXN. The view divides by the market's usual 30-minute reaction to that family (unitFor), so "1" is an ordinary reaction, "3" a large one, and
// markets with different units can stand side by side in ALL MARKETS. The native size is always given beside it.
// DESCRIPTION ONLY: history of past reactions. The direction of a release reaction is not predictable from the release alone (Evidence Book news-asymmetry NULL); nothing here says where the next one goes.
import { londonParts } from './dayAheadCore.js';

export const OFFS = [-30, 240];
export const SPAN = OFFS[1] - OFFS[0];
export const CAP = 4;              // heights are linear in units of the usual move up to +-CAP; beyond that a point is clamped and marked capped
export const MIN_UNIT = 5, MIN_BAND = 3, MIN_FAMILY = 3, GRID_STEP = 2, BRIDGE = 20;

export const FAMILY_ORDER = ['NFP', 'CPI', 'FOMC', 'ECB', 'BOE', 'BOJ', 'REFUNDING', 'UKFISCAL', 'RETAIL', 'PCE', 'GDP'];
export const FAMILY_LABEL = { NFP: 'US payrolls', CPI: 'US CPI', FOMC: 'Fed decision', ECB: 'ECB decision', BOE: 'BoE decision', BOJ: 'BoJ decision', REFUNDING: 'Treasury refunding', UKFISCAL: 'UK budget', RETAIL: 'US retail sales', PCE: 'US PCE', GDP: 'US GDP' };
export const FAMILY_SHORT = { NFP: 'NFP', CPI: 'CPI', FOMC: 'FOMC', ECB: 'ECB', BOE: 'BoE', BOJ: 'BoJ', REFUNDING: 'REFUND', UKFISCAL: 'BUDGET', RETAIL: 'RETAIL', PCE: 'PCE', GDP: 'GDP' };
/** Where each family lands hardest, so the view opens on something readable (and the SHOW speaks about it). */
export const FAMILY_MARKET = { NFP: 'eurusd', CPI: 'nq', FOMC: 'nq', ECB: 'eurusd', BOE: 'gbpusd', BOJ: 'usdjpy', REFUNDING: 'zn', UKFISCAL: 'gilt', RETAIL: 'eurusd', PCE: 'nq', GDP: 'nq' };

/** The 19 markets of the record, in button order; unit = the stored unit. */
export const MARKETS = [
  { k: 'eurusd', label: 'EURUSD', unit: '%' }, { k: 'gbpusd', label: 'GBPUSD', unit: '%' }, { k: 'usdjpy', label: 'USDJPY', unit: '%' }, { k: 'nq', label: 'Nasdaq', unit: '%' },
  { k: 'es', label: 'S&P 500', unit: '%' }, { k: 'gold', label: 'Gold', unit: '%' }, { k: 'sofr', label: 'SOFR leg', unit: 'bp' }, { k: 'zt', label: 'US 2y fut', unit: '%' },
  { k: 'zn', label: 'US 10y fut', unit: '%' }, { k: 'gilt', label: 'Gilt fut', unit: '%' }, { k: 'bund', label: 'Bund fut', unit: '%' }, { k: 'eur', label: 'Euribor leg', unit: 'bp' },
  { k: 'spr', label: 'SOFR-Euribor', unit: 'bp' }, { k: 'dx', label: 'Dollar idx', unit: '%' }, { k: 'ftse', label: 'FTSE 100', unit: '%' }, { k: 'dax', label: 'DAX', unit: '%' },
  { k: 'nikkei', label: 'Nikkei', unit: '%' }, { k: 'vix', label: 'VIX', unit: 'pt' }, { k: 'vxn', label: 'VXN', unit: 'pt' },
];
const MK = Object.fromEntries(MARKETS.map(m => [m.k, m]));
export const marketLabel = k => MK[k]?.label ?? String(k ?? '');
export const marketUnit = k => MK[k]?.unit ?? '%';
export const familyLabel = f => FAMILY_LABEL[String(f ?? '').toUpperCase()] ?? String(f ?? 'release');

export const fin = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function quantile(a, q) { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
export const median = a => quantile(a, 0.5);

/** Printed releases (time passed, not upcoming, carrying an id and a family). */
function printed(rows, now) { return (Array.isArray(rows) ? rows : []).filter(r => r && r.id && r.family && fin(Date.parse(r.t)) && Date.parse(r.t) <= now && r.status !== 'upcoming' && !r.inProgress); }

/** The families present, in FAMILY_ORDER (unknown ones after), each { f, n, label }, only those with at least MIN_FAMILY printed releases. */
export function familiesOf(rows, now = Date.now()) {
  const n = new Map(); for (const r of printed(rows, now)) n.set(r.family, (n.get(r.family) ?? 0) + 1);
  const rank = f => { const i = FAMILY_ORDER.indexOf(f); return i < 0 ? 99 : i; };
  return [...n.entries()].filter(([, c]) => c >= MIN_FAMILY).sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1]).map(([f, c]) => ({ f, n: c, label: familyLabel(f) }));
}

/** One family's printed releases, oldest first. */
export function releasesOf(rows, family, now = Date.now()) { return printed(rows, now).filter(r => r.family === family).sort((a, b) => Date.parse(a.t) - Date.parse(b.t)); }

/** The usual 30-minute reaction (absolute, the market's own unit). { unit, n, pooled } or null when no release has a 30-minute move for the market at all. */
export function unitFor(rows, family, mkt, now = Date.now()) {
  const abs = list => list.map(r => r.M?.[mkt]?.m30).filter(fin).map(Math.abs);
  const own = abs(releasesOf(rows, family, now));
  if (own.length >= MIN_UNIT) { const u = median(own); if (u > 0) return { unit: u, n: own.length, pooled: false }; }
  const all = abs(printed(rows, now)), u = median(all);
  return all.length && u > 0 ? { unit: u, n: all.length, pooled: true } : null;
}

/** The value of a stored path at minute `min` (null where the record has nothing there). A 15-minute path is stored on the minute grid with nulls between its samples. */
export function rawAt(path, min) {
  const v = path?.v; if (!Array.isArray(v) || !v.length) return null;
  const step = path.step > 0 ? path.step : 1, i = v.length >= SPAN + 1 ? min - OFFS[0] : Math.round((min - OFFS[0]) / step);
  return i >= 0 && i < v.length && fin(v[i]) ? v[i] : null;
}

/**
 * A stored path in units of the usual move, on a grid every `step` minutes from OFFS[0] to `to`. Gaps up to BRIDGE minutes are bridged linearly (a 15-minute CFD path becomes a straight-line
 * join of its samples, which is what it is); longer gaps split the line. Returns { segs: [[ [min, y], ... ], ...], capped (any point clamped), n (finite samples), abs (fold to |y|) }.
 */
export function resample(path, unit, { step = GRID_STEP, to = OFFS[1], from = OFFS[0], abs = false, cap = CAP } = {}) {
  const out = { segs: [], capped: false, n: 0 };
  if (!path || !fin(unit) || unit <= 0) return out;
  const pts = [];
  for (let m = OFFS[0]; m <= OFFS[1]; m++) { const x = rawAt(path, m); if (x != null) pts.push([m, x / unit]); }
  out.n = pts.length; if (pts.length < 2) return out;
  let seg = [], j = 0;
  for (let m = from; m <= to; m += step) {
    while (j < pts.length - 1 && pts[j + 1][0] <= m) j++;
    const a = pts[j], b = pts[j + 1];
    let y = null;
    if (a[0] === m) y = a[1];
    else if (b && a[0] < m && b[0] > m && b[0] - a[0] <= BRIDGE) y = a[1] + (b[1] - a[1]) * (m - a[0]) / (b[0] - a[0]);
    if (y == null) { if (seg.length >= 2) out.segs.push(seg); seg = []; continue; }
    if (abs) y = Math.abs(y);
    if (Math.abs(y) > cap) { out.capped = true; y = clamp(y, -cap, cap); }
    seg.push([m, y]);
  }
  if (seg.length >= 2) out.segs.push(seg);
  return out;
}

/** A resampled line's value at grid minute m (null when not covered). */
export function lineAt(line, m) { for (const s of line.segs) { if (m < s[0][0] || m > s[s.length - 1][0]) continue; for (const p of s) if (p[0] === m) return p[1]; } return null; }

/** Median and 25-75% across lines at each grid minute. Returns [{ m, med, lo, hi, n }] with nulls where fewer than MIN_BAND lines cover the minute. Values are the (capped) unit values. */
export function bandStats(lines, { step = GRID_STEP } = {}) {
  const out = [];
  for (let m = OFFS[0]; m <= OFFS[1]; m += step) {
    const v = lines.map(l => lineAt(l, m)).filter(fin);
    const ok = v.length >= MIN_BAND;
    out.push({ m, n: v.length, med: ok ? median(v) : null, lo: ok ? quantile(v, 0.25) : null, hi: ok ? quantile(v, 0.75) : null });
  }
  return out;
}

/** The size of the 30-minute move for a family and market, from the rows' own m30 (the market's unit): median |m30|, 25-75% of |m30|, n, and how many went up / down (a count, not a lean). */
export function typical30(rows, family, mkt, now = Date.now()) {
  const v = releasesOf(rows, family, now).map(r => r.M?.[mkt]?.m30).filter(fin);
  if (!v.length) return null;
  const a = v.map(Math.abs);
  return { med: median(a), lo: quantile(a, 0.25), hi: quantile(a, 0.75), n: v.length, up: v.filter(x => x > 0).length, dn: v.filter(x => x < 0).length, max: Math.max(...a), unit: marketUnit(mkt) };
}

/** The biggest 30-minute reactions of a family in units of the usual move, biggest first: [{ id, t, m30, size }]. */
export function biggest(rel, mkt, unit, n = 3) {
  if (!fin(unit) || unit <= 0) return [];
  return rel.map(r => ({ id: r.id, t: r.t, name: r.name, m30: r.M?.[mkt]?.m30 })).filter(x => fin(x.m30)).map(x => ({ ...x, size: Math.abs(x.m30) / unit })).sort((a, b) => b.size - a.size).slice(0, n);
}

/** Depth of a release in [0, 1]: 0 = the newest, 1 = the oldest of the family (by date, so gaps in the record show as gaps). */
export function depthOf(t, t0, t1) { const a = Date.parse(t); if (!fin(a) || !(t1 > t0)) return 0; return clamp((t1 - a) / (t1 - t0), 0, 1); }

/** Year (or half-year) ticks along the depth axis between t0 and t1: [{ f, label }]. */
export function dateTicks(t0, t1) {
  const out = []; if (!(t1 > t0)) return out;
  const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear(), half = y1 - y0 <= 2;
  for (let y = y0; y <= y1 + 1; y++) for (const mo of half ? [0, 6] : [0]) {
    const ms = Date.UTC(y, mo, 1); if (ms < t0 || ms > t1) continue;
    out.push({ f: (t1 - ms) / (t1 - t0), label: mo ? `Jul ${y}` : `${y}` });
  }
  return out;
}

/**
 * ALL MARKETS: the release's markets as spokes. row = the /api/release-layer1 row, paths = its /paths record, units = { mkt: unit }. Returns markets with a path, each
 * { k, label, unit, m30 (native), size (|m30| / usual), sign, line (resampled 0..+240 in units, signed) }, sorted by size, biggest first; and `missing` (market labels with no path or no unit).
 */
export function fanOf(row, paths, units, { step = 4 } = {}) {
  const out = [], missing = [];
  for (const m of MARKETS) {
    const p = paths?.[m.k], u = units?.[m.k], m30 = row?.M?.[m.k]?.m30;
    if (!p || !fin(u) || u <= 0) { missing.push(m.label); continue; }
    const line = resample(p, u, { step, from: 0 });
    if (!line.segs.length) { missing.push(m.label); continue; }
    const v30 = fin(m30) ? m30 : rawAt(p, 30);
    out.push({ k: m.k, label: m.label, unit: m.unit, m30: v30, size: fin(v30) ? Math.abs(v30) / u : null, sign: fin(v30) ? Math.sign(v30) : 0, line });
  }
  out.sort((a, b) => (b.size ?? -1) - (a.size ?? -1));
  return { spokes: out, missing };
}

/** The flare scale for a size in units: AREA proportional to the size (so the radius goes with its square root), capped at CAP units (and the caller marks the cap). */
export const areaScale = (size, base = 0.16) => (fin(size) ? base * Math.sqrt(Math.min(CAP, Math.max(0, size))) : 0);

/** The next release still to come today (London date) of a family we hold: from /api/event-day events, else the release record's `ahead`. { family, hm, ms } or null. */
export function nextToday(evday, rl, now, families = null) {
  const today = londonParts(now).date, have = f => !families || families.includes(f);
  const cand = [...(Array.isArray(evday?.events) ? evday.events : []), ...(Array.isArray(rl?.ahead) ? rl.ahead : [])]
    .map(e => ({ family: String(e?.family ?? '').toUpperCase(), ms: Date.parse(e?.t ?? e?.time ?? ''), released: e?.released }))
    .filter(e => e.family && fin(e.ms) && e.ms > now && e.released !== true && have(e.family) && londonParts(e.ms).date === today)
    .sort((a, b) => a.ms - b.ms);
  return cand.length ? { family: cand[0].family, ms: cand[0].ms, hm: londonParts(cand[0].ms).hm } : null;
}

/** Greedy label placement. items = [{ x, y, w, h, prio }] (x = centre, y = baseline); tries a few vertical nudges; returns [{ x, y } | null] in the input order. `taken` = boxes to avoid. */
export function placeLabels(items, W, H, taken = []) {
  const boxes = taken.map(b => ({ ...b })), out = new Array(items.length).fill(null);
  const order = items.map((_, i) => i).sort((a, b) => (items[b].prio ?? 0) - (items[a].prio ?? 0));
  const hit = b => boxes.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
  for (const i of order) {
    const it = items[i];
    for (const dy of [0, -16, 16, -32, 32, -48]) {
      const x = clamp(it.x, it.w / 2 + 4, W - it.w / 2 - 4), y = it.y + dy, b = { x: x - it.w / 2 - 3, y: y - it.h, w: it.w + 6, h: it.h + 5 };
      if (b.y < 0 || b.y + b.h > H || hit(b)) continue;
      boxes.push(b); out[i] = { x, y }; break;
    }
  }
  return out;
}

/** A native-unit size in words: "0.21%", "4.5 bp", "1.2 points". */
export function nativeText(v, unit, signed = false) {
  if (!fin(v)) return 'n/a';
  const a = Math.abs(v), s = signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : '';
  if (unit === 'bp') return `${s}${a < 10 ? a.toFixed(1) : Math.round(a)} bp`;
  if (unit === 'pt') return `${s}${a.toFixed(2)} pt`;
  return `${s}${a < 0.1 ? a.toFixed(3) : a.toFixed(2)}%`;
}
const spokenNative = (v, unit) => {
  if (!fin(v)) return null; const a = Math.abs(v);
  if (unit === 'bp') return `${a < 10 ? a.toFixed(1) : Math.round(a)} basis points`;
  if (unit === 'pt') return `${a.toFixed(1)} points`;
  return `${a < 0.1 ? a.toFixed(2) : a.toFixed(1)} percent`;
};

const SPOKEN = { eurusd: 'Euro Dollar', gbpusd: 'Sterling Dollar', usdjpy: 'Dollar Yen', nq: 'the Nasdaq', es: 'the S and P', gold: 'gold', sofr: 'the SOFR futures leg', zt: 'the two-year note future',
  zn: 'the ten-year note future', gilt: 'the gilt future', bund: 'the Bund future', eur: 'the Euribor leg', spr: 'the SOFR-Euribor spread', dx: 'the dollar index', ftse: 'the FTSE', dax: 'the DAX', nikkei: 'the Nikkei', vix: 'the VIX', vxn: 'the VXN' };
/** The SHOW line: the size (not the direction) of the main market's first 30 minutes after this kind of release. */
export function shockwaveScript({ family, mkt, typ, next }) {
  if (!family || !typ || !fin(typ.med) || typ.n < MIN_FAMILY) return null;
  const fam = familyLabel(family), mk = SPOKEN[mkt] ?? marketLabel(mkt), med = spokenNative(typ.med, typ.unit), lo = spokenNative(typ.lo, typ.unit), hi = spokenNative(typ.hi, typ.unit);
  const lead = next ? `${fam} is due at ${next.hm} London.` : `The most recent big release was the ${fam}.`;
  return `${lead} Over the last ${typ.n} of them, ${mk} typically moved about ${med} in the first thirty minutes, with half of them between ${lo} and ${hi}. `
    + `That is the size of the reaction; its direction came out ${typ.up} times up and ${typ.dn} times down, so history, not a forecast.`;
}
