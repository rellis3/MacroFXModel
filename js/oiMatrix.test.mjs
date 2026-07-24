// Tests the CME multi-expiry heatmap matrix parser (the format that was silently
// mis-read: strikes × expiries, tab-separated with empty cells).
//   node js/oiMatrix.test.mjs
import { parseOIMatrix, oiParseTable, oiParseChangeTable, oiParseVolume, oiCalcMaxPain,
  oiMatrixPersistence, oiMatrixTermStructure, pickPrimaryExpiry } from './oi.js';

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

console.log('[primary expiry — nearest expiry with significant near-money liquidity]');
{
  // Screenshot shape: a thin front 0-DTE weekly (EU4N6) and a fat 14-DTE monthly
  // (EUUQ6) where the real OI (12,039 at 1.14 etc.) lives. The walls must come from
  // the MONTHLY, not the literal front column.
  const SHOT = [
    '6EU6', 'STRIKE\tEU4N6\tEUUQ6', '0 DTE\t14 DTE', 'C\tP\tC\tP',
    '1.1375\t524\t18\t159\t364',
    '1.14\t28\t154\t289\t12039',
    '1.145\t3128\t1868\t1071\t8174',
    '1.15\t876\t3\t3518\t1796',
    '1.16\t2265\t1\t6866\t917',
  ].join('\n');
  const t = oiParseTable(SHOT);
  ok('auto-selects the 14-DTE monthly (not the empty front weekly)', t.primaryExpiry?.dte === 14,
    JSON.stringify(t.primaryExpiry));
  ok('1.14 reads the monthly PUT OI 12,039 (not the front weekly 154)',
    t.puts[t.strikes.indexOf(1.14)] === 12039, `${t.puts[t.strikes.indexOf(1.14)]}`);
  ok('call wall = 1.16 from the monthly column', (() => {
    const w = t.strikes.map((s,i)=>({s,oi:t.calls[i]})).sort((a,b)=>b.oi-a.oi)[0];
    return w.s === 1.16 && w.oi === 6866;
  })());
  ok('put wall = 1.14 from the monthly column', (() => {
    const w = t.strikes.map((s,i)=>({s,oi:t.puts[i]})).sort((a,b)=>b.oi-a.oi)[0];
    return w.s === 1.14 && w.oi === 12039;
  })());

  // The existing OI fixture: near-dated (0 DTE) is the near-money leader; the fat
  // 36k lives in a far expiry as a DEEP-OTM tail hedge. Primary must stay near-dated.
  ok('tail-hedge expiry is NOT selected — primary stays 0 DTE', oiParseTable(OI).primaryExpiry?.dte === 0,
    JSON.stringify(oiParseTable(OI).primaryExpiry));
}

console.log('[pickPrimaryExpiry — near-money beats total when a far tail dominates]');
{
  // TOTAL OI points at exp1 (a 90k deep-OTM tail); NEAR-money OI points at exp0
  // (the real liquidity around 1.14). The near-money rule must win → index 0.
  const rows = [
    { strike: 1.14,  cp: [[100, 8000], [50, 60]] },
    { strike: 1.145, cp: [[200, 100],  [30, 20]] },
    { strike: 3.00,  cp: [[0, 0],      [90000, 0]] },   // far tail in exp1
  ];
  const pe = pickPrimaryExpiry(rows, [0, 14], 1.14);
  ok('picks exp0 by near-money despite exp1 having far more TOTAL OI', pe.index === 0 && pe.dte === 0,
    JSON.stringify(pe));
  ok('single-expiry matrix → index 0', pickPrimaryExpiry([{ strike: 1.1, cp: [[5, 5]] }], [7]).index === 0);
}

console.log('[backward compat — the simple 3-column format still parses]');
const simple = ['4200 1000 900', '4250 1200 1100', '4300 1500 800'].join('\n');
ok('plain strike/call/put table unaffected (no matrix header)', parseOIMatrix(simple) === null
  && oiParseTable(simple).strikes.length === 3);

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
