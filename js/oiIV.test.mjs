// Tests the CME QuikStrike "Option Settlement Tool" implied-vol parser against the
// REAL pasted format (owner's 2026-07 sample). No network.
//   node js/oiIV.test.mjs
import { parseIVSettlement, parseSettlementTermStructure } from './oi.js';

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

console.log('[auto-DTE from the QuikStrike title line]');
{
  const withHdr = 'Gold (OG|GC) OG4N6 (0.11 DTE) vs 4057.3 (+7.1) - Settles\n' + SETTLE;
  ok('reads fractional DTE 0.11 from the header', parseIVSettlement(withHdr).dte === 0.11, `${parseIVSettlement(withHdr).dte}`);
  const monthly = 'Gold (OG|GC) OGQ6 (28 DTE) vs 4057.3\n' + SETTLE;
  ok('reads integer DTE 28', parseIVSettlement(monthly).dte === 28, `${parseIVSettlement(monthly).dte}`);
  ok('no title line → dte null (falls back downstream)', parseIVSettlement(SETTLE).dte === null, `${parseIVSettlement(SETTLE).dte}`);
}

console.log('[parseSettlementTermStructure — per-EXPIRY "Settlements" table (owner NQ 2026-07)]');
{
  // The owner's real paste (title/menu cruft + the two wrapped header rows + data).
  const raw = `NASDAQ 100 (NQ|NQ) Settles

Symbol\tDTE\tExpiration
Date\tStrike\tFuture Price\tStraddle Price\tVolatility\tOpen Interest
Settle\tPrior\tChg\tSettle\tPrior\tChg\tSettle\tPrior\tChg\tCall\tCall Chg\tPut\tPut Chg
Q4AN6\t3\t27/07/2026\t28280\t28282.25\t28620.75\t-338.5\t375.75\t646.5\t-270.75\t18.80\t25.06\t-6.26\t17\t17\t8\t6
Q4BN6\t4\t28/07/2026\t28280\t28282.25\t28620.75\t-338.5\t507.75\t740.75\t-233\t21.87\t26.27\t-4.40\t1\t1\t9\t9
QN2Q6\t21\t14/08/2026\t28300\t28282.25\t28620.75\t-338.5\t1392.75\t1561.75\t-169\t25.85\t27.79\t-1.94\t0\t0\t95\t-2
NQZ6\t147\t18/12/2026\t28500\t28573.25\t28913\t-339.75\t3616.5\t3715.5\t-99\t25.46\t25.82\t-0.36\t172\t7\t165\t15`;
  const ts = parseSettlementTermStructure(raw);
  ok('parses the data rows, skips title + 3 header lines', ts && ts.length === 4, `${ts?.length}`);
  const front = ts[0];
  ok('front row: symbol + DTE + expiry date', front.symbol === 'Q4AN6' && front.dte === 3 && front.expiry === '27/07/2026');
  ok('reads the ATM strike (col 3)', front.strike === 28280, `${front.strike}`);
  ok('reads the future settle (col 4)', front.future === 28282.25, `${front.future}`);
  ok('reads the STRADDLE settle (col 7 → expected move)', front.straddle === 375.75, `${front.straddle}`);
  ok('reads the VOL settle (col 10, percent)', front.iv === 18.80, `${front.iv}`);
  ok('reads vol prior + chg', front.ivPrior === 25.06 && front.ivChg === -6.26, `${front.ivPrior}/${front.ivChg}`);
  ok('reads call/put OI (cols 13/15)', front.oiCall === 17 && front.oiPut === 8, `${front.oiCall}/${front.oiPut}`);
  ok('back row (Dec) parsed too', ts[3].symbol === 'NQZ6' && ts[3].straddle === 3616.5);
  // The discriminator: a per-STRIKE chain (no date in col 2) must NOT parse as term structure.
  const perStrike = 'x\ty\t9\t28280\t1\t2\t3\t18.8\t18\t0\t10\t0\t8\t0';
  ok('per-strike chain → null (falls through to parseIVSettlement)', parseSettlementTermStructure(perStrike) === null);
  // Smile-box hint: a wall expiry at ~21 DTE maps to the nearest Settlements row's CODE.
  const primaryDte = 21;
  const match = ts.slice().sort((a, b) => Math.abs(a.dte - primaryDte) - Math.abs(b.dte - primaryDte))[0];
  ok('primary-expiry DTE → exact QuikStrike code + date', match.symbol === 'QN2Q6' && match.expiry === '14/08/2026', `${match.symbol} ${match.expiry}`);
  // Fallback: DTE from the typed field (e.g. FX single-expiry, no primaryExpiry) still matches.
  const typedDte = 4;
  const m2 = ts.slice().sort((a, b) => Math.abs(a.dte - typedDte) - Math.abs(b.dte - typedDte))[0];
  ok('typed-DTE fallback → nearest code (4 → Q4BN6)', m2.symbol === 'Q4BN6', m2.symbol);
  // Fallback: no DTE at all → front LIQUID expiry (smallest DTE with a real straddle).
  const liquid = ts.filter(r => r.straddle > 0 && r.iv > 0).sort((a, b) => a.dte - b.dte);
  ok('no-DTE fallback → front liquid expiry', liquid[0].symbol === 'Q4AN6', liquid[0].symbol);
}

console.log('[guards]');
ok('empty → null', parseIVSettlement('') === null && parseIVSettlement(null) === null);
ok('non-settlement text → null', parseIVSettlement('foo bar\nbaz') === null);
ok('term-structure guards', parseSettlementTermStructure('') === null && parseSettlementTermStructure('foo\nbar') === null);

console.log(`\n${fails === 0 ? 'ALL PASSED ✓' : fails + ' FAILED ✗'}`);
process.exit(fails === 0 ? 0 : 1);
