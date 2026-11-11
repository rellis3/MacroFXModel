// node js/nqRatesResidual.test.mjs  — checks the JS monitor against the Python study's own output on the same FRED files.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { alignDaily, rollingMonitor, describe } from './nqRatesResidual.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'analysis', 'output', 'nq-rates-residual-monitor');
let fails = 0;
const ok = (c, msg, extra = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${msg}${extra ? '  ' + extra : ''}`); if (!c) fails++; };

const csv = f => fs.readFileSync(path.join(DIR, 'data', f), 'utf8').trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; }).filter(o => Number.isFinite(o.value));
if (!fs.existsSync(path.join(DIR, 'monitor_daily.csv'))) { console.log('  (skipped: study output missing)'); process.exit(0); }
const A = alignDaily(csv('NASDAQ100.csv'), csv('DGS2.csv'), csv('DGS10.csv'));
const keep = A.dates.map((d, i) => d >= '2005-01-01' ? i : -1).filter(i => i >= 0);      // the study starts at 2005-01-01
const sub = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, keep.map(i => v[i])]));
const rows = rollingMonitor(sub, 120);
const py = new Map(fs.readFileSync(path.join(DIR, 'monitor_daily.csv'), 'utf8').trim().split('\n').slice(1).map(l => l.split(',')).map(c => [c[0], { b2y: +c[2], r2: +c[4], z: +c[8], z20: c[9] === '' ? null : +c[9] }]));
ok(rows.length === py.size, 'same number of days as the Python study', `${rows.length} vs ${py.size}`);
let maxD = 0, n = 0;
for (const r of rows) { const p = py.get(r.date); if (!p) continue; n++; maxD = Math.max(maxD, Math.abs(r.b2y - p.b2y), Math.abs(r.r2 - p.r2), Math.abs(r.z - p.z), p.z20 == null ? 0 : Math.abs(r.z20 - p.z20)); }
ok(n > 5000 && maxD < 1e-3, 'betas, R2, z and z20 match the Python output', `max abs diff ${maxD.toExponential(2)} over ${n} days`);
const d = describe(rows.at(-1));
ok(d && typeof d.regime === 'string' && typeof d.gap === 'string', 'describe() gives a plain-English read', JSON.stringify(d));
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
