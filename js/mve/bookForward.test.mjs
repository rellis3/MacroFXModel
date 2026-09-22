// Unit tests for the forward paper tracker's pure logic (js/mve/bookForward.js).
//   node js/mve/bookForward.test.mjs

import { forwardStep, summarizeForward, FORWARD_RULES, maxAbsDiff } from './bookForward.js';

let failures = 0, tests = 0;
const ok = (name, cond, extra = '') => { tests++; console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;

const manifest = {
  startDate: '2026-09-01', K: 2, costOneWay: { eurusd: 0.0001, usdjpy: 0.0001 },
  reference: { neutralCombined: { oosSharpe: 1.36, fullMaxDdPct: -10 } },
};
const bookOf = neutral => ({ neutral, exposurePre: [0.1, 0.2], exposurePost: [0, 0], factorVarShare: 0.5 });

console.log('forwardStep accounting');
const s1 = forwardStep([], manifest, { date: '2026-09-01', closes: { eurusd: 1.10, usdjpy: 150 }, raw: { eurusd: 1 }, book: bookOf({ eurusd: 0.6, usdjpy: 0.4 }) });
ok('first record appended', s1.appended);
ok('first record: no P&L, entry cost only', s1.record.gross === 0 && near(s1.record.cost, 1.0 * 0.0001));
ok('equity after entry cost', near(s1.record.equity, 1 - 0.0001));
const log1 = [s1.record];
const s2 = forwardStep(log1, manifest, {
  date: '2026-09-02', closes: { eurusd: 1.111, usdjpy: 148.5 }, raw: { eurusd: 1 }, book: bookOf({ eurusd: 0.5, usdjpy: 0.5 }),
  replayPrev: { date: '2026-09-01', neutral: { eurusd: 0.6, usdjpy: 0.4 }, raw: { eurusd: 1 } },
});
const expGross = 0.6 * (1.111 / 1.10 - 1) + 0.4 * (148.5 / 150 - 1);
ok('P&L = previous book × moves between the STORED closes', near(s2.record.gross, expGross), `${s2.record.gross.toExponential(4)}`);
ok('cost = turnover to the new book × one-way cost', near(s2.record.cost, (0.1 + 0.1) * 0.0001));
ok('equity compounds net', near(s2.record.equity, s1.record.equity * (1 + expGross - 0.2 * 0.0001)));
ok('raw book tracked alongside', near(s2.record.rawGross, 1 * (1.111 / 1.10 - 1)));
ok('parity: identical replay → diff 0', s2.record.parity.maxAbsDiff === 0);
const log2 = [...log1, s2.record];
ok('idempotent: same date again is not appended', !forwardStep(log2, manifest, { date: '2026-09-02', closes: {}, raw: {}, book: bookOf({}) }).appended);
ok('never before the start date', !forwardStep([], manifest, { date: '2026-08-31', closes: {}, raw: {}, book: bookOf({}) }).appended);
const s3 = forwardStep(log2, manifest, { date: '2026-09-07', closes: { eurusd: 1.12, usdjpy: 149 }, raw: {}, book: bookOf({}) });
ok('gap: previous book held through missed days', near(s3.record.gross, 0.5 * (1.12 / 1.111 - 1) + 0.5 * (149 / 148.5 - 1)) && s3.record.gapDays === 5);
ok('flat book: closing costs the full turnover', near(s3.record.cost, 1.0 * 0.0001));
ok('log not mutated by forwardStep', log2.length === 2);
ok('maxAbsDiff', maxAbsDiff({ a: 1, b: 2 }, { a: 1.5 }) === 2);

console.log('summarizeForward — pre-registered status');
const mk = (rets, extra = {}) => rets.map((r, i) => ({ date: `d${String(i).padStart(4, '0')}`, net: r, rawNet: r * 2, neutral: {}, raw: {}, parity: null, ...extra }));
{
  const s = summarizeForward(mk([0, 0.001, -0.001, 0.002]), manifest);
  ok('few days → RUNNING', s.status === 'RUNNING', s.why);
  ok('vol ratio neutral/raw reported', s.volRatio === 0.5);
}
{
  const log = mk([0, 0.001, 0.001]);
  log[2].parity = { date: 'd0001', maxAbsDiff: 0.01 };
  const s = summarizeForward(log, manifest);
  ok('parity break → PAUSED-PARITY (checked before anything else)', s.status === 'PAUSED-PARITY', s.why);
}
{
  const s = summarizeForward(mk([0, -0.08, -0.08]), manifest);
  ok('drawdown beyond 1.5× backtest DD → KILL-DRAWDOWN', s.status === 'KILL-DRAWDOWN', s.why);
}
{
  const rets = [0]; for (let i = 0; i < 200; i++) rets.push(i % 2 ? -0.0012 : 0.0009);
  const s = summarizeForward(mk(rets), manifest);
  ok('≥126 days with Sharpe far below backtest → KILL-INCONSISTENT', s.status === 'KILL-INCONSISTENT', s.why);
}
{
  const rets = [0]; for (let i = 0; i < 260; i++) rets.push(i % 2 ? -0.001 : 0.0014);
  const s = summarizeForward(mk(rets), manifest);
  ok('≥252 days, consistent → REVIEW-DUE', s.status === 'REVIEW-DUE', s.why);
  ok('SE of annualised Sharpe = √(252/n)', near(s.neutral.se, +Math.sqrt(252 / 260).toFixed(3)));
}
ok('rules are the pre-registered ones', FORWARD_RULES.killDdMult === 1.5 && FORWARD_RULES.killMinDays === 126 && FORWARD_RULES.reviewDays === 252);

console.log(`\n${failures ? '❌' : '✅'} bookForward tests: ${tests - failures}/${tests} passed`);
if (failures) process.exit(1);
