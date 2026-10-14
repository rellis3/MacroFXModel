// Per-instrument calibration of the OI touch-probability model (js/oiReachability.js).
//
// WHY: the shipped map was fitted on EUR/USD only, at targets 0.5-2.0 sigma from price (reachabilityCalibration's targetMults).
// Two consequences seen live 2026-10-14: (1) levels CLOSER than 0.5 sigma — i.e. the walls that actually matter intraday —
// were never in the fit, so the map flat-tops at 68% (1h) / 59% (4h) and a level 0.05% from price scored 59%; (2) the 1h/4h/8h
// maps disagree, so 4h could come out BELOW 1h. And every other instrument borrowed EUR/USD's curve.
//
// DESIGN (exploratory, not pre-registered; calibration of an existing display number, no strategy claim):
//   data    local M1 -> M5, 2026-02-01 .. 2026-08-21 (lockbox start is 2026-08-22: nothing after is touched)
//   targets mu x sdH from the cone, mu in 0.02..3, both sides  (adds the missing near-price region)
//   truth   did a bar in [i, i+H) reach the target (wick counts) — same definition as the simulator
//   split   train = first 60% of windows by time, test = last 40% (time-ordered, no shuffling)
//   fits    (a) shipped EUR/USD curve  (b) pooled-all isotonic  (c) per-asset-class isotonic  (d) per-instrument isotonic
//   score   mean |predicted - realised| over 10 raw-prob bins (weighted by n), and Brier, on TEST only
//
//   node analysis/reach_calibration_study.mjs [--only eurusd,nq] [--paths 200]
import fs from 'fs';
import path from 'path';
import { loadM1ForPairLocal } from '../js/localM1Loader.js';
import { buildIntradayContext, intradayCone, intradayReachability } from '../js/forecastPathCore.js';
import { REACH_CALIB, REACH_CALIB_H48, calibrateTouch } from '../js/oiReachability.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
const NPATHS = +arg('paths', 200);
const OUT = path.join('analysis', 'output', 'reach_calibration'); fs.mkdirSync(OUT, { recursive: true });
const INSTR = { eurusd: 'fx', gbpusd: 'fx', usdjpy: 'fx', audusd: 'fx', gold: 'gold', nq: 'index', spx: 'index', us2000: 'index', us30: 'index' };
const HS = [12, 48, 96];
const MUS = [0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0];
const T0 = Date.UTC(2026, 1, 1) / 1000, T1 = Date.UTC(2026, 7, 22) / 1000;   // [Feb 1, Aug 22)

function m5(m) {
  const out = []; let cur = null;
  for (let k = 0; k < m.n; k++) { const t = m.times[k]; if (t < T0 || t >= T1) continue;
    const b = t - (t % 300);
    if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: m.opens[k], high: m.highs[k], low: m.lows[k], close: m.closes[k] }; }
    else { if (m.highs[k] > cur.high) cur.high = m.highs[k]; if (m.lows[k] < cur.low) cur.low = m.lows[k]; cur.close = m.closes[k]; } }
  if (cur) out.push(cur); return out;
}

// pool-adjacent-violators isotonic regression on (x,y) sorted by x
function isotonic(pts) {
  const s = pts.slice().sort((a, b) => a[0] - b[0]); const blocks = [];
  for (const [x, y] of s) { blocks.push({ sx: x, sy: y, n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sy / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sy / blocks[blocks.length - 1].n) {
      const b = blocks.pop(), a = blocks.pop(); blocks.push({ sx: a.sx + b.sx, sy: a.sy + b.sy, n: a.n + b.n }); } }
  return blocks.map(b => [b.sx / b.n, b.sy / b.n, b.n]);
}
// compress an isotonic step function to <=K knots [rawMean, realised] (equal-count groups)
function knots(pts, K = 14) {
  const iso = isotonic(pts); if (!iso.length) return [];
  const tot = iso.reduce((a, b) => a + b[2], 0), per = tot / K; const out = []; let acc = 0, sx = 0, sy = 0, c = 0;
  for (const [x, y, n] of iso) { acc += n; sx += x * n; sy += y * n; c += n; if (acc >= per) { out.push([sx / c, sy / c]); acc = 0; sx = sy = c = 0; } }
  if (c) out.push([sx / c, sy / c]);
  // monotone + anchor the origin
  let best = 0; return out.map(([x, y]) => { best = Math.max(best, y); return [+x.toFixed(4), +best.toFixed(4)]; });
}
function apply(curve, p) {   // piecewise-linear through (0,0) and the knots; flat above the top knot
  if (!(p > 0)) return 0; const c = curve; if (!c.length) return p;
  if (p <= c[0][0]) return c[0][1] * (p / (c[0][0] || 1));
  for (let i = 1; i < c.length; i++) if (p <= c[i][0]) { const [x0, y0] = c[i - 1], [x1, y1] = c[i]; return y0 + (y1 - y0) * ((p - x0) / ((x1 - x0) || 1)); }
  return c[c.length - 1][1];
}
function score(rows, f) {   // rows: [raw, hit]
  if (!rows.length) return null; const bins = Array.from({ length: 10 }, () => ({ sp: 0, h: 0, n: 0 })); let br = 0;
  for (const [raw, hit] of rows) { const p = Math.min(1, Math.max(0, f(raw))); const b = Math.min(9, Math.floor(p * 10)); bins[b].sp += p; bins[b].h += hit; bins[b].n++; br += (p - hit) ** 2; }
  const ece = bins.reduce((a, b) => a + (b.n ? Math.abs(b.sp / b.n - b.h / b.n) * b.n : 0), 0) / rows.length;
  const worst = Math.max(...bins.filter(b => b.n >= 30).map(b => Math.abs(b.sp / b.n - b.h / b.n)), 0);
  return { n: rows.length, eceP: +(ece * 100).toFixed(2), brier: +(br / rows.length).toFixed(4), worstBinP: +(worst * 100).toFixed(1) };
}

const DATA = {};   // key -> { H -> [{t, raw, hit, mu}] }
for (const key of Object.keys(INSTR)) {
  if (ONLY.length && !ONLY.includes(key)) continue;
  const t0 = Date.now(); const m = await loadM1ForPairLocal(key); if (!m) { console.log(key, 'no M1'); continue; }
  const bars = m5(m); if (bars.length < 5000) { console.log(key, 'too few bars', bars.length); continue; }
  const ctx = buildIntradayContext(bars, {}); DATA[key] = {};
  for (const H of HS) {
    const rows = [];
    for (let i = 300; i + H <= bars.length; i += H) {
      if (bars[i + H - 1].time - bars[i - 1].time > (H + 4) * 300) continue;          // window spans a weekend / gap
      const cone = intradayCone(ctx, i, H); if (!cone) continue;
      const last = cone.steps[H - 1], sdH = Math.log(last.p75Up / last.center) / 0.6745; if (!(sdH > 0)) continue;
      const anchor = cone.anchor; let hi = -Infinity, lo = Infinity;
      for (let h = 0; h < H; h++) { const b = bars[i + h]; if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
      for (const mu of MUS) for (const sg of [1, -1]) {
        const target = anchor * Math.exp(sg * mu * sdH); const r = intradayReachability(ctx, i, target, H, { nPaths: NPATHS }); if (!r) continue;
        rows.push({ t: bars[i].time, raw: r.pTouch, hit: (sg > 0 ? hi >= target : lo <= target) ? 1 : 0, mu });
      }
    }
    DATA[key][H] = rows;
  }
  console.log(key, 'bars', bars.length, HS.map(H => H + 'h:' + DATA[key][H].length).join(' '), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}

// ── fit + score ───────────────────────────────────────────────────────────────
const result = { generated: new Date().toISOString(), window: '2026-02-01..2026-08-21', split: 'first 60% of windows train / last 40% test', nPaths: NPATHS, mus: MUS, horizons: {} };
const oldCurve = H => (H === 12 ? REACH_CALIB : REACH_CALIB_H48);
const split = rows => { const ts = rows.map(r => r.t).sort((a, b) => a - b); const cut = ts[Math.floor(ts.length * 0.6)]; return [rows.filter(r => r.t < cut), rows.filter(r => r.t >= cut)]; };
for (const H of HS) {
  const R = result.horizons[H] = { instruments: {}, classes: {}, pooled: null };
  const tr = {}, te = {}; for (const k of Object.keys(DATA)) [tr[k], te[k]] = split(DATA[k][H]);
  const cls = k => INSTR[k];
  const pool = (keys, src) => keys.flatMap(k => src[k]);
  const all = Object.keys(DATA);
  const pooledCurve = knots(pool(all, tr).map(r => [r.raw, r.hit]));
  R.pooled = { curve: pooledCurve };
  for (const c of [...new Set(all.map(cls))]) { const ks = all.filter(k => cls(k) === c); R.classes[c] = { members: ks, curve: knots(pool(ks, tr).map(r => [r.raw, r.hit])) }; }
  for (const k of all) {
    const own = knots(tr[k].map(r => [r.raw, r.hit])), cl = R.classes[cls(k)].curve, T = te[k].map(r => [r.raw, r.hit]);
    R.instruments[k] = { trainN: tr[k].length, testN: T.length, curve: own,
      oos: { raw: score(T, x => x), shippedEURUSD: score(T, x => calibrateTouch(x, oldCurve(H))), pooled: score(T, x => apply(pooledCurve, x)),
             assetClass: score(T, x => apply(cl, x)), ownCurve: score(T, x => apply(own, x)) } };
  }
  // near-price reality check: realised touch frequency for the closest targets, whole sample
  R.nearPrice = Object.fromEntries(all.map(k => [k, MUS.slice(0, 4).map(mu => { const rr = DATA[k][H].filter(r => r.mu === mu); return { mu, n: rr.length, realised: +(rr.reduce((a, r) => a + r.hit, 0) / Math.max(1, rr.length)).toFixed(3), rawMean: +(rr.reduce((a, r) => a + r.raw, 0) / Math.max(1, rr.length)).toFixed(3) }; })]));
}
fs.writeFileSync(path.join(OUT, 'curves.json'), JSON.stringify(result, null, 1));
// console summary
for (const H of HS) { console.log(`\n=== H=${H} (${H * 5} min) — OOS mean |pred-realised| in pp (lower is better); worst bin in brackets ===`);
  console.log('instrument  n_test   raw   shippedEUR  pooled  class  own');
  for (const [k, v] of Object.entries(result.horizons[H].instruments)) { const o = v.oos, f = s => s ? `${s.eceP}(${s.worstBinP})`.padEnd(11) : '—'.padEnd(11);
    console.log(k.padEnd(11), String(v.testN).padEnd(7), f(o.raw), f(o.shippedEURUSD), f(o.pooled), f(o.assetClass), f(o.ownCurve)); } }
