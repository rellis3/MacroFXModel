// LADDER CALIBRATION Amendment 2: daily bars the way live sees them — NY-close (17:00 New York) sessions from M1,
// sessions with >= 60 M1 bars (no Sunday stub), exactly nyCloseDailyBars as v4Days / the JS scorecard use.
// Writes analysis/output/ladder_candidates/d1/<NAME>.json ([{d,o,h,l,c}], d = the NY session's end date).
//   node scripts/rangebook/ny_close_d1.mjs NAME:fileKey ...
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { nyCloseDailyBars } from '../../js/voteAtlasV4Lines.js';
const DIR = 'analysis/output/ladder_candidates/d1';
fs.mkdirSync(DIR, { recursive: true });
for (const arg of process.argv.slice(2)) {
  const [name, key] = arg.split(':');
  const packed = await loadM1ForPair(key);
  const rows = nyCloseDailyBars(packed).filter(b => b.n >= 60)
    .map(b => ({ d: b.key, o: b.open, h: b.high, l: b.low, c: b.close }));
  fs.writeFileSync(`${DIR}/${name}.json`, JSON.stringify(rows));
  console.log(name, rows.length, rows[0]?.d, rows.at(-1)?.d);
}
