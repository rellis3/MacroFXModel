/**
 * "Fear versus the Nasdaq": has the VIX (or the VVIX, the volatility of the VIX) been moving far more than the Nasdaq?
 *
 * This is C.OG's idea (Discord, 2026-10-23: "the ratio between how VVIX and Nasdaq are pricing in information ... when that ratio is at an extreme, what then
 * happens"), pre-registered and run the same day (forge/VVIX_NASDAQ_RATIO_PREREG.md, ledger `vvix-ratio-range` VALIDATED, `vvix-ratio-direction`
 * UNDERPOWERED). The finding: when the 20-session ratio of VIX (or VVIX) moves to Nasdaq moves is in the top decile of its own last year, the VIX has
 * tended to fall about 7% over the next month, beyond what the VIX's own state predicts (t -3.1, all three periods, placebo, leave-one-year-out). It is a
 * volatility read. The Nasdaq's own direction after it came out underpowered, so nothing here says which way stocks go.
 *
 * Construction, as pre-registered (so a reading here is the study's reading):
 *   ratio R = sd(daily change in ln VIX) / sd(daily change in ln Nasdaq) over the last 20 sessions   (R_b; the same with VVIX is R_a)
 *   extreme = the ratio's percentile among its own last 252 sessions, today included; top decile is 90% or more
 * The page's Nasdaq is the NQ future from the market bundle, the study used the Nasdaq-100 index from FRED, so the two can differ at the edges.
 *
 * It is a CALMING signal: the opposite kind from the range-pressure gauge (js/rangePressure.js), so it sits beside that gauge and never subtracts from it.
 *
 * Pure: no fetch, no DOM, no clock. Tested in js/fearVsNasdaq.test.mjs.
 */
const fin = v => v != null && Number.isFinite(v);
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
export const WINDOW = 20, LOOKBACK = 252, TOP = 0.9;

/** s = { vix, vvix, nq }: daily closes, oldest first, same dates, nulls allowed. Returns null when there is not enough aligned history. */
export function fearVsNasdaq(s) {
  const n = Math.min(s?.vix?.length ?? 0, s?.vvix?.length ?? 0, s?.nq?.length ?? 0), rows = [];
  for (let i = 0; i < n; i++) if (fin(s.vix[i]) && fin(s.vvix[i]) && fin(s.nq[i]) && s.vix[i] > 0 && s.vvix[i] > 0 && s.nq[i] > 0) rows.push([Math.log(s.vix[i]), Math.log(s.vvix[i]), Math.log(s.nq[i])]);
  const d = k => rows.slice(1).map((r, i) => r[k] - rows[i][k]);
  const dv = d(0), dw = d(1), dn = d(2);
  if (dn.length < LOOKBACK + WINDOW - 1) return null;
  const ratioAt = (dx, t) => { const den = sd(dn.slice(t - WINDOW + 1, t + 1)); return den > 0 ? sd(dx.slice(t - WINDOW + 1, t + 1)) / den : null; };
  const T = dn.length - 1, build = dx => {
    const hist = []; for (let t = T - LOOKBACK + 1; t <= T; t++) hist.push(ratioAt(dx, t));
    const now = hist.at(-1); if (!fin(now)) return null;
    const known = hist.filter(fin), pct = known.filter(x => x <= now).length / known.length;
    return { ratio: Math.round(now * 100) / 100, pct: Math.round(pct * 100), on: pct >= TOP };
  };
  const b = build(dv), a = build(dw); if (!a && !b) return null;
  const on = !!(a?.on || b?.on), top = Math.max(a?.pct ?? 0, b?.pct ?? 0);
  return { a, b, on, top, evidence: 'vvix-ratio-range' };
}

/** Plain words for the reading. */
export function fearWords(f) {
  if (!f) return '';
  if (f.on) return `Fear has run ahead of the Nasdaq. Over the last 20 sessions the VIX${f.a?.on ? ' and the VVIX (the volatility of the VIX)' : ''} ${f.a?.on && f.b?.on ? 'have' : 'has'} moved far more than the Nasdaq, in the top tenth of the past year. After that, the VIX has tended to give back about 7% over the following month. It is a read on volatility. It does not say which way stocks will go.`;
  return `Fear versus the Nasdaq is at the ${f.top}th percentile of its past year, below the top-tenth level (90th) that has gone with the VIX giving back about 7% over the next month. It is a read on volatility only. It does not say which way stocks will go.`;
}
