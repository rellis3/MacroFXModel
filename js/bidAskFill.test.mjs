// Tests for js/bidAskFill.js: each fill rule on hand-built bars, then a
// statistical check on random-walk bid/ask (no edge: mean R about 0 with no
// spread, and about minus one spread per trade, in stop units, with a spread).
import { priceBracketBidAsk, priceRetestFadeBidAsk } from './bidAskFill.js';
import { randomWalkPacked } from './atlasNullCheck.js';

let failures = 0;
const ok = (name, cond, detail = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${detail ? '  ' + detail : ''}`); if (!cond) failures++; };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// Bars from mid OHLC rows [o,h,l,c] with a fixed half-spread.
function bars(rows, half = 0.0001) {
  const n = rows.length, d = { times: new Int32Array(n) };
  for (const k of ['bid_o', 'bid_h', 'bid_l', 'bid_c', 'ask_o', 'ask_h', 'ask_l', 'ask_c']) d[k] = new Float64Array(n);
  rows.forEach(([o, h, l, c], i) => {
    d.times[i] = i * 60;
    d.bid_o[i] = o - half; d.bid_h[i] = h - half; d.bid_l[i] = l - half; d.bid_c[i] = c - half;
    d.ask_o[i] = o + half; d.ask_h[i] = h + half; d.ask_l[i] = l + half; d.ask_c[i] = c + half;
  });
  return d;
}
const P = { dir: 1, level: 1.1000, stopDist: 0.0010, targetDist: 0.0010 };

{ // Limit: a mid touch that does not trade through on the ask does not fill.
  const d = bars([[1.1010, 1.1012, 1.1000, 1.1005], [1.1005, 1.1015, 1.1003, 1.1012]]); // ask low = 1.1001 > 1.1000
  ok('limit buy: mid touch without ask trading through -> no fill', !priceBracketBidAsk(d, { ...P, entryType: 'limit', startIdx: 0, endIdx: 1 }).filled);
}
{ // Limit buy fills at the level, target needs bid trade-through and is not credited on the fill bar.
  const d = bars([[1.1005, 1.1030, 1.0995, 1.1001], [1.1001, 1.1012, 1.0998, 1.1008], [1.1008, 1.1015, 1.1005, 1.1010]]);
  const r = priceBracketBidAsk(d, { ...P, entryType: 'limit', startIdx: 0, endIdx: 2 });
  ok('limit buy fills at the level', r.filled && r.fillIdx === 0 && near(r.entryPx, 1.1000));
  ok('target not credited on the fill bar even though its high reached it', r.fillIdx === 0 && r.exitIdx !== 0);
  ok('target needs the bid to trade through (bar 1 bid high 1.1011 > 1.1010)', r.why === 'target' && r.exitIdx === 1 && near(r.exitPx, 1.1010) && near(r.r, 1), JSON.stringify(r));
}
{ // Stop entry gaps through the level: fill at the ask open.
  const d = bars([[1.0990, 1.0995, 1.0985, 1.0994], [1.1004, 1.1006, 1.1002, 1.1005], [1.1005, 1.1030, 1.1004, 1.1020]]);
  const r = priceBracketBidAsk(d, { ...P, entryType: 'stop', startIdx: 0, endIdx: 2 });
  ok('buy stop that gaps through fills at the ask open, not the level', r.fillIdx === 1 && near(r.entryPx, 1.1005), JSON.stringify(r));
  ok('R counts the gap: target hit gives less than 1R', r.why === 'target' && r.r < 1 && near(r.r, (1.1010 - 1.1005) / 0.0010), JSON.stringify(r));
}
{ // Same bar reaches stop and target: stop is taken.
  const d = bars([[1.1001, 1.1003, 1.0995, 1.1001], [1.1001, 1.1020, 1.0980, 1.1000]]);
  const r = priceBracketBidAsk(d, { ...P, entryType: 'limit', startIdx: 0, endIdx: 1 });
  ok('bar reaching both stop and target -> stop', r.why === 'stop' && near(r.exitPx, 1.0990) && r.r < -1 + 1e-9, JSON.stringify(r));
}
{ // Stop that gaps: exit at the bid open, worse than the stop.
  const d = bars([[1.1001, 1.1003, 1.0995, 1.1001], [1.0980, 1.0985, 1.0975, 1.0980]]);
  const r = priceBracketBidAsk(d, { ...P, entryType: 'limit', startIdx: 0, endIdx: 1 });
  ok('long stop gapped through exits at the bid open (loss beyond 1R)', r.why === 'stop' && near(r.exitPx, 1.0980 - 0.0001) && r.r < -1.9, JSON.stringify(r));
}
{ // Short side mirrors, and an open trade is flattened at the ask close.
  const d = bars([[1.0995, 1.1005, 1.0993, 1.0999], [1.0999, 1.1002, 1.0996, 1.0998]]);
  const r = priceBracketBidAsk(d, { ...P, dir: -1, entryType: 'limit', startIdx: 0, endIdx: 1 });
  ok('sell limit fills when the bid trades above the level', r.filled && r.fillIdx === 0 && near(r.entryPx, 1.1000));
  ok('unresolved short flattened at the ask close', r.why === 'close' && near(r.exitPx, 1.0998 + 0.0001), JSON.stringify(r));
}
ok('invalid geometry is refused, not priced', priceBracketBidAsk(bars([[1, 1, 1, 1]]), { ...P, stopDist: 0, entryType: 'limit', startIdx: 0, endIdx: 0 }).invalid === true);

// Retest fade (owner's ForecastBandFade sheet): arm on overshoot, stop entry back through the line.
{
  const R = { dir: -1, level: 1.1000, stopDist: 0.0010, targetDist: 0.0020 };
  let d = bars([[1.0998, 1.1003, 1.0997, 1.1002], [1.1002, 1.1002, 1.0995, 1.0996], [1.0996, 1.0997, 1.0975, 1.0978]]);
  let r = priceRetestFadeBidAsk(d, { ...R, startIdx: 0, endIdx: 2 });
  ok('retest short: arm on 10% overshoot, fill at the line on the way back, target hit', r.filled && r.armIdx === 0 && r.fillIdx === 1 && near(r.entryPx, 1.1000) && r.why === 'target' && near(r.r, 2), JSON.stringify(r));
  d = bars([[1.0998, 1.10005, 1.0997, 1.0999], [1.0999, 1.0999, 1.0980, 1.0985]]);
  ok('overshoot under 10% of the stop never arms', !priceRetestFadeBidAsk(d, { ...R, startIdx: 0, endIdx: 1 }).armed);
  d = bars([[1.0998, 1.1003, 1.0990, 1.0992]]);
  r = priceRetestFadeBidAsk(d, { ...R, startIdx: 0, endIdx: 0 });
  ok('the arm bar itself never fills', r.armed && !r.filled, JSON.stringify(r));
  d = bars([[1.0998, 1.1003, 1.0997, 1.1002], [1.1002, 1.1015, 1.1005, 1.1014], [1.1014, 1.1014, 1.0970, 1.0975]]);
  r = priceRetestFadeBidAsk(d, { ...R, startIdx: 0, endIdx: 2 });
  ok('run past 1.2x the stop cancels the order: no trade even if price later falls', !r.filled && r.cancelled, JSON.stringify(r));
  d = bars([[1.0998, 1.1003, 1.0997, 1.1002], [1.1002, 1.10105, 1.1004, 1.1005], [1.1005, 1.1005, 1.0975, 1.0978]]);
  ok('chase: cancel at the next line out when it is nearer than 1.2x', priceRetestFadeBidAsk(d, { ...R, startIdx: 0, endIdx: 2, cancelDist: 0.0010 }).cancelled === true
    && priceRetestFadeBidAsk(d, { ...R, startIdx: 0, endIdx: 2 }).filled === true);
  d = bars([[1.0998, 1.1003, 1.0997, 1.1002], [1.1002, 1.1015, 1.0995, 1.0996]]);
  r = priceRetestFadeBidAsk(d, { ...R, startIdx: 0, endIdx: 1 });
  ok('a bar reaching both the cancel and the line is booked as filled and stopped', r.filled && r.why === 'stop' && near(r.r, -1), JSON.stringify(r));
  d = bars([[1.1002, 1.1003, 1.0997, 1.0998], [1.0998, 1.1005, 1.0998, 1.1004], [1.1004, 1.1025, 1.1003, 1.1022]]);
  r = priceRetestFadeBidAsk(d, { ...R, dir: 1, startIdx: 0, endIdx: 2 });
  ok('retest long mirrors: buy stop at a lower line after an undershoot', r.filled && r.fillIdx === 1 && near(r.entryPx, 1.1000) && r.why === 'target', JSON.stringify(r));
}

// Statistical: random-walk mid, brackets at levels set off the previous close.
function statRun(half) {
  const p = randomWalkPacked({ seed: 7, years: 0.5, subSteps: 30 });
  const n = p.n, d = { times: p.times };
  for (const s of ['o', 'h', 'l', 'c']) {
    const src = { o: p.opens, h: p.highs, l: p.lows, c: p.closes }[s];
    d['bid_' + s] = Float64Array.from(src, x => x - half); d['ask_' + s] = Float64Array.from(src, x => x + half);
  }
  const rs = [];
  for (let i = 1000; i + 240 < n; i += 97) {
    const ref = p.closes[i - 1], dist = 0.0008;
    for (const [dir, entryType, off] of [[1, 'limit', -1], [-1, 'limit', 1], [1, 'stop', 1], [-1, 'stop', -1]]) {
      const r = priceBracketBidAsk(d, { startIdx: i, endIdx: i + 240, dir, entryType, level: ref + off * 0.0003, stopDist: dist, targetDist: dist });
      if (r.filled) rs.push(r.r);
    }
  }
  const m = rs.reduce((a, b) => a + b, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (rs.length - 1));
  return { n: rs.length, m, se: sd / Math.sqrt(rs.length) };
}
const z = statRun(0);
ok('random walk, no spread: mean R within 3 SE of 0', Math.abs(z.m) < 3 * z.se, `n=${z.n} mean=${z.m.toFixed(4)} se=${z.se.toFixed(4)}`);
const s = statRun(0.00005); // 1 pip spread, 8 pip stop -> about -0.125R
ok('random walk, 1-pip spread on an 8-pip stop: mean R about -0.125 (one spread)', Math.abs(s.m + 0.125) < 3 * s.se + 0.02, `n=${s.n} mean=${s.m.toFixed(4)} se=${s.se.toFixed(4)}`);

if (failures) { console.log(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nALL PASSED');
