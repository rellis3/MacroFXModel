// M1 archive gap audit — 2026-09-12
//
// Checks whether any pair's M1 series has a SUSPICIOUS time-gap: not a
// normal weekend closure or brief rollover, but a multi-bar hole during what
// should have been active trading. This is exactly the shape of damage the
// old m1GapFill silent-chunk-skip bug (fixed this session) could have left
// behind in an ALREADY-PERSISTED book -- the fix stops NEW gaps, it does not
// retroactively repair anything that happened before it existed. This script
// is the retroactive check.
//
// A weekend gap is real and expected (FX/indices close Friday evening,
// reopen Sunday evening -- roughly 48h, longer over a long weekend). A
// multi-minute-to-multi-hour gap on an otherwise-active weekday is not
// normal and is flagged for a human to look at directly -- this script
// classifies, it doesn't auto-explain away a real hole.
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { mergeBarsIntoPacked } from '../js/m1GapFill.js';

const PROD_BASE = 'https://macrofxmodel-production.up.railway.app';
// A genuine fetch-chunk failure (the bug this audits for) fails an ENTIRE
// chunk at once -- js/m1GapFill.js's chunkMinuteRange pages at 5000 minutes
// (~3.5 days) per request, so a real silent-skip hole is hours-to-days wide,
// never a few minutes. Started at 10 min and found 400+ hits, all clustered
// at 21:00-23:59 UTC Fri/Sun (normal thin-liquidity rollover, not a bug) --
// raised to filter that noise out while still catching what actually matters.
const SUSPICIOUS_MIN_GAP_MINUTES = 90;
const WEEKEND_MIN_GAP_MINUTES = 40 * 60; // ~40h+ gaps are presumptively weekend/holiday, not flagged

const PAIRS = process.env.LA_PAIRS ? process.env.LA_PAIRS.split(',') : ['eurusd', 'gbpusd', 'usdjpy', 'audusd',
  'usdchf', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

async function fetchGapCandles(pair, fromDate, toDate) {
  try {
    const r = await fetch(`${PROD_BASE}/api/vol-backtest/candles/${pair}?from=${fromDate}&to=${toDate}`);
    const j = await r.json();
    if (!j.ok) return [];
    return j.candles.map(c => ({ time: c.time + 'Z', open: c.open, high: c.high, low: c.low, close: c.close }));
  } catch { return []; }
}

const today = new Date().toISOString().slice(0, 10);
const allFindings = [];

for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}: loading M1...`);
  let packed = await loadM1ForPair(pair);
  const lastLocalDate = new Date(packed.times[packed.n - 1] * 1000).toISOString().slice(0, 10);
  if (lastLocalDate < today) {
    const gapBars = await fetchGapCandles(pair, lastLocalDate, today);
    if (gapBars.length) packed = mergeBarsIntoPacked(packed, gapBars);
  }

  let suspicious = 0, weekendOrLong = 0;
  const dow = t => new Date(t * 1000).getUTCDay(); // 0=Sun..6=Sat
  for (let i = 1; i < packed.n; i++) {
    const prev = packed.times[i - 1], cur = packed.times[i];
    const gapMin = (cur - prev) / 60;
    if (gapMin <= 1.5) continue; // normal consecutive minute bar
    if (gapMin >= WEEKEND_MIN_GAP_MINUTES) { weekendOrLong++; continue; }
    // A gap spanning a Friday->Sunday/Monday boundary at a plausible weekend length is not suspicious either,
    // even if slightly under the blanket threshold (holiday weeks can run short).
    const spansWeekend = (dow(prev) === 5 || dow(prev) === 6) && gapMin >= 20 * 60;
    if (spansWeekend) { weekendOrLong++; continue; }
    if (gapMin >= SUSPICIOUS_MIN_GAP_MINUTES) {
      suspicious++;
      allFindings.push({
        pair: pair.toUpperCase(),
        from: new Date(prev * 1000).toISOString(),
        to: new Date(cur * 1000).toISOString(),
        gapMinutes: +gapMin.toFixed(1),
      });
    }
  }
  console.log(`  ${packed.n} bars, ${weekendOrLong} normal weekend/long closures, ${suspicious} SUSPICIOUS gaps`);
}

console.log(`\n${'='.repeat(80)}\nSUSPICIOUS GAPS (not a normal weekend/rollover) -- ${allFindings.length} total\n${'='.repeat(80)}`);
allFindings.sort((a, b) => b.gapMinutes - a.gapMinutes);
for (const f of allFindings.slice(0, 100)) {
  console.log(`  ${f.pair.padEnd(8)} ${f.from} -> ${f.to}  (${f.gapMinutes} min)`);
}
if (allFindings.length > 100) console.log(`  ... and ${allFindings.length - 100} more`);
if (!allFindings.length) console.log('  None found -- no evidence of a retroactive silent gap in any checked pair.');

import fs from 'fs';
fs.mkdirSync('analysis/output', { recursive: true });
fs.writeFileSync('analysis/output/m1_archive_gap_audit.json', JSON.stringify(allFindings, null, 1));
console.log(`\nWrote analysis/output/m1_archive_gap_audit.json (${allFindings.length} findings)`);
