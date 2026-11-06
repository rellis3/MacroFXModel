// hedge-residual-system: shared code. Prereg: forge/HEDGE_RESIDUAL_SYSTEM_PREREG.md.
//
// The question (owner, 2026-11-06): run the hedging system as a single system. For each desk pair X, the Hedge
// finder's best partner Y (js/terminal/corrMath.js rankHedges, imported unchanged: |corr| x sign stability, 60-day
// window, NY-close daily closes to the previous session) is chosen once a month; the spread is X - beta.Y at the
// finder's own min-variance ratio, refreshed daily from data to the previous close; three signals trade the spread on
// hourly bars:
//   MR     z of the log spread (current beta) against its own last N hours: enter |z| >= ENTRY fading it, exit
//          |z| <= EXIT (or crossed), or after MAX_HOLD hours
//   MOM    sign of the trailing K-hour residual return, re-read every 4th UTC hour
//   CARRY  sign of the spread's policy-rate carry (c_X - beta.c_Y), rates of calendar day D-1 at session D's close
//   HOLD   always long the spread (no signal): the buy-and-hold benchmark
// Placebo: the same X slots with a uniformly drawn partner, the same beta method and signals.
//
// Nothing here reads data after the decision time; costs are half the measured spread per unit of turnover on both
// legs (analysis/output/costs/spread_profile_hist.json, weekday x UTC-hour medians scaled to the year).
import fs from 'node:fs';
import * as M from '../../js/terminal/corrMath.js';
import { DESK_UNIVERSE } from '../../js/deskPack.js';

export const SEED = 20261106;
export const W = 60;                 // the tab's default window (days)
export const LOOKBACK = 250;         // corrMath stability lookback (days)
export const SHARE_MIN = 0.8;        // partner eligible only if its sign held in >= 80% of the last year's windows
export const MIN_ABS = 0.10;         // the finder's own |corr| floor
export const START_MONTH = '2017-04';
export const LAST_DATE = '2026-08-20';   // last complete NY-close session in the cache; lockbox 2026-08-21 untouched
export const SPLIT = '2021-12-01';
export const N_Z = 120;              // MR: z window, hours (one trading week)
export const ENTRY = 2.0, EXIT = 0.5, MAX_HOLD = 120;
export const K_MOM = 120;            // MOM: trailing residual return, hours
export const MOM_EVERY = 4;          // MOM: re-read on UTC hours divisible by 4
export const RISK = 0.01;            // each slot sized to 1% daily residual sd (scale-free for Sharpe)

export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD'];
export const PAIRS = [...DESK_UNIVERSE.fx_majors, ...DESK_UNIVERSE.fx_crosses].filter(p => !/CHF|NOK|SEK/.test(p));   // 21
const DATA = new URL('../../data/hedge-residual-system/', import.meta.url);
const fin = v => v != null && Number.isFinite(v);

// ── data ──
/** USD value of one unit of each currency from the 10 cached instruments (CAD via CADJPY / USDJPY). */
function usdValues(c, n) {
  const o = { USD: new Float64Array(n).fill(1) };
  const get = (k, i) => c[k][i];
  const mk = f => Float64Array.from({ length: n }, (_, i) => { const v = f(i); return fin(v) && v > 0 ? v : NaN; });
  o.EUR = mk(i => get('eurusd', i)); o.GBP = mk(i => get('gbpusd', i)); o.AUD = mk(i => get('audusd', i)); o.NZD = mk(i => get('nzdusd', i));
  o.JPY = mk(i => 1 / get('usdjpy', i)); o.CAD = mk(i => get('cadjpy', i) / get('usdjpy', i));
  return o;
}
const pairFrom = (u, p) => Float64Array.from(u.USD, (_, i) => u[p.slice(0, 3)][i] / u[p.slice(3)][i]);

/** New York 17:00 on a date as UTC epoch seconds. */
const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit' });
export function nyCloseEpoch(d) {
  for (const off of [4, 5]) { const t = Date.parse(`${d}T${String(17 + off).padStart(2, '0')}:00:00Z`) / 1000; if (+nyFmt.format(new Date(t * 1000)) % 24 === 17) return t; }
  throw new Error(`no NY close for ${d}`);
}

/** Real data: hourly + daily pair closes for the 21 pairs, the daily panel, and the hour -> session maps. */
export function loadReal() {
  const h1 = JSON.parse(fs.readFileSync(new URL('h1.json', DATA)));
  const d1 = JSON.parse(fs.readFileSync(new URL('d1.json', DATA)));
  const keep = d1.d.map((d, i) => [d, i]).filter(([d]) => d <= LAST_DATE).map(([, i]) => i);
  const dc = Object.fromEntries(Object.entries(d1.c).map(([k, v]) => [k, keep.map(i => v[i])]));
  const dates = keep.map(i => d1.d[i]);
  return assemble({ tEnd: h1.t, hourClose: h1.c, dates, dayClose: dc, rates: loadRates() });
}

/** From instrument closes (10 cached keys) to the study's arrays. Shared by the real run and the synthetic power runs. */
export function assemble({ tEnd, hourClose, dates, dayClose, rates }) {
  const nH = tEnd.length, nD = dates.length;
  const uh = usdValues(hourClose, nH), ud = usdValues(dayClose, nD);
  const lp = {}, r = {}, px = {};
  for (const p of PAIRS) {
    const c = pairFrom(uh, p); px[p] = c;
    const l = c.map(Math.log); lp[p] = l;
    r[p] = Float64Array.from(l, (v, i) => (i > 0 && fin(v) && fin(l[i - 1]) ? v - l[i - 1] : 0));
  }
  const closes = Object.fromEntries(PAIRS.map(p => [p, Array.from(pairFrom(ud, p), v => (fin(v) ? v : null))]));
  const S = M.series({ dates, syms: PAIRS, closes });
  // session close times; kOf[h] = last session closed at or before the hour's end; sessOf[h] = session the hour's
  // return belongs to (first close >= hour end)
  const close = dates.map(nyCloseEpoch);
  const kOf = new Int32Array(nH), sessOf = new Int32Array(nH);
  let k = -1;
  for (let h = 0; h < nH; h++) {
    while (k + 1 < nD && close[k + 1] <= tEnd[h]) k++;
    kOf[h] = k;
    sessOf[h] = k >= 0 && close[k] === tEnd[h] ? k : k + 1;      // nD when the hour is after the last close
  }
  return { tEnd, nH, nD, dates, close, lp, r, px, S, kOf, sessOf, rates };
}

// ── rates (carry) ──
export function loadRates() {
  const raw = JSON.parse(fs.readFileSync(new URL('rates.json', DATA)));
  return Object.fromEntries(CCYS.map(c => [c, raw[c]]));
}
/** Rate (decimal / yr) of ccy in effect on calendar day `d` (last value dated <= d; null before the series starts). */
export function rateFn(rates) {
  const memo = new Map();
  return (ccy, d) => {
    const key = ccy + d; if (memo.has(key)) return memo.get(key);
    const a = rates[ccy]; let lo = 0, hi = a.length - 1, ans = null;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m][0] <= d) { ans = a[m][1]; lo = m + 1; } else hi = m - 1; }
    const v = ans == null ? null : ans / 100; memo.set(key, v); return v;
  };
}
const dayBefore = d => new Date(Date.parse(d + 'T00:00:00Z') - 86400e3).toISOString().slice(0, 10);
export const pairCarry = (rf, p, d) => { const a = rf(p.slice(0, 3), dayBefore(d)), b = rf(p.slice(3), dayBefore(d)); return fin(a) && fin(b) ? a - b : null; };

// ── costs ──
const SPREADS = JSON.parse(fs.readFileSync(new URL('../../analysis/output/costs/spread_profile_hist.json', import.meta.url), 'utf8'));
/** Half the measured spread as a fraction of price, for pair p traded at the end of hour h. */
export function makeHalfCost(D, mult = 1) {
  const memo = new Map();
  const yScale = {};
  for (const p of PAIRS) {
    const t = SPREADS[p.toLowerCase()]; if (!t) throw new Error(`no spread for ${p}`);
    const ys = Object.keys(t.by_year).sort(), meds = ys.map(y => t.by_year[y].med_pips).sort((a, b) => a - b);
    const all = meds[Math.floor(meds.length / 2)];
    yScale[p] = y => { const yy = t.by_year[y] ? y : (y < ys[0] ? ys[0] : ys.at(-1)); return t.by_year[yy].med_pips / all; };
    yScale[p].allPrice = all * t.pip;
  }
  return (p, h) => {
    const dt = new Date(D.tEnd[h] * 1000), wd = (dt.getUTCDay() + 6) % 7, hr = dt.getUTCHours(), y = String(dt.getUTCFullYear());
    const key = `${p}|${wd}-${hr}|${y}`;
    let s = memo.get(key);
    if (s == null) { const t = SPREADS[p.toLowerCase()]; const wh = t.by_weekday_hour_utc[`${wd}-${String(hr).padStart(2, '0')}`]; s = (wh ? wh.med : yScale[p].allPrice) * yScale[p](y); memo.set(key, s); }
    return mult * 0.5 * s / D.px[p][h];
  };
}

// ── selection ──
/** The first session index of each calendar month from START_MONTH; the selection for that month uses end = idx-1. */
export function rebalances(D) {
  const out = [];
  for (let i = 1; i < D.nD; i++) if (D.dates[i].slice(0, 7) !== D.dates[i - 1].slice(0, 7) && D.dates[i].slice(0, 7) >= START_MONTH) out.push(i);
  return out;
}
/** The finder's pick for every X at session end `e` (data <= e): top row of rankHedges with |rho| >= 0.10 and share >= 0.8. */
export function finderPicks(D, e) {
  const picks = [];
  for (const x of PAIRS) {
    const rows = M.rankHedges(D.S, x, PAIRS.filter(c => c !== x), { w: W, end: e, minAbs: MIN_ABS, lookback: LOOKBACK });
    const top = rows[0];
    if (top && top.share >= SHARE_MIN) picks.push({ x, y: top.id, score: top.score, rho: top.rho, share: top.share });
  }
  // one slot per unordered pair: keep the orientation with the higher score (ties: earlier X in PAIRS order)
  const best = new Map();
  for (const p of picks) { const k = [p.x, p.y].sort().join('/'); const b = best.get(k); if (!b || p.score > b.score) best.set(k, p); }
  return [...best.values()].sort((a, b) => PAIRS.indexOf(a.x) - PAIRS.indexOf(b.x));
}
/** Daily hedge parameters of slot (x, y) at session end e: signed min-variance beta, and size for RISK residual sd. */
export function slotParams(D, x, y, e) {
  const tx = M.retOf(D.S, x), cy = M.retOf(D.S, y);
  const rho = M.corrWin(tx, cy, e, W), sx = M.sdWin(tx, e, W), sy = M.sdWin(cy, e, W);
  if (!fin(rho) || !fin(sx) || !fin(sy) || sy <= 0) return null;
  const beta = rho * sx / sy, rsd = sx * Math.sqrt(Math.max(1e-6, 1 - rho * rho));
  return { beta, w: RISK / rsd, rho };
}

// ── the engine ──
export const SIGNALS = ['MR', 'MOM', 'CARRY', 'HOLD'];
/**
 * Run every signal over every slot. `plan` = [{ from: firstHour, to: lastHour (inclusive), slots: [{x, y}] }] with
 * hours where the month's selection is in force. Returns per signal: hourly net/gross/cost/accrual P&L arrays (length
 * nH, zeros outside the plan), trade counts, and per-slot-X attributions.
 */
export function runEngine(D, plan, { halfCost, rf, accrual = true } = {}) {
  const nH = D.nH;
  const out = {};
  for (const s of SIGNALS) out[s] = { gross: new Float64Array(nH), cost: new Float64Array(nH), acc: new Float64Array(nH), trades: 0, byX: {}, entries: [] };
  const paramMemo = new Map();
  const params = (x, y, k) => { const key = `${x}|${y}|${k}`; if (!paramMemo.has(key)) paramMemo.set(key, slotParams(D, x, y, k)); return paramMemo.get(key); };
  for (const blk of plan) {
    for (const { x, y } of blk.slots) {
      const lx = D.lp[x], ly = D.lp[y], rx = D.r[x], ry = D.r[y];
      const st = Object.fromEntries(SIGNALS.map(s => [s, { pos: 0, held: 0, px: 0, py: 0 }]));
      for (let h = blk.from; h <= blk.to + 1 && h < nH; h++) {
        // 1. P&L over hour h of the positions set at the end of hour h-1
        if (h > blk.from) {
          const dtY = (D.tEnd[h] - D.tEnd[h - 1]) / (365.25 * 86400);
          const kk = D.kOf[h - 1], d = D.dates[kk];
          const cx = accrual ? pairCarry(rf, x, d) : 0, cyy = accrual ? pairCarry(rf, y, d) : 0;
          for (const s of SIGNALS) {
            const S = st[s]; if (!S.px && !S.py) continue;
            const o = out[s];
            const g = S.px * rx[h] + S.py * ry[h];
            const a = (fin(cx) ? S.px * cx : 0) * dtY + (fin(cyy) ? S.py * cyy : 0) * dtY;
            o.gross[h] += g; o.acc[h] += a;
            (o.byX[x] ??= new Float64Array(nH))[h] += g + a;
          }
        }
        // 2. decisions at the end of hour h (last block hour + 1 only closes out)
        const closing = h > blk.to;
        const k = D.kOf[h];
        const P = closing ? null : params(x, y, k);
        let z = null, mom = null, carry = null;
        if (P && h >= N_Z) {
          // z of U = lx - beta.ly over the last N_Z hours (inclusive of h)
          let su = 0, suu = 0;
          for (let j = h - N_Z + 1; j <= h; j++) { const u = lx[j] - P.beta * ly[j] - (lx[h] - P.beta * ly[h]); su += u; suu += u * u; }
          const m = su / N_Z, v = suu / N_Z - m * m;
          if (v > 1e-14) z = (0 - m) / Math.sqrt(v);
          mom = (lx[h] - lx[h - K_MOM]) - P.beta * (ly[h] - ly[h - K_MOM]);
          const cX = pairCarry(rf, x, D.dates[k]), cY = pairCarry(rf, y, D.dates[k]);
          carry = fin(cX) && fin(cY) ? cX - P.beta * cY : null;
        }
        const hourUTC = new Date(D.tEnd[h] * 1000).getUTCHours();
        for (const s of SIGNALS) {
          const S = st[s], o = out[s];
          let pos = S.pos;
          if (closing || !P) pos = 0;
          else if (s === 'HOLD') pos = 1;
          else if (s === 'MR') {
            if (pos !== 0) { S.held++; if (z == null || pos * z >= -EXIT || S.held >= MAX_HOLD) pos = 0; }
            if (pos === 0 && S.pos === 0 && fin(z) && Math.abs(z) >= ENTRY) { pos = z > 0 ? -1 : 1; S.held = 0; o.trades++; o.entries.push({ h, x, y, side: pos, z }); }
          } else if (s === 'MOM') {
            if ((S.pos === 0 || hourUTC % MOM_EVERY === 0) && fin(mom) && mom !== 0) { const np = mom > 0 ? 1 : -1; if (np !== S.pos) o.trades++; pos = np; }
          } else if (s === 'CARRY') {
            const np = fin(carry) && carry !== 0 ? (carry > 0 ? 1 : -1) : 0; if (np !== S.pos && np !== 0) o.trades++; pos = np;
          }
          const nx = P && pos ? pos * P.w : 0, ny = P && pos ? -pos * P.w * P.beta : 0;
          const hc = Math.min(h, nH - 1);
          const c = Math.abs(nx - S.px) * halfCost(x, hc) + Math.abs(ny - S.py) * halfCost(y, hc);
          if (c) { o.cost[Math.min(h + 1, nH - 1)] += c; (o.byX[x] ??= new Float64Array(nH))[Math.min(h + 1, nH - 1)] -= c; }
          S.pos = pos; S.px = nx; S.py = ny;
        }
      }
    }
  }
  return out;
}

/** Hours in force for each month's selection: from the first hour after the close of session (reb-1) up to the hour
 *  before the next selection takes over (the last month runs to the last hour of LAST_DATE's session). */
export function planHours(D, rebs) {
  const blocks = [];
  for (let m = 0; m < rebs.length; m++) {
    const e = rebs[m] - 1, eNext = m + 1 < rebs.length ? rebs[m + 1] - 1 : null;
    let from = -1, to = -1;
    for (let h = 0; h < D.nH; h++) {
      if (D.kOf[h] < e) continue;
      if (eNext != null && D.kOf[h] >= eNext) break;
      if (D.sessOf[h] > D.nD - 1 || D.dates[D.sessOf[h]] > LAST_DATE) break;
      if (from < 0) from = h; to = h;
    }
    if (from >= 0) blocks.push({ e, from, to });
  }
  return blocks;
}

/** Hourly arrays -> daily (NY-close session) series over the scored sessions. */
export function toDaily(D, arr, firstH, lastH) {
  const m = new Map();
  for (let h = firstH; h <= lastH + 1 && h < D.nH; h++) { const s = D.sessOf[h]; m.set(s, (m.get(s) ?? 0) + arr[h]); }
  return m;
}
export function dailySeries(D, plan, o, { costMult = 1, withAcc = true, withCost = true } = {}) {
  const first = plan[0].from, last = plan.at(-1).to;
  const sess = [];
  for (let s = D.sessOf[first]; s <= Math.min(D.sessOf[Math.min(last + 1, D.nH - 1)], D.nD - 1); s++) if (D.dates[s] <= LAST_DATE) sess.push(s);
  const g = toDaily(D, o.gross, first, last), a = toDaily(D, o.acc, first, last), c = toDaily(D, o.cost, first, last);
  return { sess, dates: sess.map(s => D.dates[s]), net: sess.map(s => (g.get(s) ?? 0) + (withAcc ? a.get(s) ?? 0 : 0) - (withCost ? costMult * (c.get(s) ?? 0) : 0)) };
}

// ── stats ──
export const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
export const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
export function annFactor(dates) { const y = (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / (365.25 * 86400e3); return dates.length / y; }
export const sharpe = (a, af) => { const s = sd(a); return s > 0 ? mean(a) / s * Math.sqrt(af) : 0; };
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function blockIndex(n, { B = 2000, L = 21, seed = SEED } = {}) {
  const r = rng(seed), out = [];
  for (let b = 0; b < B; b++) { const idx = new Int32Array(n); let k = 0; while (k < n) { const s = Math.floor(r() * n); for (let j = 0; j < L && k < n; j++) idx[k++] = (s + j) % n; } out.push(idx); }
  return out;
}
export const take = (a, idx) => Array.from(idx, j => a[j]);
export function quantile(a, q) { const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); }
