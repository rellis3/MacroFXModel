// Rate-differential cross-sectional momentum (forge/RATE_XSMOM_PREREG.md): the FRED series not already in
// analysis/output/ys_long/fred/. Node, because FRED refuses Python's urllib from this machine.
//   node scripts/rate_xsmom/fetch.mjs
import fs from 'fs';

const OUT = 'analysis/output/ys_long/fred';
const IDS = ['IR3TIB01USM156N', 'TB3MS', 'IR3TIB01JPM156N', 'IR3TIB01CAM156N', 'IR3TIB01DEM156N', 'IR3TIB01EZM156N', 'NASDAQCOM'];
for (const id of IDS) {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(90_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = await r.text();
      fs.writeFileSync(`${OUT}/${id}.csv`, t);
      const l = t.trim().split('\n');
      console.log(id, l.length - 1, l[1], '->', l.at(-1));
      break;
    } catch (e) {
      console.log(id, 'attempt', a, 'failed:', e.message);
    }
  }
}
