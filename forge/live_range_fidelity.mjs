// Compares the shipped page logic (js/intradayRange.js) with forge/live_range_replay.py on dumped sessions.
import fs from 'fs';
import { sessionState, reforecast } from '../js/intradayRange.js';
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let maxd = 0, n = 0, missing = 0;
for (const r of rows) {
  const st = sessionState(r.bars, r.date);
  const rf = st.checkpoints.map(cp => ({ cp, f: reforecast(cp, { instrument: r.name, open: st.open, sigmaDailyPct: r.sigma }) })).filter(x => x.f);
  const py = Object.fromEntries(r.py.map(x => [x[0], x]));
  for (const { cp, f } of rf) {
    const p = py[cp.h]; if (!p) { missing++; continue; }
    const js = [f.projHigh.p50, f.projHigh.p75, f.projHigh.p90, f.projLow.p50, f.projLow.p75, f.projLow.p90];
    const mine = [p[1] + p[3] * f.unit, p[1] + p[4] * f.unit, p[1] + p[5] * f.unit, p[2] - p[6] * f.unit, p[2] - p[7] * f.unit, p[2] - p[8] * f.unit];
    // py stores runH/runL in absolute price (cols 7,8 of HT) -> columns 1,2 here
    for (let i = 0; i < 6; i++) { maxd = Math.max(maxd, Math.abs(js[i] - mine[i]) / f.unit); n++; }
  }
}
console.log(JSON.stringify({ sessions: rows.length, lines_compared: n, missing_checkpoints: missing, max_abs_diff_sigma: maxd }));
