/**
 * Pools the per-instrument summary.json + mae_dynamic_stop.json files into
 * comparison tables (printed to stdout, and written to
 * data/pooled_summary.json) for RESULTS.md — gold vs FX vs index, level
 * hit-rate table across instruments, correlation table, MAE/stop headline.
 * Usage: node aggregate.mjs <dataDir> <pair1> [pair2 ...]
 */
import fs from 'fs';

const dataDir = process.argv[2];
const pairs = process.argv.slice(3);
if (!dataDir || !pairs.length) { console.error('usage: aggregate.mjs <dataDir> <pair1> [pair2 ...]'); process.exit(1); }

const summaries = {};
const maes = {};
for (const p of pairs) {
  summaries[p] = JSON.parse(fs.readFileSync(`${dataDir}/${p}.summary.json`, 'utf8'));
  maes[p] = JSON.parse(fs.readFileSync(`${dataDir}/${p}.mae_dynamic_stop.json`, 'utf8'));
}

// ── Headline table ──────────────────────────────────────────────────────
console.log('\n=== Headline (per instrument) ===');
console.log('pair          class      nImp  bull/bear   winRate  meanR   sizeExhCorr(full/IS/OOS)          reversalCorr(full/IS/OOS)');
for (const p of pairs) {
  const s = summaries[p];
  const se = s.sizeExhaustionCorrelation, rv = s.reversalAnalysis.corrVsImpulseSize;
  console.log(
    `${p.padEnd(13)} ${s.meta.assetClass.padEnd(10)} ${String(s.nImpulses).padEnd(5)} ${String(s.directionCounts.bullish)}/${s.directionCounts.bearish}`.padEnd(45) +
    `  ${s.continuationTrade.winRatePct}%   ${s.continuationTrade.meanR}   ` +
    `${se.full.r}/${se.is.r}/${se.oos.r}   ${rv.full.r}/${rv.is.r}/${rv.oos.r}`
  );
}

// ── Level hit-rate table, pooled by asset class ─────────────────────────
console.log('\n=== Level hit-rate (%) by fib rung, near-range levels, full sample per instrument ===');
const showFibs = [-2, -1.5, -1, -0.5, 0, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5];
console.log('fib    ' + pairs.map(p => p.padEnd(10)).join(''));
for (const f of showFibs) {
  const row = pairs.map(p => {
    const v = summaries[p].levelHitRate.full.rates[f];
    return (v == null ? 'n/a' : v.toFixed(1)).padEnd(10);
  }).join('');
  console.log(String(f).padEnd(7) + row);
}

// ── Reversal stats ───────────────────────────────────────────────────────
console.log('\n=== Reversal-after-exhaustion (ATR units) ===');
for (const p of pairs) {
  const r = summaries[p].reversalAnalysis;
  console.log(`${p.padEnd(13)} n=${r.stats.full.n} (excl ${r.truncatedExcluded} truncated)  meanATR=${r.stats.full.meanAtr?.toFixed(3)}  medianATR=${r.stats.full.medianAtr?.toFixed(3)}  |  IS mean=${r.stats.is.meanAtr?.toFixed(3)} OOS mean=${r.stats.oos.meanAtr?.toFixed(3)}`);
}

// ── VWAP ──────────────────────────────────────────────────────────────────
console.log('\n=== VWAP ===');
for (const p of pairs) {
  const v = summaries[p].vwapAnalysis;
  console.log(`${p.padEnd(13)} touchRate=${v.vwapTouchRatePct}%  medianBarsToTouch=${v.medianBarsToTouch}  within4h=${v.pctTouchedWithin4h}%  within24h=${v.pctTouchedWithin24h}%  within3d=${v.pctTouchedWithin3days}%  |  |dist|@exhaustion vs reversal corr full/IS/OOS = ${v.corrAbsDistAtExhaustionVsReversal.full.r}/${v.corrAbsDistAtExhaustionVsReversal.is.r}/${v.corrAbsDistAtExhaustionVsReversal.oos.r}`);
}

// ── MAE / dynamic-stop headline ─────────────────────────────────────────
console.log('\n=== MAE / dynamic-stop: baseline vs best cell (full) + best-cell IS/OOS ===');
for (const p of pairs) {
  const m = maes[p];
  const b = m.bestCellIsOos;
  console.log(`${p.padEnd(13)} baseline sharpe=${m.baseline.sharpe} winRate=${m.baseline.winRate}%  |  best(fracEarly=${b.fracEarly},kBars=${b.kBars}) full=${b.full.sharpe}  IS=${b.is.sharpe}(n=${b.is.n})  OOS=${b.oos.sharpe}(n=${b.oos.n})`);
}

// ── Direction / day-of-week breakdown ────────────────────────────────────
console.log('\n=== Direction bias & day-of-week (UTC) ===');
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
for (const p of pairs) {
  const s = summaries[p];
  const dc = s.directionCounts;
  const dow = s.dayOfWeekUTC_0Sun.map((c, i) => `${DOW[i]}:${c}`).join(' ');
  console.log(`${p.padEnd(13)} bull=${dc.bullish} (${(dc.bullish/(dc.bullish+dc.bearish)*100).toFixed(1)}%) bear=${dc.bearish}  |  ${dow}`);
}

fs.writeFileSync(`${dataDir}/pooled_summary.json`, JSON.stringify({ pairs, summaries, maes }, null, 2));
console.log(`\nwrote ${dataDir}/pooled_summary.json`);
