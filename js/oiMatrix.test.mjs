// Tests the CME multi-expiry heatmap matrix parser (the format that was silently
// mis-read: strikes × expiries, tab-separated with empty cells).
//   node js/oiMatrix.test.mjs
import { parseOIMatrix, oiParseTable, oiParseChangeTable, oiParseVolume, oiCalcMaxPain } from './oi.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) fails++; };

// A realistic slice: header block carries the ES future price (7588); the C/P
// header marks the expiry columns; near-dated (E2BN6, cols 1–2) is populated at
// ATM strikes and EMPTY at the deep-OTM tail-hedge strike 2100 (whose 36k OI
// lives in a later-dated column).
const OI = [
  '\tESU6',
  '7588\tESU6',
  '7588\tESU6',
  'Strike\tE2BN6',
  '0 DTE\tE3CN6',
  '1 DTE\tE3DN6',
  'C\tP\tC\tP\tC\tP\tC\tP',
  '100\t230\t230\t7\t\t\t\t36,042',            // near-dated 230/230; the 36,042 is a later expiry
  '2100\t\t\t\t\t\t35,737\t36,221',            // near-dated EMPTY → tail hedge dropped
  '7480\t8\t836\t24\t309',
  '7500\t132\t3,010\t85\t1,383',
  '7520\t78\t888\t63\t404',
].join('\n');

console.log('[matrix detection + near-dated OI]');
const p = oiParseTable(OI);
ok('futures price read from the header block', p.futures === 7588, `${p.futures}`);
ok('reads the near-dated (first) expiry call/put', p.strikes.includes(7500)
  && p.calls[p.strikes.indexOf(7500)] === 132 && p.puts[p.strikes.indexOf(7500)] === 3010);
ok('drops the deep-OTM tail-hedge strike (empty in near-dated)', !p.strikes.includes(2100));
ok('does NOT grab a later-expiry number for strike 100', p.calls[p.strikes.indexOf(100)] === 230);
ok('max pain lands near the price, not dragged to the tail', oiCalcMaxPain(p.strikes, p.calls, p.puts) >= 7400,
  `${oiCalcMaxPain(p.strikes, p.calls, p.puts)}`);

console.log('[change matrix — aligned to the OI strikes]');
const CHG = [
  'Strike\tE2BN6', '0 DTE\tE3CN6',
  'C\tP\tC\tP',
  '7500\t-24\t1,127\t19\t170',
  '7520\t5\t-50\t2\t9',
].join('\n');
const chg = oiParseChangeTable(CHG, p.strikes.length, p.strikes);
ok('signed change kept (negative)', chg.callChg[p.strikes.indexOf(7500)] === -24);
ok('change aligned by strike (7500 put +1127)', chg.putChg[p.strikes.indexOf(7500)] === 1127);
ok('strike absent from change → 0', chg.callChg[p.strikes.indexOf(100)] === 0);

console.log('[volume matrix — near-dated call+put per strike]');
const vol = oiParseVolume([
  'Strike\tE2BN6', '0 DTE\tE3CN6', 'C\tP\tC\tP',
  '7500\t132\t3,010\t85\t1,383',
  '7480\t8\t836\t24\t309',
].join('\n'));
ok('volume = near-dated call+put, top strike first', vol[0].strike === 7500 && vol[0].volume === 3142);

console.log('[backward compat — the simple 3-column format still parses]');
const simple = ['4200 1000 900', '4250 1200 1100', '4300 1500 800'].join('\n');
ok('plain strike/call/put table unaffected (no matrix header)', parseOIMatrix(simple) === null
  && oiParseTable(simple).strikes.length === 3);

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
