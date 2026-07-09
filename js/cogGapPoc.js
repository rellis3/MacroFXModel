/**
 * COG-gap POC — build-and-kill diagnostic (delete after we've read the answer).
 *
 * Two questions the daily COG-vs-ours comparison raised, neither of which more
 * correction-factor tweaking can answer:
 *
 *   Part 1 — FEED. Is the GOLD/NQ gap because COG references the FUTURE (GC=F /
 *     NQ=F) while we run OANDA's spot CFD? Run our EXACT calc (computeForecast)
 *     on both feeds; only the DATA differs. If futures lands materially closer to
 *     COG, the fix is the data source, not the math. Prior: gold spot≈futures
 *     (basis adds ~0 to daily range), so this likely comes back ~null for gold.
 *
 *   Part 2 — RESPONSIVENESS. COG's number moves day-to-day (NQ 2.08→2.17→2.47)
 *     while ours is sticky (2.20→2.31→2.20). That is a HALF-LIFE difference, not a
 *     feed one — a feed offset can't flip sign across days. Trace HL-median-raw
 *     under a spread of estimators (fast EWMA → slow HV30) over the last N days so
 *     we can see which half-life tracks COG's trajectory.
 *
 * Pure core (no network) — the server route feeds it the fetched bars. Reuses the
 * live calc + estimators; copies nothing (Lego Principle).
 */
import { computeForecast } from './volForecast.js';
import { latestSigmaForecast } from './volForecastBench.js';
import { BM_P50 } from './volBacktestEngine.js';

// ── Part 1: feed A/B — same calc, two feeds ───────────────────────────────────
// spotBars / futBars: [{date,open,high,low,close}] oldest→newest, ≥60 bars each.
export function feedAB(spotBars, futBars, assetClass) {
  const one = (bars) => {
    if (!bars || bars.length < 60) return { insufficient: true, n: bars?.length ?? 0 };
    const f = computeForecast(bars, assetClass);
    return { hl_median: f.hl_median, hl_75: f.hl_75, oc_median: f.oc_median,
      vol_annual: f.vol_annual, n: bars.length, lastDate: bars.at(-1).date };
  };
  const spot = one(spotBars), fut = one(futBars);
  const dPct = (a, b) => (a > 0 && b > 0) ? +(((a / b) - 1) * 100).toFixed(1) : null;
  return {
    assetClass, spot, fut,
    // >0 ⇒ futures forecasts a WIDER median H-L than spot (would move us toward COG if COG is higher).
    futVsSpotHlPct: (spot.insufficient || fut.insufficient) ? null : dPct(fut.hl_median, spot.hl_median),
    futVsSpotVolPct: (spot.insufficient || fut.insufficient) ? null : dPct(fut.vol_annual, spot.vol_annual),
  };
}

// ── Part 2: responsiveness — HL-median-raw trajectory per estimator ───────────
// A spread of half-lives: ewma090 (fast, ~6.6d) → hv30 (slow). Raw BM median
// (no per-class fudge) so we compare day-to-day MOVEMENT, not level. Walk the
// last `days` anchor points, each using only bars up to that day (causal).
const RESP_KEYS = ['ewma090', 'ewma094', 'hv20', 'hv30', 'yz30'];
const RESP_LABEL = { ewma090: 'EWMA λ0.90 (fast)', ewma094: 'EWMA λ0.94', hv20: 'HV20', hv30: 'HV30 (slow)', yz30: 'Yang-Zhang(30)' };

export function responsivenessTrace(bars, days = 8) {
  if (!bars || bars.length < 60 + days) return { insufficient: true, n: bars?.length ?? 0 };
  const dates = [];
  for (let k = days - 1; k >= 0; k--) dates.push(bars[bars.length - 1 - k]?.date ?? null);
  const estimators = {};
  for (const key of RESP_KEYS) {
    const traj = [];
    for (let k = days - 1; k >= 0; k--) {
      const sub = bars.slice(0, bars.length - k);
      let sig = null;
      try { sig = latestSigmaForecast(sub, key, {}); } catch { sig = null; }
      traj.push((sig != null && isFinite(sig) && sig > 0) ? +(BM_P50 * sig * 100).toFixed(2) : null);
    }
    const chg = [];
    for (let i = 1; i < traj.length; i++) if (traj[i] != null && traj[i - 1] > 0) chg.push(Math.abs(traj[i] / traj[i - 1] - 1) * 100);
    estimators[key] = {
      label: RESP_LABEL[key], traj, latest: traj.at(-1),
      // mean |day-over-day % change| — the "how fast does it move" score. COG's
      // trajectory movement should sit near whichever estimator matches its half-life.
      movementPct: chg.length ? +(chg.reduce((a, b) => a + b, 0) / chg.length).toFixed(2) : null,
    };
  }
  return { dates, estimators };
}
