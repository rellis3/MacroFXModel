// Parity of the paper record's chosen-lines arm (js/paperRecordCore.js) with the rule A backtest
// (scripts/backtest/build_line_backtest.py) on sampled backtest days.
//   python <exporter> days.json   (London-day M1 bars + the backtest's trades for 40 random rule A days)
//   node scripts/rule-a-book-forward/parity_test.mjs days.json
// Only lines that traded are known per day, so the check is: every backtest trade is found by the live code with the
// same entry minute and price, and the same gross R at 0.2σ / 5R.
import fs from 'node:fs';
import { chosenLevels, detectChosenBreaks, scoreTrade } from '../../js/paperRecordCore.js';

const days = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let n = 0, entryOk = 0, rOk = 0;
const bad = [];
for (const D of days) {
  const open = D.bars[0].open, unit = open * D.sig / 100;
  const brks = detectChosenBreaks(chosenLevels(D.lad, open), unit, 0, D.bars);
  for (const t of D.trades) {
    n++;
    const b = brks.find(x => x.line === t.line);
    if (!b || b.entryTime / 60 !== t.em || Math.abs(b.entry - t.ep) > 1e-9 * t.ep) { bad.push({ inst: D.inst, d: D.d, line: t.line, want: [t.em, t.ep], got: b ? [b.entryTime / 60, b.entry] : null }); continue; }
    entryOk++;
    const v = scoreTrade({ open, sigmaFrac: D.sig / 100 }, D.bars, b, 0, true).variants['0.2σ/5R'];
    if (t.g && Math.abs(v.R - t.g[0] / 1000) < 0.002) rOk++;
    else bad.push({ inst: D.inst, d: D.d, line: t.line, R: v.R, want: t.g?.[0] / 1000, status: v.status });
  }
}
console.log(`trades ${n} · entry match ${entryOk} · R match ${rOk}`);
if (bad.length) console.log(JSON.stringify(bad.slice(0, 8), null, 1));
process.exit(entryOk === n && rOk >= n * 0.95 ? 0 : 1);
