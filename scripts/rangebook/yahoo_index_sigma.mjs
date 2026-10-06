// Index σ the way LIVE computes it: Yahoo daily bars (preferYahoo), production estimators on the last 800 bars.
// Reads analysis/output/yahoo_d1/<SYM>.json, writes <SYM>_sig.csv (date, har800_ann_pct, live_ann_pct).
import fs from 'fs';
import { forecastSigma } from '../../js/forecastSigma.js';
import { paramsFor } from '../../js/forecastLadder.js';
const DIR = 'analysis/output/yahoo_d1';
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
  const sym = f.replace('.json', ''), rows = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
  const bars = rows.map(r => ({ open: r.o, high: r.h, low: r.l, close: r.c }));
  const est = paramsFor(sym, 'index').estimator ?? 'yz_30';
  const out = ['date,har,live'];
  for (let t = 100; t <= bars.length; t++) {
    const w = bars.slice(Math.max(0, t - 800), t);
    const h = forecastSigma(w, 'har_rv_log'), l = forecastSigma(w, est);
    if (h > 0 && l > 0) out.push(`${rows[t - 1].d},${(h * Math.sqrt(252) * 100).toFixed(5)},${(l * Math.sqrt(252) * 100).toFixed(5)}`);
  }
  fs.writeFileSync(`${DIR}/${sym}_sig.csv`, out.join('\n') + '\n');
  console.log(sym, est, out.length - 1);
}
