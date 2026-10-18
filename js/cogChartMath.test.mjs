// node js/cogChartMath.test.mjs : the indicator's transform chain, step by step, and a cross-check of the default against the C.OG line we reconstructed and serve.
import fs from 'node:fs';
import { DEFAULTS, TF_SEC, pickSource, barsFromColumns, aggregateBars, legOnChart, carryForward, ema, legRaw, spreadRaw, mapSeries, shiftPoints } from './cogChartMath.js';
let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) fails++; };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;

// source picks
ok('source picks', pickSource(1, 4, 0, 2, 'open') === 1 && pickSource(1, 4, 0, 2, 'high') === 4 && pickSource(1, 4, 0, 2, 'low') === 0 && pickSource(1, 4, 0, 2, 'hl2') === 2 && pickSource(1, 4, 0, 2, 'ohlc4') === 1.75 && pickSource(1, 4, 0, 2) === 2);
// the defaults are C.OG's
ok('defaults: raw, no smoothing, manual 0.1 x + 1.445, no shift, rate + invert + bp', DEFAULTS.smooth === 1 && DEFAULTS.scale === 0.1 && DEFAULTS.offset === 1.445 && DEFAULTS.shift === 0 && DEFAULTS.asRate && DEFAULTS.invert && DEFAULTS.inBps && DEFAULTS.mapMode === 'manual' && DEFAULTS.eur === 'IH7' && DEFAULTS.usd === 'SR3U6');
// default spread by hand: EUR price 96.05 (rate 3.95), USD price 95.80 (rate 4.20): Pine eur - usd = -0.25, invert -> +0.25, bp -> 25, x0.1 + 1.445 = 3.945
const raw = spreadRaw([96.05], [95.80], DEFAULTS);
ok('default spread (SOFR rate - Euribor rate) = +25 bp', near(raw[0], 25, 1e-9), String(raw[0]));
ok('default mapped value = 25 x 0.1 + 1.445 = 3.945', near(mapSeries(raw, DEFAULTS)[0], 3.945, 1e-9));
// the same number as the closed form on prices: (EUR price - USD price) x 100
ok('closed form on prices: (p_EUR - p_USD) x 100', near(raw[0], (96.05 - 95.80) * 100, 1e-9));
// options one at a time
ok('rate off, invert off, bp off: EUR price - USD price', near(spreadRaw([96.05], [95.80], { ...DEFAULTS, asRate: false, invert: false, inBps: false })[0], 0.25));
ok('invert flips the sign', near(spreadRaw([96.05], [95.80], { ...DEFAULTS, invert: false })[0], -25));
ok('bp off keeps percent units', near(spreadRaw([96.05], [95.80], { ...DEFAULTS, inBps: false })[0], 0.25));
ok('a single leg: rate then invert then bp', near(legRaw([95.80], { ...DEFAULTS, invert: false })[0], 420) && near(legRaw([95.80], DEFAULTS)[0], -420) && near(legRaw([95.80], { ...DEFAULTS, asRate: false, invert: false, inBps: false })[0], 95.8));
// EMA as Pine: seed with the first value
const e = ema([1, 2, 3, 4], 3);
ok('EMA(3) seeded with the first value', near(e[0], 1) && near(e[1], 1.5) && near(e[2], 2.25) && near(e[3], 3.125));
ok('smoothing length 1 is off', ema([1, 2, 3], 1).every((v, i) => v === i + 1));
// carry (fixnan)
ok('carry last value over gaps', JSON.stringify(carryForward([null, 1, null, null, 2, null])) === JSON.stringify([null, 1, 1, 1, 2, 2]));
// auto-fit
const af = mapSeries([0, 5, 10], { ...DEFAULTS, mapMode: 'auto', fitLen: 3 }, [100, 110, 120], [90, 95, 80]);
ok('auto-fit puts the raw range inside the price range over the look-back', near(af[2], 80 + (10 - 0) / (10 - 0) * (120 - 80)) && af[0] === null);
// shift
const t = [100, 200, 300, 400];
const sh = shiftPoints(t, [1, 2, 3, 4], 2, 100);
ok('shift +2 moves the line right and extends past the last bar', JSON.stringify(sh) === JSON.stringify([{ time: 300, value: 1 }, { time: 400, value: 2 }, { time: 500, value: 3 }, { time: 600, value: 4 }]));
ok('shift -1 drops the first point', JSON.stringify(shiftPoints(t, [1, 2, 3, 4], -1, 100)) === JSON.stringify([{ time: 100, value: 2 }, { time: 200, value: 3 }, { time: 300, value: 4 }]));
ok('shift 0 is the identity', JSON.stringify(shiftPoints(t, [1, 2, 3, 4], 0, 100).map(p => p.value)) === JSON.stringify([1, 2, 3, 4]));
// timeframe handling
const bars15 = [0, 900, 1800, 2700, 3600, 4500].map((tt, i) => ({ t: tt, o: 10 + i, h: 11 + i, l: 9 + i, c: 10.5 + i }));
const h1 = aggregateBars(bars15, 3600);
ok('aggregate 15m into 1h: first open, max high, min low, last close', h1[0].o === 10 && h1[0].h === 14 && h1[0].l === 9 && h1[0].c === 13.5 && h1.length === 2);
ok('chart 1h from 15m legs: close = last 15m close inside the hour', legOnChart(bars15, [0, 3600], 3600, 'close', null, 900)[0] === 13.5);
ok('chart 15m from 15m legs: exact bar', legOnChart(bars15, [900], 900, 'close', null, 900)[0] === 11.5);
ok('higher data timeframe uses only a bar that has already closed (no look-ahead)', legOnChart(bars15, [0, 1800, 3600], 900, 'close', 3600, 900).every((v, i) => i === 2 ? v === 13.5 : v === null));

// cross-check against the line we reconstructed and serve (right-labelled 15-minute bars of the 1-minute midpoints, bar-open label in the JSON)
const dir = new URL('../analysis/output/', import.meta.url);
const legFile = n => JSON.parse(fs.readFileSync(new URL(`cog_chart/leg_${n}.json`, dir), 'utf8'));
if (fs.existsSync(new URL('cog_chart/leg_SR3U6.json', dir)) && fs.existsSync(new URL('cog_line/cog_line_pinned_recent.json', dir))) {
  const U = barsFromColumns(legFile('SR3U6').m15), Eb = barsFromColumns(legFile('IH7').m15);
  const times = U.map(b => b.t).filter(tt => Eb.some(b => b.t === tt)).slice(-6000);
  const eP = legOnChart(Eb, times, 900, 'close', null, 900), uP = legOnChart(U, times, 900, 'close', null, 900);
  const mine = spreadRaw(eP, uP, DEFAULTS);                    // bp
  const line = JSON.parse(fs.readFileSync(new URL('cog_line/cog_line_pinned_recent.json', dir), 'utf8'));
  const x = [], y = [];
  times.forEach((tt, i) => { const k = Math.round((tt - line.t0) / line.step); const v = line.bp[k]; if (k >= 0 && k < line.bp.length && v != null && mine[i] != null) { x.push(mine[i]); y.push(v); } });
  const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
  const cov = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0), vx = x.reduce((a, v) => a + (v - mx) ** 2, 0), vy = y.reduce((a, v) => a + (v - my) ** 2, 0);
  const corr = cov / Math.sqrt(vx * vy), md = x.map((v, i) => Math.abs(v - y[i])).sort((a, b) => a - b)[Math.floor(n / 2)];
  ok(`default series vs the served line on ${n} common bars: level correlation >= 0.995`, corr >= 0.995, `corr ${corr.toFixed(4)}`);
  ok('median absolute difference under 1 bp (the two differ only by the one-minute bar-label convention)', md < 1.0, `median ${md.toFixed(3)} bp`);
} else console.log('  (cross-check skipped: leg or line file missing)');
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
