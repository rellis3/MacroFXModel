#!/usr/bin/env node
/**
 * L1 / L2 — lead-lag claims from the course notes. Design frozen in
 * MD files/LEAD_LAG_TESTS.md before this ran.
 *
 *   node analysis/lead_lag_studies.mjs [L1,L2]      (needs OANDA_KEY)
 *
 * L1: does the DE-US (and UK-US) 10-year spread lead EUR/USD (GBP/USD) by hours?
 *     Hourly OANDA bond-CFD and FX closes 2012 -> now. L1a cross-correlation vs a
 *     within-week-shuffled placebo; L1b the lesson's own divergence setup, next-24h
 *     outcome, aligned control.
 * L2: month-end rebalancing pressure on SPX500 after a strong / weak month.
 * Output analysis/output/lead_lag_studies.json + console.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchD1 } from '../js/volBacktestEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output'); fs.mkdirSync(OUT_DIR, { recursive: true });
const CACHE = path.join(__dirname, '..', 'data', 'h1cache'); fs.mkdirSync(CACHE, { recursive: true });
const ONLY = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const want = id => !ONLY || ONLY.has(id);
const H = 3600e3, SEED = 20260919, REPS = 1000;
function mulberry32(a) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmt = (x, dp = 3) => x == null || !Number.isFinite(x) ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : null; };
const corr = (x, y) => { const n = x.length; const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const isoWeek = ms => { const d = new Date(ms); const day = (d.getUTCDay() + 6) % 7; const th = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3)); const y = th.getUTCFullYear(); const w = 1 + Math.round(((th - Date.UTC(y, 0, 4)) / 864e5 - 3 + ((new Date(Date.UTC(y, 0, 4)).getUTCDay() + 6) % 7)) / 7); return `${y}-${w}`; };
const binom = (hits, n) => { const p = n ? hits / n : null; const se = n ? Math.sqrt(p * (1 - p) / n) : null; return { n, hits, p: p != null ? +p.toFixed(3) : null, lo: p != null ? +Math.max(0, p - 1.96 * se).toFixed(3) : null, hi: p != null ? +Math.min(1, p + 1.96 * se).toFixed(3) : null }; };
// ISO-week block bootstrap of a mean
function blockBoot(rows, key, seed) {
  const blocks = [...new Map(rows.map(r => [r.week, 1])).keys()]; const byW = new Map(); for (const r of rows) { if (!byW.has(r.week)) byW.set(r.week, []); byW.get(r.week).push(r[key]); }
  const rnd = mulberry32(seed); const means = [];
  for (let k = 0; k < REPS; k++) { const s = []; for (let i = 0; i < blocks.length; i++) s.push(...byW.get(blocks[Math.floor(rnd() * blocks.length)])); means.push(mean(s)); }
  means.sort((a, b) => a - b); return { mean: mean(rows.map(r => r[key])), lo: means[Math.floor(REPS * 0.025)], hi: means[Math.floor(REPS * 0.975)] };
}

// ── hourly bars, paged and cached on disk ──
const base = () => (process.env.OANDA_ENV || 'live') === 'practice' ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
async function fetchH1(sym, fromIso = '2012-01-01T00:00:00Z') {
  const f = path.join(CACHE, `${sym}_H1.json`);
  let bars = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
  let from = bars.length ? new Date(bars[bars.length - 1].t + H).toISOString() : fromIso;
  while (true) {
    const r = await fetch(`${base()}/v3/instruments/${sym}/candles?granularity=H1&price=M&from=${from}&count=5000`, { headers: { Authorization: `Bearer ${process.env.OANDA_KEY}` }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`OANDA ${sym} HTTP ${r.status}`);
    const c = ((await r.json()).candles ?? []).filter(x => x.complete && x.mid).map(x => ({ t: Date.parse(x.time), c: +x.mid.c }));
    if (!c.length) break;
    bars.push(...c.filter(x => !bars.length || x.t > bars[bars.length - 1].t));
    if (c.length < 5000) break;
    from = new Date(c[c.length - 1].t + H).toISOString();
    process.stdout.write(`\r  ${sym} ${bars.length} bars to ${new Date(bars[bars.length - 1].t).toISOString().slice(0, 10)}   `);
  }
  fs.writeFileSync(f, JSON.stringify(bars)); process.stdout.write('\n');
  return bars;
}
// align two hourly series on shared timestamps -> arrays of log returns with times
function aligned(a, b) {
  const mb = new Map(b.map(x => [x.t, x.c])); const out = [];
  for (const x of a) if (mb.has(x.t)) out.push({ t: x.t, a: x.c, b: mb.get(x.t) });
  const rows = []; for (let i = 1; i < out.length; i++) { if (out[i].t - out[i - 1].t > 4 * H) continue; rows.push({ t: out[i].t, ra: Math.log(out[i].a / out[i - 1].a), rb: Math.log(out[i].b / out[i - 1].b) }); }
  return rows;
}

const results = { ranAt: new Date().toISOString(), studies: {} };
const log = (...a) => console.log(...a);

// ═══ L1 ═══
async function L1(label, bondHome, bondUS, fxSym) {
  log(`\n═══ L1 ${label}: does the ${bondHome}-${bondUS} spread lead ${fxSym} by hours? ═══`);
  const [h, u, fx] = await Promise.all([fetchH1(bondHome), fetchH1(bondUS), fetchH1(fxSym)]);
  // spread proxy: Δlog(P_home) − Δlog(P_US)  (>0 = US yield advantage widening -> textbook: fx down)
  const hu = aligned(h, u); const mfx = new Map(aligned(fx, fx).map(r => [r.t, r.ra]));
  const rows = hu.filter(r => mfx.has(r.t)).map(r => ({ t: r.t, s: r.ra - r.rb, f: mfx.get(r.t), week: isoWeek(r.t) }));
  log(`  ${rows.length} shared hours ${new Date(rows[0].t).toISOString().slice(0, 10)} → ${new Date(rows[rows.length - 1].t).toISOString().slice(0, 10)}`);
  // L1a: cross-correlation at lags, vs placebo
  const lags = [-24, -12, -6, -3, -1, 0, 1, 2, 3, 6, 12, 24, 48];
  const xc = k => { const x = [], y = []; for (let i = Math.max(0, -k); i + Math.max(0, k) < rows.length; i++) { x.push(rows[i].s); y.push(rows[i + k].f); } return corr(x, y); };
  const rho = Object.fromEntries(lags.map(k => [k, +xc(k).toFixed(4)]));
  // placebo: shuffle s within each ISO week, 200 reps, take |rho| 95th pct at each positive lag
  const rnd = mulberry32(SEED); const byWeek = new Map(); rows.forEach((r, i) => { if (!byWeek.has(r.week)) byWeek.set(r.week, []); byWeek.get(r.week).push(i); });
  const plac = {}; for (const k of [1, 3, 6, 12, 24]) plac[k] = [];
  for (let rep = 0; rep < 200; rep++) {
    const sh = rows.map(r => r.s); for (const idx of byWeek.values()) { for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[idx[i]], sh[idx[j]]] = [sh[idx[j]], sh[idx[i]]]; } }
    for (const k of [1, 3, 6, 12, 24]) { const x = [], y = []; for (let i = 0; i + k < rows.length; i++) { x.push(sh[i]); y.push(rows[i + k].f); } plac[k].push(Math.abs(corr(x, y))); }
  }
  const plac95 = Object.fromEntries(Object.entries(plac).map(([k, v]) => [k, +v.sort((a, b) => a - b)[Math.floor(v.length * 0.95)].toFixed(4)]));
  // cumulative: sum of rho over 1..24 (the "lead" in total), vs placebo of the same sum
  log('  ρ(k) spread(t) vs fx(t+k):', lags.map(k => `${k}h ${fmt(rho[k], 3)}`).join('  '));
  log('  placebo 95th |ρ| at +1/+3/+6/+12/+24h:', Object.entries(plac95).map(([k, v]) => `${k}h ${v}`).join('  '));
  const byYear = {}; for (const r of rows) { const y = new Date(r.t).getUTCFullYear(); (byYear[y] ??= []).push(r); }
  const yr = Object.fromEntries(Object.entries(byYear).filter(([, v]) => v.length > 2000).map(([y, v]) => { const x0 = [], y0 = [], x1 = [], y1 = [], x24 = [], y24 = []; for (let i = 0; i + 24 < v.length; i++) { x0.push(v[i].s); y0.push(v[i].f); x1.push(v[i].s); y1.push(v[i + 1].f); x24.push(v[i].s); y24.push(v[i + 24].f); } return [y, { r0: +corr(x0, y0).toFixed(3), r1: +corr(x1, y1).toFixed(3), r24: +corr(x24, y24).toFixed(3), n: v.length }]; }));
  log('  by year (ρ0 / ρ+1h / ρ+24h):', Object.entries(yr).map(([y, v]) => `${y} ${fmt(v.r0, 2)}/${fmt(v.r1, 2)}/${fmt(v.r24, 2)}`).join('  '));
  // L1b: the divergence setup
  const W = 24; const setups = [], alignedCtl = []; let lastTaken = -Infinity;
  const s24 = [], f24 = []; for (let i = W; i < rows.length; i++) { let ss = 0, ff = 0; for (let j = i - W + 1; j <= i; j++) { ss += rows[j].s; ff += rows[j].f; } s24.push(ss); f24.push(ff); }
  const idx0 = W; // s24[i-W] corresponds to rows[i]
  const trailingSd = (arr, i, n = 250 * 24) => { const from = Math.max(0, i - n); const sl = arr.slice(from, i); return sl.length > 500 ? sd(sl) : null; };
  for (let i = W; i + W < rows.length; i++) {
    const k = i - idx0; const sig = trailingSd(s24, k), sigF = trailingSd(f24, k); if (!sig || !sigF) continue;
    const zS = s24[k] / sig, zF = f24[k] / sigF; if (Math.abs(zS) < 1) continue;
    if (rows[i].t - lastTaken < W * H) continue;
    // next-24h fx return
    let nf = 0; for (let j = i + 1; j <= i + W; j++) nf += rows[j].f;
    const expectedSign = zS > 0 ? -1 : 1;   // US advantage widening -> fx down
    const withSpread = Math.sign(zF) === expectedSign && Math.abs(zF) >= 0.25;
    const diverged = Math.abs(zF) < 0.25 || Math.sign(zF) !== expectedSign;
    const rec = { t: rows[i].t, week: rows[i].week, zS: +zS.toFixed(2), zF: +zF.toFixed(2), next: +(nf / sigF).toFixed(3), inDir: +(expectedSign * nf / sigF).toFixed(3), hit: Math.sign(nf) === expectedSign ? 1 : 0 };
    if (diverged) { setups.push(rec); lastTaken = rows[i].t; } else if (withSpread) { alignedCtl.push(rec); lastTaken = rows[i].t; }
  }
  const sc = (arr, seed) => ({ ...binom(arr.reduce((s, r) => s + r.hit, 0), arr.length), inDir: blockBoot(arr, 'inDir', seed) });
  const dv = sc(setups, SEED + 1), al = sc(alignedCtl, SEED + 2);
  log(`  L1b divergence setups n=${dv.n}: next-24h in the spread's direction ${dv.hits}/${dv.n} = ${dv.p} [${dv.lo}–${dv.hi}]; mean ${fmt(dv.inDir.mean)}σ [${fmt(dv.inDir.lo)}, ${fmt(dv.inDir.hi)}]`);
  log(`  L1b aligned control  n=${al.n}: ${al.hits}/${al.n} = ${al.p} [${al.lo}–${al.hi}]; mean ${fmt(al.inDir.mean)}σ [${fmt(al.inDir.lo)}, ${fmt(al.inDir.hi)}]`);
  const bigS = setups.filter(r => Math.abs(r.zS) >= 2); const bs = bigS.length >= 20 ? sc(bigS, SEED + 3) : null;
  if (bs) log(`  L1b big divergences (|z|≥2) n=${bs.n}: ${bs.hits}/${bs.n} = ${bs.p} [${bs.lo}–${bs.hi}]; mean ${fmt(bs.inDir.mean)}σ`);
  const pass = dv.n >= 100 && dv.lo > 0.5 && dv.inDir.mean >= 0.15 && dv.inDir.lo > 0;
  const verdict = pass ? (al.p >= dv.p ? 'hit rate clears but the aligned control does as well -- momentum in the spread, not a lag' : 'PASS') : 'NULL';
  log(`  → ${verdict}`);
  results.studies[`L1_${label}`] = { rows: rows.length, rho, placebo95: plac95, byYear: yr, divergence: dv, aligned: al, big: bs, verdict };
}

// ═══ L2 ═══
async function L2() {
  log('\n═══ L2 month-end rebalancing pressure, SPX500 ═══');
  const d = (await fetchD1('SPX500_USD', 5000)).filter(b => b.close > 0);
  const byM = new Map(); for (let i = 0; i < d.length; i++) { const m = d[i].date.slice(0, 7); if (!byM.has(m)) byM.set(m, []); byM.get(m).push(i); }
  const months = [...byM.entries()].filter(([, ix]) => ix.length >= 15).map(([m, ix]) => { const i0 = ix[0], iT3 = ix[ix.length - 4], iEnd = ix[ix.length - 1]; const mtd = d[iT3].close / d[i0 - 1 >= 0 ? i0 - 1 : i0].close - 1; const last3 = d[iEnd].close / d[iT3].close - 1; return { m, mtd, last3, week: m }; });
  const q = [...months].sort((a, b) => a.mtd - b.mtd); const nq = Math.floor(q.length / 5);
  const weak = q.slice(0, nq), strong = q.slice(-nq), mid = q.slice(nq, -nq);
  // random 3-session returns inside months as the unconditional
  const rnd = mulberry32(SEED + 9); const rand = []; for (let k = 0; k < 2000; k++) { const i = 5 + Math.floor(rnd() * (d.length - 10)); rand.push(d[i + 3].close / d[i].close - 1); }
  const rep = (arr, seed) => { const bb = blockBoot(arr, 'last3', seed); const neg = arr.filter(x => x.last3 < 0).length; return { n: arr.length, mean: +bb.mean.toFixed(5), lo: +bb.lo.toFixed(5), hi: +bb.hi.toFixed(5), negShare: binom(neg, arr.length) }; };
  const S = rep(strong, SEED + 4), Wk = rep(weak, SEED + 5), M = rep(mid, SEED + 6);
  log(`  months ${months.length} (${months[0].m} → ${months[months.length - 1].m}); quintile size ${nq}`);
  log(`  after a STRONG month: last-3-session return ${fmt(S.mean * 100, 2)}% [${fmt(S.lo * 100, 2)}, ${fmt(S.hi * 100, 2)}], negative ${S.negShare.hits}/${S.negShare.n} = ${S.negShare.p} [${S.negShare.lo}–${S.negShare.hi}]`);
  log(`  after a WEAK month:   last-3-session return ${fmt(Wk.mean * 100, 2)}% [${fmt(Wk.lo * 100, 2)}, ${fmt(Wk.hi * 100, 2)}], negative ${Wk.negShare.p} [${Wk.negShare.lo}–${Wk.negShare.hi}]`);
  log(`  ordinary months:      ${fmt(M.mean * 100, 2)}% [${fmt(M.lo * 100, 2)}, ${fmt(M.hi * 100, 2)}], negative ${M.negShare.p}; any 3 sessions: mean ${fmt(mean(rand) * 100, 2)}%, negative ${(rand.filter(x => x < 0).length / rand.length).toFixed(3)}`);
  const pass = S.hi < 0 && S.negShare.lo > 0.5;
  const verdict = S.n < 40 ? `base rate only (n=${S.n} under the bar): ${pass ? 'direction as claimed' : 'no rebalancing drag visible'}` : pass ? 'PASS' : 'NULL';
  log(`  → ${verdict}`);
  results.studies.L2 = { months: months.length, strong: S, weak: Wk, mid: M, random: { mean: mean(rand), negShare: rand.filter(x => x < 0).length / rand.length }, verdict };
}

if (want('L1')) { await L1('EURUSD', 'DE10YB_EUR', 'USB10Y_USD', 'EUR_USD'); await L1('GBPUSD', 'UK10YB_GBP', 'USB10Y_USD', 'GBP_USD'); }
if (want('L2')) await L2();
fs.writeFileSync(path.join(OUT_DIR, 'lead_lag_studies.json'), JSON.stringify(results, null, 1));
log('\nwritten analysis/output/lead_lag_studies.json');
