// dayVol regime breakdown -- does the CORE live-traded edge (margin>=3
// vote-margin trades, the actual thing volatility_bot_v2 trades) hold up
// when checked SEPARATELY within each dayVol regime (quiet/normal/heavy), or
// is the reported aggregate number carried by just one regime? This has only
// ever been checked for the p90 side-investigation (not traded live) --
// never for the core system. Purely descriptive: no new backtest, no fit --
// the trades' pnlPct is already the SAME validated fixed-rule outcome
// atlasWalk produced (matches live), this only re-labels each trade with its
// day's dayVol regime and re-aggregates.
//
// dayVol replicated EXACTLY as js/levelAtlasEngine.js's atlasWalk computes
// it (same bucketM1IntoSessions call, same forecastSigma/LADDER_PARAMS
// estimator selection, same r<0.85/r>1.25 thresholds) -- not a second
// definition. Causal by construction (forecastSigma(d1.slice(0,i)) excludes
// today), so this carries no lookahead risk of its own; it's re-using an
// already-lookahead-checked label, not introducing a new one.
//
// Needs an M1 load per pair (dayVol requires the daily O/H/L series, which
// atlasWalk itself only ever derives FROM the bucketed M1 -- there's no
// M1-free path to it) but skips the expensive per-touch context/vote walk
// entirely, so this is much cheaper than a full atlasWalk run.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { forecastSigma } from '../js/forecastSigma.js';
import { LADDER_PARAMS } from '../js/forecastLadderParams.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'output', 'level-atlas-vote-trades');
const OUT = path.join(__dirname, 'output', 'dayvol_regime_breakdown.json');
const MIN_MARGIN = 3;
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

function fmt(x) { return x == null ? '—' : (+x).toFixed(4); }

// Exact replica of atlasWalk's dayVol classification (js/levelAtlasEngine.js).
function dayVolByDate(packed, sym, assetClass) {
  const sessions = bucketM1IntoSessions(packed, 'Europe/London');
  const dates = [...sessions.keys()].sort().filter(d => (sessions.get(d)?.length ?? 0) >= 200);
  const d1 = dates.map(d => {
    const b = sessions.get(d); let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
  const est = LADDER_PARAMS.pairs?.[sym]?.estimator ?? LADDER_PARAMS.classDefaults?.[assetClass]?.estimator ?? 'yz_30';
  const out = new Map();
  for (let i = 0; i < dates.length; i++) {
    let sigma = 0;
    try { sigma = forecastSigma(d1.slice(0, i), est); } catch { continue; }
    if (!(sigma > 0)) continue;
    const hist = [];
    for (let k = Math.max(0, i - 20); k < i; k++) { try { const s = forecastSigma(d1.slice(0, k), est); if (s > 0) hist.push(s); } catch {} }
    if (hist.length < 8) continue;
    const sorted = [...hist].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
    if (!(med > 0)) continue;
    const r = sigma / med;
    out.set(dates[i], r < 0.85 ? '1·quiet' : r > 1.25 ? '3·heavy' : '2·normal');
  }
  return out;
}

async function main() {
  const perPairByRegime = { '1·quiet': [], '2·normal': [], '3·heavy': [] };
  const perPairSummary = {};

  for (const pair of PAIRS) {
    const file = path.join(DIR, `${pair}-votetrades.json`);
    if (!fs.existsSync(file)) { console.log(`  no cached trades for ${pair}, skipping`); continue; }
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const trades = (d.trades || []).filter(t => t.margin >= MIN_MARGIN);
    if (!trades.length) { console.log(`  0 margin>=${MIN_MARGIN} trades for ${pair}, skipping`); continue; }
    console.log(`Loading M1 for ${pair} (${trades.length} margin>=${MIN_MARGIN} trades)...`);
    let packed;
    try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); continue; }
    if (!packed || !packed.n) { console.log(`  no M1, skipping`); continue; }
    const assetClass = assetClassFor(pair);
    const regimeByDate = dayVolByDate(packed, pair.toUpperCase(), assetClass);

    const byRegime = { '1·quiet': [], '2·normal': [], '3·heavy': [] };
    let unlabeled = 0;
    for (const t of trades) {
      const r = regimeByDate.get(t.date);
      if (!r) { unlabeled++; continue; }
      byRegime[r].push(t);
      perPairByRegime[r].push(t);
    }
    perPairSummary[pair] = {};
    console.log(`  ${pair}: ${trades.length} trades, ${unlabeled} unlabeled (no dayVol coverage)`);
    for (const r of Object.keys(byRegime)) {
      const list = byRegime[r];
      const s = list.length ? summarizeTrades(list.map(t => t.pnlPct), list.map(t => t.date)) : null;
      perPairSummary[pair][r] = s;
      console.log(`    ${r}  n=${list.length}  ${s ? `winRate=${fmt(s.winRate)}  mean=${fmt(s.expectancy)}  sharpe=${fmt(s.sharpe)}  total=${fmt(s.totalPnl)}` : '(no trades)'}`);
    }
  }

  console.log(`\n==== POOLED across all pairs, by dayVol regime ====`);
  const pooled = {};
  for (const r of Object.keys(perPairByRegime)) {
    const list = perPairByRegime[r];
    const s = list.length ? summarizeTrades(list.map(t => t.pnlPct), list.map(t => t.date)) : null;
    pooled[r] = s;
    console.log(`  ${r}  n=${list.length}  ${s ? `winRate=${fmt(s.winRate)}  mean=${fmt(s.expectancy)}  sharpe=${fmt(s.sharpe)}  total=${fmt(s.totalPnl)}  maxDD=${fmt(s.maxDD)}` : '(no trades)'}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ perPair: perPairSummary, pooled }, null, 2));
  console.log(`\nWrote full results to ${OUT}`);
}

main();
