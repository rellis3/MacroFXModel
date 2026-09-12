// Level Base Rates, Exit Variants — 2026-09-11
//
// level_base_rates_priced.mjs found the raw p50/p75 rule net-negative
// (t=-6.55) despite a genuinely strong directional lean (z=13-22 in
// level_base_rates_honest.mjs). Implied avg-win/avg-loss from the pooled
// PF=0.92 at 52.4% win rate is ~0.84 -- losers run ~16% bigger than winners.
// That's a REWARD:RISK problem, not a win-rate problem, so the next honest
// test is exit construction, not another context filter.
//
// This applies the SAME stop-tightening machinery already validated for
// Thread 1 and Fib Atlas (runStopStudy / priceAtTighterStop /
// levelAtlasVoteReview.js) to Thread 2's raw trades: fit the best stop
// percentile on IS winners' real MAE, freeze it, apply unchanged to real
// OOS. Tested separately for 'fade' and 'follow' -- no assumption that only
// fade needs it (in the pooled priced numbers, follow was actually the MORE
// negative leg, which is the opposite of what Fib Atlas found, so this is
// a genuine test, not a rerun of an already-known answer).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { priceBarrierTrade, applyConcurrencyCap, reorientExcursion, runStopStudy, priceAtTighterStop } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS } from '../js/levelAtlasRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const REARM = 0.3;
const RULE = { p50: 'follow', p75: 'fade' };

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ALL_PAIRS;

function buildRow(t, cost) {
  const decision = RULE[t.rung];
  if (!decision) return null;
  const priced = priceBarrierTrade(t, decision, cost);
  if (!priced) return null;
  const { maePips } = reorientExcursion(t, decision);
  return {
    instrument: t.instrument, date: t.date, time: t.time,
    resolveTime: t.resolveTime ?? t.sessionCloseTime,
    side: t.side, rung: t.rung, entry: t.level, pip: t.pip,
    decision, targetPips: priced.targetPips, stopPips: priced.stopPips,
    maePips: +Math.abs(maePips).toFixed(1),
    win: priced.win, pnlPct: priced.pnlPct, timedOut: !!priced.timedOut,
  };
}

const perPairIS = {}, perPairOOS = {};
for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  const packed0 = await loadM1ForPair(pair);
  const packed = boundPacked(packed0, LOOKBACK_DAYS);
  const assetClass = assetClassFor(pair);
  const cost = costForPair(pair, assetClass);
  const { touches } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
  const atRearm = touches.filter(t => t.rearmFrac === REARM);
  const { split } = splitAt(atRearm);

  const isRows = atRearm.filter(t => t.date < split).map(t => buildRow(t, cost)).filter(Boolean);
  const oosRows = atRearm.filter(t => t.date >= split).map(t => buildRow(t, cost)).filter(Boolean);
  perPairIS[pair.toUpperCase()] = applyConcurrencyCap(isRows, { maxConcurrent: 1 }).kept ?? isRows;
  perPairOOS[pair.toUpperCase()] = applyConcurrencyCap(oosRows, { maxConcurrent: 1 }).kept ?? oosRows;
  console.log(`  IS ${perPairIS[pair.toUpperCase()].length}, OOS ${perPairOOS[pair.toUpperCase()].length}`);
}

const allIS = Object.values(perPairIS).flat();
const allOOS = Object.values(perPairOOS).flat();
console.log(`\nTotal: IS ${allIS.length}, OOS ${allOOS.length}`);

// Fit stop percentile per decision on the POOLED IS block (same discipline
// applyFadeStopTightening uses, just not restricted to fade only).
const study = runStopStudy(allIS, { cost: 0, sliceBy: t => t.decision, minN: 30 });
console.log('\nIS stop-study fit (best stopPips per decision, by IS Sharpe):');
for (const key of Object.keys(study)) {
  const b = study[key].best;
  console.log(`  ${key}: ${b ? `stopPips=${b.stopPips} (p${b.p}, IS sharpe=${b.sharpe?.toFixed(2)})` : 'no eligible candidate'}`);
}

function applyFrozen(rows, decision, stopPips) {
  if (stopPips == null) return rows;
  return rows.map(t => {
    if (t.decision !== decision) return t;
    const priced = priceAtTighterStop(t, stopPips, 0); // re-pricing an already-built trade, cost already baked in
    return priced ? { ...t, ...priced, stopPips: Math.min(stopPips, t.stopPips) } : t;
  });
}

const fadeStop = study.fade?.best?.stopPips ?? null;
const followStop = study.follow?.best?.stopPips ?? null;
let tightenedOOS = applyFrozen(allOOS, 'fade', fadeStop);
tightenedOOS = applyFrozen(tightenedOOS, 'follow', followStop);

function row(label, trades) {
  if (trades.length < 30) return `${label.padEnd(32)}${String(trades.length).padStart(7)}   [thin]`;
  const s = summarizeTrades(trades.map(t => t.pnlPct), trades.map(t => t.date));
  const n = trades.length;
  const m = trades.reduce((a, t) => a + t.pnlPct, 0) / n;
  const sd = Math.sqrt(trades.reduce((a, t) => a + (t.pnlPct - m) ** 2, 0) / (n - 1));
  const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0;
  return label.padEnd(32) + String(n).padStart(7) + (s.winRate ?? 0).toFixed(1).padStart(8) +
    ((m >= 0 ? '+' : '') + m.toFixed(4)).padStart(10) + (s.profitFactor ?? 0).toFixed(2).padStart(7) +
    (s.sharpe ?? 0).toFixed(2).padStart(8) + ('t' + t.toFixed(2)).padStart(8);
}

console.log('\n' + '='.repeat(94));
console.log('BASELINE (fixed rung target/stop) vs STOP-TIGHTENED (IS-fit, frozen, applied real OOS)');
console.log('='.repeat(94));
console.log('policy'.padEnd(32), 'n'.padStart(7), 'win%'.padStart(8), 'meanPct'.padStart(10), 'PF'.padStart(7), 'sharpe'.padStart(8), 't-stat'.padStart(8));
console.log(row('BASELINE all', allOOS));
console.log(row('BASELINE follow (p50)', allOOS.filter(t => t.decision === 'follow')));
console.log(row('BASELINE fade (p75)', allOOS.filter(t => t.decision === 'fade')));
console.log('');
console.log(row('TIGHTENED all', tightenedOOS));
console.log(row('TIGHTENED follow (p50)', tightenedOOS.filter(t => t.decision === 'follow')));
console.log(row('TIGHTENED fade (p75)', tightenedOOS.filter(t => t.decision === 'fade')));

console.log('\n--- per pair (TIGHTENED, all) ---');
for (const pair of PAIRS) {
  const P = pair.toUpperCase();
  const rows = tightenedOOS.filter(t => t.instrument === P);
  console.log(row(P, rows));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'level_base_rates_exit_variants.json'), JSON.stringify({
  fadeStop, followStop,
  baseline: allOOS.length >= 30 ? summarizeTrades(allOOS.map(t => t.pnlPct), allOOS.map(t => t.date)) : null,
  tightened: tightenedOOS.length >= 30 ? summarizeTrades(tightenedOOS.map(t => t.pnlPct), tightenedOOS.map(t => t.date)) : null,
}, null, 1));
console.log(`\nWrote ${OUT_DIR}/level_base_rates_exit_variants.json`);
