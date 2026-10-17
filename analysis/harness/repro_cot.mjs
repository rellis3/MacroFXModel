/**
 * Reproduction 1 of 2 for the harness "done when" (forge/HARNESS_REGISTRY_PREREG.md Part A):
 * `cot-positioning-factor` (MD files/COT_POSITIONING_FACTOR_TEST.md, banked 2026-08-22).
 *
 * Expected, written before running: still FAIL, with a LARGER p than the banked 0.0936 once
 * the block is by week rather than by row.
 *
 * What the original did, and how this run maps onto the harness:
 *   signal    z = rollingZScore(share, 156) of leveraged-fund net / OI (statsCore brick,
 *             same as the original); share comes from the store's cot_lev_share_<ccy>
 *             (asof Friday 20:30Z, JPY/CAD/CHF flipped at build time, same as the original)
 *   decision  the original traded the Monday open after the Friday release; the harness
 *             decides at the Friday 22:00Z close — the same trading instant bar the weekend
 *             gap, and the report (asof 20:30Z) is knowable at both
 *   target    forward 4 weeks (20 trading days), close-to-close rather than open-to-open
 *   split     IS → 2017-12-31, OOS 2018 →, chronological, as registered
 *   universe  the store holds the 7 TFF FX legs; the original's 8th leg (gold, Disaggregated
 *             Managed Money) is not in the store and is NOT reproduced here — stated
 *   score     IC uses z; the P&L column takes the FADE direction (−z/2, clipped) because the
 *             two-sided original had no position rule and "crowded unwinds" was its own
 *             reading of the sign; the P&L is secondary, the IC is primary
 */
import { runStudy } from '../../js/harness/runStudy.mjs';
import { rollingZScore } from '../../js/statsCore.js';

const CCY = { eurusd: 'eur', gbpusd: 'gbp', usdjpy: 'jpy', audusd: 'aud', usdcad: 'cad', usdchf: 'chf', nzdusd: 'nzd' };
const WINDOW = 156;   // COT_WINDOW_WEEKS — inherited from DF-01, not tuned
const MIN_WEEKS = 260;

const res = await runStudy({
  id: 'cot-positioning-factor-harness',
  doc: 'MD files/COT_POSITIONING_FACTOR_TEST.md',
  domain: 'positioning',
  claim: 'Speculative positioning (leveraged-fund net share of OI, z vs 156 weeks) carries information about forward 4-week returns',
  universe: Object.keys(CCY),
  horizonDays: 20,
  rebalance: 'weekly',
  sample: { from: '2009-06-01', to: '2026-09-15', isEnd: '2018-01-01' },
  primary: 'ic',
  cells: [{ key: 'z156-fade' }],
  signal: async (f, t, inst) => {
    const rows = await f.series(`cot_lev_share_${CCY[inst]}`);
    const share = rows.map(r => Number(r.value));
    if (share.length < MIN_WEEKS) return null;                 // history guard, as registered
    const z = rollingZScore(share, WINDOW);
    const last = z[z.length - 1];
    if (!Number.isFinite(last)) return null;
    return { score: last, pos: Math.max(-1, Math.min(1, -last / 2)) };
  },
}, { log: m => process.stderr.write(m + '\n') });

const c = res.cells[0];
const banked = { ic: -0.0317, p: 0.0936, halves: [-0.0252, -0.0412] };
console.log(JSON.stringify({
  id: res.id, universe: res.spec.universe.length + ' FX legs (gold not in store)',
  oos: { ic: c.ic.oos.obs, ci95: c.ic.oos.ci95, p: c.ic.oos.pValue, nRows: c.ic.nRowsOos, nDates: c.ic.nDatesOos, meanBlockSteps: res.fixed.meanBlockSteps },
  brickRowBlocks: c.ic.brickRowBlocks, halves: c.ic.oosHalves, is: c.ic.is,
  perLegIcOos: Object.fromEntries(Object.entries(c.legs).map(([k, v]) => [k, v.icOos])),
  fadePnlOos: { sharpe: c.pnl.sharpeOos, gross: c.pnl.sharpeGrossOos, p: c.pnl.pValueOos, years: c.pnl.yearsPositiveOos },
  dependence: res.dependence, banked,
  verdict: {
    stillFail: !(c.ic.oos.pValue < 0.05 && c.ic.oos.ci95[0] * c.ic.oos.ci95[1] > 0),
    pLargerThanBanked: c.ic.oos.pValue > banked.p,
    sameSignAsBanked: Math.sign(c.ic.oos.obs) === Math.sign(banked.ic),
  },
}, null, 1));
