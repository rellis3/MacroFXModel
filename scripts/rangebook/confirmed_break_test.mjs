// Pre-registered confirmation (forge/CONFIRMED_BREAK_INDICES_PREREG.md) of the confirmed-
// break rule on indices never examined for it. Rule fixed: push first, stop at the pullback level.
//   node scripts/rangebook/confirmed_break_test.mjs > analysis/output/rangebook/CONFIRMED_BREAK_RESULTS.md
import { confirmedBreakRows } from './confirmedBreak.mjs';

const CONFIRM = ['spx', 'dow', 'us2000', 'de30', 'uk100'], SEEN = ['nq', 'eurusd', 'gold'];
const SPLIT = '2023-01-01';
const st = xs => { const n = xs.length; if (n < 2) return { m: NaN, t: NaN, n }; const m = xs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return { m, t: m / sd * Math.sqrt(n), n }; };
const f = x => (x >= 0 ? '+' : '') + x.toFixed(3), P = x => `${(100 * x).toFixed(0)}%`;

const out = {};
for (const p of [...CONFIRM, ...SEEN]) out[p] = await confirmedBreakRows(p);

console.log('# Confirmed break on the Close median — confirmation on unseen indices\n');
console.log('Rule: forge/CONFIRMED_BREAK_INDICES_PREREG.md. After the first Close-median touch, a push of 0.25× the Close-median '
  + 'distance beyond the line (before a 0.25× pullback) → follow from the push level to Close p75, stop at the pullback level. '
  + 'Net of spread, R = stop distance.\n');
console.log('| instrument | set | period | touches | push first → reach p75 | pull first → reach p75 | trades | win % | break-even | net R | t | net R 2016–22 / 2023–26 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
const pooled = [], perInst = [];
for (const p of [...CONFIRM, ...SEEN]) {
  const R = out[p], set = CONFIRM.includes(p) ? 'confirmation' : 'seen (not counted)';
  const rate = f => { const x = R.filter(r => r.first === f); return `${P(x.reduce((a, r) => a + r.reach75, 0) / (x.length || 1))} (${x.length})`; };
  const tr = R.filter(r => r.trades.stopAtPull).map(r => ({ ...r.trades.stopAtPull, date: r.date }));
  const s = st(tr.map(x => x.r)), be = tr.reduce((a, x) => a + x.be, 0) / tr.length;
  const h1 = st(tr.filter(x => x.date < SPLIT).map(x => x.r)), h2 = st(tr.filter(x => x.date >= SPLIT).map(x => x.r));
  console.log(`| ${p.toUpperCase()} | ${set} | ${R[0].date.slice(0, 7)} → ${R.at(-1).date.slice(0, 7)} | ${R.length} | ${rate('push')} | ${rate('pull')} | ${s.n} | ${P(tr.filter(x => x.r > 0).length / tr.length)} | ${P(be)} | ${f(s.m)} | ${s.t.toFixed(1)} | ${h1.n > 1 ? f(h1.m) : '–'} / ${f(h2.m)} |`);
  if (CONFIRM.includes(p)) { pooled.push(...tr.map(x => x.r)); perInst.push([p, s.m]); }
}
const s = st(pooled), pos = perInst.filter(([, m]) => m > 0).length;
const grp = ps => st(ps.flatMap(p => out[p].filter(r => r.trades.stopAtPull).map(r => r.trades.stopAtPull.r)));
const a = grp(['spx', 'dow']), b = grp(['us2000', 'de30', 'uk100']);
console.log(`\nPooled confirmation set: **${f(s.m)}R** (t ${s.t.toFixed(1)}, n ${s.n}); positive on ${pos} of 5.`);
console.log(`- SPX + DOW (tied to NQ): ${f(a.m)}R (t ${a.t.toFixed(1)}, n ${a.n})`);
console.log(`- US2000 + DE30 + UK100: ${f(b.m)}R (t ${b.t.toFixed(1)}, n ${b.n})`);
console.log(`\n**Verdict: ${s.m > 0 && s.t >= 2 && pos >= 3 ? 'PASS' : 'FAIL'}**`);
