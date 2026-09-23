// Synthetic checks for bandFade.js — run: node js/bandFade/bandFade.test.mjs
import {
  BAND_FADE_DEFAULTS as D, kappa, foldWeekends, bandFeatures, unionCalendar, outsideCell, bucketTest,
  stackTest, shuffledNull, readBucket, alignPanel, covSeries, fadeSchedule, runSizedBook, randomSchedule,
} from './bandFade.js';
import { mulberry32 } from '../statsCore.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('FAIL:', msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b} ± ${tol})`);

function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function weekdays(n, start = '2016-01-04') {
  const out = []; let t = Date.parse(start + 'T00:00:00Z');
  while (out.length < n) { const d = new Date(t); if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10)); t += 86_400_000; }
  return out;
}
// phi = 1 → random walk; phi < 1 → log price mean-reverts to 0.
// transient > 0 → random walk + a decaying shock component (AR(1), decay 0.8):
// the realistic planted reversion — stretches happen and then partly unwind.
function series(n, rng, { sigma = 0.006, phi = 1, transient = 0 } = {}) {
  const dates = weekdays(n); let x = 0, rw = 0, tr = 0; const bars = [];
  for (let t = 0; t < n; t++) {
    const prev = x;
    if (transient > 0) { rw += sigma * gauss(rng); tr = 0.8 * tr + transient * gauss(rng); x = rw + tr; }
    else x = phi * x + sigma * gauss(rng);
    const c = Math.exp(x) * 1.2, p = Math.exp(prev) * 1.2;
    bars.push({ date: dates[t], open: p, high: Math.max(p, c) * (1 + 0.002 * rng()), low: Math.min(p, c) * (1 - 0.002 * rng()), close: c });
  }
  return bars;
}
const inst = (key, bars) => ({ key, costRtPct: 0.01, f: bandFeatures(bars, D) });

// ── weekend folding ──
{
  const t = s => Date.parse(s + 'T00:00:00Z') / 1000;
  const out = foldWeekends([
    { time: t('2026-09-18'), open: 1, high: 1.1, low: 0.9, close: 1.0 },
    { time: t('2026-09-20'), open: 1.01, high: 1.3, low: 1.0, close: 1.02 },   // Sunday stub
    { time: t('2026-09-21'), open: 1.02, high: 1.05, low: 0.95, close: 1.04 },
  ]);
  ok(out.length === 2, 'Sunday is not a bar of its own');
  ok(out[1].date === '2026-09-21' && out[1].open === 1.01 && out[1].high === 1.3 && out[1].low === 0.95 && out[1].close === 1.04, 'Sunday folded into Monday (open, high, low merged)');
}

// ── κ makes |z| a random-walk sd ──
{
  const rng = mulberry32(1);
  const f = bandFeatures(series(6000, rng), D);
  const zs = f.z.filter(Number.isFinite);
  const sd = Math.sqrt(zs.reduce((s, x) => s + x * x, 0) / zs.length);
  near(sd, 1, 0.12, 'z has ~unit sd on a random walk');
  near(kappa(20), 2.234, 0.01, 'κ(20)');
  const frac = zs.filter(x => Math.abs(x) >= 2).length / zs.length;
  ok(frac > 0.02 && frac < 0.09, `|z| ≥ 2 is a tail event on a random walk (${(frac * 100).toFixed(1)}%)`);
}

// ── no lookahead in features ──
{
  const bars = series(800, mulberry32(2));
  const full = bandFeatures(bars, D), cut = bandFeatures(bars.slice(0, 500), D);
  let maxd = 0;
  for (const k of ['z', 'kz', 'bz', 'sigma', 'fair', 'adx']) for (let t = 0; t < 500; t++) {
    const a = full[k][t], b = cut[k][t];
    if (Number.isFinite(a) || Number.isFinite(b)) maxd = Math.max(maxd, Math.abs(a - b));
  }
  ok(maxd < 1e-12, `features at t use data ≤ t (max Δ ${maxd})`);
}

// ── stage 1: random walks → no edge; planted reversion → edge ──
const rwInsts = Array.from({ length: 8 }, (_, k) => inst('rw' + k, series(2500, mulberry32(100 + k))));
const ouInsts = Array.from({ length: 8 }, (_, k) => inst('ou' + k, series(2500, mulberry32(200 + k), { sigma: 0.004, transient: 0.006 })));
{
  const cal = unionCalendar(rwInsts), split = cal[Math.floor(cal.length * 0.6)];
  const rw = outsideCell(rwInsts, { h: 5, cal, splitDate: split });
  ok(rw.n > 50 && Math.abs(rw.t) < 2.5, `random walk: no bucket edge (t ${rw.t}, n ${rw.n})`);
  const ou = outsideCell(ouInsts, { h: 5, cal, splitDate: split });
  ok(ou.t > 3 && ou.mean > 0 && ou.isMean > 0 && ou.oosMean > 0, `planted reversion found (t ${ou.t})`);
  const nd = shuffledNull(ouInsts, { h: 5, cal, splitDate: split, draws: 30, seed: 7 });
  ok(nd.p95 < 2.5 && ou.t > nd.p95, `shuffled null removes the planted reversion (p95 ${nd.p95} vs real ${ou.t})`);
  const rd = readBucket(ou, nd);
  ok(rd.checks.tGe2 && rd.checks.beatsShuffledNull && rd.checks.isAndOosPositive, 'readBucket passes the planted edge on t / null / IS-OOS');
  const bt = bucketTest(ouInsts, { h: 5, cal, splitDate: split });
  console.log('  planted buckets:', bt.map(b => `${b.bucket}:${b.mean}(n${b.n})`).join(' '), '| t', ou.t);
  const filled = bt.filter(b => b.mean != null);
  ok(bt.length === 6 && filled.every((b, i) => i === 0 || b.mean > filled[i - 1].mean), 'bucket means rise monotonically with stretch on planted reversion');
  const st = stackTest(ouInsts, { h: 5, cal, splitDate: split });
  ok(st.length === 4 && st.reduce((s, x) => s + x.n, 0) > 0, 'stack test returns 0–3 cells');
}

// ── fade rule mechanics ──
{
  const cal = weekdays(12);
  const zrow = [NaN, 0.5, 2.2, 1.8, 0.4, -0.1, 2.5, 2.6, 2.1, 1.0, 2.3, 2.4];
  const panel = { cal, keys: ['x'], z: [zrow] };
  const s = fadeSchedule(panel, { ...D, maxHold: 10 });
  ok(s.length === 2, `two trades (got ${s.length})`);
  ok(s[0].entryT === 2 && s[0].dir === -1 && s[0].exitT === 5 && s[0].exitReason === 'fair-value', 'first: short at z 2.2, out when z crosses 0');
  ok(s[1].entryT === 6, 'second entry needs the re-arm (z 0.5 < 1.5 before) — at z 2.5');
  const s2 = fadeSchedule(panel, { ...D, maxHold: 2 });
  ok(s2[0].exitT === 4 && s2[0].exitReason === 'time', 'time stop after maxHold bars');
  ok(!s2.some(tr => tr.entryT === 8), 'no re-entry while still stretched (disarmed)');
}

// ── the sized book: vol target, cap, cost & P&L attribution, no lookahead ──
{
  const insts = Array.from({ length: 4 }, (_, k) => inst('i' + k, series(1500, mulberry32(300 + k), { phi: 0.98 })));
  const cal = unionCalendar(insts), panel = alignPanel(insts, cal), cov = covSeries(panel, D.covWindow);
  const sched = fadeSchedule(panel, D);
  const cost = panel.keys.map(() => 0.0001);
  const b = runSizedBook({ panel, cov, schedule: sched, costOneWay: cost, o: D });
  ok(sched.length > 20, `trades generated (${sched.length})`);
  const sumTrades = b.trades.reduce((s, t) => s + t.retPct, 0) / 100;
  const sumBook = b.net.reduce((s, x) => s + x, 0);
  near(sumTrades, sumBook, b.trades.length * 1e-6, 'per-trade net sums to the book net');
  const sumTC = b.trades.reduce((s, t) => s + t.costPct, 0) / 100, sumC = b.costs.reduce((s, x) => s + x, 0);
  near(sumTC, sumC, b.trades.length * 1e-6, 'every cost (incl. exits) is owned by a trade');
  ok(Math.max(...b.leverage) <= D.maxGross + 1e-9, 'gross never exceeds the cap');
  const capped = runSizedBook({ panel, cov, schedule: sched, costOneWay: cost, o: { ...D, maxGross: 0.5 }, withTrades: false });
  ok(Math.max(...capped.leverage) <= 0.5 + 1e-9, 'a tighter cap binds');
  // realized vol on active days near the target (planted OU, 4 names)
  const act = b.net.filter((_, t) => b.leverage[t] > 0);
  const m = act.reduce((s, x) => s + x, 0) / act.length;
  const vol = Math.sqrt(act.reduce((s, x) => s + (x - m) ** 2, 0) / (act.length - 1)) * Math.sqrt(252);
  ok(vol > 0.06 && vol < 0.16, `realized vol near the 10% target when active (${(vol * 100).toFixed(1)}%)`);
  // no lookahead: truncate the future → the earlier book is identical
  const cut = 900;
  const insts2 = insts.map(x => ({ ...x, f: bandFeatures(x.f.dates.slice(0, cut).map((d, t) => ({ date: d, open: x.f.close[t], high: x.f.high[t], low: x.f.low[t], close: x.f.close[t] })), D) }));
  const p2 = alignPanel(insts2, unionCalendar(insts2)), c2 = covSeries(p2, D.covWindow);
  const b2 = runSizedBook({ panel: p2, cov: c2, schedule: fadeSchedule(p2, D).filter(tr => tr.exitReason !== 'end'), costOneWay: cost, o: D, withTrades: false });
  const bFull = runSizedBook({ panel, cov, schedule: sched.filter(tr => tr.exitT < cut - 1), costOneWay: cost, o: D, withTrades: false });
  let md = 0; for (let t = 0; t < cut - 2; t++) md = Math.max(md, Math.abs(b2.net[t] - bFull.net[t]));
  ok(md < 1e-12, `book at t uses data ≤ t (max Δ ${md})`);
  // random control keeps count/lengths, no overlap
  const rs = randomSchedule(panel, sched, mulberry32(9));
  ok(rs.length >= sched.length * 0.9, 'random control places (almost) every trade');
  const lens = a => a.map(t => t.exitT - t.entryT).sort((x, y) => x - y).join(',');
  ok(rs.length !== sched.length || lens(rs) === lens(sched.map(t => ({ ...t, exitT: t.entryT + Math.max(1, t.exitT - t.entryT) }))), 'control keeps trade lengths');
}

// ── random walks through the whole system: no edge after cost ──
{
  const insts = Array.from({ length: 6 }, (_, k) => inst('r' + k, series(2500, mulberry32(400 + k))));
  const cal = unionCalendar(insts), panel = alignPanel(insts, cal), cov = covSeries(panel, D.covWindow);
  const b = runSizedBook({ panel, cov, schedule: fadeSchedule(panel, D), costOneWay: panel.keys.map(() => 0.0001), o: D, withTrades: false });
  const m = b.net.reduce((s, x) => s + x, 0) / b.net.length;
  const sd = Math.sqrt(b.net.reduce((s, x) => s + (x - m) ** 2, 0) / (b.net.length - 1));
  const sh = m / sd * Math.sqrt(252);
  ok(Math.abs(sh) < 0.9, `random walk system Sharpe ≈ 0 (${sh.toFixed(2)})`);
}

console.log(`bandFade: ${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
