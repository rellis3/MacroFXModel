/**
 * Tests for the Forecast Auditor (js/forecastAudit.js): the binomial band and its design effect, the per-date
 * aggregation (pinball ratio only on paired rows), the regime measure, the drift rule (fires on a tight line, stays
 * quiet on a calibrated one, never on less than the minimum, never on HAR-800), and the seeded bootstrap.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  binomCdf, binomBand, designEffect, regimeOf, eventGroup, rowsFromStore, lastSessions, byDate, cellOf, blockBootstrap,
  bootStats, calibrate, rollingSeries, driftAlarms, buildAudit, newAlarms, alarmMessage, untaggedDates, DRIFT, LOCKBOX_END,
} from './forecastAudit.js';
import { mulberry32 } from './statsCore.js';

const dates = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 5) + i * 86400_000).toISOString().slice(0, 10));
// a scoreLadder-shaped row whose rungs are passed with probability p50/p75/p90 (draws from rng)
const draw = (rng, pr = [0.5, 0.25, 0.1], pin = 1) => {
  const f = () => pr.map(p => (rng() < p ? 1 : 0));
  return { hl: f(), oh: f(), ol: f(), pin };
};

test('binomial CDF and band', () => {
  assert.ok(Math.abs(binomCdf(5, 10, 0.5) - 0.623046875) < 1e-9);
  assert.equal(binomCdf(-1, 10, 0.5), 0);
  assert.equal(binomCdf(10, 10, 0.5), 1);
  const b = binomBand(0.25, 100);
  assert.deepEqual([b.lo, b.hi], [0.17, 0.34]);
  // the band holds ~95% of draws: P(outside) <= 5%
  assert.ok(binomCdf(16, 100, 0.25) + (1 - binomCdf(34, 100, 0.25)) <= 0.05);
  // fewer effective trials -> a wider band
  const narrow = binomBand(0.1, 2000), wide = binomBand(0.1, 2000 / designEffect(28));
  assert.ok(wide.hi - wide.lo > 2 * (narrow.hi - narrow.lo));
});

test('design effect: 28 instruments a day at rho 0.47 is ~2.1 independent forecasts', () => {
  assert.equal(designEffect(1), 1);
  assert.ok(Math.abs(28 / designEffect(28) - 2.05) < 0.01);
});

test('cellOf pools by date, flags out-of-band rungs, and takes the pinball ratio on paired rows only', () => {
  const rows = [];
  for (const d of dates(40)) for (const inst of ['A', 'B']) {
    rows.push({ date: d, inst, s: { plain: { hl: [1, 1, 0], oh: [1, 0, 0], ol: [0, 0, 0], pin: 2 }, ...(inst === 'A' ? { persist: { hl: [1, 0, 0], oh: [0, 0, 0], ol: [1, 0, 0], pin: 1 } } : {}) } });
  }
  const c = cellOf(byDate(rows, 'persist'));
  assert.equal(c.n, 40); assert.equal(c.sessions, 40); assert.equal(c.pairs, 40);
  assert.equal(c.ratio, 0.5);                                 // 1 vs plain's 2 on the same 40 rows, not plain's 80
  const p = cellOf(byDate(rows, 'plain'));
  assert.equal(p.hl[1].rate, 1); assert.equal(p.hl[1].out, 1);   // p75 passed every day: TIGHT
  assert.equal(p.ol[0].rate, 0); assert.equal(p.ol[0].out, -1);  // p50 never passed: WIDE
  assert.ok(p.de > 1 && p.hl[0].nEff < 80);
});

test('rowsFromStore + tags + lastSessions + untaggedDates', () => {
  const store = { days: { '2026-01-05': { EURUSD: { plain: { hl: [1, 0, 0], pin: 1 }, live: {} } }, '2026-01-06': { EURUSD: { plain: { hl: [0, 0, 0], pin: 1 } } } },
                  weeks: { '2026-01-05': { EURUSD: { sqrt: { hl: [1, 1, 0], pin: 2 }, rev: { hl: [1, 0, 0], pin: 1 } } } } };
  const { daily, weekly } = rowsFromStore(store, { '2026-01-05': { EURUSD: { regime: 'calm', event: 'NFP' } } });
  assert.equal(daily.length, 2); assert.equal(weekly.length, 1);
  assert.equal(daily[0].regime, 'calm'); assert.equal(daily[0].event, 'NFP'); assert.equal(daily[1].regime, null);
  assert.deepEqual(lastSessions(daily, 1).map(r => r.date), ['2026-01-06']);
  assert.deepEqual(untaggedDates(store, { '2026-01-05': { EURUSD: {} } }), ['2026-01-06']);
  assert.equal(eventGroup('FOMC'), 'event'); assert.equal(eventGroup('none'), 'quiet'); assert.equal(eventGroup(null), 'unknown');
});

test('regimeOf: σ well above its usual level reads stressed, below reads calm', () => {
  const rng = mulberry32(7), mk = (n, vol) => { const out = []; let c = 100;
    for (let i = 0; i < n; i++) { const o = c; c = o * (1 + vol * (rng() - 0.5)); out.push({ open: o, high: Math.max(o, c) * (1 + vol * 0.3), low: Math.min(o, c) * (1 - vol * 0.3), close: c }); }
    return out; };
  const base = mk(300, 0.01);
  const hot = [...base, ...mk(15, 0.03).map(b => ({ ...b }))];
  assert.equal(regimeOf(hot, 'yz_10').regime, 'stressed');
  const cool = [...base, ...mk(15, 0.003)];
  assert.equal(regimeOf(cool, 'yz_10').regime, 'calm');
  assert.equal(regimeOf(base.slice(0, 100), 'yz_10'), null);   // too short
});

test('drift: a calibrated line raises nothing; a tight one raises exceedance alarms; too little data raises nothing', () => {
  const rng = mulberry32(42);
  const ok = [], tight = [];
  for (const d of dates(60)) for (const inst of ['A', 'B', 'C', 'D']) {
    ok.push({ date: d, inst, s: { plain: draw(rng), persist: draw(rng) } });
    tight.push({ date: d, inst, s: { plain: draw(rng), persist: draw(rng, [0.75, 0.5, 0.3]) } });
  }
  assert.deepEqual(driftAlarms(ok, 'plain').filter(a => a.q === 'hl' && a.rung === 'p75'), []);
  const al = driftAlarms(tight, 'persist');
  assert.ok(al.some(a => a.kind === 'exceedance' && a.q === 'hl' && a.rung === 'p75' && /TIGHT/.test(a.text)));
  assert.deepEqual(driftAlarms(lastSessions(tight, DRIFT.min.daily - 1), 'persist'), []);
  assert.deepEqual(driftAlarms(tight, 'har800'), []);
});

test('drift: pinball alarm needs the ratio above 1.02 AND its interval above 1', () => {
  const rows = [], rows2 = [];
  const rng = mulberry32(3);
  for (const d of dates(60)) for (const inst of ['A', 'B']) {
    const pl = 1 + rng();
    rows.push({ date: d, inst, s: { plain: { ...draw(() => 0.6), pin: pl }, persist: { ...draw(() => 0.6), pin: pl * 1.1 } } });
    rows2.push({ date: d, inst, s: { plain: { ...draw(() => 0.6), pin: pl }, persist: { ...draw(() => 0.6), pin: pl * (rng() < 0.5 ? 0.13 : 1.93) } } });
  }
  assert.ok(driftAlarms(rows, 'persist').some(a => a.kind === 'pinball'));
  assert.ok(!driftAlarms(rows2, 'persist').some(a => a.kind === 'pinball'), 'a noisy ratio near 1.03 must not fire');
});

test('bootstrap: seeded, deterministic, and the interval covers the point estimate', () => {
  const rng = mulberry32(11), rows = [];
  for (const d of dates(200)) for (const inst of ['A', 'B', 'C']) rows.push({ date: d, inst, s: { plain: draw(rng, undefined, 1 + rng()), persist: draw(rng, undefined, 1 + rng()) } });
  const days = byDate(rows, 'persist');
  const a = blockBootstrap(days, bootStats, { nBoot: 300, seed: 5 }), b = blockBootstrap(days, bootStats, { nBoot: 300, seed: 5 });
  assert.deepEqual(a, b);
  const c = cellOf(days);
  assert.ok(a[1][0] <= c.hl[1].rate && c.hl[1].rate <= a[1][1]);
  assert.ok(a[9][0] <= c.ratio && c.ratio <= a[9][1]);
  assert.equal(blockBootstrap(days.slice(0, 5), bootStats), null);
});

test('calibrate splits by regime and event; rolling series has one point per date after the window', () => {
  const rng = mulberry32(9), rows = [];
  for (const d of dates(30)) rows.push({ date: d, inst: 'A', regime: rng() < 0.5 ? 'calm' : 'stressed', event: rng() < 0.3 ? 'CPI' : 'none', s: { plain: draw(rng) } });
  const c = calibrate(rows, 'plain');
  assert.equal(c.regime.calm.n + c.regime.stressed.n, 30);
  assert.equal((c.event.event?.n ?? 0) + (c.event.quiet?.n ?? 0), 30);
  assert.equal(rollingSeries(rows, 'plain', { window: 20 }).length, 11);
});

test('buildAudit: windows, HAR-800 labelled not scored (lockbox), weekly sets, alarms diffed for messages', () => {
  const rng = mulberry32(1), store = { days: {}, weeks: {} };
  for (const d of dates(70)) store.days[d] = { A: { plain: draw(rng), persist: draw(rng, [0.8, 0.6, 0.3]) }, B: { plain: draw(rng), persist: draw(rng, [0.8, 0.6, 0.3]) } };
  for (const d of dates(10)) store.weeks[d] = { A: { sqrt: draw(rng), rev: draw(rng) } };
  const A = buildAudit({ store, asOf: '2026-03-20', harSessions: 70 });
  assert.equal(A.sessions, 70);
  assert.equal(A.sets.plain.windows.r20.sessions, 20);
  assert.equal(A.sets.plain.windows.all.sessions, 70);
  assert.equal(A.sets.har800.lockbox, true);
  assert.match(A.sets.har800.note, new RegExp(LOCKBOX_END));
  assert.ok(!('windows' in A.sets.har800));
  assert.ok(A.sets.rev && A.sets.sqrt && !A.sets.ivadj);
  assert.ok(A.alarms.some(a => a.set === 'persist'));
  assert.deepEqual(newAlarms(A.alarms, A.alarms), []);
  assert.equal(newAlarms([], A.alarms).length, A.alarms.length);
  assert.match(alarmMessage(A.alarms, '2026-03-20'), /not a verdict/);
  assert.equal(alarmMessage([], 'x'), null);
});
