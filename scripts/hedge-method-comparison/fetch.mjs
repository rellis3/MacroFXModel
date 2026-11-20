#!/usr/bin/env node
// hedge-method-comparison: build the daily-close panel from M1 (NY-close days, lockbox end 2026-08-21), read-only.
// Prereg: forge/HEDGE_METHOD_COMPARISON_PREREG.md.   node scripts/hedge-method-comparison/fetch.mjs [m1Dir]
// Output: analysis/output/hedge-method-comparison/daily_closes.json  { keys, dates, close: {KEY: [..]} }  (inner join: a date is kept only if every series printed)
import fs from 'node:fs';
import path from 'node:path';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { nyCloseDailyBars } from '../../js/voteAtlasV4Lines.js';

const M1_DIR = process.argv[2] || path.resolve(process.cwd(), '../MacroFXModel/VolRangeForecaster/data/m1');
const END = '2026-08-21', START = '2016-01-01';
const KEYS = ['gold', 'nq', 'us30', 'us2000', 'de30', 'eurusd', 'gbpusd', 'usdjpy', 'usdchf', 'audusd', 'usdcad', 'nzdusd'];
const OUT = new URL('../../analysis/output/hedge-method-comparison/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

const byKey = {};
for (const k of KEYS) {
  const packed = await loadM1ForPair(k, M1_DIR);
  if (!packed?.n) throw new Error(`no M1 for ${k}`);
  const days = nyCloseDailyBars(packed).filter(b => b.n >= 60 && b.key >= START && b.key <= END && Number.isFinite(b.close) && b.close > 0);
  byKey[k] = new Map(days.map(b => [b.key, b.close]));
  console.log(k, 'days', days.length, days[0]?.key, '->', days.at(-1)?.key);
}
let dates = [...byKey[KEYS[0]].keys()].filter(d => KEYS.every(k => byKey[k].has(d))).sort();
// drop weekend-stamped days (the NY-close day key can land on a Sunday for a stub)
dates = dates.filter(d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w >= 1 && w <= 5; });
const close = {}; for (const k of KEYS) close[k] = dates.map(d => byKey[k].get(d));
fs.writeFileSync(new URL('daily_closes.json', OUT), JSON.stringify({ keys: KEYS, dates, close, m1Dir: M1_DIR, builtAt: new Date().toISOString() }));
console.log('common dates', dates.length, dates[0], '->', dates.at(-1));
process.exit(0);
