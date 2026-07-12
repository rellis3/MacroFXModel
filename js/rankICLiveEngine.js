/**
 * Rank-IC (Live scores) — grades the ACTUAL live entry scores against realized
 * trade pnl, the honest counterpart to rankICEngine.js (which grades the D1
 * classifier scores).
 *
 * The scores the live bot fires — star rating, signalScore, day-type T, vol
 * position, approach velocity — depend on intraday level context (density,
 * cross-session match, pivot match, EMA-RSI, HMM) that CANNOT be rebuilt from D1.
 * So this does not fake them from D1. Instead it drives the SHARED grading path:
 * asiaRangeEngine walks M1 history and computes `live_signal_score` / `live_stars`
 * / `day_type_T` / `vol_pos` / `approach_vel` per entry candidate using the very
 * same entryGradeCore / rangeBiasCore / hmm.js bricks the live levels.js uses
 * (CONFLUENCE_LIVE_VS_BACKTEST.md), alongside the realized `pnl_pct`. We then feed
 * each (score, pnl) pair into the SAME statsCore.rankIC brick on a true IS/OOS
 * split. No re-implementation, no drift.
 *
 * Staleness: the M1 comes from the frozen R2/parquet snapshot, so this opts into
 * asiaRangeEngine's gap-fill (m1GapFill) to top the recent tail up to now from
 * OANDA live — the cached bulk history stays, only the missing edge is fetched.
 *
 * What it is / is NOT
 *   • Falsification, not edge. IC near 0 OOS ⇒ the score does not sort trade
 *     quality. Benchmark = IC 0, and only OOS.
 *   • It grades signalScore AS THE ASIA-RANGE BOT FIRES IT (that strategy's entry
 *     candidates, no-macro blend), not every possible level touch. Honest scope.
 *   • Sample size is the real limit — Asia-range candidates per pair can be thin,
 *     so OOS n may fall short of the ≥30 bar; the card shows n so a thin cell
 *     can't masquerade as a result.
 */

import { runAsiaRangeBacktest, ASIA_INSTRUMENTS } from './asiaRangeEngine.js';
import { fetchM1Range } from './volBacktestEngine.js';
import { rankIC } from './statsCore.js';

// The live scores to grade, each vs realized trade pnl (all claim higher → better
// trade; +IC ⇒ the score ranks winners above losers). Fields are emitted per
// trade by asiaRangeEngine's live-grade path.
export const LIVE_SCORES = [
  { key: 'live_signal_score', label: 'signalScore (0–100)',       note: 'HMM+mom+range-bias+struct blend (no-macro)' },
  { key: 'live_stars',        label: 'Star rating (1–5)',         note: 'structural: tight/density/cross-session/pivot' },
  { key: 'day_type_T',        label: 'Day-type T',                note: 'trend-day-ness at the entry (no lookahead)' },
  { key: 'vol_pos',           label: 'Vol position |Δ|/HL75',     note: '≈1 ⇒ at the forecast exhaustion band' },
  { key: 'approach_vel',      label: 'Approach velocity (σ)',     note: 'speed into the level (spike ⇒ fade)' },
];

// Time-split a set of {date, v, pnl} rows into IS/OOS and rank-IC each segment.
function splitIC(rows, oosFrac) {
  const sorted = rows.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const cut = Math.floor(sorted.length * (1 - oosFrac));
  const splitDate = sorted[cut]?.date ?? null;
  const isRows  = sorted.filter(r => (splitDate ? r.date < splitDate : true));
  const oosRows = sorted.filter(r => (splitDate ? r.date >= splitDate : false));
  const ic = rs => rankIC(rs.map(r => r.v), rs.map(r => r.pnl));
  return { full: ic(sorted), is: ic(isRows), oos: ic(oosRows), splitDate };
}

// ── One pair: run the Asia-range backtest (gap-filled) → rank-IC each score ────
export async function runRankICLive(pairKey, opts = {}) {
  const { oosFrac = 0.4, dateFrom = '', dateTo = '', gapFill = true, nowSec, onLog = () => {} } = opts;
  const trades = await runAsiaRangeBacktest(pairKey, {
    dateFrom, dateTo, liveGrade: true,
    gapFill, fetchCandles: fetchM1Range, nowSec, onLog,
  });
  const filled = trades.filter(t => t.filled && Number.isFinite(t.pnl_pct));

  const scores = LIVE_SCORES.map(s => {
    const rows = filled
      .filter(t => Number.isFinite(t[s.key]))
      .map(t => ({ date: t.date, v: t[s.key], pnl: t.pnl_pct }));
    const seg = splitIC(rows, oosFrac);
    return { key: s.key, label: s.label, note: s.note, n: rows.length, ...seg };
  });

  return { pair: pairKey.toUpperCase(), nTrades: filled.length, oosFrac, scores };
}

// ── Suite: loop pairs, pooled OOS summary ─────────────────────────────────────
export async function runRankICLiveSuite(opts = {}, pairs = ASIA_INSTRUMENTS) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — needed for M1 gap-fill / OANDA data');
  const results = [], log = [];
  const onLog = m => log.push(m);
  for (const pair of pairs) {
    try {
      const r = await runRankICLive(pair, { ...opts, onLog });
      results.push(r);
      log.push(`${pair.toUpperCase()}: ${r.nTrades} trades`);
    } catch (e) {
      log.push(`  Error ${pair.toUpperCase()}: ${e.message}`);
    }
  }

  // Pooled per-score summary: mean/median of per-pair OOS ICs + significant-cell
  // count (|t|≥2). With LIVE_SCORES × pairs cells, a few significant survivors is
  // what multiple testing yields by chance — nSig sits next to the cell count so a
  // lone survivor can't be read as a win (CLAUDE.md working agreement).
  const summary = LIVE_SCORES.map(s => {
    const oos = results.map(r => r.scores.find(x => x.key === s.key)?.oos).filter(Boolean);
    const vals = oos.map(x => x.ic);
    const sig  = oos.filter(x => Math.abs(x.tStat) >= 2).length;
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const sorted = vals.slice().sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    return { key: s.key, label: s.label, note: s.note, meanOosIC: +mean.toFixed(4), medianOosIC: +median.toFixed(4), nPair: vals.length, nSig: sig };
  });

  return { results, summary, log, opts };
}

export { ASIA_INSTRUMENTS as RANKIC_LIVE_INSTRUMENTS };
