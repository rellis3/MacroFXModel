// Tests the CME multi-expiry heatmap matrix parser (the format that was silently
// mis-read: strikes × expiries, tab-separated with empty cells).
//   node js/oiMatrix.test.mjs
import { parseOIMatrix, oiParseTable, oiParseChangeTable, oiParseVolume, oiCalcMaxPain,
  oiMatrixPersistence, oiMatrixTermStructure, pickPrimaryExpiry, oiScrubImplausibleStrikes } from './oi.js';

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

console.log('[oiScrubImplausibleStrikes — the 2026-09-03 gold incident]');
{
  // Real numbers from that day's capture: spot 4423.1, the genuine ATM wall (11107 OI at
  // 4449.99) is the trust reference. 14949.99 (3.4x spot, 36577 OI) and 19949.99 (4.5x
  // spot, 38019 OI) are the two strikes that were absent the day before and single-
  // handedly doubled that day's total OI. 13000-ish real deep-OTM hedges (small OI,
  // stable across days per the row-cap comment elsewhere in oi.js) must NOT be touched.
  const strikes = [4449.99, 4549.99, 5449.99, 5949.99, 7949.99, 9949.99, 13000, 14949.99, 19949.99];
  const calls =   [11107,    4930,    13325,   18714,   17760,   11368,   688,   36577,    38019];
  const puts  =   new Array(strikes.length).fill(0);
  const r = oiScrubImplausibleStrikes(strikes, calls, puts, 4423.1);
  ok('flags exactly the two clearest outliers', r.anomalies.length === 2,
    JSON.stringify(r.anomalies.map(a => a.strike)));
  ok('flags 14949.99 (36577 OI, 3.4x spot)', r.anomalies.some(a => a.strike === 14949.99));
  ok('flags 19949.99 (38019 OI, 4.5x spot)', r.anomalies.some(a => a.strike === 19949.99));
  ok('a real deep-OTM hedge (13000, small OI) is left alone', r.keep[strikes.indexOf(13000)] === true);
  ok('the genuine ATM wall (4449.99) is left alone', r.keep[0] === true);
  ok('the ambiguous middle strikes (5449-9949) are left alone — not confidently distinguishable from real',
    r.keep[2] && r.keep[3] && r.keep[4] && r.keep[5]);
  ok('keep mask is the same length/order as the input (safe to apply to a parallel array)',
    r.keep.length === strikes.length);
  ok('reason names the strike, the OI, the distance and the reference wall',
    /3\.4x spot/.test(r.anomalies[0].reason) && /largest near-money wall \(11107 OI\)/.test(r.anomalies[0].reason),
    r.anomalies[0].reason);
}

console.log('[oiScrubImplausibleStrikes — guard rails]');
{
  ok('no spot → returns everything kept, no crash', oiScrubImplausibleStrikes([100, 50000], [10, 99999], [0, 0], null).anomalies.length === 0);
  ok('empty input → no crash', oiScrubImplausibleStrikes([], [], [], 100).anomalies.length === 0);
  ok('nothing within nearFrac of spot → no reference to trust, nothing flagged (never guess a scale)',
    oiScrubImplausibleStrikes([100000], [999999], [0], 100).anomalies.length === 0);
  // A far strike UNDER farFrac × spot is trusted regardless of size — a genuine strong
  // wall close to spot is exactly what this file exists to find, not to gate.
  const near = oiScrubImplausibleStrikes([100, 150], [500, 50000], [0, 0], 100, { farFrac: 2.0 });
  ok('a strike inside farFrac is never flagged, however large', near.anomalies.length === 0);
  // A far strike whose OI does NOT dwarf the near reference is left alone (big, not implausible).
  const modest = oiScrubImplausibleStrikes([100, 300], [1000, 1500], [0, 0], 100, { farFrac: 2.0, oiMult: 2 });
  ok('a far strike under oiMult× the reference is left alone', modest.anomalies.length === 0);
  // A far strike that DOES dwarf it gets flagged.
  const bad = oiScrubImplausibleStrikes([100, 300], [1000, 5000], [0, 0], 100, { farFrac: 2.0, oiMult: 2 });
  ok('a far strike over oiMult× the reference is flagged', bad.anomalies.length === 1 && bad.anomalies[0].strike === 300);
}

console.log('[backward compat — the simple 3-column format still parses]');
const simple = ['4200 1000 900', '4250 1200 1100', '4300 1500 800'].join('\n');
ok('plain strike/call/put table unaffected (no matrix header)', parseOIMatrix(simple) === null
  && oiParseTable(simple).strikes.length === 3);

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
