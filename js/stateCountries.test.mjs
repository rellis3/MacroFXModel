// node --test js/stateCountries.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summariseCountries, nextMeeting, newestDate, CCYS } from './stateCountries.js';

const stores = {
  cpi: { generatedAt: '2026-10-30T00:00:00Z', byCcy: {
    USD: { pressure: 0.4, dims: { headlineLevel: { latestYoy: 3.1, latestDate: '2026-09-01' }, coreLevel: { latestYoy: 3.0 } } },
    EUR: { pressure: -0.2, dims: { headlineLevel: { latestYoy: 1.8, latestDate: '2026-09-01' } } },
    GBP: { discontinued: { since: '2025-03' }, dims: {}, pressure: null },
    JPY: { discontinued: { since: '2021-06' }, dims: {}, pressure: null } } },
  gdp: { byCcy: { USD: { score: 0.5, latestGrowth: 2.4, latestDate: '2026-07-01' }, EUR: { score: -0.3, latestGrowth: 0.6, latestDate: '2026-07-01', recessionFlag: false } } },
  ism: { byCcy: { USD: { activity: 0.1 }, EUR: { activity: -0.5 } } },
  labor: { byCcy: { USD: { strength: 0.2, flag: null, dims: { a: { latestDate: '2026-10-03' } } } } },
  trade: { byCcy: { USD: { score: -0.4, surplus: false, latestDate: '2026-08-01' } } },
  realYield: { byCcy: { USD: { latestReal: 1.9 }, EUR: { latestReal: 0.8 } } },
  curve: { byCcy: { USD: { latestSlope: 0.4, inverted: false }, GBP: { latestSlope: 1.4, latestLong: 4.6 } } },
  rateDiff: { byCcy: { USD: { latestRate: 4.25, latestDate: '2026-10-01' }, EUR: { latestRate: 2.0 } } },
  ppi: null,
};
const cb = { USD: { latest: { kind: 'statement', meetingDate: '2026-09-16', analysis: { hawkishScore: 0.2, regime: 'NEUTRAL', headline: 'Fed holds' } }, calendar: { meetings: [{ date: '2026-10-28' }, { date: '2026-12-09' }] } },
  EUR: { latest: { meetingDate: '2026-10-22', analysis: { hawkishScore: -0.3, regime: 'DOVISH' } }, calendar: { meetings: ['2026-12-17'] } } };

test('one row per G8 currency, built from the stores, with composites that say what they used', () => {
  const C = summariseCountries({ stores, cb, today: '2026-11-01' });
  assert.deepEqual(C.rows.map(r => r.ccy), CCYS);
  const us = C.rows[0];
  assert.equal(us.growth.score, 0.3);                    // mean of gdp 0.5 and business 0.1
  assert.equal(us.inflation.score, 0.4); assert.equal(us.inflation.headlineYoy, 3.1);
  assert.equal(us.quadrant, 'Reflation (growth and inflation up)');
  assert.equal(us.policy.next, '2026-12-09');
  assert.equal(us.policy.stance, 0.2);
  const eu = C.rows[1];
  assert.equal(eu.quadrant, 'Disinflationary slowdown (both down)');
  assert.equal(eu.vsUsd.rate, -2.25); assert.equal(eu.vsUsd.stance, -0.5);
  assert.equal(C.stanceRange.hawkish, 'USD'); assert.equal(C.stanceRange.dovish, 'EUR');
  assert.deepEqual(C.missingStores.sort(), ['ppi']);
});

test('a discontinued source says so; GBP inflation is filled from ONS when given, JPY stays missing', () => {
  const C = summariseCountries({ stores, cb, cpiFallback: { GBP: { date: '2026-09-01', value: 3.8, via: 'ONS' } }, today: '2026-11-01' });
  const gb = C.rows.find(r => r.ccy === 'GBP'), jp = C.rows.find(r => r.ccy === 'JPY');
  assert.equal(gb.inflation.headlineYoy, 3.8); assert.match(gb.inflation.via, /ONS/);
  assert.equal(gb.policy.realYield, 0.8); assert.equal(gb.policy.realYieldDerived, true);   // 10Y 4.6 − CPI 3.8
  assert.equal(jp.inflation.score, null); assert.equal(jp.inflation.discontinued.since, '2021-06');
  assert.equal(jp.quadrant, null);
});

test('no stores → empty cells, no invented numbers', () => {
  const C = summariseCountries({ today: '2026-11-01' });
  assert.ok(C.rows.every(r => r.growth.score == null && r.inflation == null && r.quadrant == null));
});

test('helpers', () => {
  assert.equal(nextMeeting({ meetings: [{ meetingDate: '2026-10-01' }, { meetingDate: '2026-11-05T12:00' }] }, '2026-11-01'), '2026-11-05');
  assert.equal(newestDate({ a: { latestDate: '2026-01-01' }, b: { c: { date: '2026-03-01' } } }), '2026-03-01');
});
