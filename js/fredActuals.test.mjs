import assert from 'node:assert/strict';
import { fredSpecFor, referenceDate, vintageWindow, actualFromVintage, priorAgrees, pendingRows, fetchStart, revisionOf, policyActualFrom, onsSeries } from './fredActuals.js';

const ms = s => Date.parse(s);
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('map', () => {
  assert.equal(fredSpecFor('US', 'CPI m/m').id, 'CPIAUCSL');
  assert.equal(fredSpecFor('GB', 'Halifax HPI m/m'), null); assert.equal(fredSpecFor('GB', 'CPI y/y').source, 'ons');
  assert.equal(fredSpecFor('US', 'ISM Manufacturing PMI'), null);
});
t('reference periods (documentation helpers)', () => {
  assert.equal(referenceDate(ms('2025-09-11T12:30:00Z'), 'm1'), '2025-08-01');
  assert.equal(referenceDate(ms('2025-01-14T13:30:00Z'), 'm1'), '2024-12-01');
  assert.equal(referenceDate(ms('2025-10-30T12:30:00Z'), 'q1'), '2025-07-01');
  assert.equal(referenceDate(ms('2025-09-18T12:30:00Z'), 'wk'), '2025-09-13');
});
t('vintage window: release day to three days later, capped at now', () => {
  assert.deepEqual(vintageWindow(ms('2025-09-11T12:30:00Z'), ms('2025-09-20T00:00:00Z')), { realtime_start: '2025-09-11', realtime_end: '2025-09-14' });
  assert.deepEqual(vintageWindow(ms('2025-09-11T12:30:00Z'), ms('2025-09-11T14:00:00Z')), { realtime_start: '2025-09-11', realtime_end: '2025-09-11' });
});
t('cpi m/m from the vintage: first print, prior as the market had it', () => {
  const spec = fredSpecFor('US', 'CPI m/m'); const rel = ms('2025-09-11T12:30:00Z');
  const v = [
    { date: '2025-06-01', value: 321.5, realtime_start: '2025-07-15' },
    { date: '2025-07-01', value: 322.132, realtime_start: '2025-08-12' },
    { date: '2025-08-01', value: 323.364, realtime_start: '2025-09-11' },
  ];
  const a = actualFromVintage(spec, rel, v);
  assert.equal(a.actual, '0.4%'); assert.equal(a.prior, '0.2%'); assert.equal(a.refDate, '2025-08-01'); assert.equal(a.publishedOn, '2025-09-11');
  // FRED not updated yet: the newest observation predates the release -> null, never July's number
  assert.equal(actualFromVintage(spec, rel, v.slice(0, 2)), null);
});
t('a revised earlier month inside the window does not masquerade as the print', () => {
  const spec = fredSpecFor('US', 'Retail Sales m/m'); const rel = ms('2025-09-16T12:30:00Z');
  const v = [
    { date: '2025-06-01', value: 720.0, realtime_start: '2025-07-17' },
    { date: '2025-07-01', value: 724.3, realtime_start: '2025-08-15' },
    { date: '2025-07-01', value: 724.9, realtime_start: '2025-09-16' },   // July revised on the August release day
    { date: '2025-08-01', value: 729.2, realtime_start: '2025-09-16' },
  ];
  const a = actualFromVintage(spec, rel, v);
  assert.equal(a.refDate, '2025-08-01'); assert.equal(a.actual, '0.6%'); assert.equal(a.prior, '0.7%');   // prior uses the revised July, as FF's `previous` does
});
t('units: payrolls K, claims persons -> K, ADP persons -> K, JOLTS M, new home sales K, trade B', () => {
  const at = (title, rel, rows) => actualFromVintage(fredSpecFor('US', title), ms(rel), rows.map(r => ({ ...r, realtime_start: r.realtime_start ?? rel.slice(0, 10) })))?.actual;
  assert.equal(at('Non-Farm Employment Change', '2025-04-04T12:30:00Z', [{ date: '2025-02-01', value: 158000, realtime_start: '2025-03-07' }, { date: '2025-03-01', value: 158228 }]), '228K');
  assert.equal(at('Unemployment Claims', '2025-04-03T12:30:00Z', [{ date: '2025-03-29', value: 219000 }]), '219K');
  assert.equal(at('ADP Non-Farm Employment Change', '2025-04-02T12:15:00Z', [{ date: '2025-02-01', value: 131500000, realtime_start: '2025-03-05' }, { date: '2025-03-01', value: 131655000 }]), '155K');
  assert.equal(at('JOLTS Job Openings', '2025-03-11T14:00:00Z', [{ date: '2025-01-01', value: 7568 }]), '7.57M');
  assert.equal(at('New Home Sales', '2025-04-23T14:00:00Z', [{ date: '2025-03-01', value: 670 }]), '670K');
  assert.equal(at('Trade Balance', '2017-12-05T13:30:00Z', [{ date: '2017-10-01', value: -48700 }]), '-48.7B');
});
t('fed funds waits for the observation dated after the decision day', () => {
  const spec = fredSpecFor('US', 'Federal Funds Rate'); const rel = ms('2026-09-16T18:00:00Z');
  const v = [{ date: '2026-09-15', value: 3.75, realtime_start: '2026-09-15' }, { date: '2026-09-16', value: 3.75, realtime_start: '2026-09-16' }, { date: '2026-09-17', value: 4.00, realtime_start: '2026-09-17' }];
  assert.equal(actualFromVintage(spec, rel, v).actual, '4.00%');
  assert.equal(actualFromVintage(spec, rel, v.slice(0, 2)), null);   // decision-day row can still carry the old rate
});
t('plausibility: a newest observation outside the cadence band is refused', () => {
  const spec = fredSpecFor('US', 'CPI m/m'); const rel = ms('2025-09-11T12:30:00Z');
  assert.equal(actualFromVintage(spec, rel, [{ date: '2025-03-01', value: 320, realtime_start: '2025-09-11' }, { date: '2025-04-01', value: 321, realtime_start: '2025-09-11' }]), null);
});
t('yoy needs thirteen months', () => {
  const spec = fredSpecFor('US', 'CPI y/y');
  const v = Array.from({ length: 13 }, (_, k) => { const mo = 7 + k; return { date: `${2024 + Math.floor(mo / 12)}-${String((mo % 12) + 1).padStart(2, '0')}-01`, value: 300 * Math.pow(1.0023, k), realtime_start: k === 12 ? '2025-09-11' : '2025-01-01' }; });
  assert.equal(actualFromVintage(spec, ms('2025-09-11T12:30:00Z'), v).actual, '2.8%');
  assert.equal(fetchStart(spec, ms('2025-09-11T12:30:00Z')) < '2024-08-01', true);
});
t('prior agreement tolerates a tick, not a different series', () => {
  assert.equal(priorAgrees('0.2%', '0.2%'), true);
  assert.equal(priorAgrees('0.2%', '0.3%'), true);
  assert.equal(priorAgrees('0.2%', '0.5%'), false);
  assert.equal(priorAgrees('228K', '229K'), true);
  assert.equal(priorAgrees('7.57M', '7.76M'), false);
});
t('pending rows: US, mapped, 45 min old, within 3 weeks, no actual', () => {
  const now = ms('2026-09-19T12:00:00Z');
  const rows = [
    { country: 'US', event: 'CPI m/m', ms: now - 3 * 3600e3, actual: null },
    { country: 'US', event: 'CPI m/m', ms: now - 10 * 60e3, actual: null },
    { country: 'US', event: 'CPI m/m', ms: now - 30 * 864e5, actual: null },
    { country: 'GB', event: 'Halifax HPI m/m', ms: now - 3 * 3600e3, actual: null },
    { country: 'US', event: 'ISM Manufacturing PMI', ms: now - 3 * 3600e3, actual: null },
    { country: 'US', event: 'CPI m/m', ms: now - 5 * 3600e3, actual: '0.3%' },
  ];
  assert.equal(pendingRows(rows, now).length, 1);
});
t('revisions: null when equal, signed delta in the series unit otherwise', () => {
  assert.equal(revisionOf('0.2%', '0.2%'), null);
  assert.deepEqual(revisionOf('12K', '155K'), { was: '12K', now: '155K', delta: '+143K' });
  assert.deepEqual(revisionOf('1.24M', '1.31M'), { was: '1.24M', now: '1.31M', delta: '+0.07M' });
  assert.deepEqual(revisionOf('0.5%', '0.4%'), { was: '0.5%', now: '0.4%', delta: '−0.1%' });
});
t('non-US policy rates: mapped by country, joined on the day after the decision', () => {
  assert.equal(fredSpecFor('GB', 'Official Bank Rate').source, 'boe');
  assert.equal(fredSpecFor('CA', 'Overnight Rate').id, 'V39079');
  assert.equal(fredSpecFor('EU', 'Main Refinancing Rate').source, 'fred');
  assert.equal(fredSpecFor('GB', 'Halifax HPI m/m'), null);
  const spec = fredSpecFor('AU', 'Cash Rate'); const rel = ms('2026-09-15T04:30:00Z');
  const obs = [{ date: '2026-09-14', value: 4.35 }, { date: '2026-09-15', value: 4.35 }, { date: '2026-09-16', value: 4.10 }];
  assert.equal(policyActualFrom(spec, rel, obs).actual, '4.10%');
  assert.equal(policyActualFrom(spec, rel, obs.slice(0, 2)), null);   // nothing dated after the decision yet
  assert.equal(pendingRows([{ country: 'GB', event: 'Official Bank Rate', ms: rel, actual: null }], rel + 3 * 3600e3).length, 1);
});
t('international: ONS/StatCan stamps join like FRED; Eurostat needs the exact period', () => {
  const gb = fredSpecFor('GB', 'CPI y/y'); const rel = ms('2026-09-16T06:00:00Z');
  const ons = onsSeries({ months: [{ year: '2026', month: 'July', value: '2.9', updateDate: '2026-08-18T23:00:00.000Z' }, { year: '2026', month: 'August', value: '3.1', updateDate: '2026-09-15T23:00:00.000Z' }] });
  assert.equal(ons[1].realtime_start, '2026-09-16');
  assert.equal(actualFromVintage(gb, rel, ons).actual, '3.1%');
  assert.equal(actualFromVintage(gb, rel, ons.slice(0, 1)), null);   // ONS not updated yet
  const eu = fredSpecFor('EU', 'CPI Flash Estimate y/y'); const flash = ms('2026-09-02T09:00:00Z');   // September flash reports September
  const es = [{ date: '2026-07-01', value: 2.9, realtime_start: '' }, { date: '2026-08-01', value: 3.2, realtime_start: '2026-09-17' }];
  assert.equal(actualFromVintage(eu, flash, es), null);   // August is not September: never fill a flash with the previous month's final
  assert.equal(actualFromVintage(eu, ms('2026-09-17T09:00:00Z'), es), null);   // the Final CPI spec (m1) would take it; the flash spec (m0) must not
  assert.equal(actualFromVintage(fredSpecFor('EU', 'Final CPI y/y'), ms('2026-09-17T09:00:00Z'), es).actual, '3.2%');
});
console.log(`fredActuals: ${n} groups, all passed`);
