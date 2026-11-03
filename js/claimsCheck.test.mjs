// Tests for js/claimsCheck.js.   node js/claimsCheck.test.mjs
import assert from 'node:assert/strict';
import { publishedText, numbersIn, numberCheck, validateClaims, claimsSections } from './claimsCheck.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const run = {
  head: { book: { headline: 'Risk-off', instruments: { USDJPY: { rating: 'SHORT', conviction: 'high', size: 1.02 } } } },
  analysts: { credit_funding: { ok: true, report: { headline: 'Gate blocked', points: [{ claim: 'creditZ -2.85, curveZ -1.42; CSI -0.55; ivrv 1.371' }] } } },
  newsletter: { issue: { subject: 'Yen strength', standfirst: 'Credit z sits at -2.9 and the curve at -1.42 at 15:16 on 2026-11-03, across six pairs. CPI printed 5.7 and VIX hit 23.8.', sections: [{ title: 'Backdrop', body: 'ivrv 1.37 in 2026.' }], ideas: [] } },
};

t('published parts', () => { const p = publishedText(run); assert.equal(p[0][0], 'subject'); assert.ok(p.some(([w]) => w === 'section: Backdrop')); });
t('numbers skip times, dates, years and small counts', () => {
  const xs = numbersIn('At 15:16 on 2026-11-03 in 2026, six pairs and 3 bets, z -2.9 and 312 contracts.').map(x => x.raw);
  assert.deepEqual(xs, ['-2.9', '312']);
});
t('rounded source numbers count; invented ones are listed', () => {
  const r = numberCheck(run);
  assert.deepEqual(r.unsourced.map(u => u.raw).sort(), ['23.8', '5.7']);
  assert.match(r.unsourced[0].sentence, /CPI printed/);
});
t('validation: items decide the verdict; problems and severities are normalised', () => {
  const v = validateClaims({ verdict: 'clean', items: [{ quote: 'CPI printed 5.7', problem: 'unsourced', severity: 'high', fix: 'drop it' }, { quote: 'x', problem: 'weird', severity: 'urgent' }] });
  assert.equal(v.value.verdict, 'hold'); assert.equal(v.value.items[1].problem, 'other'); assert.equal(v.value.items[1].severity, 'medium');
  assert.equal(validateClaims({ verdict: 'clean', items: [] }).value.verdict, 'clean');
  assert.equal(validateClaims('no').ok, false);
});
t('sections carry the script list and the nulls', () => {
  const s = claimsSections(run, numberCheck(run), [{ id: 'cot-crowding', verdict: 'null', claim: 'Crowded COT predicts reversals' }, { id: 'vix', verdict: 'validated', claim: 'x' }]);
  assert.match(s[1][1], /5\.7/); assert.match(s[4][1], /cot-crowding/); assert.doesNotMatch(s[4][1], /\[vix/);
});
console.log(`claimsCheck: ${n} tests passed`);
