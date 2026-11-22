// js/terminal/cotHoloCore.js: the pure half of Jarvis's POSITIONING TERRAIN (view 'cot', js/terminal/jarvisViewCot.js). No DOM, no fetch, no three.js; tested by cotHoloCore.test.mjs.
// Input: /api/desk-cot-history?weeks=156 (server.js) = { ok, series: { SYM: { label, dates: [YYYY-MM-DD oldest -> newest], specShare: [percent of open interest, signed], amShare?: [...] } }, error }.
//   specShare is speculators' net position (leveraged funds for the financial TFF contracts, managed money for the commodity contracts) as a % of open interest, written by the
//   cot-extremes engine (_worker.js, KV cot_series_v2). JPY, CAD and CHF are already flipped into USD-pair terms there (long = long USD/JPY). amShare (asset managers' net share, TFF contracts
//   only) is stored in KV but the route does not pass it today: everything here treats it as optional and the view hides its toggle when no market carries it.
// The percentile is the cot-extremes page's own rule (_worker.js pctRank): the share of PRIOR weeks in the window strictly below this week, rounded; no number under 52 weeks of history.
// Extreme = 90th percentile or above (stretched long against its own history) or 10th or below (stretched short), the same 90/10 thresholds cot-extremes.html uses.
// DESCRIPTION ONLY: where positioning sits against its own past. Nothing here is a forecast, a signal or a trade.
import { COT_MARKETS } from '../cotArchive.js';

export const WEEKS = 156, MIN_HISTORY = 52, EXT_HI = 90, EXT_LO = 10;
/** Asset-class groups in screen order (left to right), with their on-screen names. */
export const GROUPS = [['fx', 'FX'], ['equities', 'INDICES'], ['rates', 'TREASURIES'], ['metals', 'METALS'], ['energy', 'ENERGY'], ['crypto', 'CRYPTO'], ['grains', 'GRAINS'], ['softs', 'SOFTS'], ['livestock', 'LIVESTOCK'], ['other', 'OTHER']];
const GROUP_IX = Object.fromEntries(GROUPS.map(([k], i) => [k, i]));
const META = Object.fromEntries(COT_MARKETS.map((m, i) => [m.sym, { group: m.group, flip: !!m.flip, order: i }]));
/** Short on-screen names (the server's labels are long for a few); flipped FX futures are shown in the USD-pair terms the series is already in. */
const SHORT = { USD: 'DXY', ES: 'S&P 500', YM: 'DOW', RTY: 'RUSSELL', TY: '10Y NOTE', US: '30Y BOND', TU: '2Y NOTE', BTC: 'BITCOIN', JPY: 'USD/JPY', CAD: 'USD/CAD', CHF: 'USD/CHF', PLAT: 'PLATINUM', PALL: 'PALLADIUM', SOYS: 'SOYBEANS', SYBO: 'SOY OIL', NATGAS: 'NAT GAS' };
const SPOKEN = { EUR: 'the euro', GBP: 'sterling', JPY: 'the dollar against the yen', AUD: 'the Aussie dollar', CAD: 'the dollar against the Canadian dollar', CHF: 'the dollar against the Swiss franc',
  NZD: 'the New Zealand dollar', MXN: 'the Mexican peso', USD: 'the dollar index', NQ: 'the Nasdaq', ES: 'the S&P 500', YM: 'the Dow', RTY: 'the Russell 2000', TY: 'ten-year Treasuries', US: 'the long bond',
  TU: 'two-year Treasuries', BTC: 'bitcoin', GOLD: 'gold', SILVER: 'silver', COPPER: 'copper', PLAT: 'platinum', PALL: 'palladium', WTI: 'crude oil', BRENT: 'Brent crude', NATGAS: 'natural gas', RBOB: 'gasoline',
  CORN: 'corn', WHEAT: 'wheat', SOYS: 'soybeans', SYBO: 'soybean oil', SUGAR: 'sugar', COFFEE: 'coffee', COTTON: 'cotton', COCOA: 'cocoa', CATTLE: 'live cattle', HOGS: 'lean hogs' };

const fin = v => typeof v === 'number' && Number.isFinite(v);
const num = v => (v == null || v === '' ? null : (fin(+v) ? +v : null));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const shortName = (sym, label) => SHORT[sym] ?? String(label ?? sym ?? '').toUpperCase().slice(0, 12);
export const spokenOf = (sym, label) => SPOKEN[sym] ?? String(label ?? sym ?? '').toLowerCase();
export const groupName = k => GROUPS.find(([g]) => g === k)?.[1] ?? 'OTHER';

/** The cot-extremes rank: share of the prior values strictly below cur, 0..100 rounded; null with under MIN_HISTORY values in all (prior + current) or no current value. */
export function pctRank(prior, cur, minHist = MIN_HISTORY) {
  if (!fin(cur)) return null; const h = (prior ?? []).filter(fin);
  if (h.length + 1 < minHist || !h.length) return null;
  return Math.round(h.filter(v => v < cur).length / h.length * 100);
}
/** Ordinal: 97 -> '97th', 1 -> '1st', 12 -> '12th'. */
export function ordinal(n) {
  if (!fin(n)) return '–'; const v = Math.round(n), t = v % 100, u = v % 10;
  return `${v}${t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'}`;
}
/** Signed with a proper minus: +12.3 / −4.0. */
export const sg = (v, d = 1) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}` : '–');
/** 'YYYY-MM-DD' -> '17 Nov 2026' (UTC, no locale dependence). */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (d, year = true) => (DAY.test(String(d ?? '')) ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}${year ? ` ${d.slice(0, 4)}` : ''}` : '–');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 'YYYY-MM-DD' -> '17 November' for the voice. */
export const spokenDate = d => (DAY.test(String(d ?? '')) ? `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]}` : '');
/** The Friday release that follows a Tuesday as-of date (COT is as of Tuesday, published Friday). */
export function releaseOf(d) {
  if (!DAY.test(String(d ?? ''))) return null; const t = Date.parse(`${d}T12:00:00Z`); if (!fin(t)) return null;
  const wd = new Date(t).getUTCDay(), add = (5 - wd + 7) % 7; return new Date(t + add * 864e5).toISOString().slice(0, 10);
}

/**
 * Parse the route into markets on one shared weekly axis. Returns { weeks: [dates], markets: [...], report, hasAm, error } where each market is
 * { sym, label, name, group, flip, spec: Float64Array-like [] (null where no report), am: [] | null, cur, pct, chg4, amCur, amPct, last (its own latest date), stale, histLen, ext: 'long'|'short'|null }.
 * Markets are ordered by group then by the cotArchive list. Never throws.
 */
export function parseCot(resp, maxWeeks = WEEKS) {
  const out = { weeks: [], markets: [], report: null, hasAm: false, error: null };
  const S = resp && typeof resp === 'object' ? resp.series : null;
  if (!S || typeof S !== 'object' || !Object.keys(S).length) { out.error = resp?.error || 'No COT series is cached yet.'; return out; }
  const rows = [];
  for (const [sym, s] of Object.entries(S)) {
    const d = Array.isArray(s?.dates) ? s.dates : [], sp = Array.isArray(s?.specShare) ? s.specShare : [], am = Array.isArray(s?.amShare) ? s.amShare : null;
    const m = new Map(), a = new Map();
    for (let i = 0; i < d.length; i++) { if (!DAY.test(String(d[i] ?? ''))) continue; const v = num(sp[i]); if (v != null) m.set(d[i], v); if (am) { const w = num(am[i]); if (w != null) a.set(d[i], w); } }
    if (m.size) rows.push({ sym, label: s.label ?? sym, m, a: a.size ? a : null });
  }
  if (!rows.length) { out.error = resp?.error || 'The COT series carry no readable weeks.'; return out; }
  const all = new Set(); for (const r of rows) for (const k of r.m.keys()) all.add(k);
  const weeks = [...all].sort().slice(-Math.max(1, maxWeeks)); out.weeks = weeks; out.report = weeks[weeks.length - 1];
  const first = weeks[0];
  for (const r of rows) {
    const meta = META[r.sym] ?? { group: 'other', flip: false, order: 999 };
    const own = [...r.m.keys()].filter(k => k >= first).sort(), vals = own.map(k => r.m.get(k));
    const spec = weeks.map(k => (r.m.has(k) ? r.m.get(k) : null)), am = r.a ? weeks.map(k => (r.a.has(k) ? r.a.get(k) : null)) : null;
    const n = vals.length, cur = n ? vals[n - 1] : null, last = n ? own[n - 1] : null;
    const pct = pctRank(vals.slice(0, -1), cur), chg4 = n >= 5 ? cur - vals[n - 5] : null;
    let amCur = null, amPct = null;
    if (r.a) { const ak = [...r.a.keys()].filter(k => k >= first).sort(), av = ak.map(k => r.a.get(k)); if (av.length) { amCur = av[av.length - 1]; amPct = pctRank(av.slice(0, -1), amCur); } }
    out.markets.push({ sym: r.sym, label: r.label, name: shortName(r.sym, r.label), group: GROUP_IX[meta.group] != null ? meta.group : 'other', flip: meta.flip, order: meta.order, spec, am,
      cur, pct, chg4, amCur, amPct, last, stale: last != null && last < out.report, histLen: n, ext: pct == null ? null : pct >= EXT_HI ? 'long' : pct <= EXT_LO ? 'short' : null });
  }
  out.markets.sort((x, y) => GROUP_IX[x.group] - GROUP_IX[y.group] || x.order - y.order || (x.sym < y.sym ? -1 : 1));
  out.hasAm = out.markets.some(m => m.am && m.am.some(fin));
  return out;
}

/** The value that marks the top of the height scale: the q-quantile of |share| over every cell (and the asset-manager cells when asked); never below 5 points. */
export function scaleOf(markets, q = 0.98, withAm = false) {
  const a = []; for (const m of markets ?? []) { for (const v of m.spec ?? []) if (fin(v)) a.push(Math.abs(v)); if (withAm && m.am) for (const v of m.am) if (fin(v)) a.push(Math.abs(v)); }
  if (!a.length) return 5; a.sort((x, y) => x - y); return Math.max(5, a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))]);
}
/** Height in -1..1 for a share against the scale; linear; values beyond are clipped and reported as capped. */
export function heightOf(v, scale) { if (!fin(v) || !(scale > 0)) return { h: 0, capped: false }; const r = v / scale; return { h: Math.max(-1, Math.min(1, r)), capped: Math.abs(r) > 1 }; }

/** Rank of each week's value inside the market's own window (0..100, ties count half), for the surface colour; null where no value. */
export function windowRanks(spec) {
  const v = (spec ?? []).filter(fin).slice().sort((a, b) => a - b), n = v.length, out = new Array((spec ?? []).length).fill(null);
  if (n < 2) return out;
  const lowerBound = x => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] < x) lo = m + 1; else hi = m; } return lo; };
  const upperBound = x => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] <= x) lo = m + 1; else hi = m; } return lo; };
  spec.forEach((x, i) => { if (fin(x)) { const b = lowerBound(x), e = upperBound(x); out[i] = ((b + (e - b - 1) / 2) / (n - 1)) * 100; } });
  return out;
}
/** Tone of a percentile: gold weight 0..1 (0 inside 17..83, ramps smoothly to 1 at the 90th / 10th) and a brightness 0.1..1 rising with distance from the median. */
export function toneOf(p) {
  if (!fin(p)) return { gold: 0, bright: 0.08 };
  const e = Math.min(1, Math.abs(p - 50) / 50), x = Math.max(0, Math.min(1, (e - 0.66) / 0.14)), gold = x * x * (3 - 2 * x);
  return { gold, bright: 0.1 + 0.9 * Math.pow(e, 1.8) };
}

/** x positions for the markets: one slot each, a wider gap between groups, centred on 0 across width W. Returns { x: [], groups: [{ key, name, x0, x1, xc }], slot }. */
export function layoutX(markets, W = 8, gap = 1.3) {
  const ms = markets ?? [], groups = []; let u = 0, prev = null;
  const xs = ms.map((m, i) => { if (i && m.group !== prev) u += gap; if (m.group !== prev) groups.push({ key: m.group, name: groupName(m.group), u0: u, u1: u }); groups[groups.length - 1].u1 = u; prev = m.group; return u++; });
  const span = Math.max(1, u - 1), slot = W / Math.max(1, span), x0 = -W / 2;
  return { x: xs.map(v => x0 + v * slot), slot, groups: groups.map(gp => ({ key: gp.key, name: gp.name, x0: x0 + gp.u0 * slot, x1: x0 + gp.u1 * slot, xc: x0 + (gp.u0 + gp.u1) / 2 * slot })) };
}

/** The extremes, most stretched first (distance of the percentile from the median), and the biggest 4-week shift. */
export function extremes(markets) {
  const ms = (markets ?? []).filter(m => fin(m.pct));
  const long = ms.filter(m => m.ext === 'long').sort((a, b) => b.pct - a.pct || Math.abs(b.cur) - Math.abs(a.cur));
  const short = ms.filter(m => m.ext === 'short').sort((a, b) => a.pct - b.pct || Math.abs(b.cur) - Math.abs(a.cur));
  const most = [...ms].sort((a, b) => Math.abs(b.pct - 50) - Math.abs(a.pct - 50) || Math.abs(b.cur) - Math.abs(a.cur))[0] ?? null;
  const topLong = [...ms].sort((a, b) => b.pct - a.pct || b.cur - a.cur)[0] ?? null, topShort = [...ms].sort((a, b) => a.pct - b.pct || a.cur - b.cur)[0] ?? null;
  const shift = (markets ?? []).filter(m => fin(m.chg4) && !m.stale).sort((a, b) => Math.abs(b.chg4) - Math.abs(a.chg4))[0] ?? null;
  return { long, short, most, topLong, topShort, shift };
}

/** Card lines for one market (the view colours them). */
export function cardOf(M, sym) {
  const m = M?.markets?.find(x => x.sym === sym); if (!m) return null;
  const side = !fin(m.cur) ? 'no reading' : m.cur > 0 ? 'net long' : m.cur < 0 ? 'net short' : 'flat';
  const where = m.pct == null ? `under ${MIN_HISTORY} weeks of history: no percentile` : `${ordinal(m.pct)} percentile of its own ${m.histLen} weeks`;
  const lines = [
    ['tx', `speculators ${side} ${fin(m.cur) ? `${sg(m.cur)}% of open interest` : ''}`.trim()],
    [m.ext ? 'gold' : 'tx2', where],
    ...(m.ext ? [['gold', `stretched ${m.ext} (${m.ext === 'long' ? '90th or above' : '10th or below'})`]] : []),
    [fin(m.chg4) ? (m.chg4 > 0 ? 'up' : m.chg4 < 0 ? 'dn' : 'tx2') : 'tx2', fin(m.chg4) ? `4-week change ${sg(m.chg4)} points ${m.chg4 > 0 ? '▲' : m.chg4 < 0 ? '▼' : ''}`.trim() : '4-week change: not enough weeks'],
  ];
  if (fin(m.amCur)) lines.push(['blue', `asset managers ${sg(m.amCur)}% of OI${m.amPct != null ? ` · ${ordinal(m.amPct)} pct` : ''}${fin(m.cur) && Math.sign(m.amCur) !== Math.sign(m.cur) && m.cur !== 0 && m.amCur !== 0 ? ' · opposite side' : ''}`]);
  if (m.flip) lines.push(['tx2', `in USD-pair terms: long = long the dollar`]);
  lines.push(['tx2', m.stale ? `latest report on file ${fmtDate(m.last)} (older than the rest)` : `report as of Tue ${fmtDate(m.last)}`]);
  return { m, title: `${m.name} · ${groupName(m.group)}`, lines };
}

/** The SHOW line: the most stretched long and short markets against their own history and the biggest 4-week shift. Null when nothing has a percentile. */
export function cotScript(M) {
  if (!M?.markets?.length || !M.report) return null; const E = extremes(M.markets); if (!E.topLong && !E.topShort) return null;
  const rel = releaseOf(M.report), t = [`Futures positioning, from the report dated Tuesday ${spokenDate(M.report)}${rel ? `, released on Friday ${spokenDate(rel)}` : ''}.`];
  const L = E.topLong, Sh = E.topShort, at = p => (p >= 100 ? 'the top of its own range' : p <= 0 ? 'the bottom of its own range' : `the ${ordinal(p)} percentile`);
  if (L && Sh && L !== Sh) t.push(`Against their own history, speculators are most stretched long in ${spokenOf(L.sym, L.label)}, at ${at(L.pct)}, and most stretched short in ${spokenOf(Sh.sym, Sh.label)}, at ${at(Sh.pct)}.`);
  else if (L) t.push(`The most stretched market against its own history is ${spokenOf(L.sym, L.label)}, at ${at(L.pct)}.`);
  const nExt = E.long.length + E.short.length;
  t.push(nExt ? `${nExt === 1 ? 'One market sits' : `${nExt} markets sit`} at an extreme, ${E.long.length} long and ${E.short.length} short.` : 'No market sits beyond the 90th or below the 10th percentile.');
  if (E.shift) t.push(`The biggest four-week shift is in ${spokenOf(E.shift.sym, E.shift.label)}, net share ${E.shift.chg4 > 0 ? 'up' : 'down'} ${Math.round(Math.abs(E.shift.chg4))} points.`);
  t.push('Positioning, description only, not a forecast.');
  return t.join(' ');
}
/** The lower-third figure: the most extreme percentile and whose it is. */
export function cotFigure(M) {
  const E = extremes(M?.markets); const m = E.most; if (!m) return null;
  return { value: ordinal(m.pct), label: `${m.name} pct · ${m.pct >= 50 ? 'long' : 'short'} side` };
}

/** Collision-free label placement: the first candidate box inside bounds that overlaps nothing taken (then it is taken). */
export function placeBox(cands, taken, bounds = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity }, pad = 3) {
  const hit = (a, b) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
  for (const c of cands ?? []) { if (![c?.x, c?.y, c?.w, c?.h].every(fin)) continue; if (c.x < bounds.x0 || c.y < bounds.y0 || c.x + c.w > bounds.x1 || c.y + c.h > bounds.y1) continue; if (taken.some(t => hit(c, t))) continue; taken.push(c); return c; }
  return null;
}
