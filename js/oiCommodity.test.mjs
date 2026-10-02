// Commodity OI support (2026-10-02): the one product table, the cents→dollars scaler,
// and the copies of the table that live where it cannot be imported.
import { readFileSync } from 'fs';
import { OI_PRODUCT_SPEC, oiSpec, oiScaleRawPrices, oiContractSize, oiFlatVol, oiPriceDigits,
         oiFmtStrike, oiFuturesTermsPrice } from './oi.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[existing products are untouched]');
ok('gold contract 100', oiContractSize('XAU/USD') === 100);
ok('NQ contract 20', oiContractSize('NAS100_USD') === 20);
ok('EUR/USD contract 125000', oiContractSize('EUR/USD') === 125000);
ok('EUR/USD flat vol 0.12', oiFlatVol('EUR/USD') === 0.12);
ok('USD/JPY 3dp, EUR/USD 5dp, gold 2dp', oiPriceDigits('USD/JPY') === 3 && oiPriceDigits('EUR/USD') === 5 && oiPriceDigits('XAU/USD') === 2);
ok('gold has no spec (falls to its own rules)', oiSpec('XAU/USD') === null);

console.log('[commodities come from the table, not FX defaults]');
ok('corn contract 5000 (not 125000)', oiContractSize('CORN_USD') === 5000);
ok('nat gas vol 0.60 (not 0.12)', oiFlatVol('NATGAS_USD') === 0.6);
ok('copper 4dp', oiPriceDigits('XCU/USD') === 4 && oiFmtStrike(6.5815, 'XCU/USD') === '6.5815');
ok('grains are the only scaled products', Object.entries(OI_PRODUCT_SPEC).every(([k, v]) =>
  (v.priceScale !== 1) === ['SOYBN_USD', 'CORN_USD', 'WHEAT_USD'].includes(k)));

console.log('[scaler: prices move, OI does not]');
const matrix = ['\tZCZ6', '499.75\tZCZ6', 'Strike\t49 DTE\t', '\tC\tP', '480\t1200\t300', '500\t2500\t2200'].join('\n');
// The matrix layout is covered end-to-end on a real capture (corn 499.75 → 4.9975 through
// buildOIEntry, checked when this landed); here only the no-op guard.
ok('k=1 is a no-op', oiScaleRawPrices(matrix, 'matrix', 1) === matrix);
const chain = 'Corn (OZC|ZC) OZCZ6 (49.0 DTE) vs 499.75 (+1.25)\n0.5\t10\t10.5\t480\t2.25\t2\t-0.25\t28.5\t28.1\t0.4\t1200\t5\t300\t-2';
const cs = oiScaleRawPrices(chain, 'chain', 0.01).split('\n');
ok('chain title price scaled', /vs 4\.9975/.test(cs[0]), cs[0]);
const cc = cs[1].split('\t');
ok('chain strike + option prices scaled', cc[3] === '4.8' && cc[2] === '0.105' && cc[4] === '0.0225', cs[1]);
ok('chain vol + OI untouched', cc[7] === '28.5' && cc[10] === '1200' && cc[12] === '300');
const settle = 'ZCZ6\t49\t20/11/2026\t500\t499.75\t498.5\t1.25\t28.25\t27.5\t0.75\t28.5\t28.1\t0.4\t9000\t50\t8000\t-20';
const ss = oiScaleRawPrices(settle, 'settle', 0.01).split('\t');
ok('settle strike/future/straddle scaled', ss[3] === '5' && ss[4] === '4.9975' && ss[7] === '0.2825', ss.slice(3, 10).join(' '));
ok('settle IV + OI untouched', ss[10] === '28.5' && ss[13] === '9000' && ss[15] === '8000');

console.log('[futures terms undo the unit]');
ok('corn level 4.99 + basis 0.0075 → 499.75 cents', Math.abs(oiFuturesTermsPrice(4.99, { pair: 'CORN_USD', basis: 0.0075 }) - 499.75) < 1e-9);
ok('silver futures terms = price + basis', Math.abs(oiFuturesTermsPrice(61.4, { pair: 'XAG/USD', basis: 0.105 }) - 61.505) < 1e-9);

console.log('[copies of the table stay in step]');
const page = readFileSync(new URL('../oi-dashboard.html', import.meta.url), 'utf8');
const block = page.slice(page.indexOf('const CMDTY = {'), page.indexOf('};', page.indexOf('const CMDTY = {')));
for (const [k, v] of Object.entries(OI_PRODUCT_SPEC)) {
  const at = block.indexOf(`'${k}':[`);
  const m = at < 0 ? null : block.slice(at).match(/^'[^']+':\['[A-Z]+',(\d+),([\d.]+),'([A-Z_]+)'\]/);
  ok(`oi-dashboard.html CMDTY ${k} matches (dp ${v.dp}, pip ${v.pip}, ${v.oanda})`,
    !!m && +m[1] === v.dp && +m[2] === v.pip && m[3] === v.oanda, m ? m[0] : 'missing');
}
const pine = readFileSync(new URL('../pine/Confluence Zones Indicator.pine', import.meta.url), 'utf8');
for (const v of Object.values(OI_PRODUCT_SPEC)) {
  ok(`indicator knows block name ${v.tv}`, pine.includes(`str.contains(rowUp, "${v.tv}")`) && pine.includes(`r := "${v.tv}"`));
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' FAILED ✗'}`);
process.exit(failures ? 1 : 0);
