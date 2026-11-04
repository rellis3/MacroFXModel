// Tests for js/surpriseReader.js.   node js/surpriseReader.test.mjs
import assert from 'node:assert/strict';
import { parseValue, releaseKey, dueReleases, nameSimilarity, matchActual, historyFor, surprise, playbookRead, readRelease, surpriseMessage, addToLog, pruneSent } from './surpriseReader.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const T0 = Date.parse('2026-11-06T13:30:00Z');
const nfp = { country: 'US', event: 'Non-Farm Employment Change', impact: 'high', ms: T0, estimate: '110K', prev: '85K', actual: null };

t('values: percent, K/M suffixes, nbsp and junk', () => {
  assert.deepEqual(parseValue('0.3%'), { v: 0.3, unit: '%' });
  assert.deepEqual(parseValue('-12.5K'), { v: -12500, unit: 'K' });
  assert.equal(parseValue('1.2M').v, 1.2e6);
  assert.equal(parseValue('&nbsp;'), null); assert.equal(parseValue('0-2-7'), null); assert.equal(parseValue(null), null);
  assert.equal(parseValue('1,234.5').v, 1234.5); assert.equal(parseValue(3.75).v, 3.75);
});
t('due: high impact, numeric, inside the window, not yet sent', () => {
  const evs = [nfp, { ...nfp, event: 'FOMC Member Waller Speaks' }, { ...nfp, impact: 'medium', event: 'X' }, { ...nfp, event: 'CPI m/m', ms: T0 + 3600e3 }];
  assert.deepEqual(dueReleases(evs, T0 + 60e3).map(e => e.event), ['Non-Farm Employment Change']);
  assert.equal(dueReleases(evs, T0 - 60e3).length, 1, 'two minutes before counts');
  assert.equal(dueReleases(evs, T0 + 31 * 60e3).length, 0, 'gone after 30 minutes');
  assert.equal(dueReleases(evs, T0 + 60e3, { [releaseKey(nfp)]: 1 }).length, 0, 'sent once only');
});
t('the Nasdaq row is matched by country, time and name', () => {
  const rows = [{ ms: T0, country: 'United States', event: 'Nonfarm Payrolls', released: true, raw: { actual: '172K' } },
    { ms: T0, country: 'United States', event: 'Non-Farm Employment Change', released: true, raw: { actual: '57K', consensus: '110K' } },
    { ms: T0, country: 'Canada', event: 'Employment Change', released: true, raw: { actual: '20K' } },
    { ms: T0, country: 'United States', event: 'Unemployment Rate', released: false, raw: { actual: '' } }];
  assert.equal(matchActual(nfp, rows).raw.actual, '57K');
  assert.equal(matchActual({ ...nfp, event: 'Unemployment Rate' }, rows), null, 'not printed yet');
  assert.equal(matchActual({ ...nfp, ms: T0 + 3600e3 }, rows), null, 'a different time');
  assert.ok(nameSimilarity('CPI m/m', 'CPI (MoM)') >= 0.5);
});
t('history: same release, before this print, as surprises', () => {
  const store = [{ country: 'US', event: 'Non-Farm Employment Change', ms: 1, estimate: '100K', actual: '150K' }, { country: 'US', event: 'Non-Farm Employment Change', ms: 2, estimate: '100K', actual: '90K' },
    { country: 'US', event: 'Non-Farm Employment Change', ms: T0, estimate: '1', actual: '2' }, { country: 'CA', event: 'Non-Farm Employment Change', ms: 3, estimate: '1', actual: '2' }];
  assert.deepEqual(historyFor(store, nfp, { before: T0 }), [50000, -10000]);
});
t('the surprise in its own units and as a z against its own history', () => {
  const s = surprise({ actual: '57K', estimate: '110K', history: [40e3, -30e3, 60e3, -50e3, 20e3, -40e3, 10e3] });
  assert.equal(s.ok, true); assert.equal(s.diff, -53000); assert.equal(s.diffText, '-53K'); assert.equal(s.direction, 'below');
  assert.ok(s.z < -1 && s.z > -2, `z ${s.z}`); assert.equal(s.size, 'clear'); assert.equal(s.n, 7);
  const few = surprise({ actual: '0.4%', estimate: '0.3%', history: [0.1] });
  assert.equal(few.z, null); assert.equal(few.diffText, '+0.1pp'); assert.equal(few.direction, 'above');
  assert.equal(surprise({ actual: null, estimate: '1' }).ok, false);
  assert.equal(surprise({ actual: '3.75%', estimate: '3.75%' }).direction, 'in line');
});
const studyRows = Array.from({ length: 8 }, (_, i) => ({ family: 'NFP', t: `2025-0${i + 1}-05T12:30:00Z`, surprise: i % 2 ? -50 : 50,
  M: { eurusd: { m30: i % 2 ? 0.3 : -0.3, m240: i % 2 ? 0.2 : -0.25, t_peak: 20, retain: 0.6 }, zt: { m30: i % 2 ? 0.1 : -0.1, m240: 0.05, t_peak: 30, retain: 0.8 } } }));
t('the playbook read picks this side of the surprise', () => {
  const r = readRelease({ ...nfp }, { raw: { actual: '57K', consensus: '110K' } }, { studyRows, now: T0 + 40e3 });
  assert.equal(r.family, 'NFP'); assert.equal(r.source, 'nasdaq'); assert.equal(r.lagSec, 40);
  assert.equal(r.playbook.side, 'cold'); assert.equal(r.playbook.markets[0].id, 'eurusd');
  assert.equal(r.playbook.markets[0].after.m30, 0.3); assert.equal(r.playbook.markets[0].kept, 0.6);
  assert.equal(playbookRead(null, 'above'), null);
  const msg = surpriseMessage(r);
  assert.match(msg, /Non-Farm Employment Change/); assert.match(msg, /-53K/); assert.match(msg, /after cold prints \(n 4\) \+0\.3% at 30 min/); assert.match(msg, /not a forecast/);
  const noPb = surpriseMessage(readRelease({ country: 'AU', event: 'Employment Change', ms: T0, estimate: '20K', actual: '35K' }, null, { now: T0 }));
  assert.match(noPb, /No playbook history/); assert.match(noPb, /<b>\+15K<\/b> above consensus/);
});
t('the log is one row per release, newest first; old sent keys are pruned', () => {
  const a = { key: 'a', ms: 1 }, b = { key: 'b', ms: 2 };
  assert.deepEqual(addToLog(addToLog([], a), b).map(x => x.key), ['b', 'a']);
  assert.equal(addToLog([a, b], { key: 'a', ms: 1, x: 1 }).length, 2);
  assert.deepEqual(Object.keys(pruneSent({ old: 0, fresh: T0 }, T0 + 864e5)), ['fresh']);
});
console.log(`surpriseReader: ${n} tests passed`);
