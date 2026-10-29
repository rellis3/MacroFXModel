// js/dailyOpenFib.js: the live tracker's engine.   node js/dailyOpenFib.test.mjs
// Mirrors scripts/daily-open-fib-retest/test_engine.py (the backtest's checks); exact
// parity with engine.py on random bid/ask sessions: node scripts/daily-open-fib-retest/parity.mjs
import { findFill, findFillSwing, pendingSwing, trade, pending, levels, night, adrFrom, sessionAnchor, sessionKey, sessionFromCandles, summarise } from './dailyOpenFib.js';

let n = 0, f = 0;
const ok = (m, c) => { n++; if (!c) { f++; console.log('  ✗ ' + m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

/** Linear minute path through [price, minute] points → {o,h,l,c}, mins. */
function bars(points, wick = 0) {
  const px = [], mm = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, m0] = points[i], [p1, m1] = points[i + 1];
    for (let m = m0; m < m1; m++) { px.push(p0 + (p1 - p0) * (m - m0) / (m1 - m0)); mm.push(m); }
  }
  px.push(points.at(-1)[0]); mm.push(points.at(-1)[1]);
  const c = px, o = [c[0], ...c.slice(0, -1)];
  return { o, h: o.map((v, i) => Math.max(v, c[i]) + wick), l: o.map((v, i) => Math.min(v, c[i]) - wick), c, mins: mm };
}
const shift = (B, s) => ({ o: B.o.map(v => v + s), h: B.h.map(v => v + s), l: B.l.map(v => v + s), c: B.c.map(v => v + s) });

// The video's trade (26 Oct 2026): open 4019.10 at the top, low 4004.11, back through the 1, down through the low.
const V = bars([[4019.10, 0], [4004.11, 45], [4019.60, 75], [4012.0, 120], [4004.00, 175], [4006, 600]]);
const fv = findFill(V, V.mins, 40, 'high', 0.10);
ok('video: sells at the opening high', fv && fv.side === -1 && near(fv.A, 4019.10) && near(fv.L0, 4004.11));
const tv = trade(V, V.mins, fv, { target: 'zero', be: true });
ok('video on mid: +5R at the 0', tv.how === 'target' && near(tv.R, 5));
ok('video: 1.2 stop at 4022.098', near(tv.stop, 4019.10 + 0.2 * (4019.10 - 4004.11)));
const tva = trade(shift(V, 0.5), V.mins, fv, { target: 'zero', be: true, fillSpread: 0.5 });
ok('video on the ask (spread 0.5): misses the 0', tva.how !== 'target');

// stop, break-even, time exit
let B = bars([[100, 0], [90, 30], [103, 60], [95, 100], [95, 600]]);
let F = findFill(B, B.mins, 50, 'high', 0.10);
ok('stop = -1R', trade(B, B.mins, F).how === 'stop' && near(trade(B, B.mins, F).R, -1));
B = bars([[100, 0], [90, 30], [100, 50], [97.5, 60], [100.5, 80], [95, 120], [95, 600]]);
F = findFill(B, B.mins, 50, 'high', 0.10);
ok('break-even = 0R', trade(B, B.mins, F).how === 'be' && near(trade(B, B.mins, F).R, 0));
ok('no BE: time exit', trade(B, B.mins, F, { be: false }).how === 'time');

// buy mirror, no impulse, cut-off
B = bars([[100, 0], [110, 30], [99.5, 60], [111, 120], [110, 600]]);
F = findFill(B, B.mins, 50, 'high', 0.10);
ok('buy at the opening low, +5R', F.side === 1 && near(F.A, 100) && trade(B, B.mins, F).how === 'target' && near(trade(B, B.mins, F).R, 5));
B = bars([[100, 0], [99, 30], [100.5, 60], [100, 600]]);
ok('small impulse: no trade', findFill(B, B.mins, 50, 'high', 0.10) === null);
B = bars([[100, 0], [90, 30], [91, 400], [101, 430], [100, 600]]);
ok('no fill after 360 minutes', findFill(B, B.mins, 50, 'high', 0.10, 360) === null);

// buy fills only when the ASK reaches the bid-drawn 1
B = bars([[100, 0], [110, 30], [99.4, 31], [111, 90], [110, 600]]);
ok('buy: ask 0.5 above reaches 100', findFill(B, B.mins, 50, 'high', 0.10, 360, { o: B.o.map(v => v + 0.5), l: B.l.map(v => v + 0.5) }).side === 1);
ok('buy: ask 0.7 above does not', findFill(B, B.mins, 50, 'high', 0.10, 360, { o: B.o.map(v => v + 0.7), l: B.l.map(v => v + 0.7) }).side === -1);

// live: an unfinished session leaves the trade open; pending shows the resting order
const P = bars([[4019.10, 0], [4004.11, 45], [4019.60, 75], [4012.0, 120]]);
const fp = findFill(P, P.mins, 40, 'high', 0.10);
const tp = trade(P, P.mins, fp, { final: false });
ok('unfinished session: trade is open', tp.open === true && tp.how === 'open');
const Q = bars([[4019.10, 0], [4004.11, 45], [4010, 60]]);
const pq = pending(Q, Q.mins, 40, 'high', 0.10);
ok('pending: armed sell at the opening high, stop 1.2, target the 0', pq.phase === 'armed' && pq.side === -1 && near(pq.A, 4019.10) && near(pq.stop, 4022.098) && near(pq.tp, 4004.11));
const W = bars([[100, 0], [99.5, 20]]);
ok('pending: waiting while the impulse is small', pending(W, W.mins, 50, 'high', 0.10).phase === 'waiting');
const lv = levels(-1, 4071.23, 4036.0);
ok('levels: the 29 Oct signal (1 = 4071.23, 0 = 4036) puts the 1.2 at 4078.276', near(lv.stop, 4078.276) && near(lv.be, 4064.184));

// night(): bid/ask session object end to end
const S = { t: V.mins.map(m => Date.UTC(2026, 9, 26, 22) + m * 60e3), mins: V.mins, bid: V, ask: shift(V, 0.02) };
const nv = night(S, 40, 'high', { final: true });
ok('night: closed with the fill and exit stamped', nv.phase === 'closed' && nv.fill && nv.exit && Number.isFinite(nv.R) && nv.Rv && 'tp3' in nv.Rv);
const nd = night(S, 40, 'do', { final: true });
ok('night: DO anchor = the open price here', nd.side === -1 && near(nd.A, 4019.10));
ok('summarise counts the closed trade', summarise([nv, nd]).trades === 2);

// ADR and session clock
ok('ADR = median of the previous 20 ranges', adrFrom(Array.from({ length: 25 }, (_, i) => i + 1)) === 15.5);
ok('ADR needs 10 ranges', adrFrom([1, 2, 3]) === null);
ok('anchor in EDT: 17:00 NY = 21:00 UTC', sessionAnchor(Date.UTC(2026, 9, 27, 1)) === Date.UTC(2026, 9, 26, 21));
ok('anchor in EST: 17:00 NY = 22:00 UTC', sessionAnchor(Date.UTC(2026, 11, 2, 3)) === Date.UTC(2026, 11, 1, 22));
ok('anchor before 17:00 NY is the previous day', sessionAnchor(Date.UTC(2026, 9, 27, 20)) === Date.UTC(2026, 9, 26, 21));
ok('session key = NY date of the anchor', sessionKey(Date.UTC(2026, 9, 26, 21)) === '2026-10-26');
const cs = [{ time: '2026-10-26T22:00:00.000000000Z', complete: true, bid: { o: '1', h: '2', l: '0.5', c: '1.5' }, ask: { o: '1.1', h: '2.1', l: '0.6', c: '1.6' } },
            { time: '2026-10-26T22:01:00.000000000Z', complete: false, bid: { o: '1', h: '1', l: '1', c: '1' }, ask: { o: '1', h: '1', l: '1', c: '1' } }];
const sx = sessionFromCandles(cs, Date.UTC(2026, 9, 26, 21));
ok('candles: complete bars only, minutes from the first bar', sx.t.length === 1 && sx.mins[0] === 0 && sx.bid.h[0] === 2 && sx.ask.l[0] === 0.6);

// swing anchor: the 1 = the swing high the impulse leg started from, which may be before the open
{
  // Jay's chart (stream 'Trading Asia'): spike to 110, drop to 92, bounce to 100 BEFORE the open; open 99, impulse to 88;
  // back up to 100 -> sell at 100 (not the bigger spike at 110, not the opening wick at 99)
  const pre = bars([[95, 0], [110, 20], [92, 50], [100, 70], [99, 89]]);
  const B = bars([[99, 0], [88, 40], [100.2, 90], [88, 150], [87, 600]]);
  const f = findFillSwing(pre, B, B.mins, 50, 0.10);
  ok('swing: the 1 is the pre-open bounce high (100), not the spike (110)', f && f.side === -1 && near(f.A, 100) && near(f.L0, 88));
  ok('swing: tAnchor sits before the open (negative index)', f.tAnchor < 0);
  ok('swing: target hit = +5R', trade(B, B.mins, f).how === 'target' && near(trade(B, B.mins, f).R, 5));
  const fw = findFill(B, B.mins, 50, 'high', 0.10);
  ok('same night on the opening wick: the 1 = 99', fw && near(fw.A, 99));
  // night() maps the pre-open anchor time
  const S = { t: B.mins.map(m => 1e12 + m * 60e3), mins: B.mins, bid: B, ask: B, pre: { ...pre, t: pre.mins.map(m => 1e12 - (90 - m) * 60e3) } };
  const n = night(S, 50, 'swing', { final: true });
  ok('night(swing): anchor time is before the open', n.tAnchor < S.t[0] && n.phase === 'closed');
}
{
  // 28 Oct gold: swing high 4071.23 just before the open, open 4065.64, wick 4067.75, low 4036, rally tops at 4068.5:
  // the opening-wick order (4067.75) fills, the swing order (4071.23) never does
  const pre = bars([[4060, 0], [4071.23, 40], [4066, 59]]);
  const B = bars([[4065.64, 0], [4067.75, 3], [4036, 150], [4068.5, 210], [4036, 380], [4030, 600]]);
  const fw = findFill(B, B.mins, 58.3, 'high', 0.10), fs = findFillSwing(pre, B, B.mins, 58.3, 0.10);
  ok('28 Oct: opening wick fills at 4067.75', fw && near(fw.A, 4067.75));
  ok('28 Oct: swing 1 = 4071.23 does not fill (rally tops 4068.5)', fs === null);
  const ps = pendingSwing(pre, B, B.mins.slice(), 58.3, 0.10);
  ok('28 Oct: swing is no_setup after the cut-off', ps.phase === 'no_setup');
  const B2 = { o: B.o.slice(0, 200), h: B.h.slice(0, 200), l: B.l.slice(0, 200), c: B.c.slice(0, 200) };
  const p2 = pendingSwing(pre, B2, B.mins.slice(0, 200), 58.3, 0.10);
  ok('28 Oct live: swing order resting at 4071.23, stop 4078.276 (= Jay 4078.22), target 4036', p2.phase === 'armed' && near(p2.A, 4071.23) && near(p2.stop, 4078.276) && near(p2.tp, 4036));
}

console.log(`${n - f}/${n} passed`);
process.exit(f ? 1 : 0);
