// Synthetic, no-network unit tests for the give-back brick.
//   node js/giveback.test.mjs
import { excursionFromM1, summarizeGiveback } from './giveback.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ── excursionFromM1: build a packed M1 window with a known high/low path ──────
// Entry 1.1000 at t=100; path highs peak 1.1050 (+50p), lows dip 1.0980 (-20p).
const times = new Int32Array([100, 160, 220, 280, 340]);
const highs = Float32Array.from([1.1010, 1.1050, 1.1020, 1.1000, 1.1030]);
const lows  = Float32Array.from([1.0995, 1.1005, 1.0980, 1.0990, 1.1010]);
const packed = { n: 5, times, highs, lows };

const longExc = excursionFromM1(packed, { time_open: 100, time_close: 350, direction: 'BUY', open_price: 1.1000 }, 0.0001);
ok('LONG MFE = +50 pips', near(longExc.mfePips, 50, 0.05), `got ${longExc.mfePips.toFixed(1)}`);
ok('LONG MAE = -20 pips', near(longExc.maePips, -20, 0.05), `got ${longExc.maePips.toFixed(1)}`);

const shortExc = excursionFromM1(packed, { time_open: 100, time_close: 350, direction: 'SELL', open_price: 1.1000 }, 0.0001);
ok('SHORT MFE = +20 pips (fav = price down)', near(shortExc.mfePips, 20, 0.05), `got ${shortExc.mfePips.toFixed(1)}`);
ok('SHORT MAE = -50 pips', near(shortExc.maePips, -50, 0.05), `got ${shortExc.maePips.toFixed(1)}`);

ok('empty window → null', excursionFromM1(packed, { time_open: 400, time_close: 500, direction: 'BUY', open_price: 1.1 }, 0.0001) === null);
ok('MFE always >= 0', excursionFromM1(packed, { time_open: 280, time_close: 300, direction: 'BUY', open_price: 1.1000 }, 0.0001).mfePips >= 0);

// ── summarizeGiveback: a small book with logged mfe_pips ──────────────────────
const pipFor = () => 0.0001;
const rows = [
  // winner: reached +40p, kept +25p → gave back 15p (37.5% of peak). profit $500 for 25p → $20/pip
  { direction: 'BUY', open_price: 1.1000, close_price: 1.1025, profit: 500, mfe_pips: 40, time_close: 3 },
  // loser: reached +5p then closed -30p (SL). green then red.
  { direction: 'BUY', open_price: 1.2000, close_price: 1.1970, profit: -600, mfe_pips: 5, time_close: 2 },
  // pending: no mfe_pips → excluded, counted pending
  { direction: 'SELL', open_price: 0.7000, close_price: 0.7010, profit: -200, mfe_pips: null, time_close: 1 },
];
const s = summarizeGiveback(rows, pipFor);
ok('n counts only rows with mfe', s.n === 2, `n=${s.n}`);
ok('pending counts the null-mfe row', s.pending === 1, `pending=${s.pending}`);
ok('winners = 1', s.winners === 1);
ok('losers = 1', s.losers === 1);
ok('greenThenRed catches the +5p→-30p loser', s.greenThenRed === 1, `got ${s.greenThenRed}`);
// winner give-back: (40-25)/40 = 0.375
ok('winner giveback frac ~0.375', near(s.winnersGivebackFrac, 0.375, 1e-6), `got ${s.winnersGivebackFrac}`);
// winner $/pip = 500/25 = 20; giveback$ = 15*20 = 300
ok('total giveback$ includes winner 300', s.totalGivebackUsd > 299 && s.totalGivebackUsd < 100000, `got ${s.totalGivebackUsd.toFixed(0)}`);
ok('trades sorted newest-first', s.trades[0].time_close >= s.trades[s.trades.length - 1].time_close);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll give-back tests passed');
process.exit(failures ? 1 : 0);
