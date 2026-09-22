// dayVol-conditional stop tightening -- does shrinking the stop on
// heavy/normal vol-regime days reduce drawdown or improve Sharpe, versus
// leaving the stop at its current (percentile-ladder-derived, already
// vol-scaled-WIDER-not-tighter) size? Never tested before this script --
// confirmed via a full repo search (2026-09-21): dayVol exists only as a
// descriptive tag in two purely-descriptive scripts, never fed into any
// stop/risk decision. See MD files/ or the conversation this was built from.
//
// READ-ONLY / ISOLATED: pulls fresh trades from the LIVE vote-trades route
// (current, bug-fixed engine -- NOT the Sep-15 local cache under
// analysis/output/level-atlas-vote-trades/, which predates this week's
// look-ahead fixes), re-prices them in-memory using the EXISTING, already-
// validated priceAtTighterStop() (js/levelAtlasVoteReview.js -- the same
// path-aware, MAE-based re-pricing applyFadeStopTightening already uses
// live). Writes only to analysis/output/ -- touches no R2 key, no KV key,
// nothing the backtest page or either live bot reads.
//
// Caveat: aggregation here is a simple equal-weighted daily pnlPct sum
// across all matching trades, NOT the full risk-pct-sized / max-concurrent-
// capped portfolio simulation the vote-portfolio page runs. That's fine for
// a DIRECTIONAL first pass (does tightening help or hurt, and by how much,
// relative to the SAME baseline) but these Sharpe/CAGR numbers won't
// exactly match the live-config backtest's own headline figures.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { bucketM1IntoSessions } from '../js/forecastAnalyser.js';
import { forecastSigma } from '../js/forecastSigma.js';
import { LADDER_PARAMS } from '../js/forecastLadderParams.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { priceAtTighterStop } from '../js/levelAtlasVoteReview.js';
import { portfolioStats } from '../js/backtestStats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'dayvol_stop_tightening_study.json');
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://macrofxmodel-production.up.railway.app';
const MIN_MARGIN = 3;
// Same 17-pair "recommended" universe volatility_bot_v3 actually trades.
const PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

// EXACT replica of atlasWalk's dayVol classification (js/levelAtlasEngine.js),
// copied from analysis/dayvol_regime_breakdown.mjs -- same estimator
// selection, same r<0.85/r>1.25 thresholds, causal by construction
// (forecastSigma(d1.slice(0,i)) excludes today).
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
    out.set(dates[i], r < 0.85 ? 'quiet' : r > 1.25 ? 'heavy' : 'normal');
  }
  return out;
}

async function fetchTrades(pair) {
  const r = await fetch(`${DASHBOARD_URL}/api/level-atlas/vote-trades/${pair}?minMargin=1`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'fetch failed');
  return j.trades || [];
}

// Fraction of the trade's OWN stopPips to use as the candidate (tighter)
// stop for a given regime. 1.0 = unchanged. Never widens (priceAtTighterStop
// itself clamps with Math.min against the original stopPips).
const TIGHTEN_GRIDS = [
  { label: 'baseline',          quiet: 1.0, normal: 1.0,  heavy: 1.0 },
  { label: 'heavy-0.85',        quiet: 1.0, normal: 1.0,  heavy: 0.85 },
  { label: 'heavy-0.70',        quiet: 1.0, normal: 1.0,  heavy: 0.70 },
  { label: 'heavy-0.55',        quiet: 1.0, normal: 1.0,  heavy: 0.55 },
  { label: 'normal+heavy-0.85', quiet: 1.0, normal: 0.85, heavy: 0.85 },
  { label: 'normal+heavy-0.70', quiet: 1.0, normal: 0.70, heavy: 0.70 },
  { label: 'all-uniform-0.85',  quiet: 0.85, normal: 0.85, heavy: 0.85 },
];

function repriceTrade(t, frac) {
  if (frac >= 1) return t;
  const priced = priceAtTighterStop(t, t.stopPips * frac, 0);
  return priced ? { ...t, ...priced } : t;   // no real MAE data -> leave unchanged, don't guess
}

function toDailySeries(trades) {
  const m = new Map();
  for (const t of trades) m.set(t.date, (m.get(t.date) || 0) + t.pnlPct);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, v]) => v);
}

const fmt = (x, d = 2) => (x == null || Number.isNaN(x)) ? '—' : (+x).toFixed(d);

async function main() {
  const allTrades = [];
  for (const pair of PAIRS) {
    process.stdout.write(`${pair}: fetching...`);
    let trades;
    try { trades = await fetchTrades(pair); } catch (e) { console.log(` fetch failed: ${e.message}`); continue; }
    trades = trades.filter(t => t.margin >= MIN_MARGIN);
    if (!trades.length) { console.log(' 0 margin>=3 trades, skipping'); continue; }
    let packed;
    try { packed = await loadM1ForPair(pair); } catch (e) { console.log(` M1 load failed: ${e.message}`); continue; }
    if (!packed?.n) { console.log(' no local M1, skipping'); continue; }
    const assetClass = assetClassFor(pair);
    const regimeByDate = dayVolByDate(packed, pair.toUpperCase(), assetClass);
    let labeled = 0;
    for (const t of trades) {
      const r = regimeByDate.get(t.date);
      if (!r) continue;
      allTrades.push({ ...t, pair, dayVol: r });
      labeled++;
    }
    console.log(` ${labeled}/${trades.length} labeled`);
  }

  console.log(`\nTotal labeled margin>=${MIN_MARGIN} trades: ${allTrades.length}`);
  const byRegime = { quiet: 0, normal: 0, heavy: 0 };
  for (const t of allTrades) byRegime[t.dayVol]++;
  console.log(`Regime split: quiet=${byRegime.quiet} normal=${byRegime.normal} heavy=${byRegime.heavy}\n`);

  const results = [];
  console.log('grid'.padEnd(20), '| ALL DECISIONS'.padEnd(46), '| FADE-ONLY (follow untouched)');
  for (const grid of TIGHTEN_GRIDS) {
    const fracFor = t => (t.dayVol === 'quiet' ? grid.quiet : t.dayVol === 'normal' ? grid.normal : grid.heavy);

    const repricedAll = allTrades.map(t => repriceTrade(t, fracFor(t)));
    const statsAll = portfolioStats(toDailySeries(repricedAll), { mc: false });

    const repricedFadeOnly = allTrades.map(t => (t.decision === 'fade' ? repriceTrade(t, fracFor(t)) : t));
    const statsFadeOnly = portfolioStats(toDailySeries(repricedFadeOnly), { mc: false });

    results.push({ grid: grid.label, allDecisions: statsAll, fadeOnly: statsFadeOnly });
    console.log(
      grid.label.padEnd(20),
      `| sharpe=${fmt(statsAll.sharpe)} cagr=${fmt(statsAll.cagr, 1)}% maxDD=${fmt(statsAll.maxDD, 1)}%`.padEnd(46),
      `| sharpe=${fmt(statsFadeOnly.sharpe)} cagr=${fmt(statsFadeOnly.cagr, 1)}% maxDD=${fmt(statsFadeOnly.maxDD, 1)}%`
    );
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), minMargin: MIN_MARGIN, nTrades: allTrades.length, regimeSplit: byRegime, results }, null, 2));
  console.log(`\nWritten to ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
