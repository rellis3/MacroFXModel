// COT history for the book instruments (forge/IVRV_COT_PREREG.md). Pulls CFTC Socrata futures-only reports and runs
// them through js/cotFactorCore.js unchanged (OI-normalised net, JPY/CAD/CHF flipped, 156-week percentile, tradableFrom).
//   node scripts/rangebook/cot_fetch.mjs   -> analysis/output/rangebook/cot/cot_series.json
import fs from 'fs';
import { COT_FACTOR_UNIVERSE, cotFactorSeries } from '../../js/cotFactorCore.js';

const DS = { tff: { id: 'gpe5-46if', long: 'lev_money_positions_long', short: 'lev_money_positions_short' },
             disagg: { id: '72hh-3qpy', long: 'm_money_positions_long_all', short: 'm_money_positions_short_all' } };
async function pull(ds, names) {
  const where = encodeURIComponent(`market_and_exchange_names in(${names.map(n => `'${n.replace(/'/g, "''")}'`).join(',')})`);
  const url = `https://publicreporting.cftc.gov/resource/${ds.id}.json?$where=${where}&$limit=50000&$order=report_date_as_yyyy_mm_dd`;
  const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const out = {};
for (const u of COT_FACTOR_UNIVERSE) {
  const ds = DS[u.dataset], raw = await pull(ds, [u.name, ...(u.alt ?? [])]);
  const rows = raw.map(r => ({ date: r.report_date_as_yyyy_mm_dd.slice(0, 10), specLong: +r[ds.long], specShort: +r[ds.short], openInterest: +r.open_interest_all }))
    .filter(r => Number.isFinite(r.specLong) && Number.isFinite(r.specShort) && r.openInterest > 0);
  const s = cotFactorSeries(rows, { flip: u.flip });
  out[u.pair] = s.map(x => ({ date: x.date, from: x.tradableFrom, pct: x.pct, z: x.z }));
  const last = s.at(-1);
  console.log(`${u.pair}: ${s.length} weeks ${s[0]?.date} -> ${last?.date}; latest pct ${last?.pct?.toFixed?.(1)} usable from ${last?.tradableFrom}`);
}
fs.writeFileSync('analysis/output/rangebook/cot/cot_series.json', JSON.stringify(out));
