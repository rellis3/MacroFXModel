// LADDER CALIBRATION variant 2 input (forge/LADDER_CALIBRATION_PREREG.md, Amendment 1): the HAR-log sigma exactly as
// production computes it — forecastSigma(last 800 D1 bars, 'har_rv_log') — for every D1 bar date, as of that bar's close.
// Reads analysis/output/ladder_candidates/d1/<NAME>.json ([{d,o,h,l,c}], written by forge/run_ladder_candidates.py),
// writes <NAME>_har800.csv (date, sigma_ann_pct). Read-only use of the shared estimator.
import fs from 'fs';
import { forecastSigma } from '../../js/forecastSigma.js';
const DIR = 'analysis/output/ladder_candidates/d1', WIN = 800;
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const rows = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
  const bars = rows.map(r => ({ open: r.o, high: r.h, low: r.l, close: r.c }));
  const out = ['date,sig'];
  for (let t = 100; t <= bars.length; t++) {
    const s = forecastSigma(bars.slice(Math.max(0, t - WIN), t), 'har_rv_log');
    if (s > 0) out.push(`${rows[t - 1].d},${(s * Math.sqrt(252) * 100).toFixed(6)}`);
  }
  fs.writeFileSync(`${DIR}/${f.replace('.json', '_har800.csv')}`, out.join('\n') + '\n');
  console.log(f, out.length - 1);
}
