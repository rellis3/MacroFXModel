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

// 2026-11-28: an ambiguous pair is NAMED from reference rows instead of dropped; the US releases FRED does not fill are taken
{
  const { nameAmbiguous, US_GAP } = await import('./nasdaqReleases.js');
  const t = Date.parse('2026-11-16T13:30:00Z');
  const pair = [{ ms: t, country: 'Canada', event: 'CPI', raw: { actual: '3.1%', consensus: '3.2%', previous: '3.1%' } },
    { ms: t, country: 'Canada', event: 'CPI', raw: { actual: '0.2%', consensus: '0.3%', previous: '0.1%' } },
    { ms: t, country: 'Canada', event: 'Trimmed CPI', raw: { actual: '1.8%', consensus: '1.9%', previous: '1.9%' } }];
  const ref = [{ country: 'CA', event: 'CPI m/m', ms: t, estimate: '0.3%', prev: '0.1%' }, { country: 'CA', event: 'Trimmed CPI y/y', ms: t, estimate: '1.9%', prev: '1.8%' }];
  assert.deepEqual(toSurpriseRows(pair).map(r => r.event), ['Trimmed CPI'], 'without a reference the pair is dropped, as before');
  const named = toSurpriseRows(pair, { reference: ref });
  assert.deepEqual(named.map(r => [r.event, r.actual]), [['CPI y/y', '3.1%'], ['CPI m/m', '0.2%'], ['Trimmed CPI', '1.8%']], 'm/m named by its consensus, the other is the y/y');
  assert.equal(nameAmbiguous(pair.slice(0, 2), [{ country: 'CA', event: 'Trimmed CPI y/y', ms: t, estimate: '3.2%' }], 'CA').size, 0, 'a different release (trimmed) never names the headline pair');
  { const n = nameAmbiguous(pair.slice(0, 2), [{ country: 'CA', event: 'CPI m/m', ms: t + 3600e3, estimate: '0.3%' }], 'CA'); assert.deepEqual([n.get(pair[0]), n.get(pair[1])], ['CPI y/y', 'CPI m/m'], 'a reference at another time does not match by consensus; the pair is named by size instead'); }
  const us = toSurpriseRows([{ ms: t, country: 'United States', event: 'ISM Manufacturing PMI', raw: { actual: '48.2', consensus: '48.6', previous: '48.7' } },
    { ms: t, country: 'United States', event: 'CB Consumer Confidence', raw: { actual: '101.2', consensus: '99.0', previous: '98.7' } },
    { ms: t, country: 'United States', event: 'Nonfarm Payrolls', raw: { actual: '165K', consensus: '65K', previous: '60K' } }]);
  assert.deepEqual(us.map(r => [r.country, r.event]), [['US', 'ISM Manufacturing PMI'], ['US', 'CB Consumer Confidence']], 'US: only what FRED does not fill');
  assert.ok(US_GAP.test('S&P Global Manufacturing PMI') && !US_GAP.test('CPI'));
  console.log('nasdaqReleases: named pairs and US gaps passed');
}
{
  const { nameAmbiguous } = await import('./nasdaqReleases.js');
  const t = Date.parse('2025-09-16T12:30:00Z'), old = [{ country: 'CA', event: 'CPI m/m', ms: Date.parse('2025-03-18T12:30:00Z'), estimate: '0.7%' }];
  const ca = [{ ms: t, country: 'Canada', event: 'CPI', raw: { actual: '2.4%', previous: '1.9%' } }, { ms: t, country: 'Canada', event: 'CPI', raw: { actual: '-0.1%', previous: '0.3%' } }];
  const n = nameAmbiguous(ca, old, 'CA');
  assert.deepEqual([n.get(ca[0]), n.get(ca[1])], ['CPI y/y', 'CPI m/m'], 'no reference at the time: named by size, the period from the stored series');
  const ch = [{ ms: t, country: 'Switzerland', event: 'CPI', raw: { actual: '0.2%', previous: '0.1%' } }, { ms: t, country: 'Switzerland', event: 'CPI', raw: { actual: '0.1%', previous: '0.0%' } }];
  assert.equal(nameAmbiguous(ch, [{ country: 'CH', event: 'CPI m/m', ms: 1 }], 'CH').size, 0, 'too close to call: dropped');
  assert.equal(nameAmbiguous(ca, [], 'CA').size, 0, 'no known short-period series: dropped');
  console.log('nasdaqReleases: size-named pairs passed');
}
