#!/usr/bin/env node
/**
 * YIELD-SLOPE-MAGNITUDE — does the steepness of the local 1h yield leg into a predicted
 * turn scale with the SIZE of the subsequent price move? Design frozen in
 * MD files/YIELD_SLOPE_MAGNITUDE_PREREG.md BEFORE this was written. Day-clustered
 * formalisation of analysis/yield_shape_extended_theories.py's theory B.
 *
 * Reuses the cached 60-day Yahoo dataset pulled 2026-10-02 (analysis/output/yield_shape_lead/).
 *
 *   node analysis/yield_slope_magnitude_study.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'output', 'yield_shape_lead');
const OUT = path.join(__dirname, 'output', 'yield_slope_magnitude.json');

// ── pre-registered constants ──────────────────────────────────────────────────
const BAR_MIN = 15, TRAIL_BARS = 4, CORR_WINDOW_BARS = 8;
const LIVE_CONFIG = { EURUSD: { H: 15, thr: 0.7 }, GBPUSD: { H: 15, thr: 0.5 }, NZDUSD: { H: 30, thr: 0.5 }, USDCHF: { H: 60, thr: 0.5 } };
const MIN_EVENTS = 20;
const REPS = 1000, SEED = 20261004;

const mulberry32 = a => () => { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = mulberry32(SEED);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// ── CSV load: "date,value" rows, ISO-ish timestamp ----------------------------
function loadCsv(name) {
  const txt = fs.readFileSync(path.join(DATA, `${name}.csv`), 'utf8').trim().split('\n').slice(1);
  return txt.map(l => { const idx = l.indexOf(','); return { t: new Date(l.slice(0, idx).replace(' ', 'T')), v: parseFloat(l.slice(idx + 1)) }; })
    .filter(r => Number.isFinite(r.v) && !isNaN(r.t.getTime()));
}
function todGrid(rows) {
  const byTod = new Map(); // dateStr -> Map(tod -> value), insertion order per date build later
  for (const { t, v } of rows) {
    const bucketMs = Math.floor(t.getTime() / (BAR_MIN * 60_000)) * (BAR_MIN * 60_000);
    const bt = new Date(bucketMs);
    const date = bt.toISOString().slice(0, 10), tod = bt.toISOString().slice(11, 16);
    if (!byTod.has(date)) byTod.set(date, new Map());
    byTod.get(date).set(tod, v); // last value wins, same as pandas groupby().last()
  }
  return byTod; // Map(date -> Map(tod -> value))
}
function pairDays(yDates, pDates) {
  const pArr = [...pDates].sort();
  const pairs = [];
  for (const d0 of [...yDates].sort()) {
    const later = pArr.filter(d => d > d0);
    if (!later.length) continue;
    const d1 = later[0];
    if ((new Date(d1) - new Date(d0)) / 86_400_000 > 4) continue;
    pairs.push([d0, d1]);
  }
  return pairs;
}
function rollingCorr(y, p, w) {
  const n = y.length, out = new Array(n).fill(null);
  for (let i = w - 1; i < n; i++) {
    const yy = y.slice(i - w + 1, i + 1), pp = p.slice(i - w + 1, i + 1);
    const my = mean(yy), mp = mean(pp);
    let cov = 0, vy = 0, vp = 0;
    for (let k = 0; k < w; k++) { const dy = yy[k] - my, dp = pp[k] - mp; cov += dy * dp; vy += dy * dy; vp += dp * dp; }
    if (vy > 0 && vp > 0) out[i] = cov / Math.sqrt(vy * vp);
  }
  return out;
}
function slopeSign(x, i, back, fwd) {
  if (i - back < 0 || i + fwd >= x.length) return [null, null];
  return [Math.sign(x[i] - x[i - back]), Math.sign(x[i + fwd] - x[i])];
}
function spearman(xs, ys) {
  const rank = arr => { const idx = arr.map((v, i) => i).sort((a, b) => arr[a] - arr[b]); const r = new Array(arr.length);
    let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && arr[idx[j + 1]] === arr[idx[i]]) j++;
      const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k]] = avg; i = j + 1; } return r; };
  const rx = rank(xs), ry = rank(ys);
  const mx = mean(rx), my = mean(ry);
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < xs.length; i++) { const dx = rx[i] - mx, dy = ry[i] - my; cov += dx * dy; vx += dx * dx; vy += dy * dy; }
  return (vx > 0 && vy > 0) ? cov / Math.sqrt(vx * vy) : null;
}

// ── build de-clustered day-rows per pair (first qualifying event of each price-day) ──
function eventsFor(name, cfg, yieldByDate) {
  const hb = cfg.H / BAR_MIN;
  const pxRows = loadCsv(`px_${name}`);
  const pxByDate = todGrid(pxRows);
  const pairs = pairDays(yieldByDate.keys(), pxByDate.keys());
  const rows = [];
  for (const [dy, dp] of pairs) {
    const ys = yieldByDate.get(dy), ps = pxByDate.get(dp);
    const common = [...ys.keys()].filter(t => ps.has(t)).sort();
    if (common.length < CORR_WINDOW_BARS + Math.max(cfg.H / BAR_MIN, 4) + 2) continue;
    const yv = common.map(t => ys.get(t)), pv = common.map(t => ps.get(t));
    const corr = rollingCorr(yv, pv, CORR_WINDOW_BARS);
    for (let i = 0; i < common.length; i++) {
      if (corr[i] == null || Math.abs(corr[i]) <= cfg.thr) continue;
      const [yt, yf] = slopeSign(yv, i, TRAIL_BARS, hb);
      if (yt == null || yt === 0 || yf === 0 || yt === yf) continue;    // no yield turn here
      if (i + hb >= pv.length) continue;
      const yieldSlope = Math.abs(yv[i] - yv[i - TRAIL_BARS]);
      const windowMag = Math.abs(pv[i + hb] - pv[i]);
      rows.push({ date: dp, yieldSlope, windowMag });
      break;   // FIRST qualifying event of this price-day only -- de-clustering
    }
  }
  return rows;
}

function bootstrapSpearmanCI(rows) {
  const xs = rows.map(r => r.yieldSlope), ys = rows.map(r => r.windowMag);
  const obs = spearman(xs, ys);
  const boot = [];
  for (let r = 0; r < REPS; r++) {
    const bx = [], by = [];
    for (let k = 0; k < rows.length; k++) { const j = Math.floor(rnd() * rows.length); bx.push(xs[j]); by.push(ys[j]); }
    const s = spearman(bx, by); if (s != null) boot.push(s);
  }
  boot.sort((a, b) => a - b);
  const lo = boot[Math.floor(boot.length * 0.025)], hi = boot[Math.floor(boot.length * 0.975)];
  // placebo: shuffle the magnitude column against the slope column, same n
  const placebo = [];
  for (let r = 0; r < REPS; r++) {
    const shuffled = [...ys]; for (let k = shuffled.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]]; }
    const s = spearman(xs, shuffled); if (s != null) placebo.push(s);
  }
  placebo.sort((a, b) => a - b);
  const pctile = placebo.filter(v => v < obs).length / placebo.length;
  return { obs: +obs.toFixed(3), lo: +lo.toFixed(3), hi: +hi.toFixed(3), placeboPctile: +pctile.toFixed(3) };
}

function main() {
  const yieldRows = loadCsv('yield_TNX');
  const yieldByDate = todGrid(yieldRows);

  const result = { id: 'yield-slope-magnitude', ranAt: new Date().toISOString(), minEvents: MIN_EVENTS, pairs: {} };
  let passCount = 0;
  for (const [name, cfg] of Object.entries(LIVE_CONFIG)) {
    const rows = eventsFor(name, cfg, yieldByDate);
    if (rows.length < MIN_EVENTS) {
      result.pairs[name] = { n: rows.length, untestable: true };
      console.log(`${name}: n=${rows.length} UNTESTABLE (floor ${MIN_EVENTS})`);
      continue;
    }
    const half = Math.floor(rows.length / 2);
    const h1 = spearman(rows.slice(0, half).map(r => r.yieldSlope), rows.slice(0, half).map(r => r.windowMag));
    const h2 = spearman(rows.slice(half).map(r => r.yieldSlope), rows.slice(half).map(r => r.windowMag));
    const ci = bootstrapSpearmanCI(rows);
    const halvesAgree = h1 != null && h2 != null && Math.sign(h1) === Math.sign(h2) && h1 > 0 && h2 > 0;
    const ciPositive = ci.lo > 0 && ci.hi > 0;
    const placeboClears = ci.placeboPctile >= 0.95;
    const pass = ciPositive && halvesAgree && placeboClears;
    if (pass) passCount++;
    result.pairs[name] = { n: rows.length, spearman: ci.obs, lo: ci.lo, hi: ci.hi, halves: [h1 && +h1.toFixed(3), h2 && +h2.toFixed(3)],
      placeboPctile: ci.placeboPctile, halvesAgree, ciPositive, placeboClears, pass };
    console.log(`${name}: n=${rows.length}  rho=${ci.obs} [${ci.lo}, ${ci.hi}]  halves ${h1?.toFixed(2)}/${h2?.toFixed(2)}  placebo pctile ${ci.placeboPctile} -> ${pass ? 'PASS' : 'fail'}`);
  }

  result.gate = { passCount, required: 3, pass: passCount >= 3 };
  result.verdict = passCount >= 3 ? 'REAL' : Object.values(result.pairs).some(p => !p.untestable) ? 'NULL' : 'UNTESTABLE';
  console.log(`\nGATE: ${passCount}/4 pairs pass (need 3) -> VERDICT: ${result.verdict}`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log('written ' + path.relative(process.cwd(), OUT));
}

main();
