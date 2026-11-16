// js/releaseHistory.test.mjs: the last prints of one release, on synthetic store rows. node js/releaseHistory.test.mjs
import assert from 'node:assert/strict';
import { releaseHistory, seriesRows } from './releaseHistory.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const DAY = 864e5, NOW = Date.parse('2026-11-16T12:00:00Z');
const ms = d => Date.parse(`${d}T13:30:00Z`);
const row = (country, event, date, estimate, actual, prev, extra = {}) => ({ country, event, ms: ms(date), time: `${date}T13:30:00Z`, impact: 'high', estimate, actual, prev, ...extra });

// ten monthly US core CPI prints with a mix of beats and misses, one stored revision, plus the upcoming row (no actual)
const est = ['0.3%', '0.3%', '0.2%', '0.3%', '0.4%', '0.3%', '0.3%', '0.2%', '0.3%', '0.3%'];
const act = ['0.3%', '0.4%', '0.2%', '0.2%', '0.5%', '0.3%', '0.4%', '0.2%', '0.3%', '0.5%'];
const months = ['2026-01-14', '2026-02-11', '2026-03-11', '2026-04-14', '2026-05-12', '2026-06-10', '2026-07-14', '2026-08-12', '2026-09-11', '2026-10-14'];
const CPI = months.map((d, i) => row('US', 'Core CPI m/m', d, est[i], act[i], i ? act[i - 1] : '0.3%', i === 4 ? { revised: '0.4%', revisedAt: '2026-06-10', revisedDelta: -0.1, revision: { of: 'May', was: '0.5%', now: '0.4%', delta: -0.1 } } : {}));
const UPCOMING = row('US', 'Core CPI m/m', '2026-11-17', '0.3%', null, '0.5%');
const THIN = [row('NZ', 'Inflation Expectations q/q', '2026-02-01', '2.3%', '2.4%', '2.2%'), row('NZ', 'Inflation Expectations q/q', '2026-05-01', '2.4%', '2.3%', '2.4%'), row('NZ', 'Inflation Expectations q/q', '2026-08-01', '2.3%', '2.3%', '2.3%')];
const ALL = [...CPI, UPCOMING, ...THIN, row('GB', 'CPI y/y', '2026-10-15', '3.1%', '3.2%', '3.0%')];

t('the newest prints come first, only past ones, capped at n', () => {
  const h = releaseHistory(ALL, { country: 'US', event: 'Core CPI m/m', n: 5, now: NOW });
  assert.equal(h.found, true); assert.equal(h.rows.length, 5);
  assert.deepEqual(h.rows.map(r => r.date), ['2026-10-14', '2026-09-11', '2026-08-12', '2026-07-14', '2026-06-10']);
  assert.equal(h.printed, 10); assert.equal(h.first, '2026-01-14'); assert.equal(h.last, '2026-10-14');
  assert.ok(!h.rows.some(r => r.date === '2026-11-17'), 'the upcoming row has no actual and is not a past print');
  assert.equal(releaseHistory(ALL, { country: 'US', event: 'Core CPI m/m', n: 500, now: NOW }).rows.length, 10, 'n is capped by what exists (and at 40)');
});

t('each row carries forecast, actual, previous, the raw surprise, a z, and which way it beat', () => {
  const r = releaseHistory(ALL, { country: 'US', event: 'Core CPI m/m', n: 12, now: NOW }).rows[0];
  assert.equal(r.forecast, '0.3%'); assert.equal(r.actual, '0.5%'); assert.equal(r.previous, '0.3%');
  assert.equal(r.surprise, 0.2); assert.equal(r.beat, 'above'); assert.equal(r.moved, 'up');
  assert.ok(Number.isFinite(r.z) && r.z > 0, `z ${r.z}`);
  const miss = releaseHistory(ALL, { country: 'US', event: 'Core CPI m/m', n: 12, now: NOW }).rows.find(x => x.date === '2026-04-14');
  assert.equal(miss.beat, 'below'); assert.ok(miss.z < 0);
});

t('a stored revision rides along; the summary counts above, in line and below against the forecast', () => {
  const h = releaseHistory(ALL, { country: 'US', event: 'Core CPI m/m', n: 12, now: NOW });
  const rev = h.rows.find(r => r.date === '2026-05-12');
  assert.equal(rev.revised, '0.4%'); assert.equal(rev.revision.delta, -0.1);
  assert.deepEqual([h.summary.above, h.summary.inline, h.summary.below], [4, 5, 1]);   // above: Feb, May, Jul, Oct; below: Apr; the rest in line
  assert.equal(h.summary.withForecast, 10);
  assert.ok(h.summary.medianAbsZ >= 0 && h.summary.maxAbsZ >= h.summary.medianAbsZ);
});

t('z is on the series own scale: a bigger surprise has a bigger z', () => {
  const h = releaseHistory(ALL, { country: 'US', event: 'Core CPI m/m', n: 12, now: NOW });
  const big = h.rows.find(r => r.date === '2026-10-14'), small = h.rows.find(r => r.date === '2026-02-11');
  assert.ok(Math.abs(big.z) > Math.abs(small.z));
});

t('a series with too few prints still lists them, with no z and a plain reason', () => {
  const h = releaseHistory(ALL, { country: 'NZ', event: 'Inflation Expectations q/q', now: NOW });
  assert.equal(h.found, true); assert.equal(h.rows.length, 3);
  assert.ok(h.rows.every(r => r.z === null)); assert.equal(h.summary.scored, 0);
  assert.match(h.summary.zNote, /too few/); assert.ok(h.missing.some(m => /surprise z/.test(m)));
});

t('what is missing is said: no forecast range anywhere; revisions differ for the US and elsewhere', () => {
  const us = releaseHistory(ALL, { country: 'US', event: 'Core CPI m/m', now: NOW }), gb = releaseHistory(ALL, { country: 'GB', event: 'CPI y/y', now: NOW });
  assert.ok(us.missing.some(m => /forecast range/.test(m)) && gb.missing.some(m => /forecast range/.test(m)));
  assert.ok(us.missing.some(m => /ALFRED/.test(m))); assert.ok(gb.missing.some(m => /only when a later print restates/.test(m)));
  assert.ok(gb.missing.some(m => /no revision is stored/.test(m)));
});

t('a title with a period tag matches the stored series, and an unknown release says nothing is held', () => {
  const tagged = releaseHistory(ALL, { country: 'US', event: 'Core CPI m/m (Oct)', now: NOW });
  assert.equal(tagged.found, true); assert.equal(tagged.matched, 'normalised');
  assert.equal(releaseHistory(ALL, { country: 'US', event: 'Core CPI m/m', now: NOW }).matched, 'exact');
  const none = releaseHistory(ALL, { country: 'US', event: 'Nothing Index', now: NOW });
  assert.equal(none.ok, true); assert.equal(none.found, false); assert.match(none.note, /No past print/);
  assert.equal(releaseHistory(ALL, { country: '', event: 'x' }).ok, false);
});

t('the evidence note says size is validated and direction is not predictable', () => {
  const h = releaseHistory(ALL, { country: 'US', event: 'Core CPI m/m', now: NOW });
  assert.equal(h.evidence.id, 'surprise-size'); assert.match(h.evidence.say, /size of a surprise is validated/); assert.match(h.evidence.say, /cannot be predicted/);
});

t('seriesRows ignores rows with no time and keeps countries apart', () => {
  const r = seriesRows([...ALL, { country: 'US', event: 'Core CPI m/m' }], { country: 'GB', event: 'CPI y/y' });
  assert.equal(r.rows.length, 1);
});

console.log(`releaseHistory: ${n} tests passed`);
