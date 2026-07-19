/**
 * Cone Forward-Track — the one credential a backtest can't fake.
 *
 * The calibration card grades the cone on HISTORY, which is still in-sample to
 * the researcher. This accumulates a LIVE, post-research record: every ~hour it
 * snapshots each pair's live 4h cone CLAIM (P75 band + drift direction), and
 * once the 4h window matures it resolves the OUTCOME from realized bars — did
 * the close land inside the P75 band (claim 75%), did the intrabar path touch
 * beyond it (stop reality), was the drift direction right (claim ~50%). Over
 * weeks the forward numbers either track the backtest's (calibration real) or
 * drift away (it was in-sample luck). That drift, or its absence, is the only
 * thing a backtest cannot fake.
 *
 * Pure — no I/O, no clock, no network. The server records/resolves/persists;
 * this module only turns summaries→claims and claims+bars→outcomes+stats.
 * Unit-tested in js/coneForwardTrack.test.mjs.
 */

export const CONE_FWD_HORIZON_SEC = 4 * 3600;   // the cone's horizon (4h)
export const CONE_FWD_MIN_GAP_SEC = 55 * 60;    // ≤ ~1 claim per pair per hour
export const CONE_FWD_MAX_AGE_SEC = 7 * 86400;  // drop never-resolvable claims after a week

// Turn a live forecast-path summary into a claim record. `nowSec` = capture
// time. Returns null if the summary lacks a usable P75 band.
export function makeClaim(pair, summary, nowSec) {
  if (!summary || summary.p75Lo == null || summary.p75Hi == null) return null;
  const anchor = summary.anchor ?? summary.cone?.anchor ?? null;
  return {
    pair, at: nowSec,
    anchor, p75Lo: +summary.p75Lo, p75Hi: +summary.p75Hi,
    driftBp: +(summary.driftBp ?? 0),
    horizonEndSec: nowSec + CONE_FWD_HORIZON_SEC,
    resolved: false,
  };
}

// Dedupe: only record a fresh claim for a pair if the last one is old enough.
export function shouldRecord(log, pair, nowSec, minGap = CONE_FWD_MIN_GAP_SEC) {
  let last = 0;
  for (const c of log) if (c.pair === pair && c.at > last) last = c.at;
  return nowSec - last >= minGap;
}

// Resolve every matured, unresolved claim from per-pair realized bars.
// barsByPair: { PAIR: [{ time(sec), high, low, close }] } (ascending). A claim
// only resolves when its 4h window is fully in the past AND covered by bars.
export function resolveClaims(log, barsByPair, nowSec) {
  let resolved = 0;
  for (const c of log) {
    if (c.resolved || c.horizonEndSec > nowSec) continue;
    const bars = barsByPair[c.pair];
    if (!bars || !bars.length) continue;
    const win = bars.filter(b => b.time >= c.at && b.time <= c.horizonEndSec);
    if (win.length < 2 || bars[bars.length - 1].time < c.horizonEndSec) continue;   // not fully covered yet
    let hi = -Infinity, lo = Infinity;
    for (const b of win) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
    const finalClose = win[win.length - 1].close;
    c.realizedClose = finalClose;
    c.closeIn75 = finalClose >= c.p75Lo && finalClose <= c.p75Hi;
    c.touch75 = hi > c.p75Hi || lo < c.p75Lo;
    c.dirHit = (c.anchor != null && c.driftBp !== 0 && finalClose !== c.anchor)
      ? (Math.sign(finalClose - c.anchor) === Math.sign(c.driftBp)) : null;
    c.resolved = true;
    resolved++;
  }
  return { log, resolved };
}

// Housekeeping: keep resolved claims; drop unresolved ones older than maxAge
// (their bars are gone / market never traded the window).
export function pruneStale(log, nowSec, maxAge = CONE_FWD_MAX_AGE_SEC) {
  return log.filter(c => c.resolved || (nowSec - c.at) < maxAge);
}

// Forward stats over RESOLVED claims — the live record vs the backtest claims.
export function summarizeForward(log, opts = {}) {
  const done = (log ?? []).filter(c => c.resolved);
  const per = {};
  const agg = { n: done.length, closeIn75: 0, touch75: 0, dir: 0, dirN: 0 };
  for (const c of done) {
    if (c.closeIn75) agg.closeIn75++;
    if (c.touch75) agg.touch75++;
    if (c.dirHit != null) { agg.dirN++; if (c.dirHit) agg.dir++; }
    const p = per[c.pair] ?? (per[c.pair] = { n: 0, closeIn75: 0, touch75: 0, dir: 0, dirN: 0 });
    p.n++; if (c.closeIn75) p.closeIn75++; if (c.touch75) p.touch75++;
    if (c.dirHit != null) { p.dirN++; if (c.dirHit) p.dir++; }
  }
  const rate = (a, b) => b ? +(a / b).toFixed(4) : null;
  const packPair = p => ({ n: p.n, closeIn75: rate(p.closeIn75, p.n), touch75: rate(p.touch75, p.n), dirHit: rate(p.dir, p.dirN) });
  return {
    total: (log ?? []).length, resolved: done.length, pending: (log ?? []).length - done.length,
    trackingStart: opts.trackingStart ?? null,
    closeIn75: rate(agg.closeIn75, agg.n),   // forward P75 close-containment (claim 75%)
    touch75: rate(agg.touch75, agg.n),       // forward P75 touch rate (stop reality)
    dirHit: rate(agg.dir, agg.dirN),         // forward direction hit (claim ~50% coin flip)
    perPair: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, packPair(v)])),
    claims: { closeIn75: 0.75, dirHit: 0.5 },
  };
}
