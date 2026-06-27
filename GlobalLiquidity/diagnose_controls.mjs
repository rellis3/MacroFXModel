/*
 * diagnose_controls.mjs — positive-control diagnostic for the backtest harness.
 *
 * Runs the SAME weekly return/sizing/cost machinery the liquidity backtest uses,
 * but driven by signals that are KNOWN to have had historical edge in FX:
 *   - cross-sectional 12-week momentum (long top-3 / short bottom-3 trailing return)
 *   - time-series 12-week momentum (each pair long if trailing return > 0 else short)
 * Plus a random-sign control (should be ~0) as a negative control.
 *
 * Pure price data (the real M1 parquet caches) — NO FRED. Purpose: prove whether
 * the harness can detect ANY edge. If momentum scores sensibly and liquidity
 * doesn't, the signal is the problem, not the plumbing.
 *
 *   node GlobalLiquidity/diagnose_controls.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { weeklyReturns, sharpe } from './backtestCore.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FX_DIR = path.join(ROOT, 'VolRangeForecaster', 'data', 'm1');
const PAIRS = ['EURUSD','GBPUSD','AUDUSD','NZDUSD','USDJPY','USDCAD','USDCHF','EURGBP','EURJPY','EURCHF','EURCAD','EURAUD','EURNZD','GBPJPY','GBPCHF','GBPAUD','GBPCAD','GBPNZD','AUDJPY','AUDNZD','AUDCAD','AUDCHF','NZDJPY','CADJPY','CHFJPY','XAUUSD'];
const ALIAS = { XAUUSD: 'gold' };
const COST = 0.0002;
const LB = 12;            // momentum lookback (weeks) — pre-specified, not scanned

async function readWeekly(stem) {
  const fp = path.join(FX_DIR, stem + '_m1.parquet');
  if (!fs.existsSync(fp)) return null;
  const b = fs.readFileSync(fp);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const file = { byteLength: ab.byteLength, slice: (s, e) => Promise.resolve(ab.slice(s, e)) };
  const meta = await parquetMetadataAsync(file);
  const total = Number(meta.num_rows), CHUNK = 250000, byWeek = new Map();
  for (let start = 0; start < total; start += CHUNK) {
    let rows;
    await parquetRead({ file, metadata: meta, columns: ['close', 'datetime'], rowFormat: 'object', rowStart: start, rowEnd: Math.min(start + CHUNK, total), onComplete: (d) => (rows = d) });
    for (const r of rows) {
      if (!(r.close > 0)) continue;
      const t = (r.datetime instanceof Date ? r.datetime : new Date(r.datetime)).getTime();
      const dow = new Date(t).getUTCDay(); const fri = new Date(t + ((5 - dow + 7) % 7) * 864e5);
      const key = fri.toISOString().slice(0, 10); const cur = byWeek.get(key);
      if (!cur || t >= cur.t) byWeek.set(key, { t, close: r.close });
    }
  }
  return weeklyReturns([...byWeek.values()].sort((a, b) => a.t - b.t));
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
function stats(net) {
  const warm = LB + 4, v = net.slice(warm).filter((x) => isFinite(x));
  const eq = []; let c = 1; for (const r of net) { c *= 1 + r; eq.push(c); }
  let pk = -Infinity, dd = 0; for (const e of eq) { pk = Math.max(pk, e); dd = Math.min(dd, e / pk - 1); }
  // walk-forward 156/52/26
  const wins = []; let s = warm;
  while (s + 156 + 52 <= net.length) { wins.push({ is: sharpe(net.slice(s, s + 156)), oos: sharpe(net.slice(s + 156, s + 156 + 52)) }); s += 26; }
  return {
    sharpe: sharpe(v), hit: v.filter((x) => x > 0).length / (v.length || 1), maxDD: dd,
    wf: wins.length ? { is: mean(wins.map((w) => w.is)), oos: mean(wins.map((w) => w.oos)), oosPos: wins.filter((w) => w.oos > 0).length / wins.length } : null,
  };
}

// Run a strategy. rebal = recompute weights every `rebal` weeks (hold between),
// so monthly strategies don't pay weekly turnover.
function runStrategy(dates, R, m, weightFn, rebal = 1) {
  const net = new Array(dates.length).fill(0); let prev = new Array(m).fill(0); let held = prev;
  for (let i = 1; i < dates.length; i++) {
    if ((i - 1) % rebal === 0) held = weightFn(i - 1, R, m);  // decided at i-1
    const w = held;
    let ret = 0; for (let j = 0; j < m; j++) ret += w[j] * R[i][j];
    let dw = 0; for (let j = 0; j < m; j++) dw += Math.abs(w[j] - prev[j]);
    net[i] = ret - dw * COST; prev = w;
  }
  return net;
}
function trailing(i, R, j, lb) { let s = 0, n = 0; for (let k = Math.max(0, i - lb + 1); k <= i; k++) { if (isFinite(R[k][j])) { s += R[k][j]; n++; } } return n ? s : 0; }
function gnorm(w) { const g = w.reduce((s, x) => s + Math.abs(x), 0) || 1; return w.map((x) => x / g); }

function xsMomentumLB(lb) {
  return (i, R, m) => {
    const sc = Array.from({ length: m }, (_, j) => ({ j, s: trailing(i, R, j, lb) }));
    sc.sort((a, b) => b.s - a.s);
    const w = new Array(m).fill(0);
    for (let k = 0; k < 3; k++) { w[sc[k].j] = 1; w[sc[m - 1 - k].j] = -1; }
    return gnorm(w);
  };
}
function xsReversalLB(lb) {
  const mom = xsMomentumLB(lb);
  return (i, R, m) => mom(i, R, m).map((x) => -x);   // long recent losers / short winners
}
const xsMomentum = xsMomentumLB(LB);
function tsMomentum(i, R, m) {
  const w = new Array(m).fill(0);
  for (let j = 0; j < m; j++) w[j] = Math.sign(trailing(i, R, j, LB));
  return gnorm(w);
}
let _seed = 12345; const rnd = () => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; };
function randomSign(i, R, m) { const w = new Array(m).fill(0); for (let j = 0; j < m; j++) w[j] = rnd() < 0.5 ? -1 : 1; return gnorm(w); }

async function main() {
  console.log('Loading real FX (26 parquet caches)…');
  const series = {}; let found = 0;
  for (const p of PAIRS) { const r = await readWeekly((ALIAS[p] || p).toLowerCase()); if (r) { series[p] = r; found++; } }
  console.log(`  ${found}/${PAIRS.length} pairs`);

  // common weekly grid = union of all week keys
  const allWeeks = new Set(); for (const p of PAIRS) if (series[p]) for (const k of series[p].keys()) allWeeks.add(k);
  const dates = [...allWeeks].sort(); const m = PAIRS.length;
  const R = dates.map(() => new Array(m).fill(0));
  for (let j = 0; j < m; j++) { const r = series[PAIRS[j]]; if (!r) continue; for (let i = 0; i < dates.length; i++) { const v = r.get(dates[i]); if (v != null) R[i][j] = v; } }
  console.log(`  weeks: ${dates.length}  (${dates[0]} → ${dates[dates.length - 1]})\n`);

  const report = (name, net) => {
    const s = stats(net);
    console.log(`${name.padEnd(26)} Sharpe ${s.sharpe.toFixed(2).padStart(6)} | hit ${(s.hit * 100).toFixed(0).padStart(3)}% | maxDD ${(s.maxDD * 100).toFixed(0).padStart(4)}% | OOS+ ${s.wf ? (s.wf.oosPos * 100).toFixed(0) : '-'}% | OOSsharpe ${s.wf ? s.wf.oos.toFixed(2) : '-'}`);
  };
  console.log('='.repeat(92));
  console.log('  POSITIVE-CONTROL DIAGNOSTIC — same harness machinery, price-only signals (no FRED)');
  console.log('='.repeat(92));
  console.log('  WEEKLY rebalance:');
  report('  XS momentum 12w', runStrategy(dates, R, m, xsMomentum, 1));
  report('  TS momentum 12w', runStrategy(dates, R, m, tsMomentum, 1));
  report('  XS reversal 2w', runStrategy(dates, R, m, xsReversalLB(2), 1));
  report('  Random sign (neg ctrl)', runStrategy(dates, R, m, randomSign, 1));
  console.log('  MONTHLY rebalance (momentum’s natural habitat):');
  report('  XS momentum 26w', runStrategy(dates, R, m, xsMomentumLB(26), 4));
  report('  XS momentum 52w', runStrategy(dates, R, m, xsMomentumLB(52), 4));
  console.log('\nRead: random ~0 = harness mechanics sound. If a momentum/reversal variant is');
  console.log('clearly >0, the harness CAN capture a real premium — so liquidity (0.01) is the weak link.');
}
main().catch((e) => { console.error(e); process.exit(1); });
