import fs from 'fs'; import path from 'path';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { yangZhangVolSeries } from '../js/volForecast.js';
import { decomposeCurrencyDrift, pooledGain } from '../js/driftCrossSection.js';

const DIR = new URL('../VolRangeForecaster/data/m1/', import.meta.url).pathname;
const PAIRS = ['eurusd','gbpusd','audusd','nzdusd','usdjpy','usdcad','usdchf',
  'eurgbp','eurjpy','eurchf','eurcad','euraud','eurnzd','gbpjpy','gbpchf','gbpcad',
  'gbpaud','gbpnzd','audjpy','audchf','audcad','audnzd','cadjpy','chfjpy','nzdjpy'];
const WIN = 14;

async function daily(file) {
  const ab = fs.readFileSync(file);
  const buf = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength);
  const f = { byteLength: buf.byteLength, slice: (s,e)=>Promise.resolve(buf.slice(s,e)) };
  const meta = await parquetMetadataAsync(f);
  let rows; await parquetRead({ file:f, metadata:meta, columns:['open','high','low','close','datetime'],
    rowFormat:'object', onComplete:d=>rows=d });
  // Bucket M1 into UTC days (open/high/low/close per day).
  const days = new Map();
  for (const r of rows) {
    const t = r.datetime instanceof Date ? r.datetime : new Date(r.datetime);
    const k = t.toISOString().slice(0,10);
    let d = days.get(k);
    if (!d) { d = {open:r.open, high:r.high, low:r.low, close:r.close}; days.set(k,d); }
    else { if(r.high>d.high)d.high=r.high; if(r.low<d.low)d.low=r.low; d.close=r.close; }
  }
  return [...days.entries()].sort((a,b)=>a[0]<b[0]?-1:1).map(([date,d])=>({date,...d}));
}

const obs = [];
for (const p of PAIRS) {
  const file = path.join(DIR, p + '_m1.parquet');
  if (!fs.existsSync(file)) { console.error('missing', p); continue; }
  const d1 = await daily(file);
  if (d1.length < 60) { console.error('short', p, d1.length); continue; }
  const sig = yangZhangVolSeries(d1);
  const sigma = sig.at(-1);
  const c = d1.map(b=>b.close);
  const mu = Math.log(c.at(-1) / c.at(-(WIN+1))) / WIN;
  if (!(sigma>0) || !Number.isFinite(mu)) { console.error('bad', p); continue; }
  obs.push({ pair:p.toUpperCase(), base:p.slice(0,3).toUpperCase(), quote:p.slice(3,6).toUpperCase(),
             mu: mu*100, sigma: sigma*100, asOf: d1.at(-1).date, n: d1.length });
}
console.log(`loaded ${obs.length} pairs, as of ${obs[0]?.asOf}, ${obs[0]?.n} daily bars\n`);
const fit = decomposeCurrencyDrift(obs, { win: WIN });
console.log('weighting:', fit.weighting, '| dispersion:', fit.dispersion, '| R²:', fit.r2, '| n:', fit.n, 'k:', fit.nCcy);
console.log('\nCURRENCY DRIFT (%/day, sum=0 basket numeraire)');
console.log('  ccy    drift      se      t    pairs');
for (const r of fit.rank)
  console.log(`  ${r.ccy}   ${r.drift>=0?'+':''}${r.drift.toFixed(4)}  ${r.se.toFixed(4)}  ${(r.t>=0?'+':'')}${r.t.toFixed(2)}   ${r.nPairs}`);
console.log(`\nspread ${fit.strongest} - ${fit.weakest}: ${fit.spread.toFixed(4)} %/day`);
const g = pooledGain(fit, 'EUR', 'USD', obs.find(o=>o.pair==='EURUSD').sigma, WIN);
console.log('\nEURUSD  per-pair SE', g.perPairSE.toFixed(4), ' pooled SE', g.pooledSE.toFixed(4), ' gain', g.ratio.toFixed(2)+'x');
console.log('\nLARGEST PAIR-SPECIFIC RESIDUALS (move the currency legs do NOT explain)');
for (const r of fit.residuals.slice().sort((a,b)=>Math.abs(b.residZ)-Math.abs(a.residZ)).slice(0,5))
  console.log(`  ${r.pair}  mu ${r.mu>=0?'+':''}${r.mu.toFixed(3)}  fitted ${r.fitted>=0?'+':''}${r.fitted.toFixed(3)}  resid ${r.resid>=0?'+':''}${r.resid.toFixed(3)}  (${r.residZ>=0?'+':''}${r.residZ.toFixed(2)}σ)`);
