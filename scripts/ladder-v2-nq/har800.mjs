// ladder-v2-nq arm H8: production forecastSigma(last 800 NY-close bars, 'har_rv_log') per bar date, as of that bar's
// close. Same loop as scripts/rangebook/har800_sigma.mjs, directory passed as argv[2]. Read-only use of the shared code.
//   node scripts/ladder-v2-nq/har800.mjs <dir with NAME.json [{d,o,h,l,c}]>   -> NAME_har800.csv (date, sig ann %)
import fs from 'fs';
import { forecastSigma } from '../../js/forecastSigma.js';
const DIR = process.argv[2], WIN = 800;
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
