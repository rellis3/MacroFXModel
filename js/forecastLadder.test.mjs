/**
 * Tests for the fitted ladder — the properties that, if they broke, would leave the
 * bands looking perfectly plausible while being wrong. That is the failure mode this
 * whole rebuild exists to remove, so these assertions are about MEANING, not shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildLadder, flattenLadder, paramsFor, RUNGS } from './forecastLadder.js';
import { LADDER_PARAMS } from './forecastLadderParams.js';
import { SIGMA_ESTIMATORS } from './forecastSigma.js';

const SIGMA = 0.007;   // 0.7%/day

test('rungs are strictly ordered p50 < p75 < p90 for every quantity and instrument', () => {
  for (const name of Object.keys(LADDER_PARAMS.pairs)) {
    const L = buildLadder(SIGMA, { instrument: name });
    for (const q of ['hl', 'oc', 'oh', 'ol']) {
      if (!L[q]) continue;
      assert.ok(L[q].p50 < L[q].p75, `${name} ${q}: p50 !< p75`);
      assert.ok(L[q].p75 < L[q].p90, `${name} ${q}: p75 !< p90`);
    }
  }
});

test('the H-L rung is wider than the one-sided O-H / O-L rungs', () => {
  // A range contains both excursions by construction; a fit that inverted this
  // would mean the widths had been wired to the wrong realized column.
  for (const name of Object.keys(LADDER_PARAMS.pairs)) {
    const L = buildLadder(SIGMA, { instrument: name });
    for (const r of RUNGS) {
      if (L.hl?.[r] == null || L.oh?.[r] == null) continue;
      assert.ok(L.hl[r] > L.oh[r], `${name} ${r}: H-L not wider than O-H`);
      assert.ok(L.hl[r] > L.ol[r], `${name} ${r}: H-L not wider than O-L`);
    }
  }
});

test('the event multiplier is two-sided — quiet days below 1.0, event days above', () => {
  // The specific regression this guards: the old detectNewsMultiplier floored at 1.0
  // and so could never express a quiet day, which is about half the calendar.
  const quiet = buildLadder(SIGMA, { instrument: 'EURUSD', eventTag: 'none' });
  const nfp   = buildLadder(SIGMA, { instrument: 'EURUSD', eventTag: 'NFP' });
  assert.ok(quiet.event_mult < 1.0, `quiet multiplier ${quiet.event_mult} should be < 1`);
  assert.ok(nfp.event_mult > 1.0, `NFP multiplier ${nfp.event_mult} should be > 1`);
  assert.ok(nfp.hl.p50 > quiet.hl.p50);
});

test('an unknown event tag is a no-op, never a silent distortion', () => {
  const a = buildLadder(SIGMA, { instrument: 'EURUSD', eventTag: 'BANK_HOLIDAY_ON_MARS' });
  assert.equal(a.event_mult, 1);
});

test('weekly and monthly use their OWN fitted widths, not sqrt-scaled daily ones', () => {
  const d = buildLadder(SIGMA, { instrument: 'EURUSD', horizon: 'daily' });
  const w = buildLadder(SIGMA, { instrument: 'EURUSD', horizon: 'weekly' });
  assert.equal(w.width_source, 'fitted-weekly');
  // If it were sqrt-scaled the ratio would be exactly sqrt(5); the fitted width
  // differs because vol mean-reverts inside a week.
  const ratio = w.hl.p50 / d.hl.p50;
  assert.notEqual(Math.round(ratio * 1e6), Math.round(Math.sqrt(5) * 1e6));
  assert.ok(ratio > 1.5 && ratio < Math.sqrt(5) * 1.15, `weekly/daily ratio ${ratio} implausible`);
});

test('an instrument with no fitted params falls back to its class, flagged', () => {
  const f = paramsFor('SOMETHING_NEW', 'index');
  assert.equal(f.source, 'class-default');
  const L = buildLadder(SIGMA, { instrument: 'SOMETHING_NEW', assetClass: 'index' });
  assert.equal(L.params_source, 'class-default');
  assert.ok(L.hl.p50 > 0);
});

test('every shipped instrument carries the estimator its widths were fit against', () => {
  // Widths are quantiles of (realized / sigma) for ONE sigma series. A spec that
  // named an estimator this repo cannot compute would silently decalibrate.
  for (const [name, p] of Object.entries(LADDER_PARAMS.pairs)) {
    assert.ok(p.estimator, `${name} has no estimator`);
    assert.ok(SIGMA_ESTIMATORS[p.estimator], `${name}: unknown estimator ${p.estimator}`);
  }
});

test('shipped params are calibrated — last-fold OOS exceedance near nominal', () => {
  const target = { p50: 0.50, p75: 0.25, p90: 0.10 };
  const errs = { p50: [], p75: [], p90: [] };
  for (const p of Object.values(LADDER_PARAMS.pairs)) {
    for (const [k, v] of Object.entries(p.oos_exceed ?? {})) {
      const rung = k.slice(-3);
      if (target[rung] != null && v != null) errs[rung].push(Math.abs(v - target[rung]));
    }
  }
  for (const rung of ['p50', 'p75', 'p90']) {
    const mean = errs[rung].reduce((s, x) => s + x, 0) / errs[rung].length;
    assert.ok(mean < 0.05, `${rung} mean |OOS − nominal| = ${mean.toFixed(3)}, expected < 0.05`);
  }
});

test('JS sigma estimators reproduce the Python they were fit with', () => {
  const fx = JSON.parse(readFileSync(new URL('./forecastSigma.fixture.json', import.meta.url)));
  for (const [name, fn] of Object.entries(SIGMA_ESTIMATORS)) {
    const got = fn(fx.bars), want = fx.expected[name];
    for (let i = 0; i < want.length; i++) {
      const w = want[i], g = got[i];
      const wF = w !== null && Number.isFinite(w);
      assert.equal(wF, Number.isFinite(g), `${name}[${i}]: finite mismatch`);
      if (wF) assert.ok(Math.abs(w - g) / Math.abs(w) < 1e-10, `${name}[${i}]: ${w} vs ${g}`);
    }
  }
});

test('flattenLadder exposes all twelve rungs', () => {
  const flat = flattenLadder(buildLadder(SIGMA, { instrument: 'GOLD' }));
  assert.equal(Object.keys(flat).length, 12);
});

// ── Export contract with the Pine consumers ──────────────────────────────────
// `pine/cog_volatility_v3_sessions.pine` and friends parse the export by grepping
// literal tokens and then pulling numbers by position. That makes the export text a
// PUBLIC INTERFACE, not a display string: renaming a row breaks every pasted chart
// silently — the line stops matching, or the 75th resolves to na and vanishes.
// This test is that contract, written as the Pine parser sees it.
import { buildLadderExportText } from './ladderExport.js';

const _firstNumAfter = (s, k) => { const i = s.indexOf(k); if (i < 0) return null; const m = s.slice(i + k.length).match(/-?\d+\.?\d*/); return m ? +m[0] : null; };
const _lastNumBefore = (s, k) => { const i = s.indexOf(k); if (i < 0) return null; const m = [...s.slice(0, i).matchAll(/-?\d+\.?\d*/g)]; return m.length ? +m[m.length - 1][0] : null; };

function _fixture() {
  const L = buildLadder(0.006, { instrument: 'EURUSD', eventTag: 'none' });
  return { session_label: 'Test session', instruments: { EURUSD: { ...L, vol_annual: L.vol_annual, ladder: L, drift_d: 0.29 } } };
}

test('export keeps the row tokens the Pine indicators grep for', () => {
  const txt = buildLadderExportText(_fixture(), 'daily');
  for (const token of ['High to Low range', 'Open to Close move',
                       'Open High (upside)', 'Open Low  (downside)', 'Drift (d=μ/σ)']) {
    assert.ok(txt.includes(token), `export lost the "${token}" row — Pine consumers will not match it`);
  }
});

test('Pine number extraction resolves the right rung on every row', () => {
  const data = _fixture();
  const L = data.instruments.EURUSD.ladder;
  const txt = buildLadderExportText(data, 'daily');
  const row = label => txt.split('\n').find(r => r.startsWith(label));
  for (const [label, q] of [['High to Low range', L.hl], ['Open to Close move', L.oc],
                            ['Open High (upside)', L.oh], ['Open Low  (downside)', L.ol]]) {
    const r = row(label);
    assert.ok(r, `missing row ${label}`);
    // median = first number after ": "; 75th = last number BEFORE the "75th" token.
    assert.equal(_firstNumAfter(r, ': '), q.p50, `${label}: median mis-parses`);
    assert.equal(_lastNumBefore(r, '75th'), q.p75, `${label}: 75th mis-parses`);
    // p90 must sit AFTER the 75th token so the old parser cannot see it.
    assert.ok(r.indexOf(String(q.p90)) > r.indexOf('75th'), `${label}: p90 must follow the 75th token`);
  }
});

// ── Event tagging ────────────────────────────────────────────────────────────
import { detectEventTagFor, instrumentCurrencies } from './volForecast.js';

test('a high-impact release in the pair OWN currency is not tagged quiet', () => {
  // The live regression this exists for: 2026-08-20 carried two high-impact AU
  // releases and no US ones. The US-only tagger called it `none` and applied the
  // ~0.90 quiet-day discount, NARROWING AUD bands on a big AUD day.
  const day = [
    { country: 'AU', impact: 'high', event: 'Employment Change' },
    { country: 'AU', impact: 'high', event: 'Unemployment Rate' },
    { country: 'US', impact: 'medium', event: 'Unemployment Claims' },
  ];
  assert.equal(detectEventTagFor(day, 'AUDUSD'), 'high');
  assert.equal(detectEventTagFor(day, 'AUDJPY'), 'high');
  // A pair with no AUD leg sees only the US medium, which is not a bucket — `none`.
  assert.equal(detectEventTagFor(day, 'EURUSD'), 'none');
});

test('an unreadable calendar yields null, never the quiet-day discount', () => {
  // `[]` says "read it, nothing on" and earns the discount. `null` says "could not
  // read it" and must not. Collapsing them silently narrows every band on the board
  // whenever the feed is down.
  assert.equal(detectEventTagFor(null, 'EURUSD'), null);
  assert.equal(detectEventTagFor(undefined, 'EURUSD'), null);
  assert.equal(detectEventTagFor([], 'EURUSD'), 'none');
  const dead = buildLadder(0.006, { instrument: 'EURUSD', eventTag: null });
  const quiet = buildLadder(0.006, { instrument: 'EURUSD', eventTag: 'none' });
  assert.equal(dead.event_mult, 1, 'unknown calendar must not scale sigma');
  assert.ok(quiet.event_mult < 1, 'a genuinely quiet day still gets its discount');
});

test('named US releases outrank a generic high, and rank order holds', () => {
  const mk = (event, impact = 'high', country = 'US') => ({ country, impact, event });
  assert.equal(detectEventTagFor([mk('Non-Farm Employment Change'), mk('ISM Manufacturing PMI')], 'EURUSD'), 'NFP');
  assert.equal(detectEventTagFor([mk('CPI m/m'), mk('FOMC Statement')], 'EURUSD'), 'FOMC');
  assert.equal(detectEventTagFor([mk('Core CPI m/m')], 'GOLD'), 'CPI');
  assert.equal(detectEventTagFor([mk('Retail Sales m/m')], 'GOLD'), 'high');
});

test('instrument currency sets match the Python side', () => {
  assert.deepEqual(instrumentCurrencies('AUDUSD').sort(), ['AUD', 'USD']);
  assert.deepEqual(instrumentCurrencies('GBPJPY').sort(), ['GBP', 'JPY', 'USD']);
  assert.deepEqual(instrumentCurrencies('GOLD'), ['USD']);
  assert.deepEqual(instrumentCurrencies('DE30').sort(), ['EUR', 'USD']);
  assert.deepEqual(instrumentCurrencies('UK100').sort(), ['GBP', 'USD']);
});

// ── The weekly export's contract with weekly_vol_overlay.pine ────────────────
// It finds sections by header ("5-DAY"+"WEEKLY", "20-DAY"+"MONTHLY") and its "Both"
// display mode overlays them, so a single-horizon paste leaves it with nothing to
// show. Splitting the COG weekly export is exactly how that indicator broke; this
// guards the ladder's weekly export against the same mistake.
test('weekly export carries BOTH horizon sections in one paste', () => {
  const lad = h => ({ hl: { p50: h, p75: h * 1.3, p90: h * 1.7 },
                      oc: { p50: h * .5, p75: h * .9, p90: h * 1.4 },
                      oh: { p50: h * .5, p75: h * .9, p90: h * 1.4 },
                      ol: { p50: h * .5, p75: h * .9, p90: h * 1.4 },
                      vol_annual: 20, estimator: 'yz_10', width_source: 'fitted-weekly',
                      event_tag: 'none', event_mult: 0.9 });
  const data = { session_label: 'T', instruments: { GOLD: {
    vol_annual: 20, ladder: lad(1), ladder_weekly: lad(4), ladder_monthly: lad(8) } } };
  const txt = buildLadderExportText(data, 'weekly');
  const up = txt.toUpperCase().split('\n');
  assert.ok(up.some(r => r.includes('5-DAY') && r.includes('WEEKLY')), 'no is5DayHdr match');
  assert.ok(up.some(r => r.includes('20-DAY') && r.includes('MONTHLY')), 'no is20DayHdr match');

  const rows = txt.split('\n');
  const i5 = rows.findIndex(r => /5-Day/i.test(r)), i20 = rows.findIndex(r => /20-Day/i.test(r));
  assert.ok(i5 < i20, '5-Day must precede 20-Day');

  // f_parseRow strips %/75th/median then takes nums[0] and nums[1] — so a 90th is a
  // third number it ignores. Verify the first two still resolve to med and p75.
  const parseRow = r => r.replaceAll('%', ' ').replaceAll('75th', ' ')
    .replaceAll('Percentile', ' ').replaceAll('median', ' ')
    .split(' ').map(x => x.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
  for (const [from, to, expect] of [[i5, i20, 4], [i20, rows.length, 8]]) {
    const hl = rows.slice(from + 1, to).find(r => r.startsWith('High to Low range'));
    assert.ok(hl, 'section has no H-L row');
    const n = parseRow(hl);
    assert.equal(n[0], expect, `H-L median should come from that horizon's own fit`);
    assert.ok(n.length >= 3, 'the 90th should be present as an ignorable third number');
  }
});

test('each weekly section uses its OWN fitted widths, not sqrt-scaled daily ones', () => {
  const lad = h => ({ hl: { p50: h, p75: h * 1.3, p90: h * 1.7 },
                      oc: { p50: h, p75: h, p90: h }, oh: { p50: h, p75: h, p90: h },
                      ol: { p50: h, p75: h, p90: h }, vol_annual: 20, event_tag: 'none', event_mult: 1 });
  // monthly deliberately NOT 2x weekly — if the builder sqrt-scaled instead of reading
  // ladder_monthly, the 20-day row would come out at 2x the 5-day and this would fail.
  const data = { session_label: 'T', instruments: { GOLD: {
    vol_annual: 20, ladder: lad(1), ladder_weekly: lad(4), ladder_monthly: lad(9) } } };
  const rows = buildLadderExportText(data, 'weekly').split('\n');
  const i20 = rows.findIndex(r => /20-Day/i.test(r));
  const hls = rows.map((r, i) => [i, r]).filter(([, r]) => r.startsWith('High to Low range'));
  const num = r => +r.match(/:\s*(\d+\.?\d*)/)[1];
  assert.equal(num(hls.find(([i]) => i < i20)[1]), 4.00);
  assert.equal(num(hls.find(([i]) => i > i20)[1]), 9.00, 'monthly must come from ladder_monthly');
});
