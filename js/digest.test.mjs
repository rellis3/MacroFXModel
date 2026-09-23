import assert from 'node:assert/strict';
import { expectedRanges, formatDigest } from './digest.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

t('expected range: 1.0 ATR plus firing tested one-session effects; five-session effects spread; described triggers ignored', () => {
  const states = [
    { id: 'event-range', kind: 'tested', label: 'Market-moving release in the next 24h', firing: true, expect: [{ inst: 'EURUSD', window: 1, effAtr: 0.42, after: 64, unit: 'pips' }] },
    { id: 'vix-inversion', kind: 'tested', label: 'VIX curve inverted', firing: true, expect: [{ inst: 'USDJPY', window: 5, effAtr: 0.44, after: 200, unit: 'pips' }] },
    { id: 'chain-x', kind: 'described', label: 'Chain link broken', firing: true, expect: [{ inst: 'EURUSD', window: 1, effAtr: 9 }] },
    { id: 'nq-down-week', kind: 'tested', label: 'Nasdaq down-week', firing: false, expect: [{ inst: 'NQ', window: 1, effAtr: 0.21 }] },
  ];
  const r = expectedRanges(states, { EURUSD: 0.0045, USDJPY: 0.90, NQ: 250 });
  assert.equal(r.EURUSD.expectedAtr, 1.42); assert.equal(r.EURUSD.expected, 64); assert.equal(r.EURUSD.unit, 'pips'); assert.equal(r.EURUSD.drivers.length, 1);
  assert.equal(r.USDJPY.expectedAtr, 1.09); assert.equal(r.USDJPY.atr, 90);
  assert.equal(r.NQ.expectedAtr, 1); assert.deepEqual(r.NQ.drivers, []);
});
t('the digest reads as separated sections, not a wall', () => {
  const txt = formatDigest({ dateLabel: 'Mon 22 Sep', regime: { regime: 'goldilocks', months: 5, what: 'growth improving, inflation easing' }, weekUnusual: [{ label: 'Policy', z: 3.1 }],
    states: [{ id: 'event-range', kind: 'tested', label: 'Market-moving release in the next 24h', firing: true, expect: [{ inst: 'EURUSD', after: 64, unit: 'pips' }] }, { id: 'chain-oil-bei', kind: 'described', label: 'Chain link broken: oil → inflation pricing', firing: true }],
    prints: [{ time: '13:30', country: 'US', event: 'CPI m/m', estimate: '0.3%', model: '0.43%', size: 'EUR/USD 2.9× a normal half-hour', call: 'higher' }],
    ranges: { EURUSD: { inst: 'EURUSD', expected: 64, unit: 'pips', expectedAtr: 1.42, drivers: [{ label: 'Market-moving release in the next 24h' }] }, GOLD: { inst: 'GOLD', expected: 48, unit: '$', expectedAtr: 1, drivers: [] } },
    yesterday: { leans: { hits: 3, n: 6 }, ranges: [{ inst: 'EURUSD', expectedAtr: 1.0, realisedAtr: 0.8 }], calls: [{ event: 'Retail Sales m/m', result: 'hit' }] } }, { html: false });
  // sections, not one run-on block -- this is the whole point of the reformat
  const sections = txt.split('\n\n');
  assert.ok(sections.length >= 4, `expected separated sections, got ${sections.length}`);
  assert.match(txt, /🌍 Backdrop {2}Goldilocks, month 5/);
  assert.match(txt, /📈 This week {2}Policy z \+3\.1/);
  assert.match(txt, /✅ On, tested {2}Market-moving release/);
  assert.match(txt, /📝 Described {2}Chain link broken/);
  assert.match(txt, /📅 Today {2}13:30 US CPI m\/m \(0\.3% exp\., model 0\.43%\) — EUR\/USD 2\.9× a normal half-hour — you: higher/);
  assert.match(txt, /📏 Expected range {2}EUR\/USD ~64 pips \(1\.42× normal: Market-moving release in the next 24h\)/);
  assert.match(txt, /the rest an ordinary day — GOLD ~\$48/);
  assert.match(txt, /Scored at the close/);
  assert.match(txt, /📊 Yesterday {2}page leans 3\/6 right · range EUR\/USD 1×→0\.8× · your calls Retail Sales m\/m ✓/);
});
console.log(`digest: ${n} groups, all passed`);

t('the board: prices, and the Asia-conditioned side with its confidence', () => {
  const g = { inst: 'GOLD', open: 4361.19, dp: 2, dn1: { price: 4327.61 }, dn2: { price: 4298.83 },
              up1: { price: 4397.39 }, up2: { price: 4425.3 }, source: 'fitted-ladder', estimator: 'yz_10' };
  // a wide Asia with a real conditioner -> a side, and high confidence
  const wide = formatDigest({ dateLabel: 'x', states: [], ranges: {},
    board: [{ ...g, asia: 0.58, read: { band: 'wide', asiaAtr: 0.58, up: 0.21, dn: 0.17, gap: 0.04, side: null, confidence: 'high', finding: true } }] }, { html: false });
  assert.match(wide, /GOLD {2}4361\.19/);
  assert.match(wide, /▼ 4327\.61 → 4298\.83 {3}▲ 4397\.39 → 4425\.30/);
  assert.match(wide, /Asia wide 0\.58 ATR · 21% up \/ 17% down — neither side favoured/);
  // with the other tercile supplied, a quiet-from-here day is named as such
  const spent = formatDigest({ dateLabel: 'x', states: [], ranges: {},
    board: [{ ...g, asia: 0.58, read: { band: 'wide', asiaAtr: 0.58, up: 0.21, dn: 0.17, side: null, confidence: 'high', finding: true, alt: { up: 0.51, dn: 0.45 } } }] }, { html: false });
  assert.match(spent, /21% up \/ 17% down \(a narrow Asia: 51%\/45%\) — day largely spent overnight, both sides unlikely/);
  // a clear tilt names the side and prints both odds
  const tilt = formatDigest({ dateLabel: 'x', states: [], ranges: {},
    board: [{ ...g, asia: 0.2, read: { band: 'narrow', asiaAtr: 0.2, up: 0.51, dn: 0.2, gap: 0.31, side: 'up', tilt: 'clear', confidence: 'high', finding: true } }] }, { html: false });
  // a tilt is reported with its size and marked untested; the confidence on the
  // line belongs to the wide/narrow difference, which is the part that WAS tested
  assert.match(tilt, /51% up \/ 20% down — tilt ▲ up 31pp, untested alone ✓/);
  // the caveat that used to be repeated under every instrument now appears ONCE
  assert.equal((tilt.match(/is tested for that pair/g) ?? []).length, 1);
  // an instrument whose conditioner is not a finding says so
  const weak = formatDigest({ dateLabel: 'x', states: [], ranges: {},
    board: [{ ...g, asia: 0.2, read: { band: 'narrow', asiaAtr: 0.2, up: 0.48, dn: 0.35, gap: 0.13, side: 'up', tilt: 'clear', confidence: 'low', finding: false } }] }, { html: false });
  assert.match(weak, /untested alone ·/, 'a non-finding is marked with a dot, not a sentence');
  assert.match(weak, /"·" it is not a finding there/, 'and the dot is explained once, in the key');
  assert.doesNotMatch(weak, / · · /, 'the key separator must not collide with the marker');
  // a 5pp split is called slight, never "bullish"
  const slight = formatDigest({ dateLabel: 'x', states: [], ranges: {},
    board: [{ ...g, asia: 0.19, read: { band: 'narrow', asiaAtr: 0.19, up: 0.505, dn: 0.451, gap: 0.054, side: 'up', tilt: 'slight', confidence: 'high', finding: true, alt: { up: 0.214, dn: 0.171 } } }] }, { html: false });
  assert.match(slight, /slight tilt ▲ up 5pp, untested alone/);
  assert.ok(!/bullish|bearish/i.test(slight));
  // a middle Asia says so rather than inventing a side
  const mid = formatDigest({ dateLabel: 'x', states: [], ranges: {},
    board: [{ ...g, asia: 0.36, read: { band: 'middle', asiaAtr: 0.36, up: null, dn: null, side: null, confidence: 'none', why: 'an ordinary Asia' } }] }, { html: false });
  assert.match(mid, /Asia middle 0\.36 ATR — an ordinary Asia/);
  // the unconditional hit rates are NOT printed -- they barely move day to day
  assert.ok(!/\(45%\) →/.test(wide));
  // no board, no section
  assert.ok(!formatDigest({ dateLabel: 'x', states: [], ranges: {} }, { html: false }).includes('The board'));
});

t('a lean is never printed without the record behind it', () => {
  const t1 = formatDigest({ dateLabel: 'x', states: [], ranges: {},
    leanRecord: { n: 31, hits: 19, rate: 0.613, lo: 0.441, hi: 0.784, clears: false } }, { html: false });
  assert.match(t1, /right 19 of 31 at the next close — 61% \(44–78%\), NOT yet clear of a coin flip/);
});
