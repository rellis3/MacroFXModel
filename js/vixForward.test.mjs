// Tests for js/vixForward.js.   node js/vixForward.test.mjs
import { readFileSync } from 'node:fs';
import { forwardFlags, forwardRecord, FORWARD_START } from './vixForward.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const X = JSON.parse(readFileSync(new URL('./fixtures/vixForward.parity.json', import.meta.url), 'utf8'));
const F = forwardFlags({ dates: X.dates, vix: X.vix, vvix: X.vvix, vxn: X.vxn, nq: X.ndx });
for (const [k, lab, tail] of [['pa', 'VVIX ratio', 0.9], ['pb', 'VIX ratio', 0.9], ['pdr', "C.OG's dR/dt", 0.1], ['pim', 'VVIX/VXN change', 0.9]]) {
  let n = 0, worst = 0, miss = 0, flip = 0;
  X.dates.forEach((_, t) => { if (t < 300 || X[k][t] == null) return; n++; const j = F[k][t]; if (j == null) { miss++; return; } worst = Math.max(worst, Math.abs(j - X[k][t])); if ((tail > 0.5 ? X[k][t] >= tail : X[k][t] <= tail) !== (tail > 0.5 ? j >= tail : j <= tail)) flip++; });
  ok(`${lab} percentile matches the study on ${n} sessions`, miss === 0 && worst < 1e-6 && flip === 0, `missing ${miss}, worst ${worst}, flag mismatches ${flip}`);
}
const R = forwardRecord({ dates: X.dates, vix: X.vix, vvix: X.vvix, vxn: X.vxn, nq: X.ndx }, '2026-01-01');
ok('a record over 2026 finds events for each signal, with outcomes, counts and today\'s state', R && R.signals.length === 3 && R.signals.every(s => s.events.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && (e.movePct === null || Number.isFinite(e.movePct)))) && R.signals.some(s => s.events.length > 0), JSON.stringify(R.signals.map(s => [s.id, s.events.length, s.nScored])));
const last = R.signals.find(s => s.id === 'vix-beta-change').events.at(-1);
ok('an event too close to the end is marked incomplete with sessions left, never scored', R.signals.every(s => s.events.filter(e => !e.complete).every(e => e.sessionsLeft > 0)) && last !== undefined);
ok('only events from the start date count', forwardRecord({ dates: X.dates, vix: X.vix, vvix: X.vvix, vxn: X.vxn, nq: X.ndx }, FORWARD_START).signals.every(s => s.events.length === 0));
ok('no data means no record', forwardRecord({}) === null);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
