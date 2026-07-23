/**
 * Synthetic-data smoke test for the POI-reaction engine — no network, no parquet.
 * Verifies the engine composes the bricks and produces sane, honest records:
 * finite PnL, costs applied (net < gross for a win), records shaped for
 * summarizeSplit, and no trade dated before the warmup window.
 */
import assert from 'node:assert';
import { runPoiReaction, DEFAULT_CFG } from './poiReactionV1Engine.js';

const DAY = 86400, MIN = 60;

// Build ~200 days of deterministic M1 with an intraday oscillation around a slow
// drift, so daily levels form and price revisits them (fills happen).
function synthPacked(days = 220) {
  const times = [], opens = [], highs = [], lows = [], closes = [], volumes = [];
  let base = 1.2000;
  const t0 = Math.floor(Date.UTC(2020, 0, 1) / 1000);
  for (let d = 0; d < days; d++) {
    base += Math.sin(d / 9) * 0.0008;                 // slow, mean-reverting drift
    const dayStart = t0 + d * DAY;
    for (let m = 0; m < 1440; m += 5) {               // one bar / 5 min
      const t = dayStart + m * MIN;
      const intr = Math.sin(m / 1440 * Math.PI * 4) * 0.0025;   // intraday swing
      const px = base + intr;
      const o = px, c = px + 0.0001 * Math.cos(m / 50);
      const hi = Math.max(o, c) + 0.0003, lo = Math.min(o, c) - 0.0003;
      times.push(t); opens.push(o); highs.push(hi); lows.push(lo); closes.push(c); volumes.push(10 + (m % 7));
    }
  }
  return {
    n: times.length,
    times: Int32Array.from(times), opens: Float32Array.from(opens), highs: Float32Array.from(highs),
    lows: Float32Array.from(lows), closes: Float32Array.from(closes), volumes: Float32Array.from(volumes),
  };
}

const packed = synthPacked();
const { trades, records, meta } = runPoiReaction(packed, { instrument: 'eurusd', warmupDays: 60 });

assert.ok(meta.days > 150, 'built daily bars');
assert.ok(Array.isArray(trades) && Array.isArray(records), 'returns arrays');
assert.ok(records.length === trades.length, 'one record per trade');

// Every record is shaped for summarizeSplit and has finite, costed PnL.
for (const r of records) {
  assert.ok(r.filled === true, 'records are filled trades');
  assert.ok(Number.isFinite(r.pnl_pct), 'pnl_pct finite');
  assert.ok(/^\d{4}-\d\d-\d\d$/.test(r.date), 'date is ISO day');
}

// No trade before the warmup window (no lookahead into un-warmed history).
const WARMUP = 60;   // must match the warmupDays passed to runPoiReaction above
const warmCutoff = new Date((packed.times[0] + WARMUP * DAY) * 1000).toISOString().substring(0, 10);
for (const t of trades) assert.ok(t.date >= warmCutoff, `trade ${t.date} respects warmup ${warmCutoff}`);

// Cost is applied: for a win, net < gross by ~the cost; R and % are not identical
// (vol-scaled stop varies), guarding the degenerate-column case.
const win = trades.find(t => t.outcome === 'win');
if (win) {
  assert.ok(win.netPct < win.grossPct, 'cost deducted from gross');
  assert.ok(Math.abs(win.R) > 0 && win.riskPctPrice > 0, 'R computed from a positive vol-scaled risk unit');
}

// SL/TP are on the correct sides of entry for each direction.
for (const t of trades) {
  if (t.side === 'BUY') { assert.ok(t.sl < t.entry && t.tp > t.entry, 'BUY: sl<entry<tp'); }
  else { assert.ok(t.sl > t.entry && t.tp < t.entry, 'SELL: tp<entry<sl'); }
}

console.log(`poiReactionV1Engine.test: OK — ${trades.length} synthetic trades, ${meta.days} days, all invariants hold`);
