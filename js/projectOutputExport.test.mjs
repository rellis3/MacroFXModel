// node js/projectOutputExport.test.mjs — the annotator keeps every existing line and adds one track record per block.
import assert from 'node:assert/strict';
import { annotateProjectOutput, trackRecordLine } from './projectOutputExport.js';

const src = ['**VOL & RANGE FORECAST — CHOSEN (PERSISTENCE + IV)**', '**For session: MONDAY, October 12, 2026**', 'Event bucket: none', '',
  '──── EURUSD ──────────────────', 'Volatility (annualized) : 6.20%', 'High to Low range       : 0.53% median · 0.68% 75th Percentile · 0.85% 90th', '',
  '──── NQ ──────────────────────', 'Volatility (annualized) : 14.35%', 'High to Low range       : 1.26% median · 1.65% 75th Percentile · 2.13% 90th', ''].join('\n');
const out = annotateProjectOutput(src, 'daily');
for (const l of src.split('\n')) if (l.trim()) assert.ok(out.includes(l), `kept: ${l}`);
assert.equal((out.match(/Track record \(daily\)/g) || []).length, 2);
assert.ok(out.indexOf('Track record (daily)') > out.indexOf('──── EURUSD') && out.indexOf('Track record (daily)') < out.indexOf('──── NQ'));
assert.ok(out.startsWith('**VOL & RANGE FORECAST'));
assert.ok(/PROJECT OUTPUT — DAILY/.test(out));
assert.ok(!/High to Low|Open High|Open Low|Open to Close|Volatility/.test(trackRecordLine('EURUSD', 'daily')), 'track record must not carry indicator tokens');
const wk = annotateProjectOutput(src.replace('CHOSEN (PERSISTENCE + IV)', 'WEEKLY (REVERTING σ)'), 'weekly');
assert.equal((wk.match(/Track record \(weekly\)/g) || []).length, 2);
assert.ok(trackRecordLine('SPX', 'daily') && trackRecordLine('US30', 'daily'));
assert.equal(trackRecordLine('NOPE', 'daily'), null);
console.log('projectOutputExport: ok');
