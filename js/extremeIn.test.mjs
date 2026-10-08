// Parity: js/extremeIn.js vs the Python table on real sessions.   node js/extremeIn.test.mjs
import fs from 'fs';
import { sessionState } from './intradayRange.js';
import { extremeIn } from './extremeIn.js';
const rows = JSON.parse(fs.readFileSync(new URL('../scripts/fixtures/extremeIn_vectors.json', import.meta.url), 'utf8'));
let fail = 0, n = 0;
const ok = (name, c, e = '') => { n++; console.log(`  ${c ? '✓' : '✗ FAIL'} ${name}${e ? '  ' + e : ''}`); if (!c) fail++; };
for (const r of rows) {
  const st = sessionState(r.bars, r.date);
  const cp = st.checkpoints.find(c => c.h === r.h);
  const prev = r.bars.filter(b => (b.t - r.bars[0].t) / 3600 < r.h);          // bars before h (session starts 00:00 London)
  const close = prev.at(-1).close;
  const x = extremeIn({ h: cp.h, runHigh: cp.runHigh, runLow: cp.runLow, close }, { instrument: r.inst === 'NQ' ? 'NQ' : r.inst, open: st.open, sigmaDailyPct: r.sigma });
  const d = Math.max(Math.abs(x.pHigh - r.expected.pHigh), Math.abs(x.pLow - r.expected.pLow));
  ok(`${r.inst} ${r.date} ${r.h}:00 pHigh ${x.pHigh.toFixed(3)} pLow ${x.pLow.toFixed(3)}`, d < 1e-9, `max diff ${d.toExponential(1)}`);
}
console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
