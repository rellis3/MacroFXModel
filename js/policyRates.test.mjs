// Tests for js/policyRates.js.   node js/policyRates.test.mjs
import assert from 'node:assert/strict';
import { latest, parseBoc, parseRbaF1, parseSnb, parseBoj, policyRates, bojUrl } from './policyRates.js';

let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
await t('parsers: FRED map, BoC Valet, RBA F1, SNB, BoJ', () => {
  assert.deepEqual(latest(new Map([['2026-10-01', 4], ['2026-11-02', 3.75], ['2026-10-15', NaN]])), { date: '2026-11-02', value: 3.75 });
  assert.deepEqual(parseBoc({ observations: [{ d: '2026-10-29', V39079: { v: '2.50' } }, { d: '2026-10-30', V39079: { v: '' } }] }), { date: '2026-10-29', value: 2.5 });
  assert.deepEqual(parseBoc({ observations: [{ d: '2026-11-02', V39079: { v: '2.50' } }, { d: '2026-10-27', V39079: { v: '2.25' } }] }), { date: '2026-11-02', value: 2.5 }, 'newest first, as Valet sends it');
  const rba = 'F1 INTEREST RATES\nTitle,Cash Rate Target,Change in the Cash Rate Target,Interbank\nDescription,x,y,z\n31-Oct-2026,4.35,,4.35\n03-Nov-2026,4.60,0.25,4.60\n04-Nov-2026,,,\n';
  assert.deepEqual(parseRbaF1(rba), { date: '2026-11-03', value: 4.6 });
  assert.deepEqual(parseSnb('"Date";"D0";"Value"\n"2026-10-29";"LZ";"0"\n"2026-10-30";"ZIG";"-0.25"\n"2026-10-30";"LZ";"0"\n'), { date: '2026-10-30', value: 0 });
  assert.deepEqual(parseBoj({ RESULTSET: [{ VALUES: { SURVEY_DATES: [20261029, 20261030, 20261031], VALUES: [0.98, 1.0, null] } }] }), { date: '2026-10-30', value: 1 });
  assert.match(bojUrl(new Date('2026-11-04T00:00:00Z')), /startDate=202609$/);
});
await t('every bank with source and date; a failure is reported, never filled in', async () => {
  const r = await policyRates({
    fred: async id => new Map([['2026-11-01', id === 'DFEDTARU' ? 4 : 2]]),
    getJson: async u => (u.includes('bankofcanada') ? { observations: [{ d: '2026-11-03', V39079: { v: '2.50' } }] } : Promise.reject(new Error('HTTP 503'))),
    getText: async u => (u.includes('rba') ? 'Title,Cash Rate Target\n03-Nov-2026,4.60\n' : '"2026-10-30";"LZ";"0"\n'),
    rbnz: async () => ({ current: { rate: 2.75, date: '2026-10-28' } }),
  });
  assert.equal(r.rates.USD.rate, 4); assert.equal(r.rates.CAD.rate, 2.5); assert.equal(r.rates.AUD.rate, 4.6); assert.equal(r.rates.CHF.rate, 0); assert.equal(r.rates.NZD.rate, 2.75);
  assert.match(r.rates.GBP.source, /Bank Rate · BoE IUDBEDR/); assert.ok(!r.rates.JPY); assert.match(r.errors.JPY, /BoJ data API: HTTP 503/);
});
console.log(`policyRates: ${n} tests passed`);
