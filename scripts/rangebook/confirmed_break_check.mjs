// DESCRIPTIVE check (not pre-registered) of an outside finding: after the FIRST touch of
// the Close median, does a push of 0.25 × the Close-median distance BEYOND the line
// (vs a 0.25× pullback first) predict reaching the Close 75th that day — and does
// entering on the push, targeting the 75th, beat the spread?
//   node scripts/rangebook/confirmed_break_check.mjs eurusd|gold|nq
import { confirmedBreakRows } from './confirmedBreak.mjs';

const PAIR = process.argv[2] ?? 'eurusd', SYM = PAIR.toUpperCase();
const rows = await confirmedBreakRows(PAIR);
const SPLIT = '2023-01-01';
const pct = x => `${(100 * x).toFixed(0)}%`;
const st = xs => { const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return { m, t: m / sd * Math.sqrt(n), n }; };
console.log(`\n${SYM} — first touches of the Close median (${rows.length}), ${rows[0].date} → ${rows.at(-1).date}`);
for (const [lab, sel] of [['2016–22', r => r.date < SPLIT], ['2023–26', r => r.date >= SPLIT]]) {
  const R = rows.filter(sel);
  const line = f => { const x = R.filter(r => r.first === f); return `${f.padEnd(8)} ${pct(x.length / R.length).padStart(4)} of touches → reach 75th later: ${pct(x.reduce((a, r) => a + r.reach75, 0) / (x.length || 1))} (n ${x.length})`; };
  console.log(` ${lab}:\n   ${line('push')}\n   ${line('pull')}\n   ${line('neither')}`);
  for (const name of ['stopAtLine', 'stopAtPull']) {
    const tr = R.filter(r => r.trades[name]).map(r => r.trades[name]);
    const s = st(tr.map(x => x.r)), be = tr.reduce((a, x) => a + x.be, 0) / tr.length;
    console.log(`   trade on push, ${name === 'stopAtLine' ? 'stop back at the line   ' : 'stop at the pullback lvl'}: n ${s.n}, win ${pct(tr.filter(x => x.r > 0).length / tr.length)} vs break-even ${pct(be)}, net ${s.m >= 0 ? '+' : ''}${s.m.toFixed(3)}R (t ${s.t.toFixed(1)})`);
  }
}
