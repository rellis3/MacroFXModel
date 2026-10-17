import assert from 'node:assert/strict';
import { toSurpriseRows, dedupeAgainst, impactOf, familyKey } from './nasdaqReleases.js';

const ms = Date.parse('2026-10-15T06:00:00Z');
const parsed = [
  { ms, country: 'United Kingdom', event: 'CPI (YoY)', raw: { actual: '3.6%', consensus: '3.5%', previous: '3.8%' } },
  { ms, country: 'United Kingdom', event: 'PPI Input (MoM)', raw: { actual: '0.2%', consensus: '&nbsp;', previous: '0.1%' } },
  { ms, country: 'United Kingdom', event: 'BoE Governor Speaks', raw: { actual: '&nbsp;' } },
  { ms, country: 'United States', event: 'CPI (YoY)', raw: { actual: '3.7%', consensus: '3.6%' } },
  { ms: ms + 3600e3, country: 'Japan', event: 'Tankan Large Manufacturers Index', raw: { actual: '15', consensus: '14' } },
  { ms: ms + 7200e3, country: 'Euro Zone', event: 'Retail Sales (MoM)', raw: { actual: '&nbsp;', consensus: '0.2%' } },   // not out
];
const rows = toSurpriseRows(parsed);
assert.deepEqual(rows.map(r => `${r.country}|${r.event}|${r.impact}`), ['GB|CPI (YoY)|high', 'GB|PPI Input (MoM)|medium', 'JP|Tankan Large Manufacturers Index|medium']);
assert.equal(rows[1].estimate, null);                        // no consensus kept as null, not '&nbsp;'
assert.equal(rows[0].src, 'nasdaq'); assert.equal(rows[0].time, '2026-10-15 06:00:00');
assert.equal(impactOf('ECB President Lagarde Speaks'), 'low');
// family keys are vendor-neutral and keep the period apart
assert.equal(familyKey('CPI y/y'), familyKey('CPI (YoY)'));
assert.notEqual(familyKey('CPI y/y'), familyKey('CPI m/m'));
assert.equal(familyKey('Core CPI y/y'), familyKey('Core CPI (YoY)'));
assert.notEqual(familyKey('CPI (YoY)'), familyKey('PPI Input (MoM)'));
// a statistics-office fill of UK CPI y/y removes Nasdaq's CPI (YoY) but not the PPI printed at the same minute
const kept = dedupeAgainst(rows, [{ country: 'GB', event: 'CPI y/y', ms: ms + 60e3, actual: '3.6%', src: 'ons:d7g7' }]);
assert.deepEqual(kept.map(r => r.event), ['PPI Input (MoM)', 'Tankan Large Manufacturers Index']);
// earlier Nasdaq rows never block a re-merge
assert.equal(dedupeAgainst(rows, rows).length, rows.length);
console.log('nasdaqReleases: all passed');
// one name, two prints at one instant (y/y and m/m) cannot be told apart: both dropped
const amb = toSurpriseRows([
  { ms, country: 'Germany', event: 'German CPI', raw: { actual: '3.3%', consensus: '3.3%' } },
  { ms, country: 'Germany', event: 'German CPI', raw: { actual: '0.6%', consensus: '0.6%' } },
  { ms, country: 'Spain', event: 'Spanish CPI', raw: { actual: '0.3%', consensus: '0.3%' } },
]);
assert.deepEqual(amb.map(r => r.event), ['Spanish CPI']);
console.log('nasdaqReleases: ambiguity guard passed');
