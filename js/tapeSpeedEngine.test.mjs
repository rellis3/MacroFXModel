// Synthetic tests for js/tapeSpeedEngine.js. No network. Uses a fixture table so the
// tests do not depend on the generated params.
//   node js/tapeSpeedEngine.test.mjs
import { classifyTapeSpeed, speedFromCloses, atr14, paramsKeyFor, bandOf, describeTapeSpeed, LABELS } from './tapeSpeedEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// A fixture that mirrors the generated shape, with distinct numbers per band so a
// wrong-band lookup is visible.
const Q = (dwell, nr, vr) => ({ n: 1000, dwell, nextRangeAtr: nr, volRatio: vr });
const FIX = { gold: { coverage: { from: '2021-09-13', to: '2026-08-20', sessions: 1275 }, bands: {
  asia:   { n: 5000, cuts: [0.0008, 0.0016, 0.0027, 0.0045], medianNextRangeAtr: 0.157, quintiles: [Q(0.85, 0.14, 1.08), Q(0.85, 0.14, 1.04), Q(0.84, 0.15, 1.03), Q(0.82, 0.16, 0.95), Q(0.74, 0.19, 0.81)] },
  ny:     { n: 5000, cuts: [0.0011, 0.0024, 0.0040, 0.0066], medianNextRangeAtr: 0.227, quintiles: [Q(0.76, 0.19, 1.04), Q(0.75, 0.20, 1.03), Q(0.73, 0.21, 1.00), Q(0.69, 0.24, 0.94), Q(0.59, 0.29, 0.82)] },
} } };

console.log('[symbol -> params key]');
{
  ok('XAU_USD -> gold', paramsKeyFor('XAU_USD') === 'gold');
  ok('XAU/USD -> gold', paramsKeyFor('XAU/USD') === 'gold');
  ok('EUR_USD -> eurusd', paramsKeyFor('EUR_USD') === 'eurusd');
  ok('NAS100_USD -> nq', paramsKeyFor('NAS100_USD') === 'nq');
  ok('unknown -> null', paramsKeyFor('WTICO_USD') === 'wticousd' || paramsKeyFor('WTICO_USD') === null);
}

console.log('[bands]');
{
  ok('23:00 is asia', bandOf(23) === 'asia');
  ok('06:59 is asia', bandOf(6) === 'asia');
  ok('07:00 is london', bandOf(7) === 'london');
  ok('12:00 is ny', bandOf(12) === 'ny');
  ok('17:00 is late', bandOf(17) === 'late');
}

console.log('[speed and ATR]');
{
  const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 0.5);   // +0.5/min
  const s = speedFromCloses(closes, 10);
  ok('speed is |move| over 15 bars per minute per ATR', Math.abs(s.speed - 0.05) < 1e-9, String(s.speed));
  ok('signed speed carries direction', s.signed > 0);
  ok('too few closes -> null', speedFromCloses([1, 2, 3], 10) === null);
  ok('no ATR -> null', speedFromCloses(closes, 0) === null);
  const daily = Array.from({ length: 15 }, (_, i) => ({ high: 110, low: 100, close: 105 }));
  ok('ATR14 of a constant 10-point range is 10', atr14(daily) === 10);
  ok('ATR14 needs 15 bars', atr14(daily.slice(0, 14)) === null);
}

console.log('[classification is within the CURRENT band, not the whole day]');
{
  // 0.003 ATR/min is Q4 in Asia (cuts ...0.0027, 0.0045) but Q3 in NY (0.0024, 0.0040).
  const a = classifyTapeSpeed('XAU_USD', 3, 0.003, FIX), n = classifyTapeSpeed('XAU_USD', 14, 0.003, FIX);
  ok('same speed is Q4 in Asia', a.quintile === 4 && a.label === 'quick', `${a.quintile}`);
  ok('but Q3 in the NY overlap', n.quintile === 3 && n.label === 'mid', `${n.quintile}`);
  ok('and reads the band\'s own outcome row', a.dwell === 0.82 && n.dwell === 0.73);
  ok('fastest fifth is FAST with >p80', classifyTapeSpeed('XAU_USD', 14, 0.01, FIX).label === 'FAST' && classifyTapeSpeed('XAU_USD', 14, 0.01, FIX).pctile === '>p80');
  ok('slowest is DRIFT with <p20', classifyTapeSpeed('XAU_USD', 14, 0.0001, FIX).label === 'DRIFT');
  ok('next-hour range vs typical is computed', classifyTapeSpeed('XAU_USD', 14, 0.01, FIX).nextRangeVsTypical === +(0.29 / 0.227).toFixed(2));
}
{
  ok('unknown band for this instrument -> null, not a guess', classifyTapeSpeed('XAU_USD', 9, 0.003, FIX) === null);   // london absent from fixture
  ok('unknown instrument -> null', classifyTapeSpeed('WTICO_USD', 14, 0.003, FIX) === null);
  ok('non-finite speed -> null', classifyTapeSpeed('XAU_USD', 14, NaN, FIX) === null);
}

console.log('[the one-line read says range, never direction]');
{
  const d = describeTapeSpeed(classifyTapeSpeed('XAU_USD', 14, 0.01, FIX));
  ok('names the label and band', /FAST/.test(d) && /NY overlap/.test(d));
  ok('says wider than typical AND calmer than the last hour -- both are true after a burst', /wider than a typical hour/.test(d) && /calmer than the hour just gone/.test(d), d);
  ok('never says up or down', !/\b(up|down|higher|lower|bullish|bearish)\b/i.test(d));
  ok('null in -> null out', describeTapeSpeed(null) === null);
  ok('labels are the five quintiles', LABELS.length === 5);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll tapeSpeedEngine tests passed.');
