// End-to-end check of the live job's day processing on a historical day: real createPaperRecord code, a fake KV and a
// fake live cache filled with local M1 history up to that day's end. Its trades must equal asym_build's BREAK rows.
//   node scripts/rangebook/paper_job_test.mjs gold 2024-03-05
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
const { createPaperRecord } = await import(pathToFileURL(path.resolve('../MacroFXModel-paper/js/paperRecordRoutes.js')).href);
const PAIR = process.argv[2] ?? 'gold', DATE = process.argv[3] ?? '2024-03-05';
const full = await loadM1ForPair(PAIR);
const endSec = Date.parse(DATE + 'T23:59:00Z') / 1000 + 3600;
let n = 0; while (n < full.n && full.times[n] < endSec) n++;
const start = Math.max(0, n - 200 * 1440);
const cut = a => a.slice(start, n);
const packed = { n: n - start, times: cut(full.times), opens: cut(full.opens), highs: cut(full.highs), lows: cut(full.lows), closes: cut(full.closes), volumes: full.volumes ? cut(full.volumes) : undefined };
const liveCache = new Map([[PAIR, { packed }]]);
const job = createPaperRecord({ kv: { getStrict: async () => null, get: async () => null, put: async () => {} }, getFastLive: async () => ({}), liveCache, liveEventTag: (() => { const f = loadCalendarProxy(); return (sym, date) => f(sym)(date); })() });
const store = { days: { [DATE]: { flags: { [PAIR]: { rich: true } }, trades: [] } }, log: [] };
await job._updateDay(store, DATE, true);
const r3 = x => Math.round(x * 1000) / 1000;
const mine = store.days[DATE].trades.map(t => `${t.line}|${t.dir}|${r3(t.variants['0.1σ/5R'].R)}|${r3(t.variants['0.2σ/10R'].R)}`).sort();
const ref = JSON.parse(fs.readFileSync(`analysis/output/rangebook/${PAIR}_asym.json`, 'utf8')).rows.filter(r => r.type === 'BREAK' && r.date === DATE)
  .map(r => `${r.line}|${r.dir}|${r['s0.1'].r5.R}|${r['s0.2'].r10.R}`).sort();
console.log('job :', mine); console.log('ref :', ref);
console.log(JSON.stringify(mine) === JSON.stringify(ref) ? 'MATCH' : 'DIFFERENT (rounding?)');
