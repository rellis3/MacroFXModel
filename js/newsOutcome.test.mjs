import assert from 'node:assert/strict';
import { numberSide, scoreClaim, scoreRelease, claimTally, TALLY_MIN, HEADLINE_INSTRUMENT } from './newsOutcome.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

// ── which box the number landed in ──────────────────────────────────────────
t('the in-line band scales with the number it is judging', () => {
  // 0.1 on a 4.5% unemployment rate is a real miss
  assert.equal(numberSide('4.6%', '4.5%'), 'up');
  assert.equal(numberSide('4.4%', '4.5%'), 'dn');
  assert.equal(numberSide('4.5%', '4.5%'), 'mid');
  // 0.1 on a 21,500 payroll is noise, and a fixed band would have called it a miss
  assert.equal(numberSide('21.5K', '21.5K'), 'mid');
  assert.equal(numberSide('21600', '21500'), 'mid');
  assert.equal(numberSide('30000', '21500'), 'up');
  assert.equal(numberSide('-15.8K', '21.5K'), 'dn');
});

t('a release nobody forecast is not forced into a box', () => {
  assert.equal(numberSide('4.5%', null), null);
  assert.equal(numberSide(null, '4.5%'), null);
  assert.equal(numberSide('', ' '), null);
  assert.equal(numberSide('n/a', '4.5%'), null);
});

// ── the polarity table: the thing that would silently invert half the board ──
t('a currency in the QUOTE strengthens when the instrument falls', () => {
  // strong Swiss print -> stronger franc -> USD/CHF DOWN
  assert.equal(scoreClaim({ side: 'up', instrument: 'USDCHF', dir: 'down' }).claimHeld, true);
  assert.equal(scoreClaim({ side: 'up', instrument: 'USDCHF', dir: 'up' }).claimHeld, false);
  // strong Japanese print -> stronger yen -> USD/JPY DOWN
  assert.equal(scoreClaim({ side: 'up', instrument: 'USDJPY', dir: 'down' }).claimHeld, true);
  // strong Australian print -> stronger Aussie -> AUD/USD UP
  assert.equal(scoreClaim({ side: 'up', instrument: 'AUDUSD', dir: 'up' }).claimHeld, true);
  assert.equal(scoreClaim({ side: 'dn', instrument: 'AUDUSD', dir: 'down' }).claimHeld, true);
  assert.equal(scoreClaim({ side: 'dn', instrument: 'AUDUSD', dir: 'up' }).claimHeld, false);
});

t('an inverted release flips what "strong" means, once, at one place', () => {
  // a HIGHER unemployment rate is a WEAKER economy: the currency should fall
  const higher = scoreClaim({ side: 'up', instrument: 'AUDUSD', dir: 'down', invert: true });
  assert.equal(higher.claimHeld, true, 'unemployment up, Aussie down — the box said so');
  const wrong = scoreClaim({ side: 'up', instrument: 'AUDUSD', dir: 'up', invert: true });
  assert.equal(wrong.claimHeld, false);
});

t('what cannot be scored is refused, never counted as a win', () => {
  assert.equal(scoreClaim({ side: 'mid', instrument: 'AUDUSD', dir: 'up' }).claimHeld, null);
  assert.match(scoreClaim({ side: 'mid', instrument: 'AUDUSD', dir: 'up' }).why, /thirty minutes cannot falsify/);
  assert.equal(scoreClaim({ side: 'up', instrument: 'AUDUSD', dir: 'flat' }).claimHeld, null);
  assert.equal(scoreClaim({ side: 'up', instrument: 'AUDUSD', dir: null }).claimHeld, null);
  assert.equal(scoreClaim({ side: 'up', instrument: 'XAUUSD', dir: 'up' }).claimHeld, null, 'no polarity known');
  assert.equal(scoreClaim({}).claimHeld, null);
});

// ── a whole release ─────────────────────────────────────────────────────────
t('a release carries the number, the claim and the measured size, kept apart', () => {
  const r = scoreRelease(
    { country: 'AU', event: 'Employment Change', ms: 1, kind: 'jobs', actual: '30.2K', estimate: '21.5K' },
    { move: -34, unit: 'pips', dir: 'down', ratio: 2.4, ordinary: 14 });
  assert.equal(r.instrument, 'AUDUSD');
  assert.equal(r.side, 'up', 'the print beat');
  assert.equal(r.claimHeld, false, 'the box said the Aussie strengthens; it fell');
  assert.equal(r.sizeWord, 'a real move', 'and the SIZE is the part this desk has validated');
  assert.equal(r.moved.ratio, 2.4);
});

t('the unemployment rate is inverted through the whole path', () => {
  const r = scoreRelease(
    { country: 'AU', event: 'Unemployment Rate', ms: 1, kind: 'unemp', actual: '4.2%', estimate: '4.5%' },
    { move: 22, unit: 'pips', dir: 'up', ratio: 1.1 });
  assert.equal(r.side, 'dn', 'the number came in lower');
  assert.equal(r.invert, true);
  assert.equal(r.claimHeld, true, 'lower unemployment is a STRONGER economy, and the Aussie rose');
});

t('a release with no measured reaction says so rather than guessing', () => {
  const r = scoreRelease({ country: 'CH', event: 'SNB Policy Rate', ms: 1, actual: '0.00%', estimate: '0.00%' }, null);
  assert.equal(r.moved, null);
  assert.equal(r.claimHeld, null);
  assert.equal(r.sizeWord, null);
  assert.equal(r.side, 'mid');
});

t('every country the playbook names has an instrument to judge it on', () => {
  for (const c of ['US', 'EU', 'GB', 'JP', 'CH', 'AU', 'NZ', 'CA', 'DE'])
    assert.ok(HEADLINE_INSTRUMENT[c], `${c} has one`);
});

// ── the tally, which is the point of the whole thing ────────────────────────
t('below the floor it reports the count and refuses a percentage', () => {
  const rows = [{ claimHeld: true }, { claimHeld: true }, { claimHeld: true }, { claimHeld: false }];
  const tt = claimTally(rows);
  assert.equal(tt.n, 4);
  assert.equal(tt.right, 3);
  assert.equal(tt.pct, null, '3 of 4 printed as 75% is how this starts looking like a skill');
  assert.equal(tt.settled, false);
  assert.match(tt.line, /too few to quote a percentage/);
});

t('past the floor it quotes the record AND what the record is expected to be', () => {
  const rows = Array.from({ length: TALLY_MIN + 4 }, (_, i) => ({ claimHeld: i % 2 === 0 }));
  const tt = claimTally(rows);
  assert.equal(tt.settled, true);
  assert.ok(tt.pct >= 45 && tt.pct <= 55);
  assert.match(tt.line, /coin flip/);
  assert.match(tt.line, /near 50 is the expected result, not a failure/);
});

t('unscorable releases never enter the denominator', () => {
  const tt = claimTally([{ claimHeld: null }, { claimHeld: null }, { claimHeld: true }]);
  assert.equal(tt.n, 1, 'the in-line and the unmoved are not counted either way');
  assert.equal(claimTally([]).n, 0);
  assert.match(claimTally([]).line, /No release has been scored yet/);
  assert.equal(claimTally(null).n, 0);
});

console.log(`newsOutcome: ${n} groups, all passed`);
