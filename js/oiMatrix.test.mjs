// Tests the CME multi-expiry heatmap matrix parser (the format that was silently
// mis-read: strikes × expiries, tab-separated with empty cells).
//   node js/oiMatrix.test.mjs
import { parseOIMatrix, oiParseTable, oiParseChangeTable, oiParseVolume, oiCalcMaxPain,
  oiMatrixPersistence, oiMatrixTermStructure } from './oi.js';

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

console.log('[volume matrix — AGGREGATED call+put across ALL expiries]');
const vol = oiParseVolume([
  'Strike\tE2BN6', '0 DTE\tE3CN6', 'C\tP\tC\tP',
  '7500\t132\t3,010\t85\t1,383',   // agg call 217, put 4393 → 4610
  '7480\t8\t836\t24\t309',         // agg call 32,  put 1145 → 1177
].join('\n'));
ok('volume aggregates every expiry (not just near-dated), top strike first',
  vol[0].strike === 7500 && vol[0].volume === 4610, `${vol[0]?.volume}`);
ok('second strike aggregated too', vol[1].strike === 7480 && vol[1].volume === 1177, `${vol[1]?.volume}`);

console.log('[aggregate vs near-dated — parseOIMatrix mode]');
{
  const near = parseOIMatrix(OI, { mode: 'near' });
  const agg = parseOIMatrix(OI, { mode: 'aggregate' });
  // strike 100 cells: [230,230] near, [7,0], [0,0], [36042,0] — the 36,042 tail hedge
  // sits in a LATER-expiry CALL column. Near-dated sees only 230; aggregate sums it.
  ok('near-dated ignores the later-expiry tail on strike 100',
    near.calls[near.strikes.indexOf(100)] === 230, `${near.calls[near.strikes.indexOf(100)]}`);
  ok('aggregate SUMS the later-expiry tail on strike 100',
    agg.calls[agg.strikes.indexOf(100)] === 36279, `${agg.calls[agg.strikes.indexOf(100)]}`);
}

console.log('[wall persistence — expiries carrying a real position per strike]');
{
  const pers = oiMatrixPersistence(OI, 1);
  // strike 7500 has OI in both near (132/3010) and 2nd expiry (85/1383) → 2 expiries.
  ok('7500 present in 2 expiries', pers.get(7500) === 2, `${pers.get(7500)}`);
  // strike 100 cells: [230,230],[7,0],[0,0],[36042,0] → exp 0,1,3 carry OI → 3 expiries.
  ok('100 present in 3 expiries (near + mid + tail)', pers.get(100) === 3, `${pers.get(100)}`);
  // 7480 cells: [8,836],[24,309] — both expiries clear minOI 100 → 2.
  ok('minOI threshold keeps only expiries above the floor', oiMatrixPersistence(OI, 100).get(7480) === 2,
    `${oiMatrixPersistence(OI, 100).get(7480)}`);
}

console.log('[term structure — per-expiry max pain / walls / DTE]');
{
  const ts = oiMatrixTermStructure(OI, 1);
  ok('one entry per populated expiry', Array.isArray(ts) && ts.length >= 2, `${ts?.length}`);
  ok('near-dated tagged 0 DTE', ts[0].dte === 0, `${ts[0]?.dte}`);
  ok('each entry carries a max pain', Number.isFinite(ts[0].maxPain), JSON.stringify(ts[0]));
  ok('simple 3-col format → null term structure', oiMatrixTermStructure('4200 1 2\n4300 3 4') === null);
}

console.log('[backward compat — the simple 3-column format still parses]');
const simple = ['4200 1000 900', '4250 1200 1100', '4300 1500 800'].join('\n');
ok('plain strike/call/put table unaffected (no matrix header)', parseOIMatrix(simple) === null
  && oiParseTable(simple).strikes.length === 3);

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
