// Per-night vol features for the real-costs page's research filters.
// Same definition as the engine page and forge/OVERNIGHT_VOL_REGIME_PREREG.md:
// RV20 percentile vs its previous 252 values, EWMA sigma, expanding median sigma,
// all from NY-close day closes known before the 20:00 UK entry (nightVolFeatures).
// Output arrays are aligned index-for-index with page_trades.json (and so with
// futures_trades.json, which uses the same index).
//   node scripts/overnight-hold-toolkit/build_night_vol.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { loadM1ForPairLocal } from '../../js/localM1Loader.js';
import { nightVolFeatures } from '../../js/overnightHoldEngine.js';

const OUT = 'analysis/output/overnight-hold-toolkit';
const D = JSON.parse(readFileSync(`${OUT}/page_trades.json`, 'utf8'));
const out = { built: new Date().toISOString().slice(0, 10), source: 'js/overnightHoldEngine.js nightVolFeatures on local M1', instruments: {} };
const r4 = v => (v == null ? null : +v.toFixed(4));

for (const key of ['nq', 'gold', 'gbpusd', 'usdjpy']) {
  const packed = await loadM1ForPairLocal(key);
  if (!packed) throw new Error(`no local M1 for ${key}`);
  const I = D.instruments[key];
  const feat = nightVolFeatures(packed, I.entry_epoch.map((e, i) => ({ date: I.entry[i], entryEpoch: e })));
  out.instruments[key] = { vol: feat.map(t => r4(t.volPct)), sigma: feat.map(t => r4(t.sigmaPct)), sigmaMed: feat.map(t => r4(t.sigmaMedPct)) };
  const have = feat.filter(t => t.volPct != null).length;
  console.log(`${key}: ${feat.length} nights, ${have} with a vol percentile (first ${feat.find(t => t.volPct != null)?.date})`);
}
writeFileSync(`${OUT}/night_vol.json`, JSON.stringify(out));
console.log(`wrote ${OUT}/night_vol.json`);
