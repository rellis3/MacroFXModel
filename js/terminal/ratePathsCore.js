// js/terminal/ratePathsCore.js: the pure maths behind Jarvis's RATE PATHS hologram (js/terminal/jarvisViewRatePaths.js). No DOM, no fetch, no three.js.
// Tested in js/terminal/ratePathsCore.test.mjs (plain `node`).
//
// WHAT IT BUILDS. One "lane" per central bank: today's policy rate and, at each upcoming policy meeting inside the window (about 13 months, at most 8
// meetings), the move the rate market prices for that meeting (stepBp) and the running total since today (cumBp), plus the same path from an earlier
// snapshot (the ghost) when the feed carries one. Lanes come back sorted from the most easing priced over the window to the most tightening.
//
// SOURCES, best first per bank (each is what the desk already serves; nothing here is invented):
//   Fed  /api/fed-path  zq.meetings (fed funds futures, per FOMC meeting, js/fedPathZq.js); ghost = zq.ago[28] (4 weeks), else zq.weekAgo (1 week).
//   BoE  /api/cb-path/boe  meetings (the Bank's own SONIA OIS curve, js/boePath.js); ghost = each meeting's ticks.m1 level (1 month ago).
//   all  /api/cb-expectations  banks[CCY].rungs (the laptop's IBKR short-rate futures strips, js/cbExpectations.js):
//          '1m' strips (30-day fed funds, ASX 30-day cash rate) -> js/fedPathZq.js meetingProbabilities over the bank's meeting dates;
//          '3m' strips (SONIA, ESTR, SARON, CORRA, TONA) -> the smallest set of meeting moves that reproduces every quarterly rate (the method of
//          js/cbMeetingPath.js, generalised to any bank's calendar); 'bill' strips carry a credit spread, so they are left out and the lane says why.
//          Ghost = the same arithmetic on each rung's rate4wAgo (4 weeks ago).
//   policy rate: /api/cb-expectations `policy[CCY].rate` (js/policyRates.js), else the bank's own field.
// The probability shown is |step| / 25bp (one 25bp move of one size, FedWatch style; capped at 100%; above it the label counts moves instead).
// RBNZ has no futures strip in the pull (IBKR lists none for the account), so its lane is reported missing, never filled in.
//
// DESCRIPTION ONLY: what futures / OIS price at each meeting today. Market pricing, never a forecast of what a bank does.
import { meetingProbabilities } from '../fedPathZq.js';

export const BANKS = [
  { ccy: 'USD', bank: 'Fed', name: 'FEDERAL RESERVE', cal: 'fomc' },
  { ccy: 'EUR', bank: 'ECB', name: 'EUROPEAN CENTRAL BANK', cal: 'ecb', spread: -0.063, lagDays: 6 },
  { ccy: 'GBP', bank: 'BoE', name: 'BANK OF ENGLAND', cal: 'boe', spread: -0.02 },
  { ccy: 'JPY', bank: 'BoJ', name: 'BANK OF JAPAN', cal: 'boj', spread: -0.02 },
  { ccy: 'CHF', bank: 'SNB', name: 'SWISS NATIONAL BANK', cal: 'snb', spread: 0 },
  { ccy: 'CAD', bank: 'BoC', name: 'BANK OF CANADA', cal: 'boc', spread: 0 },
  { ccy: 'AUD', bank: 'RBA', name: 'RESERVE BANK OF AUSTRALIA', cal: 'rba', spread: 0 },
  { ccy: 'NZD', bank: 'RBNZ', name: 'RESERVE BANK OF NZ', cal: 'rbnz', spread: 0 },
];
export const STEP_BP = 25, HORIZON_DAYS = 395, MAX_MEETINGS = 8, SCALE_CAP_BP = 200, SCALE_FLOOR_BP = 25;

const DAY = 86400000, fin = Number.isFinite, num = v => (v == null || v === '' ? NaN : Number(v));
const isoMs = s => Date.parse(`${String(s).slice(0, 10)}T00:00:00Z`);
const ymd8 = s => Date.UTC(+String(s).slice(0, 4), +String(s).slice(4, 6) - 1, +String(s).slice(6, 8));
const r1 = v => Math.round(v * 10) / 10;
const todayIso = now => new Date(now).toISOString().slice(0, 10);

/** A calendar list ([{date}] or ['YYYY-MM-DD']) -> sorted ISO dates. */
export function datesOf(list) {
  const out = []; for (const m of list ?? []) { const d = typeof m === 'string' ? m : m?.date; if (/^\d{4}-\d{2}-\d{2}$/.test(String(d))) out.push(String(d)); }
  return [...new Set(out)].sort();
}
/** The upcoming meetings inside the window. */
export function windowDates(dates, now, horizonDays = HORIZON_DAYS, max = MAX_MEETINGS) {
  const t0 = todayIso(now), end = todayIso(now + horizonDays * DAY);
  return datesOf(dates).filter(d => d > t0 && d <= end).slice(0, max);
}

/** Solve (A'A + lambda I) x = A'y (Gaussian elimination, partial pivoting). Same as js/cbMeetingPath.js. */
function solveRidge(A, y, lambda) {
  const n = A[0]?.length ?? 0; if (!n) return [];
  const M = Array.from({ length: n }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (j === n ? 0 : i === j ? lambda : 0)));
  for (let k = 0; k < A.length; k++) for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i][j] += A[k][i] * A[k][j]; M[i][n] += A[k][i] * y[k]; }
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]]; if (Math.abs(M[i][i]) < 1e-12) continue;
    for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = Math.abs(M[i][i]) < 1e-12 ? 0 : s / M[i][i]; }
  return x;
}

/**
 * A quarterly compounded-overnight strip ('3m') -> the move priced at each meeting, in bp from today's overnight rate. field = 'rate' or 'rate4wAgo'.
 * Returns [{ date, stepBp, cumBp }] (one per meeting in `dates`, cumBp from today's level) or null when no rung brackets a meeting.
 */
export function stripSteps3m(rungs, dates, policy, { spread = 0, lagDays = 0, now = Date.now(), field = 'rate' } = {}) {
  if (!fin(policy) || !dates?.length) return null;
  const rs = (rungs ?? []).filter(r => /^\d{8}$/.test(String(r?.expiry)) && fin(num(r?.[field]))).sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
  if (!rs.length) return null;
  const P = rs.map((r, i) => { const end = ymd8(r.expiry); return { rate: num(r[field]), start: i === 0 ? end - 91 * DAY : ymd8(rs[i - 1].expiry), end }; });
  const T = Math.floor(now / DAY) * DAY, L0 = policy + spread;
  const mt = dates.map(d => ({ date: d, eff: isoMs(d) + lagDays * DAY }));
  const frac = (p, m) => Math.max(0, (p.end - Math.max(p.start, m.eff, T)) / DAY) / ((p.end - p.start) / DAY);
  const rows = [], ys = [];
  for (const p of P) { if (p.end <= T) continue; const a = mt.map(m => frac(p, m)); if (!a.some(v => v > 0)) continue; rows.push(a); ys.push((p.rate - L0) * 100); }
  if (!rows.length) return null;
  const x = solveRidge(rows, ys, 0.02), lastEnd = P.at(-1).end; let cum = 0; const out = [];
  for (let j = 0; j < mt.length; j++) { if (mt[j].eff >= lastEnd) break; cum += x[j]; out.push({ date: mt[j].date, stepBp: r1(x[j]), cumBp: r1(cum) }); }
  return out.length ? out : null;
}

/** A monthly average-rate strip ('1m': fed funds, ASX cash rate) -> per-meeting moves via js/fedPathZq.js. base = the rate before the first meeting. */
export function stripSteps1m(rungs, dates, { field = 'rate', base = null } = {}) {
  const contracts = []; for (const r of rungs ?? []) { const v = num(r?.[field]), m = String(r?.month ?? ''); if (fin(v) && /^\d{6}$/.test(m)) contracts.push({ ym: `${m.slice(0, 4)}-${m.slice(4, 6)}`, implied: v }); }
  if (!contracts.length || !dates?.length) return null;
  const res = meetingProbabilities(contracts, dates); if (!res?.rows?.length) return null;
  const b = fin(base) ? base : res.rows[0].rBefore, out = [];
  for (const row of res.rows) if (dates.includes(row.meeting)) out.push({ date: row.meeting, stepBp: r1(row.moveBp), cumBp: r1((row.rAfter - b) * 100), base: b });
  return out.length ? out : null;
}

/** The plain words for one step: "-18bp, 72% of a cut priced" | "-40bp, 1.6 cuts priced" | "no move priced". */
export function stepWords(stepBp, prob = null) {
  if (!fin(stepBp)) return 'no reading';
  const a = Math.abs(stepBp), dir = stepBp > 0 ? 'hike' : 'cut', bp = `${stepBp > 0 ? '+' : '-'}${Math.round(a)}bp`;
  if (a < 2) return `${stepBp >= 0 ? '+' : '-'}${Math.round(a)}bp, no move priced`;
  const p = fin(prob) ? prob : a / STEP_BP;
  if (a > STEP_BP + 0.5) return `${bp}, ${(a / STEP_BP).toFixed(1)} ${dir}s priced`;
  return `${bp}, ${Math.round(Math.min(1, p) * 100)}% of a ${dir} priced`;
}
export const dirOf = bp => (!fin(bp) || Math.abs(bp) < 2 ? 0 : bp > 0 ? 1 : -1);
export const bpText = bp => (!fin(bp) ? 'n/a' : `${bp > 0 ? '+' : bp < 0 ? '-' : ''}${Math.round(Math.abs(bp))}bp`);
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** '2026-12-10' -> '10 DEC' (with the year when it differs from `now`'s). */
export function dateLabel(iso, now = Date.now()) {
  const y = +String(iso).slice(0, 4), m = +String(iso).slice(5, 7), d = +String(iso).slice(8, 10); if (!y || !m) return String(iso ?? '');
  return `${d} ${MON[m - 1]}${y !== new Date(now).getUTCFullYear() ? ` ${String(y).slice(2)}` : ''}`;
}
/** Spoken date: '10 December'. */
export function dateSpoken(iso) { const m = +String(iso).slice(5, 7), d = +String(iso).slice(8, 10); return m ? `${d} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]}` : ''; }

function finishLane(meta, policy, steps, ghost, extra) {
  const meetings = steps.map(s => ({ date: s.date, stepBp: s.stepBp, cumBp: s.cumBp, prob: fin(s.prob) ? Math.min(1, s.prob) : Math.min(1, Math.abs(s.stepBp) / STEP_BP), dir: dirOf(s.stepBp),
    rate: fin(policy) ? +(policy + s.cumBp / 100).toFixed(3) : null, thin: !!s.thin }));
  const gmap = new Map((ghost ?? []).map(g => [g.date, g.cumBp]));
  const gh = ghost ? meetings.map(m => (gmap.has(m.date) && fin(gmap.get(m.date)) ? gmap.get(m.date) : null)) : null;
  const has = gh && gh.some(v => v != null);
  const total = meetings.at(-1)?.cumBp ?? 0;
  return { ...meta, policy: fin(policy) ? policy : null, meetings, ghost: has ? gh : null, totalBp: total, next: meetings[0] ?? null,
    movedBp: has && gh.at(-1) != null ? r1(total - gh.at(-1)) : null, ...extra };
}

/**
 * Every bank's lane.
 *   cbx  /api/cb-expectations    fed  /api/fed-path    boe  /api/cb-path/boe    calendars { fomc, ecb, boe, boj, snb, boc, rba, rbnz } (arrays of {date})
 * -> { lanes (sorted most easing first), missing: [{ ccy, bank, why }], asOf, horizonDays, scaleBp, capped }
 */
export function buildLanes({ cbx = null, fed = null, boe = null, calendars = {}, now = Date.now(), horizonDays = HORIZON_DAYS } = {}) {
  const lanes = [], missing = [], t0 = todayIso(now);
  const pol = c => { const p = num(cbx?.policy?.[c]?.rate ?? cbx?.policy?.[c]); return fin(p) ? p : num(cbx?.banks?.[c]?.policy); };
  for (const meta of BANKS) {
    const c = meta.ccy, dates = windowDates(calendars[meta.cal], now, horizonDays), b = cbx?.banks?.[c];
    let lane = null, why = null;
    try {
      // the Fed: the per-meeting ZQ path
      if (!lane && c === 'USD' && Array.isArray(fed?.zq?.meetings) && fed.zq.meetings.length) {
        const rows = fed.zq.meetings.filter(r => String(r?.meeting) > t0 && fin(num(r?.rAfter)) && fin(num(r?.moveBp))).slice(0, MAX_MEETINGS);
        if (rows.length) {
          const base = num(rows[0].rBefore), g = fed.zq.ago?.[28] ?? fed.zq.ago?.['28'] ?? fed.zq.weekAgo ?? null, gl = (fed.zq.ago?.[28] ?? fed.zq.ago?.['28']) ? '4 weeks ago' : g ? '1 week ago' : null;
          const ghost = g?.meetings?.length ? g.meetings.filter(r => fin(num(r?.rAfter))).map(r => ({ date: r.meeting, cumBp: r1((num(r.rAfter) - base) * 100) })) : null;
          const steps = rows.map(r => ({ date: r.meeting, stepBp: r1(num(r.moveBp)), cumBp: r1((num(r.rAfter) - base) * 100), prob: fin(num(r.probPct)) ? Math.abs(num(r.probPct)) / 100 : null, thin: !!r.thin }));
          lane = finishLane(meta, fin(pol(c)) ? pol(c) : base, steps, ghost, { src: 'fed funds futures (ZQ), per FOMC meeting', ghostLabel: ghost ? gl : null, asOf: fed.zq.asOf ?? fed.asOf ?? null });
        }
      }
      // the BoE: its own OIS curve
      if (!lane && c === 'GBP' && boe?.ok && Array.isArray(boe.meetings) && boe.meetings.length) {
        const br = num(boe.bankRate?.pct), rows = boe.meetings.filter(r => String(r?.date) > t0 && fin(num(r?.stepBp)) && fin(num(r?.cumBp))).slice(0, MAX_MEETINGS);
        if (rows.length && fin(br)) {
          const ghost = rows.map(r => ({ date: r.date, cumBp: fin(num(r.ticks?.m1)) ? r1((num(r.ticks.m1) - br) * 100) : null })).filter(x => x.cumBp != null);
          const steps = rows.map(r => ({ date: r.date, stepBp: r1(num(r.stepBp)), cumBp: r1(num(r.cumBp)), prob: fin(num(r.pMove)) ? num(r.pMove) : null }));
          lane = finishLane(meta, br, steps, ghost.length ? ghost : null, { src: 'Bank of England SONIA OIS curve', ghostLabel: ghost.length ? '1 month ago' : null, asOf: boe.asOf ?? null });
        }
      }
      // every bank: the IBKR futures strip
      if (!lane && b?.rungs?.length) {
        const p = pol(c);
        if (b.kind === 'bill') why = 'only a bank-bill strip (it carries a credit spread), so no meeting path';
        else if (!dates.length) why = 'no upcoming meetings on the calendar';
        else if (b.kind === '1m') {
          const cur = stripSteps1m(b.rungs, dates);
          if (cur) { const ghost = stripSteps1m(b.rungs, dates, { field: 'rate4wAgo', base: cur[0].base }); lane = finishLane(meta, fin(p) ? p : cur[0].base, cur, ghost, { src: `${b.source ?? 'futures'}`, ghostLabel: ghost ? '4 weeks ago' : null, asOf: cbx.asOf ?? null }); }
          else why = 'the futures strip does not cover a meeting';
        } else if (!fin(p)) why = 'no policy rate to anchor the strip';
        else {
          const o = { spread: meta.spread ?? 0, lagDays: meta.lagDays ?? 0, now }, cur = stripSteps3m(b.rungs, dates, p, o);
          if (cur) { const ghost = stripSteps3m(b.rungs, dates, p, { ...o, field: 'rate4wAgo' }); lane = finishLane(meta, p, cur, ghost, { src: `${b.source ?? 'futures'}`, ghostLabel: ghost ? '4 weeks ago' : null, asOf: cbx.asOf ?? null }); }
          else if (Array.isArray(b.path?.meetings) && b.path.meetings.length) {
            const steps = b.path.meetings.filter(m => String(m.date) > t0).slice(0, MAX_MEETINGS).map(m => ({ date: m.date, stepBp: num(m.stepBp), cumBp: num(m.cumBp), prob: num(m.probMove) })).filter(s => fin(s.stepBp) && fin(s.cumBp));
            if (steps.length) lane = finishLane(meta, p, steps, null, { src: `${b.source ?? 'futures'}`, ghostLabel: null, asOf: cbx.asOf ?? null });
          }
          if (!lane) why = 'the futures strip does not cover a meeting';
        }
      }
    } catch (e) { lane = null; why = 'the data could not be read'; }
    if (lane && lane.meetings.length) lanes.push(lane); else missing.push({ ccy: c, bank: meta.bank, why: why ?? (c === 'NZD' ? 'no futures strip in the pull' : 'no pricing in the feed') });
  }
  lanes.sort((a, b) => a.totalBp - b.totalBp || a.ccy.localeCompare(b.ccy));
  const sc = scaleOf(lanes);
  return { lanes, missing, asOf: cbx?.asOf ?? fed?.zq?.asOf ?? boe?.asOf ?? null, horizonDays, scaleBp: sc.scaleBp, capped: sc.capped };
}

/** The vertical scale: the biggest |cumBp| (path or ghost) across lanes, floored at 25bp and capped at 200bp; values beyond the cap are clamped and MARKED. */
export function scaleOf(lanes) {
  let m = 0; for (const l of lanes ?? []) { for (const s of l.meetings ?? []) if (fin(s.cumBp)) m = Math.max(m, Math.abs(s.cumBp)); for (const g of l.ghost ?? []) if (fin(g)) m = Math.max(m, Math.abs(g)); }
  return { scaleBp: Math.min(SCALE_CAP_BP, Math.max(SCALE_FLOOR_BP, m)), capped: m > SCALE_CAP_BP };
}
/** Height in scene units for a bp value: linear in bp, clamped at +-scale (flag says it was clamped). */
export function heightOf(bp, scaleBp, unit = 1) {
  if (!fin(bp)) return { y: 0, capped: false };
  const s = Math.max(1, scaleBp), c = Math.abs(bp) > s; return { y: (Math.max(-s, Math.min(s, bp)) / s) * unit, capped: c };
}
/** Days from now -> depth fraction 0..1 over the window. */
export const depthOf = (iso, now, horizonDays = HORIZON_DAYS) => Math.max(0, Math.min(1, (isoMs(iso) - Math.floor(now / DAY) * DAY) / (horizonDays * DAY)));

/** Month ticks for the shared time axis: [{ iso: 'YYYY-MM-01', label: 'JAN 27', f }] inside the window. */
export function monthTicks(now, horizonDays = HORIZON_DAYS) {
  const d = new Date(now), out = []; let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  for (let k = 0; k < 15; k++) { if (m > 11) { m = 0; y++; } const iso = `${y}-${String(m + 1).padStart(2, '0')}-01`, f = depthOf(iso, now, horizonDays); if (f > 0 && f < 1) out.push({ iso, label: `${MON[m]}${m === 0 ? ` ${String(y).slice(2)}` : ''}`, f }); m++; }
  return out;
}

/**
 * Labels without collisions: boxes [{ x, y, w, h, pri }] -> each box gets `ok` (kept) and possibly a nudged y (tried at the offsets in `tries`, in box
 * heights; a box may carry its own `tries`). Higher pri placed first. Allocation-free when `order` (an index scratch array) and `kept` (a scratch array) are passed in, so it can run every frame.
 */
export function placeLabels(boxes, { W = Infinity, H = Infinity, tries = [0, -1, 1, -2, 2, -3], pad = 2, n = boxes.length, order = [], kept = [] } = {}) {
  order.length = 0; kept.length = 0; for (let i = 0; i < n; i++) order.push(i);
  order.sort((a, b) => (boxes[b].pri ?? 0) - (boxes[a].pri ?? 0) || a - b);
  for (let oi = 0; oi < n; oi++) {
    const b = boxes[order[oi]], y0 = b.y; b.ok = false;
    const tr = b.tries ?? tries;
    for (let t = 0; t < tr.length; t++) {
      const y = y0 + tr[t] * (b.h + pad); if (y < 0 || y + b.h > H || b.x < 0 || b.x + b.w > W) continue;
      let clash = false; for (let k = 0; k < kept.length; k++) { const o = kept[k]; if (b.x < o.x + o.w + pad && o.x < b.x + b.w + pad && y < o.y + o.h + pad && o.y < y + b.h + pad) { clash = true; break; } }
      if (!clash) { b.y = y; b.ok = true; kept.push(b); break; }
    }
    if (!b.ok) b.y = y0;
  }
  return boxes;
}

/** The SHOW line (2-4 plain sentences, British news register, description only). */
export function ratePathsScript(model) {
  const L = model?.lanes ?? []; if (!L.length) return null;
  const ease = L.filter(l => l.totalBp <= -5), hike = [...L].reverse().filter(l => l.totalBp >= 5);
  const name = l => ({ Fed: 'the Fed', ECB: 'the ECB', BoE: 'the Bank of England', BoJ: 'the Bank of Japan', SNB: 'the Swiss National Bank', BoC: 'the Bank of Canada', RBA: 'the Reserve Bank of Australia', RBNZ: 'the Reserve Bank of New Zealand' }[l.bank] ?? l.bank);
  const amt = l => `about ${Math.round(Math.abs(l.totalBp) / 5) * 5} basis points`;
  const s = ['Rate paths: what futures and swaps price for each central bank over the next year.'];
  const parts = [];
  if (ease.length) parts.push(`The most easing is priced for ${name(ease[0])}, ${amt(ease[0])} of cuts`);
  if (hike.length) parts.push(`the most tightening for ${name(hike[0])}, ${amt(hike[0])} of hikes`);
  if (parts.length) s.push(parts.join(', and ') + '.'); else s.push('Hardly any change is priced for any of them.');
  const big = [...L].sort((a, b) => Math.abs(b.totalBp) - Math.abs(a.totalBp)).slice(0, 2).filter(l => l.next);
  const nx = big.map(l => { const st = l.next.stepBp, a = Math.abs(st); const w = a < 2 ? 'almost nothing is priced' : a > STEP_BP + 0.5 ? `about ${Math.round(a)} basis points of ${st < 0 ? 'cuts' : 'hikes'} are priced` : `about ${Math.round(a)} basis points are priced, ${Math.round(Math.min(1, a / STEP_BP) * 100)} percent of a quarter-point ${st < 0 ? 'cut' : 'hike'}`; return `for ${name(l)} on ${dateSpoken(l.next.date)} ${w}`; });
  if (nx.length) s.push(`At the next meetings, ${nx.join('; ')}.`.replace('At the next meetings, for', 'At the next meetings: for'));
  s.push('That is market pricing, a description and not a forecast.');
  return s.join(' ');
}
