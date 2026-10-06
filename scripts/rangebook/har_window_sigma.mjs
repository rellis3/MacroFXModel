// Robustness (plans/LESSON_COMPLIANCE_REVIEW.md A9): the production HAR-log σ at other history windows.
// Same as scripts/rangebook/har800_sigma.mjs (frozen, lockbox) but with the window as a parameter.
//   node scripts/rangebook/har_window_sigma.mjs 400 600 1000 1200
// Reads analysis/output/ladder_candidates/d1/<NAME>.json, writes <NAME>_har<W>.csv (date, sigma_ann_pct).
import fs from 'fs';
import { forecastSigma } from '../../js/forecastSigma.js';
const DIR = 'analysis/output/ladder_candidates/d1';
const WINS = process.argv.slice(2).map(Number).filter(w => w > 100);
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const rows = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
  const bars = rows.map(r => ({ open: r.o, high: r.h, low: r.l, close: r.c }));
  for (const W of WINS) {
    const out = ['date,sig'];
    for (let t = 100; t <= bars.length; t++) {
      const s = forecastSigma(bars.slice(Math.max(0, t - W), t), 'har_rv_log');
      if (s > 0) out.push(`${rows[t - 1].d},${(s * Math.sqrt(252) * 100).toFixed(6)}`);
    }
    fs.writeFileSync(`${DIR}/${f.replace('.json', `_har${W}.csv`)}`, out.join('\n') + '\n');
  }
  console.log(f, WINS.join(','));
}
