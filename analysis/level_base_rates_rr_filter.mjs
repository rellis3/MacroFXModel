// Level Base Rates, R:R Geometry Filter — 2026-09-11
//
// The stop-tightening exit variant (level_base_rates_exit_variants.mjs) didn't
// rescue the rule (t-6.55 -> t-6.12) because its IS-fit stop was itself picked
// from an all-negative candidate set for 'follow' -- a FITTED lever with
// nothing good to fit. This tests something structurally different and
// cheaper: targetPips and stopPips are both known from the level ladder's
// OWN geometry at entry time -- no fitting, no outcome data, nothing tuned.
// The pooled base rule's problem was a REWARD:RISK shape (PF=0.92 at 52.4%
// win rate implies avg win is ~84% of avg loss) -- so the direct, honest test
// is: does simply REQUIRING a favourable a-priori target:stop ratio fix it,
// with a threshold picked BEFORE looking at results (>=1.0, the breakeven
// geometry line), not swept/fit?
//
// Reported on BOTH the honest IS and real OOS blocks -- not because a
// threshold is being fit (it isn't), but to check the same-sign discipline
// used everywhere else in this project: a real structural effect should show
// up in both halves, not just one.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { priceBarrierTrade, applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { summarizeTrades } from '../js/metricsCore.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS } from '../js/levelAtlasRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const REARM = 0.3;
const RULE = { p50: 'follow', p75: 'fade' };
const RR_THRESHOLDS = [1.0, 1.5, 2.0]; // 1.0 pre-registered as the primary test; 1.5/2.0 reported for context only

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ALL_PAIRS;

function buildRow(t, cost) {
  const decision = RULE[t.rung];
  if (!decision) return null;
  const priced = priceBarrierTrade(t, decision, cost);
  if (!priced) return null;
  return {
    instrument: t.instrument, date: t.date, time: t.time,
    resolveTime: t.resolveTime ?? t.sessionCloseTime,
    side: t.side, rung: t.rung, decision,
    rr: priced.targetPips > 0 && priced.stopPips > 0 ? +(priced.targetPips / priced.stopPips).toFixed(3) : null,
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

// Distribution of the ratio itself -- sanity check before filtering
function pctileOf(arr, p) {
  const s = arr.filter(x => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))];
}
const rrsOOS = allOOS.map(t => t.rr).filter(x => x != null);
console.log(`\nrr=target:stop distribution (OOS): p10=${pctileOf(rrsOOS, 10)} p25=${pctileOf(rrsOOS, 25)} p50=${pctileOf(rrsOOS, 50)} p75=${pctileOf(rrsOOS, 75)} p90=${pctileOf(rrsOOS, 90)}`);
console.log(`fraction with rr>=1: ${(rrsOOS.filter(r => r >= 1).length / rrsOOS.length * 100).toFixed(1)}%  by decision:`);
for (const dec of ['follow', 'fade']) {
  const sub = allOOS.filter(t => t.decision === dec).map(t => t.rr).filter(x => x != null);
  console.log(`  ${dec}: p50=${pctileOf(sub, 50)}, fraction>=1: ${(sub.filter(r => r >= 1).length / sub.length * 100).toFixed(1)}%`);
}

function row(label, trades) {
  if (trades.length < 30) return `${label.padEnd(28)}${String(trades.length).padStart(7)}   [thin]`;
  const s = summarizeTrades(trades.map(t => t.pnlPct), trades.map(t => t.date));
  const n = trades.length;
  const m = trades.reduce((a, t) => a + t.pnlPct, 0) / n;
  const sd = Math.sqrt(trades.reduce((a, t) => a + (t.pnlPct - m) ** 2, 0) / (n - 1));
  const t = sd > 0 ? m / (sd / Math.sqrt(n)) : 0;
  return label.padEnd(28) + String(n).padStart(7) + (s.winRate ?? 0).toFixed(1).padStart(8) +
    ((m >= 0 ? '+' : '') + m.toFixed(4)).padStart(10) + (s.profitFactor ?? 0).toFixed(2).padStart(7) +
    (s.sharpe ?? 0).toFixed(2).padStart(8) + ('t' + t.toFixed(2)).padStart(8);
}

console.log('\n' + '='.repeat(94));
console.log('R:R GEOMETRY FILTER — target:stop known at entry, no fitting, no outcome data used');
console.log('='.repeat(94));
console.log('policy'.padEnd(28), 'n'.padStart(7), 'win%'.padStart(8), 'meanPct'.padStart(10), 'PF'.padStart(7), 'sharpe'.padStart(8), 't-stat'.padStart(8));
console.log(row('IS  all (no filter)', allIS));
console.log(row('OOS all (no filter)', allOOS));
console.log('');
for (const th of RR_THRESHOLDS) {
  console.log(row(`IS  rr>=${th}`, allIS.filter(t => t.rr != null && t.rr >= th)));
  console.log(row(`OOS rr>=${th}`, allOOS.filter(t => t.rr != null && t.rr >= th)));
  console.log('');
}

console.log('--- OOS, rr>=1.0, by decision ---');
console.log(row('follow rr>=1', allOOS.filter(t => t.decision === 'follow' && t.rr != null && t.rr >= 1)));
console.log(row('fade rr>=1', allOOS.filter(t => t.decision === 'fade' && t.rr != null && t.rr >= 1)));

console.log('\n--- per pair (OOS, rr>=1.0) ---');
for (const pair of PAIRS) {
  const P = pair.toUpperCase();
  console.log(row(P, allOOS.filter(t => t.instrument === P && t.rr != null && t.rr >= 1)));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const oosFiltered = allOOS.filter(t => t.rr != null && t.rr >= 1);
fs.writeFileSync(path.join(OUT_DIR, 'level_base_rates_rr_filter.json'), JSON.stringify({
  baseline: allOOS.length >= 30 ? summarizeTrades(allOOS.map(t => t.pnlPct), allOOS.map(t => t.date)) : null,
  rrGte1: oosFiltered.length >= 30 ? summarizeTrades(oosFiltered.map(t => t.pnlPct), oosFiltered.map(t => t.date)) : null,
}, null, 1));
console.log(`\nWrote ${OUT_DIR}/level_base_rates_rr_filter.json`);
