// Level Base Rate Confluence Book — 2026-09-11
//
// A genuinely different book off the SAME raw touches level_base_rates_*
// already walks: instead of asking "does this context dimension shift WIN
// PROBABILITY" (what Thread 1's original vote effectively did, and what
// made its edge thin and fragile), this asks "does this context dimension
// shift PRICED PnL" directly -- real target/stop, real cost, same p50=
// follow/p75=fade rule already confirmed net-negative on its own
// (level_base_rates_priced.mjs: t=-6.55 pooled). The question isn't "is
// there a lean" anymore -- there clearly is -- it's "is there a condition
// under which the REWARD:RISK shape itself, not just the win rate, turns
// favourable."
//
// Honest by construction: IS block for discovery, real (never-seen) OOS
// block for confirmation, same split/bound every other engine here uses.
// A finding only counts if BOTH halves clear a sample floor, agree in
// SIGN, and clear a real magnitude -- annotateHolds' own discipline,
// applied to priced PnL instead of the out%/back% axis it was built for.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { splitAt } from '../js/levelAtlasReport.js';
import { priceBarrierTrade, applyConcurrencyCap } from '../js/levelAtlasVoteReview.js';
import { costForPair } from '../js/perLineStrategy.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';
import { boundPacked, LOOKBACK_DAYS } from '../js/levelAtlasRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');
const REARM = 0.3;
const MIN_N = 30;
const MIN_ABS_MEAN_DELTA = 0.005; // pp of price, vs the cell's own base -- real, not noise-floor

const ALL_PAIRS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
  'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];
const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ALL_PAIRS;
const RULE = { p50: 'follow', p75: 'fade' };

// Every context dimension atlasWalk's touch record carries -- same list the
// vote book's own DIMENSIONS uses (js/levelAtlasReport.js), minus the
// outcome-derived/bookkeeping ones (ordinal, prevOutcome*) which aren't
// "known at entry" the same clean way and are tested separately if this
// pass finds anything worth following up.
const DIMENSIONS = ['session', 'dow', 'sessionPos', 'gapBucket', 'dayVol', 'asiaVol', 'londonVol',
  'prevSessionVol', 'churn', 'otherSideTouchedBefore', 'approachVel', 'approachER', 'wtState',
  'wtMtf', 'wtSlow', 'vwapSide', 'momAdx', 'htfTrend', 'volClimax', 'roundNum', 'prevCloseLoc',
  'overlapWindow', 'ivRegime', 'vrp', 'ivSkewDir', 'confluence', 'candleReject'];

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

  const priceRows = block => {
    const out = [];
    for (const t of block) {
      const decision = RULE[t.rung];
      if (!decision) continue;
      const priced = priceBarrierTrade(t, decision, cost);
      if (!priced) continue;
      out.push({ ...t, pnlPct: priced.pnlPct, win: priced.win, timedOut: !!priced.timedOut });
    }
    return applyConcurrencyCap(out, { maxConcurrent: 1 }).kept ?? out;
  };
  perPairIS[pair.toUpperCase()] = priceRows(atRearm.filter(t => t.date < split));
  perPairOOS[pair.toUpperCase()] = priceRows(atRearm.filter(t => t.date >= split));
  console.log(`  IS ${perPairIS[pair.toUpperCase()].length} priced trades, OOS ${perPairOOS[pair.toUpperCase()].length}`);
}

const allIS = Object.values(perPairIS).flat();
const allOOS = Object.values(perPairOOS).flat();
console.log(`\nTotal: IS ${allIS.length}, OOS ${allOOS.length}`);

function meanSe(rows) {
  const n = rows.length;
  if (!n) return null;
  const m = rows.reduce((a, r) => a + r.pnlPct, 0) / n;
  const sd = n > 1 ? Math.sqrt(rows.reduce((a, r) => a + (r.pnlPct - m) ** 2, 0) / (n - 1)) : 0;
  return { n, mean: m, se: sd / Math.sqrt(n) };
}

const baseIS = meanSe(allIS), baseOOS = meanSe(allOOS);
console.log(`Base (no dimension, pooled): IS mean=${baseIS.mean.toFixed(4)}  OOS mean=${baseOOS.mean.toFixed(4)}`);

const findings = [];
for (const dim of DIMENSIONS) {
  const bucketsIS = {}, bucketsOOS = {};
  for (const r of allIS) { const b = r[dim]; if (b == null) continue; (bucketsIS[b] ??= []).push(r); }
  for (const r of allOOS) { const b = r[dim]; if (b == null) continue; (bucketsOOS[b] ??= []).push(r); }
  for (const bucket of Object.keys(bucketsIS)) {
    const isRows = bucketsIS[bucket], oosRows = bucketsOOS[bucket];
    if (!oosRows || isRows.length < MIN_N || oosRows.length < MIN_N) continue;
    const mIS = meanSe(isRows), mOOS = meanSe(oosRows);
    const deltaIS = mIS.mean - baseIS.mean, deltaOOS = mOOS.mean - baseOOS.mean;
    const sameSign = Math.sign(deltaIS) === Math.sign(deltaOOS) && deltaIS !== 0;
    if (sameSign && Math.abs(deltaIS) >= MIN_ABS_MEAN_DELTA && Math.abs(deltaOOS) >= MIN_ABS_MEAN_DELTA) {
      const tOOS = mOOS.se > 0 ? mOOS.mean / mOOS.se : 0;
      findings.push({ dim, bucket, nIS: mIS.n, meanIS: +mIS.mean.toFixed(4), nOOS: mOOS.n, meanOOS: +mOOS.mean.toFixed(4), deltaOOS: +deltaOOS.toFixed(4), tOOS: +tOOS.toFixed(2), absoluteOOS: mOOS.mean > 0 ? 'POSITIVE' : 'still negative' });
    }
  }
}
findings.sort((a, b) => b.deltaOOS - a.deltaOOS);

console.log(`\n${findings.length} held findings (n>=${MIN_N} both halves, |delta|>=${MIN_ABS_MEAN_DELTA}, same sign)\n`);
console.log('dim'.padEnd(16), 'bucket'.padEnd(12), 'nIS'.padEnd(6), 'meanIS'.padEnd(9), 'nOOS'.padEnd(6), 'meanOOS'.padEnd(9), 'deltaOOS'.padEnd(9), 'tOOS'.padEnd(7), 'absolute');
for (const f of findings) {
  console.log(f.dim.padEnd(16), String(f.bucket).padEnd(12), String(f.nIS).padEnd(6), String(f.meanIS).padEnd(9), String(f.nOOS).padEnd(6), String(f.meanOOS).padEnd(9), String(f.deltaOOS).padEnd(9), String(f.tOOS).padEnd(7), f.absoluteOOS);
}

const positiveAbsolute = findings.filter(f => f.absoluteOOS === 'POSITIVE');
console.log(`\n${positiveAbsolute.length} of ${findings.length} held findings flip to ABSOLUTE POSITIVE mean PnL in OOS, not just relatively better than the (negative) base.`);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'level_base_rates_confluence_book.json'), JSON.stringify({ baseIS, baseOOS, findings }, null, 1));
console.log(`\nWrote ${OUT_DIR}/level_base_rates_confluence_book.json`);
