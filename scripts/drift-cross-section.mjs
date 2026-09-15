/**
 * drift-cross-section — the currency-factor decomposition, run on the real M1 caches.
 *
 * Two modes, ONE data path, so the printed table and any exported history can never
 * describe different numbers (the reason this is a flag rather than a second script):
 *
 *   node scripts/drift-cross-section.mjs
 *       Prints today's currency table, the pooling gain, and the largest
 *       pair-specific residuals.
 *
 *   node scripts/drift-cross-section.mjs --history 60 --json out.json
 *       Also refits as of each of the last N sessions and writes the whole series
 *       as JSON — the shape the published drift artifact is built from.
 *
 * Needs `hyparquet` (a package.json dependency) and the M1 parquet caches under
 * VolRangeForecaster/data/m1. Reading ~1.6GB takes a couple of minutes.
 */
import fs from 'fs'; import path from 'path';
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { yangZhangVolSeries } from '../js/volForecast.js';
import { decomposeCurrencyDrift, pooledGain } from '../js/driftCrossSection.js';

const DIR = new URL('../VolRangeForecaster/data/m1/', import.meta.url).pathname;
const PAIRS = ['eurusd','gbpusd','audusd','nzdusd','usdjpy','usdcad','usdchf',
  'eurgbp','eurjpy','eurchf','eurcad','euraud','eurnzd','gbpjpy','gbpchf','gbpcad',
  'gbpaud','gbpnzd','audjpy','audchf','audcad','audnzd','cadjpy','chfjpy','nzdjpy'];
const WIN = 14;

const ARGV = process.argv.slice(2);
const argOf = k => { const i = ARGV.indexOf(k); return i >= 0 ? ARGV[i + 1] : null; };
const HISTORY = Math.max(0, parseInt(argOf('--history') ?? '0', 10) || 0);
const JSON_OUT = argOf('--json');

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

// Load each pair's daily bars + causal sigma series ONCE; every snapshot below is
// an index into these, so a 60-day history costs one parquet read, not sixty.
const D = {}, S = {};
for (const p of PAIRS) {
  const file = path.join(DIR, p + '_m1.parquet');
  if (!fs.existsSync(file)) { console.error('missing', p); continue; }
  const d1 = await daily(file);
  if (d1.length < 60) { console.error('short', p, d1.length); continue; }
  D[p] = d1; S[p] = yangZhangVolSeries(d1);
}

/** Observations as of `back` sessions ago (0 = latest). Causal: sigma[i] is built
 *  from bars through i, and mu spans closes i-WIN..i. */
function observationsAt(back) {
  const out = [];
  for (const p of PAIRS) {
    const d1 = D[p], sg = S[p];
    if (!d1) continue;
    const i = d1.length - 1 - back;
    if (i < WIN + 35) continue;                    // sigma needs its own window first
    const sigma = sg[i];
    const mu = Math.log(d1[i].close / d1[i - WIN].close) / WIN;
    if (!(sigma > 0) || !Number.isFinite(mu)) continue;
    out.push({ pair: p.toUpperCase(), base: p.slice(0, 3).toUpperCase(),
               quote: p.slice(3, 6).toUpperCase(), mu: mu * 100, sigma: sigma * 100,
               asOf: d1[i].date, n: d1.length });
  }
  return out;
}

const obs = observationsAt(0);
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

// ── optional history export ──────────────────────────────────────────────────
if (HISTORY > 0) {
  const ref = D['eurusd'];
  const snaps = [];
  for (let back = HISTORY - 1; back >= 0; back--) {
    const o = observationsAt(back);
    const f = decomposeCurrencyDrift(o, { win: WIN });
    if (!f || f.error) continue;
    snaps.push({
      date: ref[ref.length - 1 - back].date,
      ccy: Object.fromEntries(Object.entries(f.currencies)
        .map(([c, v]) => [c, { d: v.drift, se: v.se, t: v.t, n: v.nPairs }])),
      r2: f.r2, dispersion: f.dispersion,
      ...(back === 0 ? { residuals: f.residuals, obs: o } : {}),
    });
  }
  console.log(`\nhistory: ${snaps.length} snapshots, ${snaps[0]?.date} -> ${snaps.at(-1)?.date}`);
  const tHi = snaps.map(sn => Object.values(sn.ccy).filter(v => Math.abs(v.t) > 2).length);
  console.log(`legs clearing |t|>2 on an average day: `
    + `${(tHi.reduce((a, b) => a + b, 0) / tHi.length).toFixed(2)} of ${Object.keys(snaps[0].ccy).length}`);
  if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify(snaps)); console.log('wrote', JSON_OUT); }
}
