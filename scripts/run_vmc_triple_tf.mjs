#!/usr/bin/env node
/**
 * Run the VMC triple-TF circle test (MD files/VMC_TRIPLE_TF_FINDINGS.md,
 * pre-registered) on gold + FX majors, with the seeded random-walk control
 * through the identical engine.
 *
 *   node scripts/run_vmc_triple_tf.mjs [pairs...]   (default: gold eurusd gbpusd usdjpy)
 */

import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { runVmcTripleTf } from '../js/vmcTripleTfEntryV1Engine.js';
import { syntheticRandomWalkPacked } from '../js/syntheticWalk.js';
import { summarizeSplit } from '../js/honestForecastEngine.js';

const pairs = process.argv.slice(2).filter(a => !a.startsWith('-'));
const list = pairs.length ? pairs : ['gold', 'eurusd', 'gbpusd', 'usdjpy'];

const tOf = s => s.trades > 1 && s.tradesPerYr > 0
  ? +((s.sharpe / Math.sqrt(s.tradesPerYr)) * Math.sqrt(s.trades)).toFixed(2) : null;

function eventStudy(label, events) {
  for (const side of ['buy', 'sell']) {
    const evs = events[side];
    const parts = [15, 30, 60, 120].map(h => {
      const v = evs.map(e => e[`h${h}`]).filter(x => x != null);
      if (v.length < 10) return `${h}m —`;
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
      const t = sd > 0 ? (m / (sd / Math.sqrt(v.length))).toFixed(1) : '—';
      const win = (v.filter(x => x > 0).length / v.length * 100).toFixed(0);
      return `${h}m ${m >= 0 ? '+' : ''}${(m * 100).toFixed(2)}bp (t ${t}, win ${win}%)`;
    });
    console.log(`  ${label} ${side.padEnd(4)} n=${String(evs.length).padStart(5)}  ${parts.join('  ')}`);
  }
}

for (const pair of list) {
  const packed = await loadM1ForPair(pair);
  if (!packed?.n) { console.log(`\n=== ${pair}: no M1 ===`); continue; }
  const costPct = pair === 'gold' ? 0.020 : 0.012;
  const { events, records, meta } = runVmcTripleTf(packed, { costPct });
  console.log(`\n=== ${pair.toUpperCase()} — circles 1/3/5m: buy ${meta.circleCounts.buy.join('/')}, sell ${meta.circleCounts.sell.join('/')} ===`);
  eventStudy('fwd', events);
  for (const side of ['buy', 'sell']) {
    const { is, oos } = summarizeSplit(records[side], 0.4);
    const grossOOS = oos.trades ? +(oos.expectancy + costPct).toFixed(4) : null;
    console.log(`  trade ${side.padEnd(4)} IS n=${String(is.trades).padStart(5)} mean ${String(is.expectancy).padStart(8)}% t ${String(tOf(is)).padStart(6)} | OOS n=${String(oos.trades).padStart(5)} mean ${String(oos.expectancy).padStart(8)}% t ${String(tOf(oos)).padStart(6)} win ${oos.winRate}% gross ${grossOOS}%`);
  }
}

console.log('\n=== RANDOM-WALK CONTROL (800 synthetic days, identical engine) ===');
{
  const { events } = runVmcTripleTf(syntheticRandomWalkPacked({ seed: 7, days: 800 }));
  eventStudy('fwd', events);
}
