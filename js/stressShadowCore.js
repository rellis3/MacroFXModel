// js/stressShadowCore.js — the stress-count shadow band (forge/FORECAST_MISS_SCAN_PREREG.md, amendment A1).
//
// WHY: forecast-miss-scan (8/34 confirmed 2026-10-27) found the shipped range lines run about 5% too wide when markets
// are calm and too narrow as equity/vol stress conditions stack (FX and indices), and too narrow for FX at month-end.
// This module counts the conditions known before the London open, builds the SHADOW lines (live ladder x factor) and
// scores them beside live on EVERY session. It never changes the live ladder (side-by-side rule): pure functions, no I/O.
import { classOf } from './drawdownShadowCore.js';

export const RULE = Object.freeze({
  // full-sample top-tercile edges from the scan (A1); each is known before London 00:00
  edges: Object.freeze({ spx5: -0.34, vixChg5: 0.67, vix: 20.95, vixTerm: 0.910, spx60: 2.26 }),
  fxFactor: Object.freeze([0.95, 1.00, 1.00, 1.00, 1.06, 1.15]),   // by number of the 5 conditions active
  monthEnd: 1.067,                                                // FX only, multiplicative
  idxFactor: Object.freeze([0.96, 1.02, 1.06]),                   // by number of (5d S&P fall, 5d VIX rise) active
  start: '2026-10-28',
  judgeAt: 120,                                                   // sessions (every session counts)
});
const QS = ['hl', 'oh', 'ol', 'oc'], RS = ['p50', 'p75', 'p90'];
const logRet = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? 100 * Math.log(a / b) : null);

/** Values known before a session: spx = [{t (close, sec), c}] ascending; vix/vix3m = [{date, value}] ascending (CBOE closes). */
export function inputsAsOf({ spx, vix, vix3m }, sessionDate, sessionMidnightSec) {
  const s = spx.filter(k => k.t <= sessionMidnightSec).map(k => k.c);
  const v = vix.filter(x => x.date < sessionDate).map(x => x.value);
  const v3 = vix3m.filter(x => x.date < sessionDate);
  const at = (a, k) => (a.length > k ? a[a.length - 1 - k] : null);
  const vNow = at(v, 0), v3Now = v3.length ? v3[v3.length - 1] : null;
  return {
    spx5: logRet(at(s, 0), at(s, 5)), spx60: logRet(at(s, 0), at(s, 60)),
    vix: vNow, vixChg5: Number.isFinite(vNow) && Number.isFinite(at(v, 5)) ? vNow - at(v, 5) : null,
    // VIX3M must be the same CBOE day as the VIX close it divides
    vixTerm: Number.isFinite(vNow) && v3Now && v3Now.date === vix.filter(x => x.date < sessionDate).at(-1)?.date ? vNow / v3Now.value : null,
  };
}

/** Which conditions are active; null inputs count as inactive and are listed as missing. */
export function conditions(inp) {
  const E = RULE.edges, f = (v, ok) => (Number.isFinite(v) ? ok(v) : null);
  const c = {
    spx5Fall: f(inp.spx5, v => v <= E.spx5), vixRise: f(inp.vixChg5, v => v >= E.vixChg5), vixHigh: f(inp.vix, v => v >= E.vix),
    vixInverted: f(inp.vixTerm, v => v >= E.vixTerm), spx60Fall: f(inp.spx60, v => v <= E.spx60),
  };
  const missing = Object.keys(c).filter(k => c[k] === null);
  return { ...c, fxCount: Object.values(c).filter(Boolean).length, idxCount: [c.spx5Fall, c.vixRise].filter(Boolean).length, missing };
}

/** Last 2 or first 2 London weekdays of the month (holidays not removed; the scan used the forecaster's session days). */
export function isMonthEnd(date) {
  const d = new Date(date + 'T12:00:00Z'), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const days = [];
  for (let k = 1; k <= 31; k++) { const x = new Date(Date.UTC(y, m, k, 12)); if (x.getUTCMonth() !== m) break; if (![0, 6].includes(x.getUTCDay())) days.push(x.toISOString().slice(0, 10)); }
  const i = days.indexOf(date);
  return i >= 0 && (i <= 1 || i >= days.length - 2);
}

export function factorFor(cls, cond, monthEnd) {
  if (cls === 'fx') return +(RULE.fxFactor[cond.fxCount] * (monthEnd ? RULE.monthEnd : 1)).toFixed(4);
  if (cls === 'idx') return RULE.idxFactor[cond.idxCount];
  return null;
}

export function shadowLadder(sym, liveFlat, cond, monthEnd) {
  const cls = classOf(sym);
  if (!liveFlat || !cls) return null;
  const f = factorFor(cls, cond, monthEnd), out = {};
  for (const [k, v] of Object.entries(liveFlat)) out[k] = Number.isFinite(v) ? +(v * f).toPrecision(8) : v;
  return { factor: f, flat: out };
}

export function scoreRow(sym, liveFlat, sess, cond, monthEnd) {
  const sh = shadowLadder(sym, liveFlat, cond, monthEnd);
  if (!sh || !sess || sess.error || !Number.isFinite(sess.hl)) return null;
  const real = { hl: sess.hl, oh: sess.oh, ol: sess.ol, oc: Number.isFinite(sess.oc) ? Math.abs(sess.oc) : null };
  const hit = flat => {
    const o = {};
    for (const q of QS) for (const p of RS) {
      const v = flat[`${q}_${p}`];
      if (Number.isFinite(v) && Number.isFinite(real[q])) o[`${q}_${p}`] = real[q] > v ? 1 : 0;
    }
    return o;
  };
  return { sym, cls: classOf(sym), factor: sh.factor, live: hit(liveFlat), shadow: hit(sh.flat) };
}

// small seeded generator so the CI is reproducible between calls
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** Date-clustered bootstrap CI of the improvement |live p75 rate - 25%| - |shadow p75 rate - 25%| (+ = shadow better). */
export function improvementCI(byDate, B = 2000, seed = 20261028) {
  if (byDate.length < 10) return null;
  const r = rng(seed), stat = ds => {
    let n = 0, l = 0, s = 0;
    for (const d of ds) { n += d.n; l += d.live; s += d.shadow; }
    return n ? Math.abs(l / n - 0.25) - Math.abs(s / n - 0.25) : NaN;
  };
  const out = [];
  for (let b = 0; b < B; b++) out.push(stat(byDate.map(() => byDate[Math.floor(r() * byDate.length)])));
  out.sort((a, b) => a - b);
  return [+out[Math.floor(0.025 * B)].toFixed(4), +out[Math.floor(0.975 * B) - 1].toFixed(4)];
}

/** Scorecard over [{date, rows:[scoreRow]}]: HL p50/p75/p90 exceedance, live vs shadow, per class, every session. */
export function scorecard(days) {
  const out = {};
  for (const cls of ['fx', 'idx']) {
    const rows = days.flatMap(d => d.rows.filter(r => r && r.cls === cls));
    const rate = (arm, k) => { const v = rows.map(r => r[arm][k]).filter(x => x === 0 || x === 1); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(4) : null; };
    const byDate = days.map(d => {
      const v = d.rows.filter(r => r && r.cls === cls && (r.live.hl_p75 === 0 || r.live.hl_p75 === 1));
      return { n: v.length, live: v.reduce((a, r) => a + r.live.hl_p75, 0), shadow: v.reduce((a, r) => a + r.shadow.hl_p75, 0) };
    }).filter(d => d.n);
    out[cls] = {
      sessions: byDate.length, rows: rows.length,
      hl_p50: { live: rate('live', 'hl_p50'), shadow: rate('shadow', 'hl_p50'), target: 0.50 },
      hl_p75: { live: rate('live', 'hl_p75'), shadow: rate('shadow', 'hl_p75'), target: 0.25 },
      hl_p90: { live: rate('live', 'hl_p90'), shadow: rate('shadow', 'hl_p90'), target: 0.10 },
      p75ImprovementCI: improvementCI(byDate),
    };
  }
  return { sessions: days.length, judgeAt: RULE.judgeAt, ready: days.length >= RULE.judgeAt, byClass: out };
}
