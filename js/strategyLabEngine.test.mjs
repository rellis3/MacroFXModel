// Synthetic, no-network unit tests for the Strategy Lab engine.
//
//   node js/strategyLabEngine.test.mjs

import {
  SIGNALS, GAUNTLET_SPECS, positionBacktest, countEntries,
  runSpec, splitDateFor, evaluateSpec, runGauntlet,
} from './strategyLabEngine.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── Deterministic synthetic daily bars (no Math.random) ──────────────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function makeBars(n, { drift = 0, noise = 0.006, start = 1.10, seed = 42 } = {}) {
  const rng = mulberry32(seed);
  const bars = [];
  let c = start;
  const d0 = Date.UTC(2015, 0, 1);
  for (let i = 0; i < n; i++) {
    const o = c;
    const r = drift + (rng() - 0.5) * 2 * noise;
    c = o * (1 + r);
    const hi = Math.max(o, c) * (1 + rng() * noise * 0.5);
    const lo = Math.min(o, c) * (1 - rng() * noise * 0.5);
    bars.push({ date: new Date(d0 + i * 864e5).toISOString().slice(0, 10), open: o, high: hi, low: lo, close: c });
  }
  return bars;
}
const UP = makeBars(1500, { drift: 0.0008, seed: 1 });        // clean uptrend
const FLAT = makeBars(1500, { drift: 0, seed: 2 });           // driftless chop
const DOWN = makeBars(1500, { drift: -0.0006, seed: 3 });     // downtrend

// ── 1. Every signal: bounds, warmup, alignment ───────────────────────────────
console.log('signal invariants');
for (const [key, def] of Object.entries(SIGNALS)) {
  for (const dir of ['longflat', 'longshort']) {
    const pos = def.compute(UP, def.defaults, dir);
    ok(`${key}/${dir} aligned`, pos.length === UP.length);
    ok(`${key}/${dir} in [-1,1]`, pos.every(p => Number.isFinite(p) && p >= -1 && p <= 1));
    if (dir === 'longflat' && key !== 'tsmom') ok(`${key} longflat never short`, pos.every(p => p >= 0));
  }
}
ok('buy_hold always long', SIGNALS.buy_hold.compute(FLAT, {}).every(p => p === 1));

// ── 2. No lookahead: mutating a future bar never changes past positions ──────
console.log('no lookahead');
for (const [key, def] of Object.entries(SIGNALS)) {
  const base = def.compute(FLAT, def.defaults, 'longshort');
  const mutIdx = 1000;
  const mutated = FLAT.map((b, i) => (i >= mutIdx ? { ...b, open: b.open * 1.3, high: b.high * 1.4, low: b.low * 1.25, close: b.close * 1.35 } : b));
  const after = def.compute(mutated, def.defaults, 'longshort');
  let same = true;
  for (let i = 0; i < mutIdx; i++) if (!near(base[i], after[i])) { same = false; break; }
  ok(`${key} pos[<${mutIdx}] unchanged by future shock`, same);
}

// ── 3. positionBacktest math ─────────────────────────────────────────────────
console.log('positionBacktest');
{
  // closes 100→110→99: long from bar0, flat from bar1.
  const closes = [100, 110, 99];
  const pos = [1, 0, 0];
  const bt = positionBacktest(closes, pos, { costBp: 10 });
  // bar1: pos[0]=1 earns +10%, cost |pos[0]-0|*10bp = 0.001
  ok('bar1 return', near(bt.dailyRet[1], 0.10 - 0.001));
  // bar2: pos[1]=0 earns 0, cost |pos[1]-pos[0]|*10bp (the exit)
  ok('bar2 exit cost', near(bt.dailyRet[2], 0 - 0.001));
  ok('turnover = 2 (in + out)', near(bt.turnover, 2));
}
{
  // buy & hold: total net return ≈ price return minus one entry cost
  const closes = UP.map(b => b.close);
  const pos = new Array(closes.length).fill(1);
  const bt = positionBacktest(closes, pos, { costBp: 2 });
  const cum = bt.dailyRet.reduce((s, x) => s + x, 0);
  const raw = closes.slice(1).reduce((s, c, i) => s + (c - closes[i]) / closes[i], 0);
  ok('buy&hold net ≈ raw − 1 entry cost', near(cum, raw - 2e-4, 1e-9));
}

// ── 4. countEntries ──────────────────────────────────────────────────────────
console.log('countEntries');
ok('flat→long→flat→short = 2 entries', countEntries([0, 1, 1, 0, -1, -1]) === 2);
ok('sign flip counts', countEntries([0, 1, -1, 1]) === 3);
ok('window restriction', countEntries([0, 1, 0, 1], 3) === 1);

// ── 5. RSI mean-reversion state machine ──────────────────────────────────────
console.log('rsi_meanrev semantics');
{
  const pos = SIGNALS.rsi_meanrev.compute(UP, SIGNALS.rsi_meanrev.defaults, 'longflat');
  ok('only 0/1 states', pos.every(p => p === 0 || p === 1));
  // No entry can exist while below the 200-SMA filter in a pure downtrend tail:
  const posDown = SIGNALS.rsi_meanrev.compute(DOWN, SIGNALS.rsi_meanrev.defaults, 'longflat');
  const lateEntries = countEntries(posDown, 800);
  ok('regime filter suppresses downtrend entries', lateEntries <= 2, `(${lateEntries})`);
}

// ── 6. Trend capture sanity: ema_cross long/flat is positive on a clean trend ─
console.log('trend capture');
{
  const r = runSpec(UP, { signal: 'ema_cross' }, { costBp: 2 });
  const cum = r.dailyRet.reduce((s, x) => s + x, 0);
  ok('ema_cross > 0 on uptrend', cum > 0, `(${(cum * 100).toFixed(1)}%)`);
  const r2 = runSpec(DOWN, { signal: 'ema_cross' }, { direction: 'longflat', costBp: 2 });
  const cum2 = r2.dailyRet.reduce((s, x) => s + x, 0);
  const bh = DOWN[DOWN.length - 1].close / DOWN[0].close - 1;
  ok('ema_cross long/flat sidesteps most of a downtrend', cum2 > bh);
}

// ── 7. Shared chronological split date ───────────────────────────────────────
console.log('splitDateFor');
{
  const markets = [
    { symbol: 'A', bars: UP },
    { symbol: 'B', bars: FLAT.slice(300) },   // shorter history, later start
  ];
  const d = splitDateFor(markets, 0.3);
  ok('returns a date', typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
  const ev = evaluateSpec(markets, { signal: 'ema_cross' }, { splitDate: d });
  // both markets must split at the SAME calendar date
  const oosBarsA = UP.filter(b => b.date >= d).length;
  const oosBarsB = FLAT.slice(300).filter(b => b.date >= d).length;
  ok('both markets have OOS bars from the shared date', oosBarsA > 0 && oosBarsB > 0);
  ok('evaluateSpec produces is/oos/full', !!ev.portfolio.is.days && !!ev.portfolio.oos.days && !!ev.portfolio.full.days);
}

// ── 8. The gauntlet end-to-end ───────────────────────────────────────────────
console.log('runGauntlet');
{
  const markets = [
    { symbol: 'UP_USD', bars: UP },
    { symbol: 'FLAT_USD', bars: FLAT },
    { symbol: 'DOWN_USD', bars: DOWN },
  ];
  const g = runGauntlet(markets, GAUNTLET_SPECS, { sweep: true, oosFrac: 0.3, costBp: 2 });
  ok('ok', g.ok === true);
  ok('one row per spec', g.rows.length === GAUNTLET_SPECS.length);
  ok('benchmark pinned first', g.rows[0].benchmark === true);
  ok('trials counted beyond specs (sweep variants)', g.nTrials > GAUNTLET_SPECS.length, `(${g.nTrials})`);
  ok('every row has flags array + survives bool', g.rows.every(r => Array.isArray(r.flags) && typeof r.survives === 'boolean'));
  ok('every row has DSR or null', g.rows.every(r => r.deflated === null || typeof r.deflated.dsr === 'number'));
  ok('rows sorted by OOS Sharpe (after benchmark)', (() => {
    const rest = g.rows.filter(r => !r.benchmark);
    for (let i = 1; i < rest.length; i++) if (rest[i].portfolio.oos.sharpe > rest[i - 1].portfolio.oos.sharpe + 1e-9) return false;
    return true;
  })());
  ok('read string present', typeof g.read === 'string' && g.read.length > 0);
  ok('internal daily series stripped', g.rows.every(r => !('_portDaily' in r)));
  const swept = g.rows.find(r => r.signal === 'ema_cross');
  ok('sweep table attached', Array.isArray(swept.sweep) && swept.sweep.length === SIGNALS.ema_cross.sweep.length);
}

// ── 9. Determinism ───────────────────────────────────────────────────────────
console.log('determinism');
{
  const markets = [{ symbol: 'A', bars: FLAT }];
  const a = runGauntlet(markets, GAUNTLET_SPECS.slice(0, 4), {});
  const b = runGauntlet(markets, GAUNTLET_SPECS.slice(0, 4), {});
  ok('identical reruns', JSON.stringify(a) === JSON.stringify(b));
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall tests passed');
process.exit(failures ? 1 : 0);
