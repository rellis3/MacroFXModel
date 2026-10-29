// Parity: js/dailyOpenFib.js (the live tracker) vs engine.py (the backtest) on random bid/ask sessions.
//   node scripts/daily-open-fib-retest/parity.mjs [n_sessions]     (needs python3 + numpy)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFill, trade } from '../../js/dailyOpenFib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(mkdtempSync(path.join(tmpdir(), 'dof-')), 'fixture.json');
execFileSync('python3', [path.join(here, 'parity_fixture.py'), out, process.argv[2] ?? '400'], { stdio: 'inherit' });
const S = JSON.parse(readFileSync(out, 'utf8'));
let checked = 0, bad = 0;
const close = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a));
for (const [i, s] of S.entries()) {
  for (const anchor of ['high', 'do']) {
    const f = findFill(s.bid, s.mins, s.adr, anchor, 0.10, 360, { o: s.ask.o, l: s.ask.l });
    const p = s.res[anchor];
    checked++;
    if (!p || !f) { if (!!p !== !!f) { bad++; console.log(i, anchor, 'fill mismatch', p, f); } continue; }
    if (f.side !== p.side || f.j !== p.j || !close(f.A, p.A) || !close(f.L0, p.L0) || !close(f.entry, p.entry)) { bad++; console.log(i, anchor, 'fill', p, f); continue; }
    const ex = f.side < 0 ? s.ask : s.bid, sp = s.ask.o[f.j] - s.bid.o[f.j];
    for (const [tg, be] of [['zero', true], ['zero', false], [3, true], [2, true]]) {
      const t = trade(ex, s.mins, f, { target: tg, be, exitMin: 540, fillSpread: sp, final: true });
      const q = p[`${tg}|${be ? 1 : 0}`];
      checked++;
      if (t.how !== q.how || !close(t.R, q.R)) { bad++; console.log(i, anchor, tg, be, 'trade', q, { how: t.how, R: t.R }); }
    }
  }
}
console.log(`${checked} comparisons, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
