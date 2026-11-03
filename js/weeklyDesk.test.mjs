// Tests for js/weeklyDesk.js.   node js/weeklyDesk.test.mjs
import assert from 'node:assert/strict';
import { isoWeek, weekBooks, weekCalendar, validateWeekly, weeklyNote } from './weeklyDesk.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
t('ISO weeks', () => { assert.equal(isoWeek('2026-11-03'), '2026-W45'); assert.equal(isoWeek('2026-01-01'), '2026-W01'); assert.equal(isoWeek('2027-01-01'), '2026-W53'); });
t('week books with scores', () => {
  const w = weekBooks([{ date: '2026-11-02', head: { ok: true, book: { global: { tone: 'risk_off' }, headline: 'h' } }, debate: { currency: { view: { ranking: ['JPY'], currencies: { JPY: { bias: 2 } } } } } }, { date: 'x', head: { ok: false } }],
    [{ date: '2026-11-02', S: 0.2, eligible: true, placebo: { p95: 0.4 } }]);
  assert.equal(w.length, 1); assert.equal(w[0].biases.JPY, 2); assert.deepEqual(w[0].score, { S: 0.2, counts: true, placeboP95: 0.4 });
});
t('calendar: high impact, next 7 days, de-duplicated, in order', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const ev = [{ country: 'US', event: 'CPI', impact: 'high', ms: now + 864e5 }, { country: 'US', event: 'CPI', impact: 'High', ms: now + 864e5 }, { country: 'GB', event: 'GDP', impact: 'medium', ms: now + 2 * 864e5 }, { country: 'US', event: 'NFP', impact: 'high', ms: now + 9 * 864e5 }, { country: 'JP', event: 'BoJ', impact: 'high', time: '2026-11-09 03:00:00Z' }];
  const c = weekCalendar(ev, now);
  assert.equal(c.length, 2); assert.match(c[0], /JP BoJ/); assert.match(c[1], /US CPI/);
});
const good = { headline: 'Yen week', lastWeek: 'x', themes: [{ title: 'BoJ', body: 'hikes' }], currencies: Object.fromEntries(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'].map((c, i) => [c, { bias: i === 3 ? 3 : 0, why: 'w' }])), ranking: ['JPY'], week: [{ when: 'Wed 13:30', event: 'US CPI', why: 'y' }], scenarios: [{ if: 'a', then: 'b' }], watch: ['w'] };
t('validation: clamps biases, rebuilds a partial ranking, needs themes and the currencies', () => {
  const v = validateWeekly(good);
  assert.ok(v.ok); assert.equal(v.value.currencies.JPY.bias, 2); assert.equal(v.value.ranking[0], 'JPY'); assert.equal(v.value.ranking.length, 8);
  assert.equal(validateWeekly({ ...good, themes: [] }).ok, false);
  assert.equal(validateWeekly({ ...good, currencies: { USD: { bias: 1 } } }).ok, false);
});
t('Sunday note', () => { const m = weeklyNote({ week: '2026-W46', view: validateWeekly(good).value }); assert.match(m, /2026-W46/); assert.match(m, /JPY▲/); assert.match(m, /Wed 13:30 US CPI/); });
console.log(`weeklyDesk: ${n} tests passed`);
