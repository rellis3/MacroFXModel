// Tests the CME QuikStrike "Option Settlement Tool" implied-vol parser against the
// REAL pasted format (owner's 2026-07 sample). No network.
//   node js/oiIV.test.mjs
import { parseIVSettlement } from './oi.js';

let fails = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) fails++; };

// Verbatim slice of the real paste: 2 header rows + data rows (incl. comma-separated
// OI like "6,827", and a low-OI tail). Tab-separated exactly as it copies.
const SETTLE = [
  'Call\t\tPut\tVolatility\tOpen Interest',
  'Chg\tPrior\tSettle\tStrike\tSettle\tPrior\tChg\tSettle\tPrior\tChg\tCall\tCall Chg\tPut\tPut Chg',
  '1.75\t13.38\t15.13\t449\t0.13\t0.38\t-0.25\t39.49\t29.79\t9.71\t202\t-3\t223\t0',
  '1.63\t12.5\t14.13\t450\t0.13\t0.5\t-0.38\t37.29\t30.28\t7.01\t6,827\t-168\t2,603\t-349',
  '1\t8.25\t9.25\t455\t0.25\t1.25\t-1\t30.43\t29.30\t1.13\t2,999\t-82\t1,975\t-152',
  '0.25\t4.75\t5\t460\t1\t2.75\t-1.75\t29.18\t28.42\t0.77\t7,643\t-467\t1,934\t54',
  '-0.38\t0.63\t0.25\t475\t11.25\t13.63\t-2.38\t34.68\t33.25\t1.42\t8,981\t-2,163\t792\t-27',
  '0.13\t0\t0.13\t479\t15.13\t0\t15.13\t38.24\t0.00\t38.24\t0\t0\t0\t0',
].join('\n');

console.log('[parseIVSettlement — real QuikStrike settlement paste]');
const p = parseIVSettlement(SETTLE);
ok('parses (non-null)', !!p, JSON.stringify(p && { n: p.strikes.length }));
ok('skips the two header rows → 6 data strikes', p.strikes.length === 6, `${p.strikes.length}`);
const near = (a, b) => Math.abs(a - b) < 1e-9;
ok('strike 449 → IV 39.49% = 0.3949', near(p.iv[p.strikes.indexOf(449)], 0.3949), `${p.iv[p.strikes.indexOf(449)]}`);
ok('ATM-ish strike 460 → IV 0.2918', near(p.iv[p.strikes.indexOf(460)], 0.2918), `${p.iv[p.strikes.indexOf(460)]}`);
ok('comma OI parsed: 450 call OI 6827 / put 2603',
  p.calls[p.strikes.indexOf(450)] === 6827 && p.puts[p.strikes.indexOf(450)] === 2603,
  `${p.calls[p.strikes.indexOf(450)]}/${p.puts[p.strikes.indexOf(450)]}`);
ok('475 call OI 8981', p.calls[p.strikes.indexOf(475)] === 8981, `${p.calls[p.strikes.indexOf(475)]}`);
ok('all IVs in a sane decimal range (0.05–1.0)', p.iv.every(v => v > 0.05 && v < 1.0), JSON.stringify(p.iv));
ok('strikes ascending as pasted', p.strikes[0] === 449 && p.strikes[p.strikes.length-1] === 479);

console.log('[guards]');
ok('empty → null', parseIVSettlement('') === null && parseIVSettlement(null) === null);
ok('non-settlement text → null', parseIVSettlement('foo bar\nbaz') === null);

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
