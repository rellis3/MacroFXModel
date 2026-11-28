// js/terminal/chainBoard.test.mjs: the Chain tab's pure pieces changed in the 2026-11-27 consistency review. node --test js/terminal/chainBoard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { chainSvg, chainLinks, chipDir, CHIP_INVERTED, weekAheadRows, winWord, overWord, VWORD } from './chainBoard.js';

const wk = (n, end = '2026-11-26') => { const out = []; for (let t = Date.parse(end); out.length < n; t -= 864e5) { const d = new Date(t); if (d.getUTCDay() % 6) out.unshift(d.toISOString().slice(0, 10)); } return out; };

test('windows are named in sessions, and the live real-yield verdict has a word', () => {
  assert.equal(winWord(20), '20-session'); assert.equal(overWord(5), 'over 5 sessions'); assert.equal(overWord(1), 'over 1 day');
  assert.match(VWORD.assumed, /assumed/);
});

test('the EM-currency chip is coloured by what it means: the index up is EM currencies down', () => {
  assert.equal(chipDir('emdollar', 'up'), 'down'); assert.equal(chipDir('dxy', 'up'), 'up'); assert.ok(CHIP_INVERTED.emdollar);
  const d = wk(30), em = d.map((date, i) => ({ date, value: 100 + (i >= 29 ? 3 : 0) })), dx = d.map((date, i) => ({ date, value: 120 + (i >= 29 ? 2 : 0) }));
  const links = chainLinks({ fred: { dxy: dx }, extra: { emdollar: em } }, 1);
  const svg = chainSvg(links, { win: 1 });
  const chip = svg.match(/<g class="cg-n ([a-z ]+)"[^>]*data-node="emdollar"[\s\S]*?<\/g><text class="cg-nl"[^>]*>[^<]*<\/text><text class="cg-nv ([a-z]*)"[^>]*>([^<]*)</);
  assert.ok(chip, 'the EM chip is drawn');
  assert.match(chip[1], /\bdn\b/, 'ring red: EM currencies fell');
  assert.equal(chip[2], 'dn');
  assert.match(chip[3], /EM FX ↓/);
});

test('a chip shows its own last move while the link is judged on a common end date', () => {
  const d = wk(30), hy = d.slice(0, 28).map((date, i) => ({ date, value: 3 + (i === 27 ? 0.3 : 0) })), nqDates = d;
  const ohlcNq = nqDates.map((date, i) => ({ date, value: i === 27 ? 99 : i >= 28 ? 104 + i : 100 }));
  const links = chainLinks({ fred: { hy }, ohlc: { nq: ohlcNq } }, 1);
  const l = links.find(x => x.id === 'hy-nq');
  assert.equal(l.alignedTo, d[27]); assert.equal(l.verdict, 'holding');
  const svg = chainSvg(links, { win: 1 });
  assert.match(svg, /data-node="nq"[\s\S]*?\+0\.\d%/, 'the Nasdaq chip shows its own latest session, not the aligned one');
});

test('week ahead: one copy per release and time, and an unrated forward row is left out', () => {
  const now = Date.parse('2026-11-28T00:00:00Z'), t = Date.parse('2026-11-30T13:30:00Z');
  const ev = [{ country: 'US', event: 'Chicago PMI', impact: 'High', ms: t + 3600e3 }];
  const ahead = [
    { country: 'CA', event: 'GDP', impact: 'High', ms: t, source: 'nasdaq' }, { country: 'CA', event: 'GDP', impact: 'High', ms: t, source: 'nasdaq' },
    { country: 'EU', event: 'German CPI', impact: 'high', ms: t, ratedAs: 'German Prelim CPI m/m', estimate: '0.3%' },
    { country: 'EU', event: 'German CPI', impact: 'high', ms: t, ratedAs: 'German Prelim CPI m/m' },
    { country: 'EU', event: 'Bavaria CPI', impact: 'low', ms: t, ratedAs: 'x' },
  ];
  const r = weekAheadRows(ev, ahead, { now, days: 7 });
  assert.equal(r.dropped, 2, 'the two unrated Canadian GDP rows');
  assert.deepEqual(r.rows.map(x => x.event), ['German CPI', 'Chicago PMI']);
  assert.equal(r.rows[0].estimate, '0.3%', 'the copy with a consensus is kept');
});
