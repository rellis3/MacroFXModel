// NY-close daily closes for the indices (for realised vol in forge/IVRV_COT_PREREG.md).
//   node scripts/rangebook/idx_daily.mjs  -> analysis/output/rangebook/cboe/<pair>_daily.json
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { nyCloseDailyBars } from '../../js/voteAtlasV4Lines.js';
for (const p of ['nq', 'spx', 'dow', 'us2000']) {
  const d = nyCloseDailyBars(await loadM1ForPair(p)).filter(b => b.n >= 60).map(b => ({ date: b.key, close: b.close }));
  fs.writeFileSync(`analysis/output/rangebook/cboe/${p}_daily.json`, JSON.stringify(d));
  console.log(p, d.length, d[0].date, d.at(-1).date);
}
