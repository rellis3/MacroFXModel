// Tests for js/releasePlaybook.js.   node js/releasePlaybook.test.mjs
import assert from 'node:assert/strict';
import { familyOf, playbook, upcoming, playbookText } from './releasePlaybook.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const mk = (i, surprise, nq30) => ({ family: 'CPI', t: `2026-0${1 + (i % 9)}-15T12:30:00Z`, surprise, M: { nq: { m30: nq30, m240: nq30 * 1.5, t_peak: 8, retain: 0.7 }, sofr: { m30: -nq30 * 10, m240: 0, t_peak: 5, retain: 0.8 } } });
const rows = [mk(0, 0.1, -0.4), mk(1, 0.2, -0.3), mk(2, -0.1, 0.2), mk(3, -0.1, 0.3), mk(4, null, 0.1), mk(5, -0.2, 0.25)];

t('families need the event and the country', () => {
  assert.equal(familyOf('Core CPI m/m', 'US'), 'CPI'); assert.equal(familyOf('CPI y/y', 'GB'), null);
  assert.equal(familyOf('Non-Farm Employment Change', 'United States'), 'NFP'); assert.equal(familyOf('ECB Main Refinancing Rate', 'EU'), 'ECB');
  assert.equal(familyOf('Official Bank Rate', 'GB'), 'BOE'); assert.equal(familyOf('Employment Change', 'NZ'), null);
});

t('playbook: typical size and speed, and hot against cold with counts', () => {
  const p = playbook(rows, 'CPI');
  assert.equal(p.n, 6); assert.deepEqual(p.surprises, { known: 5, hot: 2, cold: 3 });
  assert.equal(p.markets.nq.abs30, 0.28); assert.equal(p.markets.nq.unit, '%'); assert.equal(p.markets.sofr.unit, 'bp');
  assert.deepEqual(p.markets.nq.hot, { n: 2, m30: -0.35, m240: -0.53 }); assert.equal(p.markets.nq.cold.n, 3);
  assert.equal(playbook(rows, 'FOMC'), null);
  assert.match(playbookText(p), /CPI: 6 releases.*2 hot, 3 cold[\s\S]*Nasdaq: typical move 0.28% at 30 min/);
});

t('upcoming: high impact, in the window, with a history; deduplicated across the two calendars', () => {
  const now = Date.parse('2026-11-04T08:00:00Z');
  const ev = [{ ms: now + 3600e3, country: 'US', event: 'Core CPI m/m', impact: 'High', estimate: '0.3%' }, { time: new Date(now + 3600e3).toISOString(), country: 'US', event: 'CPI m/m', impact: 'High' },
    { ms: now + 3600e3, country: 'NZ', event: 'Employment Change', impact: 'High' }, { ms: now + 50 * 3600e3, country: 'US', event: 'CPI', impact: 'High' }, { ms: now + 7200e3, country: 'US', event: 'CPI', impact: 'Low' }];
  const u = upcoming(ev, rows, now);
  assert.equal(u.length, 1); assert.equal(u[0].family, 'CPI'); assert.equal(u[0].estimate, '0.3%');
});

console.log(`releasePlaybook: ${n} tests passed`);
