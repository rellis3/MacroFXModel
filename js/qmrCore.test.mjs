// js/qmrCore.test.mjs — the checked-in unit test LEGO_MODULES.md §1p required
// as the condition of extracting this brick. Synthetic bars only, no network.
//   node js/qmrCore.test.mjs

import { walkTrade, netReturn, overnightRange, entryBarFor, qmrStats, groupBarsByDate } from './qmrCore.js';

let pass = 0, fail = 0;
const eq = (got, want, label) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) < 1e-9 : got === want;
  if (ok) { pass++; } else { fail++; console.error(`FAIL ${label}: got ${got}, want ${want}`); }
};
const bar = (t, o, h, l, c) => ({ t, o, h, l, c });

// ── walkTrade ────────────────────────────────────────────────────────────────
let w = walkTrade([bar('2026-01-01T14:00', 100, 101, 98, 99)], 'LONG', 100, 1, 3);
eq(w.exitReason, 'STOP', 'long stop reason'); eq(w.movePct, -1, 'long stop move');

w = walkTrade([bar('2026-01-01T14:00', 100, 104, 99.5, 103)], 'LONG', 100, 1, 3);
eq(w.exitReason, 'TP', 'long tp reason'); eq(w.movePct, 3, 'long tp move');

w = walkTrade([bar('2026-01-01T20:00', 100, 100.5, 99.5, 100.2)], 'LONG', 100, 1, 3);
eq(w.exitReason, 'EOD', 'eod reason'); eq(+w.movePct.toFixed(10), 0.2, 'eod move');

// Stop must win over TP inside the same bar — intrabar path is unknown, so the
// conservative assumption is mandatory (CLAUDE.md anti-pattern list).
w = walkTrade([bar('2026-01-01T14:00', 100, 104, 98, 103)], 'LONG', 100, 1, 3);
eq(w.exitReason, 'STOP', 'stop precedes tp in-bar');

w = walkTrade([bar('2026-01-01T14:00', 100, 101.5, 99, 99.2)], 'SHORT', 100, 1, 3);
eq(w.exitReason, 'STOP', 'short stop reason'); eq(w.movePct, -1, 'short stop move');

// No TP configured (tpPct 0) ⇒ runs to EOD.
w = walkTrade([bar('2026-01-01T15:00', 100, 110, 99.5, 108)], 'LONG', 100, 1, 0);
eq(w.exitReason, 'EOD', 'no tp ⇒ eod'); eq(+w.movePct.toFixed(10), 8, 'no tp move');

eq(walkTrade([], 'LONG', 100, 1, 3), null, 'empty bars ⇒ null');

// ── netReturn: costs BEFORE leverage, stop slip only on stops ───────────────
eq(+netReturn(1.0, 'STOP', 5, 0.008, 0.005).toFixed(10), 4.935, 'stop netting');
eq(+netReturn(1.0, 'EOD', 5, 0.008, 0.005).toFixed(10), 4.96, 'eod netting');
eq(+netReturn(1.0, 'TP', 1, 0.008, 0.005).toFixed(10), 0.992, 'tp netting unlevered');

// ── overnightRange ──────────────────────────────────────────────────────────
const byDate = groupBarsByDate([
  bar('2026-01-01T21:00', 100, 102, 99, 101), bar('2026-01-01T22:00', 101, 103, 100, 102),
  bar('2026-01-02T07:00', 102, 104, 101, 103), bar('2026-01-02T08:00', 103, 105, 98, 99),
  bar('2026-01-02T13:00', 99, 100, 98, 99.5),
]);
const on = overnightRange(byDate, '2026-01-01', '2026-01-02');
eq(on.high, 105, 'overnight high'); eq(on.low, 98, 'overnight low');
// Too few bars ⇒ null rather than a fabricated range.
eq(overnightRange(groupBarsByDate([bar('2026-01-02T07:00', 1, 1, 1, 1)]), 'x', '2026-01-02'), null, 'thin overnight ⇒ null');

// ── entryBarFor: 13:00, else the 14:00 winter fallback ──────────────────────
eq(entryBarFor(byDate['2026-01-02']).t, '2026-01-02T13:00', 'entry bar 13:00');
eq(entryBarFor([bar('2026-01-02T14:00', 1, 1, 1, 1)]).t, '2026-01-02T14:00', 'entry bar winter fallback');
eq(entryBarFor([bar('2026-01-02T09:00', 1, 1, 1, 1)]), null, 'no entry bar ⇒ null');

// ── qmrStats: flat weekdays counted as zeros ────────────────────────────────
const trades = [{ tradeReturn: 1 }, { tradeReturn: -0.5 }, { tradeReturn: 2 }];
const curve = [{ date: '2026-01-05', equity: 1.01 }, { date: '2026-01-06', equity: 1.005 }, { date: '2026-01-07', equity: 1.025 }];
const s = qmrStats(trades, curve, 1.025);
eq(s.n, 3, 'stats n'); eq(s.wins, 2, 'stats wins');
eq(+s.totalReturn.toFixed(2), 2.5, 'stats totalReturn');
if (!(s.sharpe > 0)) { fail++; console.error('FAIL stats sharpe positive'); } else pass++;

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
