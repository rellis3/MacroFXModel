// Tests for js/chiefOfStaff.js.   node js/chiefOfStaff.test.mjs
import assert from 'node:assert/strict';
import { topCards, morningText, eveningText } from './chiefOfStaff.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const cards = { USDJPY: { rating: 'SHORT', conviction: 'high', size: 1.02 }, AUDJPY: { rating: 'STRONG_SHORT', conviction: 'high', size: 0.51 }, EURAUD: { rating: 'LONG', conviction: 'low', size: 0.6 }, UK100: { rating: 'FLAT', conviction: 'low', size: 0 } };
const run = { head: { book: { headline: 'Yen strength <today>', global: { tone: 'risk_off' }, instruments: cards } }, failed: [], economist: { releases: [{ event: 'US CPI', at: '2026-11-03T13:30:00Z' }] } };

t('top cards by size, conviction and strength; flat cards out', () => {
  const tc = topCards(cards, 3);
  assert.equal(tc.length, 3); assert.match(tc[0], /USDJPY/); assert.match(tc[1], /AUDJPY strong short/); assert.ok(!tc.some(x => /UK100/.test(x)));
});
t('morning: the call, cards, what to fix, releases, research; escaped', () => {
  const m = morningText({ date: '2026-11-03', run, claims: { ok: true, verdict: 'fix', review: { items: [{}, {}] } }, ops: { readyToBank: [1, 2], exploratory: [] } });
  assert.match(m, /RISK-OFF/); assert.match(m, /&lt;today&gt;/); assert.match(m, /Fix 2 thing/); assert.match(m, /US CPI 13:30/); assert.match(m, /2 result\(s\) ready to bank/);
  assert.match(morningText({ date: 'd', run, claims: { ok: true, verdict: 'clean' } }), /Nothing needs you/);
  assert.match(morningText({ date: 'd', run, rules: { bots: [{ label: 'OI Gamma', flags: [{ severity: 'high' }] }, { label: 'X', flags: [{ severity: 'low' }] }] } }), /1 bot\(s\) trading against the research: OI Gamma/);
  assert.equal(morningText({ date: 'd', run: {} }), null);
});
t('evening: score, watcher, review, record', () => {
  const e = eveningText({ date: '2026-11-03', score: { S: 0.31, placebo: { p95: 0.4 }, scored: 30, live: 35, eligible: true, control: { unweighted: -0.1 } },
    watch: { events: [{ kind: 'zone', inst: 'USDJPY' }, { kind: 'target', inst: 'AUDJPY' }, { kind: 'invalid', inst: 'NQ' }] }, reflection: { headline: 'Yen held', lessons: [{ lesson: 'Watch CPI' }] }, record: { eligibleDays: 3, S: { mean: 0.12 } } });
  assert.match(e, /\+0\.31 u/); assert.match(e, /1 in zone \(USDJPY\)/); assert.match(e, /1 invalidated \(NQ\)/); assert.match(e, /Yen held/); assert.match(e, /3 counted/);
  assert.equal(eveningText({}), null);
});
console.log(`chiefOfStaff: ${n} tests passed`);
