// js/terminal/cycleHoloCore.js: the pure half of Jarvis's WORLD CYCLE hologram (js/terminal/jarvisViewCycle.js): the business-cycle clock drawn from the OECD composite
// leading indicators, with time rising as the vertical axis. No DOM, no fetch, no three.js: it shapes the API replies into what the view draws and says.
//
//   /api/leading-indicators (server.js _mbRoute 'cli' -> js/globalBoards.js cliBoard): { ok, asOf: 'YYYY-MM', label, source, rows: [{ area (OECD code: USA, EA20, GBR ...), ccy, name,
//     period: 'YYYY-MM' (the economy's latest month), cli (100 = trend), chg1m, chg3m, phase, spark: the last 24 monthly readings, oldest first }] }
//   /api/fair-value (cliBoard's sibling fairValue): { rows: [{ area (BIS code: US, XM, GB ...), devPct (% from the 20-year average of the real effective exchange rate), period }] }
//
// PHASES are the same definitions globalBoards.cliBoard uses: level >= 100 and the 3-month change > 0 = expansion, >= 100 and not rising = slowdown, < 100 and rising = recovery,
// < 100 and not rising = contraction. So the plane's depth is the 3-MONTH change (momentum), which makes each quadrant exactly one phase.
// DESCRIPTION ONLY: phases are definitions applied to published data, never a forecast.

export const fin = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const PHASES = ['expansion', 'slowdown', 'contraction', 'recovery'];
export const PHASE_WORD = { expansion: 'Expansion', slowdown: 'Slowdown', contraction: 'Contraction', recovery: 'Recovery' };
/** OECD area -> short flag code, region and the BIS area whose real effective exchange rate prices its currency (Germany has none of its own in the BIS pull). */
export const AREAS = {
  USA: { code: 'US', region: 'americas', bis: 'US' }, CAN: { code: 'CA', region: 'americas', bis: 'CA' }, MEX: { code: 'MX', region: 'americas', bis: 'MX' }, BRA: { code: 'BR', region: 'americas', bis: 'BR' },
  EA20: { code: 'EA', region: 'europe', bis: 'XM' }, DEU: { code: 'DE', region: 'europe', bis: null }, GBR: { code: 'UK', region: 'europe', bis: 'GB' }, CHE: { code: 'CH', region: 'europe', bis: 'CH' },
  JPN: { code: 'JP', region: 'asia', bis: 'JP' }, AUS: { code: 'AU', region: 'asia', bis: 'AU' }, NZL: { code: 'NZ', region: 'asia', bis: 'NZ' }, CHN: { code: 'CN', region: 'asia', bis: 'CN' },
  IND: { code: 'IN', region: 'asia', bis: 'IN' }, KOR: { code: 'KR', region: 'asia', bis: 'KR' },
};
export const REGION_WORD = { americas: 'Americas', europe: 'Europe', asia: 'Asia-Pacific', other: 'other' };
const SPOKEN = { USA: 'the United States', EA20: 'the euro area', GBR: 'the United Kingdom', DEU: 'Germany', JPN: 'Japan', AUS: 'Australia', NZL: 'New Zealand', CAN: 'Canada', CHE: 'Switzerland',
  CHN: 'China', IND: 'India', BRA: 'Brazil', MEX: 'Mexico', KOR: 'South Korea' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The phase of one reading (cliBoard's rule; a flat 3-month change counts as not rising). Null when either number is missing. */
export function phaseOf(level, chg3) {
  if (!fin(level) || !fin(chg3)) return null;
  const up = chg3 > 0; return level >= 100 ? (up ? 'expansion' : 'slowdown') : up ? 'recovery' : 'contraction';
}
const ymOk = p => /^\d{4}-\d{2}$/.test(String(p ?? ''));
/** 'YYYY-MM' shifted by k months (k may be negative). */
export function addMonths(period, k) {
  if (!ymOk(period)) return null; const y = +period.slice(0, 4), m = +period.slice(5, 7) - 1 + k, yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}`;
}
const ymIndex = p => +p.slice(0, 4) * 12 + (+p.slice(5, 7) - 1);
/** 'Sep 2026' (or 'Sep 26' when short; 'September 2026' when long). */
export function monthLabel(period, { short = false, long = false } = {}) {
  if (!ymOk(period)) return 'n/a'; const m = +period.slice(5, 7) - 1;
  return long ? `${MONTH_LONG[m]} ${period.slice(0, 4)}` : `${MON[m]} ${short ? period.slice(2, 4) : period.slice(0, 4)}`;
}
/** Months between a 'YYYY-MM' and a date (ms), floored at 0: the data lag shown on screen. */
export function lagMonths(period, nowMs) {
  if (!ymOk(period) || !fin(nowMs)) return null; const d = new Date(nowMs); return Math.max(0, d.getUTCFullYear() * 12 + d.getUTCMonth() - ymIndex(period));
}

/** The q-quantile of |values| (finite only). */
export function absQuantile(vals, q) {
  const a = vals.filter(fin).map(Math.abs).sort((x, y) => x - y); if (!a.length) return 0;
  const i = clamp(q, 0, 1) * (a.length - 1), lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
/** A half-range for one plane axis: the 97th percentile of |value| with 15% room, rounded up to `step`, never under `floor`. Values past it are clamped to the edge and flagged. */
export function fitHalf(vals, { floor = 0.5, step = 0.25, q = 0.97, pad = 1.15 } = {}) {
  const v = absQuantile(vals, q) * pad; return Math.max(floor, Math.ceil(v / step - 1e-9) * step);
}
/** A reading on the plane: x = (level - 100) / half-range, z = 3-month change / half-range, each in [-1, 1]; capped = clamped to the edge. Rising points sit on the far side (negative z). */
export function toPlane(level, chg3, scale) {
  if (!fin(level) || !fin(chg3) || !scale) return null;
  const rx = (level - 100) / scale.x, rz = chg3 / scale.z, capped = Math.abs(rx) > 1 || Math.abs(rz) > 1;
  return { u: clamp(rx, -1, 1), v: clamp(rz, -1, 1), capped };
}

/**
 * The model the view draws. cli = the /api/leading-indicators reply, fair = the /api/fair-value reply (optional), nowMs for the lag.
 * -> { ok, asOf, lag, months: ['YYYY-MM' ...] (oldest first), econ: [{ area, code, name, region, period, pts: [point | null per month], last (index of the latest point), reer }],
 *      scale: { x, z }, capped: bool, label, why (when not ok) }
 * point = { period, cli, chg1, chg3, phase, u, v, capped }. Months with no 3-month change (the first three of each spark) are left out, so a 24-reading spark gives 21 trail points.
 */
export function buildCycle(cli, fair = null, nowMs = Date.now()) {
  const rows = Array.isArray(cli?.rows) ? cli.rows : [];
  if (!rows.length) return { ok: false, why: cli && cli.ok === false ? (cli.error ? `The leading-indicator feed says: ${cli.error}` : 'The leading-indicator feed is empty.') : 'No leading-indicator data.' };
  const series = [];
  for (const r of rows) {
    const sp = Array.isArray(r?.spark) ? r.spark : [];
    if (!ymOk(r?.period) || sp.length < 5 || !r?.area) continue;
    const vals = sp.map(x => (fin(+x) && x !== null && x !== '' ? +x : null));
    const raw = vals.map((v, i) => ({ period: addMonths(r.period, i - (vals.length - 1)), cli: v, chg1: i > 0 && fin(v) && fin(vals[i - 1]) ? v - vals[i - 1] : null, chg3: i > 2 && fin(v) && fin(vals[i - 3]) ? v - vals[i - 3] : null }));
    const pts = raw.filter(p => fin(p.cli) && fin(p.chg3)).map(p => ({ ...p, phase: phaseOf(p.cli, p.chg3) }));
    if (!pts.length) continue;
    const a = AREAS[r.area] ?? { code: String(r.area).slice(0, 3), region: 'other', bis: null };
    series.push({ area: r.area, code: a.code, name: r.name ?? r.area, region: a.region, bis: a.bis, period: r.period, list: pts });
  }
  if (!series.length) return { ok: false, why: 'The leading-indicator rows carry no usable history.' };
  const asOf = series.map(s => s.period).sort().at(-1), first = series.map(s => s.list[0].period).sort()[0];
  const n = ymIndex(asOf) - ymIndex(first) + 1, months = Array.from({ length: n }, (_, i) => addMonths(first, i));
  const scale = { x: fitHalf(series.flatMap(s => s.list.map(p => p.cli - 100)), { floor: 0.5, step: 0.25 }), z: fitHalf(series.flatMap(s => s.list.map(p => p.chg3)), { floor: 0.25, step: 0.25 }) };
  const reer = reerByArea(fair);
  let capped = false;
  const econ = series.map(s => {
    const pts = new Array(n).fill(null);
    for (const p of s.list) { const i = ymIndex(p.period) - ymIndex(first); if (i < 0 || i >= n) continue; const q = toPlane(p.cli, p.chg3, scale); if (q.capped) capped = true; pts[i] = { ...p, ...q }; }
    let last = -1; for (let i = n - 1; i >= 0; i--) if (pts[i]) { last = i; break; }
    return { area: s.area, code: s.code, name: s.name, region: s.region, period: s.period, pts, last, reer: s.bis ? reer[s.bis] ?? null : null };
  });
  return { ok: true, asOf, lag: lagMonths(asOf, nowMs), months, econ, scale, capped, label: cli?.label ?? '', source: cli?.source ?? 'OECD composite leading indicators' };
}

/** BIS fair-value rows -> { BIS area: { devPct, period } }. */
export function reerByArea(fair) {
  const out = {}; for (const r of Array.isArray(fair?.rows) ? fair.rows : []) if (r?.area && fin(r.devPct)) out[r.area] = { devPct: r.devPct, period: ymOk(r.period) ? r.period : null };
  return out;
}
/** Halo radius for a REER deviation: AREA proportional to |dev| (radius = rMax * sqrt(|dev| / cap)), capped at `cap` percent and flagged. */
export function haloRadius(devPct, rMax = 1, cap = 30) {
  if (!fin(devPct)) return null; const a = Math.abs(devPct); return { r: rMax * Math.sqrt(Math.min(a, cap) / cap), capped: a > cap, dearer: devPct > 0 };
}

/** The economy's point at month index mi, or its latest point before it (lag = months behind mi); null when it has none by then. */
export function pointAt(e, mi) {
  for (let i = Math.min(mi, e.pts.length - 1); i >= 0; i--) if (e.pts[i]) return { ...e.pts[i], index: i, lag: mi - i };
  return null;
}
/** How many consecutive months (ending at the point shown for month mi) the economy has been in its current phase. `atLeast` when the run reaches the start of the history. */
export function monthsInPhase(e, mi) {
  const p = pointAt(e, mi); if (!p) return null;
  let k = 1, i = p.index - 1; for (; i >= 0; i--) { const q = e.pts[i]; if (!q || q.phase !== p.phase) break; k++; }
  return { months: k, atLeast: i < 0 || !e.pts[i] };
}
/** Economies per phase at month index mi: { expansion: [econ ...], ... }. */
export function phaseGroups(M, mi) {
  const g = { expansion: [], slowdown: [], contraction: [], recovery: [] };
  for (const e of M?.econ ?? []) { const p = pointAt(e, mi); if (p?.phase) g[p.phase].push(e); }
  return g;
}
/** Phase changes in the `within` months up to mi (most recent per economy): [{ econ, from, to, monthsAgo, period }], newest first. */
export function phaseMoves(M, mi, within = 3) {
  const out = [];
  for (const e of M?.econ ?? []) {
    const p = pointAt(e, mi); if (!p) continue;
    for (let i = p.index; i > p.index - within && i > 0; i--) {
      const a = e.pts[i - 1], b = e.pts[i]; if (!a || !b) continue;
      if (a.phase !== b.phase) { out.push({ econ: e, from: a.phase, to: b.phase, monthsAgo: mi - i, period: b.period }); break; }
    }
  }
  return out.sort((x, y) => x.monthsAgo - y.monthsAgo);
}

/**
 * Screen-label placement, greedy by priority: each item { x, y (anchor px), w, h, pri } tries a few offsets around its anchor and keeps the first that fits inside
 * [4, W-4] x [top, bottom] without touching a reserved or already placed box. -> per item { x, y (top-left) } or null (not shown).
 */
const TRIES = [[10, -22], [10, 6], [-1, -22], [-1, 6], [10, -40], [-1, -40], [10, 24], [-1, 24]];
export function placeLabels(items, { W, top = 0, bottom, reserved = [] } = {}) {
  const res = new Array(items.length).fill(null), boxes = reserved.map(b => ({ ...b }));
  const order = items.map((_, i) => i).filter(i => items[i] && fin(items[i].x) && fin(items[i].y)).sort((a, b) => (items[b].pri ?? 0) - (items[a].pri ?? 0));
  for (const i of order) {
    const it = items[i];
    for (const [dx, dy] of TRIES) {
      const x = dx < 0 ? it.x - it.w - 10 : it.x + dx, y = it.y + dy, b = { x: x - 2, y: y - 2, w: it.w + 4, h: it.h + 4 };
      if (b.x < 4 || b.y < top || b.x + b.w > W - 4 || b.y + b.h > bottom) continue;
      if (boxes.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y)) continue;
      boxes.push(b); res[i] = { x, y }; break;
    }
  }
  return res;
}

// ── words ──
const numWord = n => (['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'][n] ?? String(n));
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const and = a => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a.at(-1)}` : a[0] ?? '');
export const spokenArea = e => SPOKEN[e?.area] ?? e?.name ?? e?.area ?? '';
/** The SHOW line: how many economies sit in each phase at the latest month, then up to three recent phase changes. Never a forecast. */
export function cycleScript(M) {
  if (!M?.ok) return null; const mi = M.months.length - 1, g = phaseGroups(M, mi), n = PHASES.reduce((s, k) => s + g[k].length, 0); if (!n) return null;
  const parts = PHASES.filter(k => g[k].length).map(k => `${numWord(g[k].length)} in ${k}`);
  const t = [`The world cycle, from the OECD's leading indicators up to ${monthLabel(M.asOf, { long: true })}.`, `Of ${numWord(n)} economies, ${and(parts)}.`];
  const mv = phaseMoves(M, mi, 3).slice(0, 3);
  if (mv.length) t.push(`Lately, ${and(mv.map(m => `${spokenArea(m.econ)} crossed into ${m.to}`))}.`);
  else t.push('No economy has changed phase in the last three months.');
  t.push('These phases are definitions, not a forecast.');
  return t.join(' ');
}
/** The lower-third number: economies in expansion at the latest month. */
export function cycleFigure(M) {
  if (!M?.ok) return null; const g = phaseGroups(M, M.months.length - 1), n = PHASES.reduce((s, k) => s + g[k].length, 0);
  return n ? { value: `${g.expansion.length} of ${n}`, label: 'in expansion' } : null;
}
export { cap1 };
