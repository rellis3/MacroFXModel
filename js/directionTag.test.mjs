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
