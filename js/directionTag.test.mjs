// Tests for js/directionTag.js — the per-card bull/bear mark.
//
// The point of most of these is the evidential rule, not the arithmetic:
// a non-validated input may subtract confidence, never add it. If someone
// later "improves" the brick by letting macro or COT set the arrow, several
// of these fail loudly.
//
// Run:  node --test js/directionTag.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { directionTag, sessionBiasDir, normTrendDir } from './directionTag.js';

// ── The HMM trend vocabulary ────────────────────────────────────────────────
// /api/daily-brief returned exactly these on 2026-08-24 across 30 instruments:
// "BULL" ×1, "BEAR" ×1, null ×13, undefined ×15. NOT "up"/"down" — so every
// `trend_dir === 'up'` test matched zero, and since they were written as
// `=== 'up' ? A : B`, bullish trends silently took the bearish branch.
test('normTrendDir accepts the vocabulary the feed actually sends', () => {
  assert.equal(normTrendDir('BULL'), 'up');
  assert.equal(normTrendDir('BEAR'), 'down');
  assert.equal(normTrendDir('up'), 'up');       // legacy shape still works
  assert.equal(normTrendDir('down'), 'down');
  for (const v of [null, undefined, '', 'sideways']) assert.equal(normTrendDir(v), null);
});

test('a BULL trend is not silently inverted into a bearish read', () => {
  // The exact regression: `trend_dir === 'up' ? 1 : -1` scored BULL as -1.
  const bull = directionTag({ regime: { label: 'TREND', trendDir: 'BULL', trendProb: 93, reliable: true } });
  const bear = directionTag({ regime: { label: 'TREND', trendDir: 'BEAR', trendProb: 93, reliable: true } });
  assert.equal(bull.direction, 'up');
  assert.equal(bear.direction, 'down');
  assert.notEqual(bull.direction, bear.direction, 'BULL and BEAR must not collapse to the same read');
});

test('BULL/BEAR and up/down produce identical tags', () => {
  const a = directionTag({ regime: { label: 'TREND', trendDir: 'BULL', trendProb: 80, reliable: true }, rangeUsed: 0.3 });
  const b = directionTag({ regime: { label: 'TREND', trendDir: 'up',   trendProb: 80, reliable: true }, rangeUsed: 0.3 });
  assert.deepEqual([a.direction, a.strength], [b.direction, b.strength]);
});

// ── The session vocabulary ──────────────────────────────────────────────────
// These are the EXACT strings /api/vol-forecast/session returned live on
// 2026-08-24, with their frequency across the 30 tracked instruments. The
// previous /bull|bear/i test matched 0 of 30 — hence these fixtures.
const LIVE_BIAS = [
  ['session developing',                          null, 19],
  ['upside leg dominating, downside contained',   'up',   6],
  ['downside extended',                           'down', 2],
  ['downside leg dominating, upside contained',   'down', 2],
  ['both sides active',                           null,   1],
];

test('sessionBiasDir handles every string the live feed actually emits', () => {
  for (const [text, want] of LIVE_BIAS) {
    assert.equal(sessionBiasDir(text), want, `"${text}" should read ${want}`);
  }
});

test('a bare "downside" inside a bullish string does not flip it', () => {
  // "upside leg dominating, downside contained" mentions both sides — the
  // qualified clause is what counts, which is exactly what the old regex missed.
  assert.equal(sessionBiasDir('upside leg dominating, downside contained'), 'up');
  assert.equal(sessionBiasDir('downside leg dominating, upside contained'), 'down');
});

test('legacy bull/bear phrasing still resolves', () => {
  assert.equal(sessionBiasDir('above · bullish daily bias'), 'up');
  assert.equal(sessionBiasDir('below · bearish daily bias'), 'down');
});

test('empty or unknown prose is null, never a guess', () => {
  for (const v of ['', null, undefined, 'quiet', 'no data']) {
    assert.equal(sessionBiasDir(v), null);
  }
});

test('the live vocabulary produces real tags, not 30 blanks', () => {
  // The regression that motivated this: every instrument read "flat" because
  // the tape driver never matched, so the card showed no tag at all.
  const tagged = LIVE_BIAS
    .filter(([, want]) => want)
    .map(([text]) => directionTag({ regime: { label: 'RANGE' }, session: { bias: text, dir: 68 }, rangeUsed: 0.4 }));
  assert.ok(tagged.length > 0);
  for (const t of tagged) {
    assert.notEqual(t.direction, 'flat', 'a dominating-leg session must produce a direction');
  }
});

const TREND_UP = { label: 'TREND', trendDir: 'BULL', trendProb: 72, reliable: true };   // live vocabulary
const TREND_DN = { label: 'TREND', trendDir: 'BEAR', trendProb: 68, reliable: true };   // live vocabulary
const RANGE    = { label: 'RANGE', trendProb: 0, reliable: true };
const TAPE_UP  = { bias: 'above · bullish daily bias', dir: 68 };
const TAPE_DN  = { bias: 'below · bearish daily bias', dir: 71 };

test('both descriptive drivers agreeing gives a strong read', () => {
  const t = directionTag({ regime: TREND_UP, session: TAPE_UP, rangeUsed: 0.35 });
  assert.equal(t.direction, 'up');
  assert.equal(t.strength, 'strong');
});

test('drivers pointing opposite ways is MIXED, never an average', () => {
  const t = directionTag({ regime: TREND_UP, session: TAPE_DN, rangeUsed: 0.4 });
  assert.equal(t.direction, 'mixed');
  assert.equal(t.strength, 'mixed');
});

test('a spent range downgrades strong to lean without changing direction', () => {
  const fresh = directionTag({ regime: TREND_UP, session: TAPE_UP, rangeUsed: 0.3 });
  const spent = directionTag({ regime: TREND_UP, session: TAPE_UP, rangeUsed: 0.92 });
  assert.equal(fresh.strength, 'strong');
  assert.equal(spent.direction, 'up', 'direction must survive — only confidence drops');
  assert.equal(spent.strength, 'lean');
});

// ── The evidential rule ─────────────────────────────────────────────────────

test('non-validated inputs CANNOT create a direction on their own', () => {
  // Every modifier screaming long, no descriptive driver at all.
  const t = directionTag({ regime: RANGE, cot: 0.9, macro: 0.8, carry: 0.7 });
  assert.equal(t.direction, 'flat',
    'COT + macro + carry agreeing must not manufacture a directional call');
  assert.equal(t.strength, 'flat');
});

test('non-validated inputs CAN subtract confidence', () => {
  const clean  = directionTag({ regime: TREND_UP, session: TAPE_UP, rangeUsed: 0.3 });
  const argued = directionTag({ regime: TREND_UP, session: TAPE_UP, rangeUsed: 0.3,
                                cot: -0.8, macro: -0.7 });
  assert.equal(clean.strength, 'strong');
  assert.notEqual(argued.strength, 'strong', 'dissenting modifiers must cost confidence');
});

test('a modifier majority against the drivers drags the read to mixed', () => {
  const t = directionTag({ regime: TREND_UP, session: TAPE_UP, rangeUsed: 0.3,
                           cot: -0.9, macro: -0.9, carry: -0.9 });
  assert.equal(t.direction, 'mixed');
});

test('modifiers agreeing never upgrades lean to strong', () => {
  // One driver only, so the ceiling is "lean" no matter how much agrees.
  const t = directionTag({ session: TAPE_UP, rangeUsed: 0.3, cot: 0.9, macro: 0.9, carry: 0.9 });
  assert.equal(t.direction, 'up');
  assert.equal(t.strength, 'lean', 'agreement from unvalidated inputs cannot buy "strong"');
});

test('every modifier carries its evidential status for the tooltip', () => {
  const t = directionTag({ regime: TREND_UP, session: TAPE_UP, cot: 0.5, macro: 0.5, carry: 0.5 });
  assert.ok(t.modifiers.length >= 3);
  for (const m of t.modifiers) {
    assert.ok(m.status && m.status.length > 0, `${m.key} must state why it cannot drive the arrow`);
  }
});

// ── Degradation ─────────────────────────────────────────────────────────────

test('no data at all is flat, not a coin flip', () => {
  const t = directionTag({});
  assert.equal(t.direction, 'flat');
  assert.equal(t.total, 0);
});

test('RANGE regime with no tape stays flat', () => {
  assert.equal(directionTag({ regime: RANGE }).direction, 'flat');
});

test('tape alone can lean but never reads strong', () => {
  const t = directionTag({ session: TAPE_DN, rangeUsed: 0.2 });
  assert.equal(t.direction, 'down');
  assert.equal(t.strength, 'lean');
});

test('a choppy tape counts for less than a clean one', () => {
  const clean  = directionTag({ regime: TREND_UP, session: { bias: 'bullish', dir: 85 } });
  const choppy = directionTag({ regime: TREND_DN, session: { bias: 'bullish', dir: 20 } });
  // Same tape direction, opposite HTF: the choppy one must not overpower a trend.
  assert.equal(clean.direction, 'up');
  assert.equal(choppy.direction, 'mixed', 'a 20%-directional day cannot outvote the HTF trend cleanly');
});

test('the cone is never an input', async () => {
  const src = await import('node:fs').then(fs => fs.readFileSync(new URL('./directionTag.js', import.meta.url), 'utf8'));
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/cone|forecastPath|p50|p75/i.test(code), false,
    'the forecast cone grades its own direction a coin flip — it must not feed this tag');
});

test('agree/total counts every voter, drivers and modifiers alike', () => {
  const t = directionTag({ regime: TREND_UP, session: TAPE_UP, cot: 0.6, macro: -0.6 });
  assert.equal(t.total, 4);          // htf, tape, cot, macro
  assert.equal(t.agree, 3);          // all but macro
});

// ── Regression guard: raw vocabulary must never be compared directly ─────────
// This class of bug has now bitten four times in one file — trend_dir compared
// to 'up' (the Market Tone gauge pinned at 50, "indices bid" stuck at 0/N, the
// aligned chip permanently reading "mixed", pairSignal scoring bull trends as
// -1) and bias_detail tested with /bull|bear/i (every directional read blank).
// Each time it failed SILENTLY — a plausible-looking number, never an error.
// So assert the shape of the calling code, not just the parsers.
test('today.html never compares raw feed vocabulary to up/down', () => {
  const src = readFileSync(new URL('../today.html', import.meta.url), 'utf8');
  const code = src.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  const bad = [];

  // trend_dir must always pass through _trendDir() before being read as a direction.
  for (const m of code.matchAll(/(\w+(?:\.\w+)*\.trend_dir)\s*(===|==|!==|!=)\s*['"](up|down)['"]/g)) {
    bad.push(`raw ${m[1]} ${m[2]} '${m[3]}' — wrap in _trendDir()`);
  }
  // …and must not be assigned as a direction without normalising.
  for (const m of code.matchAll(/\b(?:const|let)\s+\w*[Dd]ir\w*\s*=\s*[^;\n]*\?\s*(\w+(?:\.\w+)*\.trend_dir)\s*:/g)) {
    bad.push(`${m[1]} assigned as a direction unnormalised — wrap in _trendDir()`);
  }
  // bias_detail prose must go through sessionBiasDir(), never a bull/bear regex.
  for (const m of code.matchAll(/\/(?:bull|bear)\/i\.test\(/g)) {
    bad.push("a /bull|bear/i test — the feed says 'upside leg dominating'; use _biasDir()");
  }

  assert.equal(bad.length, 0, `\nRaw feed vocabulary compared directly:\n  ${bad.join('\n  ')}\n`);
});

// ── The variance/direction confusion ────────────────────────────────────────
// The daily HMM splits its states by RETURN VARIANCE (hmm.js: `rangeState` is whichever
// has the smaller sigma), so "RANGE" means QUIET and never meant directionless. This file
// used to render "HMM daily says RANGE - no structural direction", and the cost was not
// that it cancelled the tape -- a flat driver is excluded from the directional set -- but
// that `strong` became unreachable and a quiet session collapsed the whole tag to flat.
//
// USDCHF on 2026-09-29: +8.45% since March, 99% of its seven-month range, 7th vol
// percentile, HMM RANGE at 92%, and the card showed nothing at all.
const USDCHF = { label: 'RANGE', trendDir: null, trendProb: 8, rangeProb: 92, reliable: true };
const TRAVEL_UP = { dir: 'up', pos: 1, mult: 1.76, weight: 0.95,
  detail: '100% of its 63-bar range, travelling 1.76x as directly as a random walk' };

test('a quiet one-way grind is no longer invisible', () => {
  const t = directionTag({ regime: USDCHF, travel: TRAVEL_UP, session: null, rangeUsed: 0.4 });
  assert.equal(t.direction, 'up', 'the USDCHF case: RANGE label, but price is at the top of its range');
  assert.notEqual(t.strength, 'flat');
});

test('and it can reach strong when the tape agrees, which RANGE alone could never do', () => {
  const t = directionTag({ regime: USDCHF, travel: TRAVEL_UP, rangeUsed: 0.4,
    session: { bias: 'upside leg dominating, downside contained', dir: 80 } });
  assert.equal(t.direction, 'up');
  assert.equal(t.strength, 'strong', 'travel + tape are two directional drivers');
});

test('the RANGE driver stops claiming something the model never said', () => {
  const t = directionTag({ regime: USDCHF });
  const htf = t.drivers.find(d => d.key === 'htf');
  assert.doesNotMatch(htf.detail, /no structural direction/,
    'RANGE is a volatility state; it makes no directional claim');
  assert.match(htf.detail, /LOW-VOLATILITY/);
  assert.match(htf.detail, /92%/, 'rangeProb is derived from trendProb when absent');
  assert.equal(htf.dir, 'flat');
  assert.equal(htf.weight, 0, 'it abstains rather than voting flat with weight');
});

test('rangeProb is derived from trendProb rather than printed as a confident 0%', () => {
  const t = directionTag({ regime: { label: 'RANGE', trendProb: 8, reliable: true } });
  assert.match(t.drivers.find(d => d.key === 'htf').detail, /RANGE 92%/);
  const none = directionTag({ regime: { label: 'RANGE', reliable: true } });
  assert.doesNotMatch(none.drivers.find(d => d.key === 'htf').detail, /0%/,
    'with neither probability available it must say nothing, not 0%');
});

test('travel that is flat cannot create a direction', () => {
  const flat = { dir: 'flat', pos: 0.44, mult: 0.27, weight: 0, detail: 'mid-range at 44% of its 63-bar range' };
  const t = directionTag({ regime: USDCHF, travel: flat });
  assert.equal(t.direction, 'flat');
  assert.equal(t.drivers.find(d => d.key === 'travel').dir, 'flat');
});

// EURCHF sat at 97% of its range having chopped there. travelRead gives it weight 0, and
// a zero-weight driver must not be counted toward the two-driver bar for 'strong'.
test('a zero-weight travel read does not smuggle in a strong reading', () => {
  const chopped = { dir: 'up', pos: 0.97, mult: 1.02, weight: 0, detail: 'it chopped there' };
  const t = directionTag({ regime: USDCHF, travel: chopped,
    session: { bias: 'upside leg dominating, downside contained', dir: 80 } });
  assert.notEqual(t.strength, 'strong', 'only the tape is really pointing here');
});

test('travel disagreeing with the tape is MIXED, not averaged away', () => {
  const t = directionTag({ regime: USDCHF, travel: TRAVEL_UP,
    session: { bias: 'downside leg dominating, upside contained', dir: 75 } });
  assert.equal(t.direction, 'mixed');
  assert.equal(t.strength, 'mixed');
});

// ── trendDir with no dead-band ──────────────────────────────────────────────
// `trendDir` is the bare sign of the mean of the last 10 log returns. AUDJPY was labelled
// BULL on a mean of -2.5e-4 -- a quarter of a percent over a fortnight, inside its own
// daily noise, and the sign flips on a one-bar change of window.
test('a trend direction built from noise is not allowed to point the arrow', () => {
  const noisy = { label: 'TREND', trendDir: 'BULL', trendProb: 70, reliable: true, trendConfident: false };
  const t = directionTag({ regime: noisy, session: null });
  const htf = t.drivers.find(d => d.key === 'htf');
  assert.equal(htf.dir, 'flat');
  assert.match(htf.detail, /inside its own noise/);
  assert.equal(t.direction, 'flat', 'nothing else is pointing, so nothing is claimed');
});

test('a confident trend direction still drives exactly as before', () => {
  const good = { label: 'TREND', trendDir: 'BULL', trendProb: 80, reliable: true, trendConfident: true };
  const t = directionTag({ regime: good, session: { bias: 'upside leg dominating, downside contained', dir: 80 } });
  assert.equal(t.direction, 'up');
  assert.equal(t.strength, 'strong');
});

// Older callers cannot tell us, and must not be silently downgraded.
test('an absent confidence flag preserves the previous behaviour', () => {
  const t = directionTag({ regime: { label: 'TREND', trendDir: 'BEAR', trendProb: 75, reliable: true } });
  assert.equal(t.drivers.find(d => d.key === 'htf').dir, 'down');
});

test('travel is a DRIVER and the modifiers are still barred from pointing', () => {
  // The evidential rule is unchanged: adding a descriptive driver must not open the door
  // to macro, COT or carry setting the arrow.
  const t = directionTag({ regime: USDCHF, travel: null, session: null,
    cot: 0.9, macro: 0.9, carry: 0.9 });
  assert.equal(t.direction, 'flat', 'three non-validated inputs still cannot make a direction');
  const t2 = directionTag({ regime: USDCHF, travel: TRAVEL_UP, session: null,
    cot: -0.9, macro: -0.9, carry: -0.9 });
  assert.equal(t2.direction, 'mixed', 'but they can still drag a real lean to mixed');
});

test('today.html passes the two new fields through, or the fix is inert in production', () => {
  const src = readFileSync(new URL('../today.html', import.meta.url), 'utf8');
  assert.match(src, /travel:\s*r\.d\.regime\?\.travel/, 'travel must reach directionTag');
  assert.match(src, /trendConfident:\s*r\.d\.regime\.trend_dir_confident/, 'confidence must reach directionTag');
});
