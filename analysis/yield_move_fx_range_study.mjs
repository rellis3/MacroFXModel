#!/usr/bin/env node
/**
 * YIELD-MOVE-FX-RANGE — does a large 10-year move precede a WIDER FX session?
 *
 * Design frozen in MD files/YIELD_MOVE_FX_RANGE_PREREG.md and committed BEFORE this was
 * written (9e92cd1), so the ordering is checkable from git rather than asserted.
 *
 * `yields-to-fx-direction` already closed the direction question: forward coupling is
 * null, the relationship is same-bar only. This asks the only question the desk's own
 * record supports — 13 of its 19 validated entries measure range, 4 measure direction.
 *
 *   python scratchpad/runstudy.py analysis/yield_move_fx_range_study.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchD1Aligned } from '../js/volBacktestEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'yield_move_fx_range.json');

// ── pre-registered constants — these match the prereg exactly ────────────────
const PCTILE = 0.90;          // a "large" move: top decile of its own trailing 2 years
const TRAIL = 504;            // ~2 years of trading days
const HORIZONS = [1, 5];      // sessions, starting the NEXT one
const MIN_EVENTS = 30;
const REPS = 1000, BLOCK = 5;
const PAIRS = [['EURUSD', 'EUR_USD'], ['USDJPY', 'USD_JPY'], ['GBPUSD', 'GBP_USD']];

const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = v => v == null || !Number.isFinite(v) ? null : +v.toFixed(3);
const draw = (x, b) => { const o = []; while (o.length < x.length) { const i = Math.floor(Math.random() * x.length); for (let k = 0; k < b && o.length < x.length; k++) o.push(x[(i + k) % x.length]); } return o; };
function bootDiff(a, b) {
  if (a.length < MIN_EVENTS || b.length < MIN_EVENTS) return { untestable: true, nA: a.length, nB: b.length };
  const d = []; for (let r = 0; r < REPS; r++) d.push(mean(draw(a, BLOCK)) - mean(draw(b, BLOCK)));
  d.sort((p, q) => p - q);
  const lo = d[Math.floor(REPS * 0.025)], hi = d[Math.floor(REPS * 0.975)];
  return { nA: a.length, nB: b.length, diff: r3(mean(a) - mean(b)), lo: r3(lo), hi: r3(hi),
           real: (lo > 0 && hi > 0) || (lo < 0 && hi < 0) };
}

// ═══ 1. DATA ═════════════════════════════════════════════════════════════════
async function fred(id) {
  const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(30_000) })).text();
  return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; })
    .filter(o => Number.isFinite(o.value));
}
const dgs10 = await fred('DGS10');
console.log(`DGS10 ${dgs10[0].date} -> ${dgs10.at(-1).date} (${dgs10.length} prints)`);

// ═══ 2. SETUP — the large move, on a ROLLING threshold so there is no look-ahead ══
const ydays = dgs10.map((o, i) => ({ ...o, i, chg: i ? o.value - dgs10[i - 1].value : null }));
for (let i = TRAIL; i < ydays.length; i++) {
  const prior = ydays.slice(i - TRAIL, i).map(r => Math.abs(r.chg)).filter(Number.isFinite).sort((a, b) => a - b);
  ydays[i].thr = prior.length >= 250 ? prior[Math.floor(prior.length * PCTILE)] : null;
  ydays[i].big = ydays[i].thr != null && Math.abs(ydays[i].chg) >= ydays[i].thr;
}
const bigDays = ydays.filter(r => r.big);
console.log(`large 10-year days: ${bigDays.length} (top ${Math.round((1 - PCTILE) * 100)}% of a rolling ${TRAIL}-day window)`);
console.log(`  of which up ${bigDays.filter(r => r.chg > 0).length}, down ${bigDays.filter(r => r.chg < 0).length}\n`);

const result = { id: 'yield-move-fx-range', ranAt: new Date().toISOString(), pctile: PCTILE, trail: TRAIL,
  minEvents: MIN_EVENTS, bigDays: bigDays.length, instruments: {} };

for (const [name, sym] of PAIRS) {
  let bars = [];
  try { bars = await fetchD1Aligned(sym, 5000, { dailyAlignment: 0, alignmentTimezone: 'Europe/London' }); }
  catch (e) { console.log(`  ${name}: ${e.message}`); continue; }
  const idx = new Map(bars.map((b, i) => [b.date, i]));

  // ═══ 3. THE OUTCOME — forward range ratio, starting the NEXT session ═══════
  const trailMed = i => { const s = bars.slice(Math.max(0, i - 20), i).map(b => (b.high - b.low) / b.close); return s.length >= 10 ? median(s) : null; };
  const fwd = (i, n) => {
    const m = trailMed(i); if (!m || i + n >= bars.length) return null;
    // i+1 .. i+n : the yield close is known at the close, so the window starts tomorrow
    return mean(bars.slice(i + 1, i + 1 + n).map(b => (b.high - b.low) / b.close)) / m;
  };

  // setups mapped onto this instrument's calendar
  const setups = [];
  let last = -999;
  for (const d of bigDays) {
    const i = idx.get(d.date); if (i == null) continue;
    if (i - last < Math.max(...HORIZONS)) continue;          // de-cluster
    setups.push({ i, dir: Math.sign(d.chg), date: d.date }); last = i;
  }
  const near = new Set();
  for (const s of setups) for (let k = s.i - Math.max(...HORIZONS); k <= s.i + Math.max(...HORIZONS); k++) near.add(k);

  const cell = (list, H) => {
    const ev = list.map(s => fwd(s.i, H)).filter(v => v != null);
    const ctl = [];
    for (let i = 25; i < bars.length - H; i++) { if (near.has(i)) continue; const v = fwd(i, H); if (v != null) ctl.push(v); }
    return bootDiff(ev, ctl);
  };

  const mid = bars[Math.floor(bars.length / 2)].date;
  const r = { n: setups.length, from: bars[0].date, to: bars.at(-1).date };
  for (const H of HORIZONS) {
    r[`h${H}`] = cell(setups, H);
    r[`h${H}_up`] = cell(setups.filter(s => s.dir > 0), H);        // the mirror
    r[`h${H}_down`] = cell(setups.filter(s => s.dir < 0), H);
    r[`h${H}_early`] = cell(setups.filter(s => s.date < mid), H);  // the halves
    r[`h${H}_late`] = cell(setups.filter(s => s.date >= mid), H);
  }
  r.splitAt = mid;
  result.instruments[name] = r;

  const f = d => d?.untestable ? `UNTESTABLE (n=${d.nA})` : `${d.diff >= 0 ? '+' : ''}${d.diff} [${d.lo}, ${d.hi}] n=${d.nA}`;
  console.log(`${name}  ${setups.length} setups, ${r.from} -> ${r.to}`);
  for (const H of HORIZONS) {
    console.log(`   ${H}d  ${f(r[`h${H}`])}${r[`h${H}`].real ? '  REAL' : '  null'}`);
    console.log(`        up ${f(r[`h${H}_up`])} | down ${f(r[`h${H}_down`])}`);
    console.log(`        early ${f(r[`h${H}_early`])} | late ${f(r[`h${H}_late`])}`);
  }
  console.log('');
}

// ── the verdict, from the PRE-REGISTERED gate ────────────────────────────────
// (c) was the gate: all three instruments AND both halves, same sign as the pooled cell.
const names = Object.keys(result.instruments);
const gatePass = H => names.length === PAIRS.length && names.every(n => {
  const r = result.instruments[n];
  const base = r[`h${H}`];
  if (!base || base.untestable || !base.real) return false;
  const sgn = Math.sign(base.diff);
  return [`h${H}_early`, `h${H}_late`].every(k => {
    const c = r[k];
    return c && !c.untestable && c.real && Math.sign(c.diff) === sgn;
  });
});
const passed = HORIZONS.filter(gatePass);
const anyTestable = names.some(n => HORIZONS.some(H => !result.instruments[n][`h${H}`]?.untestable));
result.verdict = !anyTestable ? 'UNTESTABLE' : passed.length ? 'REAL' : 'NULL';
result.gate = { description: 'all three instruments real AND both halves agreeing in sign', passedAt: passed };

console.log(`VERDICT: ${result.verdict}` + (
  result.verdict === 'REAL' ? ` — clears the pre-registered gate at ${passed.map(h => h + 'd').join(', ')}.`
  : result.verdict === 'UNTESTABLE' ? ' — too few events to answer. Not a null.'
  : ' — no horizon clears the gate of all three instruments plus both halves.'));

// the mirror, reported separately: if one side works and the other does not, the effect
// probably belongs to the episodes those moves sat inside rather than to the move
for (const H of HORIZONS) {
  const ups = names.filter(n => result.instruments[n][`h${H}_up`]?.real).length;
  const dns = names.filter(n => result.instruments[n][`h${H}_down`]?.real).length;
  console.log(`  mirror at ${H}d: up real on ${ups}/${names.length}, down real on ${dns}/${names.length}`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log('\nwritten ' + path.relative(process.cwd(), OUT));
