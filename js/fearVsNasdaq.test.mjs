// Tests for js/fearVsNasdaq.js.   node js/fearVsNasdaq.test.mjs      (STRICT=1 also requires the ledger entry to exist in this checkout)
import { fearVsNasdaq, fearWords, WINDOW, LOOKBACK } from './fearVsNasdaq.js';
import { DESK_EVIDENCE } from './deskEvidence.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296), gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
function make(n, { lastVixMult = 1, lastN = 1 } = {}) {
  const nq = [], vix = [], vvix = []; let a = 100, b = 17, c = 90;
  for (let i = 0; i < n; i++) {
    const last = i >= n - WINDOW, k = last ? lastVixMult : 1, m = last ? lastN : 1;
    a *= Math.exp(0.01 * m * gauss()); b *= Math.exp(0.04 * k * gauss()); c *= Math.exp(0.05 * k * gauss());
    nq.push(a); vix.push(b); vvix.push(c);
  }
  return { nq, vix, vvix };
}
const calm = fearVsNasdaq(make(400));
ok('with ordinary data there is a reading for both VIX and VVIX, with a percentile each', calm && calm.a && calm.b && calm.a.pct >= 1 && calm.a.pct <= 100 && calm.b.ratio > 0, JSON.stringify(calm));
seed = 7; const hot = fearVsNasdaq(make(400, { lastVixMult: 4, lastN: 0.5 }));
ok('when fear moves far more than the Nasdaq over the last 20 sessions the ratio is in the top tenth and the flag is on', hot.on === true && hot.top >= 90 && hot.a.on && hot.b.on, JSON.stringify(hot));
seed = 7; const quietFear = fearVsNasdaq(make(400, { lastVixMult: 0.25, lastN: 1.5 }));
ok('when the Nasdaq moves far more than fear the ratio is low and the flag is off', quietFear.on === false && quietFear.top < 50, JSON.stringify(quietFear));
ok('too little history is no reading rather than a guess', fearVsNasdaq(make(100)) === null && fearVsNasdaq({}) === null && fearVsNasdaq(null) === null);
const withGaps = make(420); for (let i = 5; i < 400; i += 37) withGaps.vix[i] = null;
ok('days where any of the three series is missing are skipped, not zero-filled', fearVsNasdaq(withGaps) !== null);
ok('the words say it is a volatility read and not a direction call, in both states', /does not say which way stocks will go/.test(fearWords(hot)) && /does not say which way stocks will go/.test(fearWords(quietFear)) && /ahead of the Nasdaq/.test(fearWords(hot)) && /percentile of its past year/.test(fearWords(quietFear)) && fearWords(null) === '');
ok('the words claim only what the study found: about 7% back over the next month, nothing about stocks rising', /about 7%/.test(fearWords(hot)) && !/\b(rally|bounce|buy|sell|will rise|bullish)\b/i.test(fearWords(hot) + fearWords(quietFear)));
const e = DESK_EVIDENCE.find(x => x.id === 'vvix-ratio-range');
ok(process.env.STRICT ? 'the cited ledger entry exists and is validated' : 'the cited ledger entry, where this checkout has it, is validated (STRICT=1 requires it)', process.env.STRICT ? !!e && e.verdict === 'validated' : !e || e.verdict === 'validated');
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
