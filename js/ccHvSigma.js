/**
 * Close-to-close HV σ — COG's OWN volatility method, for reproducing his lines.
 *
 * cogReverseEngineer identified COG's σ as annualised close-to-close historical
 * vol ÷ √252. Unlike GARCH (mean-reverting/floored) or HAR-RV (a smoothed forward
 * forecast that reads low in an elevated regime), this is the plain trailing
 * standard deviation of daily CLOSE-TO-CLOSE log returns — so it is gap-inclusive
 * (every overnight move is in a close-to-close return) and current (no smoothing).
 * That's why it reproduces COG's numbers where HAR sat ~15% under him.
 *
 * Pure: daily bars in, annualised σ out. Needs only closes (D1) — no intraday.
 */
const SQRT252 = Math.sqrt(252);

/**
 * @param dailyBars ascending daily bars with a numeric `close`
 * @param window    lookback in trading days (COG-style; tune to match his output)
 * @returns { volAnnual, window, n } or { insufficient, n }
 */
export function ccHvSigma(dailyBars, { window = 20 } = {}) {
  const closes = (dailyBars || []).map(b => b?.close).filter(c => c > 0);
  if (closes.length < window + 2) return { insufficient: true, n: closes.length };
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const w = rets.slice(-window);
  const m = w.reduce((s, v) => s + v, 0) / w.length;
  const varr = w.reduce((s, v) => s + (v - m) ** 2, 0) / (w.length - 1);   // sample variance
  if (!(varr > 0)) return { insufficient: true, n: w.length };
  return { volAnnual: +(Math.sqrt(varr) * SQRT252 * 100).toFixed(2), window, n: w.length };
}

// Convenience: σ at several windows in one pass, so the caller can pick / tune the
// one that best matches COG without re-fetching. Returns { w10, w14, w20, w30 }.
export function ccHvMulti(dailyBars, windows = [10, 14, 20, 30]) {
  const out = {};
  for (const win of windows) { const r = ccHvSigma(dailyBars, { window: win }); out[`w${win}`] = r.insufficient ? null : r.volAnnual; }
  return out;
}
