// js/econSurprise.test.mjs — synthetic releases only, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCalNumber, seriesKey, polarityFor, scoreReleases, buildSurpriseIndex, mergeReleases, DEFAULTS,
} from './econSurprise.js';

const DAY = 864e5;
const NOW = Date.parse('2026-09-08T12:00:00Z');

// n releases of one series, `beats` sigma-ish above consensus on the last one.
function series({ country = 'US', event = 'Non-Farm Employment Change', n = 10, base = 200, est = 200, spread = 20, lastActual = null, impact = 'high', startDaysAgo = 200, stepDays = 20 }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ms = NOW - (startDaysAgo - i * stepDays) * DAY;
    const wiggle = ((i % 3) - 1) * spread;              // -spread, 0, +spread cycling
    const actual = (i === n - 1 && lastActual != null) ? lastActual : base + wiggle;
    out.push({
      country, event, impact, ms,
      time: new Date(ms).toISOString().slice(0, 19).replace('T', ' '),
      estimate: String(est), prev: String(base), actual: String(actual),
    });
  }
  return out;
}

test('econSurprise', async t => {
  await t.test('parseCalNumber handles the shapes a calendar actually prints', () => {
    assert.equal(parseCalNumber('225K'), 225000);
    assert.equal(parseCalNumber('1.2M'), 1200000);
    assert.equal(parseCalNumber('-0.1%'), -0.1);
    assert.equal(parseCalNumber('3.2'), 3.2);
    assert.equal(parseCalNumber('1,250'), 1250);
    assert.equal(parseCalNumber('<0.1'), 0.1);
    assert.equal(parseCalNumber(4.5), 4.5);
  });

  await t.test('unparseable is null, never zero', () => {
    // Zero would read as "came in exactly at consensus", which is a claim.
    for (const v of [null, undefined, '', '  ', 'n/a', '--']) assert.equal(parseCalNumber(v), null);
  });

  await t.test('polarity is a table, and says when it guessed', () => {
    assert.deepEqual(polarityFor('Unemployment Rate'), { sign: -1, matched: true });
    assert.deepEqual(polarityFor('Unemployment Claims'), { sign: -1, matched: true });
    assert.deepEqual(polarityFor('GDP q/q'), { sign: 1, matched: false });
  });

  await t.test('seriesKey is stable across dates, distinct across countries', () => {
    const a = { country: 'us', event: ' CPI m/m ' }, b = { country: 'US', event: 'cpi m/m' };
    assert.equal(seriesKey(a), seriesKey(b));
    assert.notEqual(seriesKey({ country: 'GB', event: 'CPI m/m' }), seriesKey(b));
  });

  await t.test('a series with too little history is excluded, not standardised against a guess', () => {
    const evs = series({ n: 3 });
    const { scored, skipped } = scoreReleases(evs, { now: NOW });
    assert.equal(scored.length, 0);
    assert.equal(skipped.length, 1);
    assert.match(skipped[0].reason, /too few/);
  });

  await t.test('a release with no published consensus is skipped, not compared to prev', () => {
    const evs = series({ n: 10 }).map(e => ({ ...e, estimate: null }));
    const { scored } = scoreReleases(evs, { now: NOW });
    assert.equal(scored.length, 0);
  });

  await t.test('a big beat scores positive; the same beat on an inverted series scores negative', () => {
    const beat = scoreReleases(series({ n: 10, lastActual: 400 }), { now: NOW }).scored;
    const newest = beat[0];
    assert.ok(newest.z > 1, `expected a strong positive z, got ${newest.z}`);

    const inv = scoreReleases(series({ event: 'Unemployment Rate', n: 10, base: 4, est: 4, spread: 0.2, lastActual: 6 }), { now: NOW }).scored;
    assert.ok(inv[0].z < -1, `higher unemployment must read weaker, got ${inv[0].z}`);
    assert.equal(inv[0].polarity, 'known');
  });

  await t.test('older surprises are down-weighted by the half-life', () => {
    const { scored } = scoreReleases(series({ n: 10 }), { now: NOW, halfLifeDays: 60 });
    const newest = scored[0], oldest = scored[scored.length - 1];
    assert.ok(newest.weight > oldest.weight);
    assert.ok(newest.ageDays < oldest.ageDays);
  });

  await t.test('a currency below the minimum sample reports null with a pending count', () => {
    // 6 releases of one series clears minSeriesObs but not minCcyObs at 8.
    const idx = buildSurpriseIndex(series({ n: 6 }), { now: NOW, minSeriesObs: 6, minCcyObs: 8 });
    assert.equal(idx.byCcy.USD.score, null);
    assert.equal(idx.byCcy.USD.n, 6);
    assert.equal(idx.byCcy.USD.pending, 2);
  });

  await t.test('country codes map to currencies, and the eurozone collapses to EUR', () => {
    const evs = [...series({ country: 'DE', event: 'German Ifo', n: 8 }), ...series({ country: 'EU', event: 'EZ CPI', n: 8 })];
    const idx = buildSurpriseIndex(evs, { now: NOW });
    assert.ok(idx.byCcy.EUR);
    assert.equal(idx.byCcy.EUR.nSeries, 2);
    assert.equal(idx.byCcy.DE, undefined);
  });

  await t.test('assumedPolarity flags how much of the read is inferred', () => {
    const idx = buildSurpriseIndex(series({ n: 10 }), { now: NOW });
    assert.equal(idx.byCcy.USD.assumedPolarity, 1);   // NFP is not in the inverted table
    const idx2 = buildSurpriseIndex(series({ event: 'Unemployment Rate', n: 10, base: 4, est: 4, spread: 0.2 }), { now: NOW });
    assert.equal(idx2.byCcy.USD.assumedPolarity, 0);
  });

  await t.test('mergeReleases keeps only printed releases and de-duplicates on revision', () => {
    const week = series({ n: 3, startDaysAgo: 40, stepDays: 7 });
    const unreleased = { ...week[0], ms: NOW + 2 * DAY, actual: null };
    let { rows, added } = mergeReleases([], [...week, unreleased], { now: NOW });
    assert.equal(added, 3);
    assert.equal(rows.length, 3, 'an unprinted release has nothing to score');

    const revised = { ...week[2], actual: '999' };
    const second = mergeReleases(rows, [revised], { now: NOW });
    assert.equal(second.added, 0);
    assert.equal(second.updated, 1);
    assert.equal(second.rows.length, 3, 'a revision updates in place, it does not duplicate');
    assert.equal(second.rows.at(-1).actual, '999');
  });

  await t.test('the store is bounded — rows past maxAgeDays are dropped', () => {
    const old = series({ n: 2, startDaysAgo: 900, stepDays: 10 });
    const recent = series({ n: 2, startDaysAgo: 30, stepDays: 10 });
    const { rows } = mergeReleases(old, recent, { now: NOW, maxAgeDays: 240 });
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => (NOW - r.ms) / DAY <= 240));
  });

  await t.test('defaults are sane', () => {
    assert.ok(DEFAULTS.halfLifeDays > 0 && DEFAULTS.maxAgeDays > DEFAULTS.halfLifeDays);
    assert.ok(DEFAULTS.minSeriesObs >= 3 && DEFAULTS.minCcyObs >= 3);
  });
});
