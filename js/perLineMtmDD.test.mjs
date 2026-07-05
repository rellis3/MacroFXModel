/**
 * Offline tests for withMtmDD — folding the mark-to-market drawdown into the book's
 * portfolio stats as the PRIMARY drawdown/Calmar basis, with the closed daily-net
 * figure preserved as a labelled lower bound. Run: node js/perLineMtmDD.test.mjs
 */
import { withMtmDD } from './perLineStrategy.js';

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

console.log('[withMtmDD]');

// Base portfolio: vol-targeted CAGR 35%, closed DD -1.2%, closed Calmar ~29.
const basePort = () => ({ sharpe: 3.07, cagr: 35, maxDD: -8.1, annVol: 68, volTarget: { target: 10, cagr: 35, maxDD: -1.2, calmar: 29.13 } });

// 1. Valid MTM path (2× deeper) → maxDDMtm = -2.4, Calmar recomputed on it, closed kept.
{
  const p = withMtmDD(basePort(), { valid: true, multipleVsClosed: 2 });
  ok('mtmValid true when idd valid', p.mtmValid === true);
  ok('maxDDMtm = closed vol-targeted DD × multiple', near(p.volTarget.maxDDMtm, -2.4), `maxDDMtm=${p.volTarget.maxDDMtm}`);
  ok('calmarMtm = cagr / |maxDDMtm|', near(p.volTarget.calmarMtm, +(35 / 2.4).toFixed(2), 0.01), `calmarMtm=${p.volTarget.calmarMtm}`);
  ok('closed DD preserved as lower bound', p.volTarget.maxDDClosed === -1.2 && p.volTarget.calmarClosed === 29.13);
  ok('maxDDMtmRaw = raw closed DD × multiple (the FULL leverage-free magnitude)', near(p.maxDDMtmRaw, -16.2), `maxDDMtmRaw=${p.maxDDMtmRaw}`);
  ok('full raw MTM DD is deeper than the 10%-vol figure', Math.abs(p.maxDDMtmRaw) > Math.abs(p.volTarget.maxDDMtm));
  ok('MTM Calmar is below the flattering closed Calmar', p.volTarget.calmarMtm < p.volTarget.calmarClosed);
}

// 2. Invalid MTM path (stale timestamps) → maxDDMtm/calmarMtm null, closed still kept.
{
  const p = withMtmDD(basePort(), { valid: false, multipleVsClosed: 1.02 });
  ok('mtmValid false when idd invalid', p.mtmValid === false);
  ok('maxDDMtm null on stale data (UI shows n/a)', p.volTarget.maxDDMtm === null);
  ok('calmarMtm null on stale data', p.volTarget.calmarMtm === null);
  ok('closed DD still preserved', p.volTarget.maxDDClosed === -1.2);
}

// 3. Missing idd entirely → treated as invalid, no throw.
{
  const p = withMtmDD(basePort(), null);
  ok('null idd → mtmValid false, no throw', p.mtmValid === false && p.volTarget.maxDDMtm === null);
}

// 4. A near-zero DD can't produce a Calmar (guard against divide-by-~0).
{
  const p = withMtmDD({ volTarget: { target: 10, cagr: 35, maxDD: 0, calmar: 0 } }, { valid: true, multipleVsClosed: 1.1 });
  ok('flat DD → maxDDMtm 0 and calmarMtm null', p.volTarget.maxDDMtm === 0 && p.volTarget.calmarMtm === null);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
if (failures) process.exit(1);
