// js/liquidityGateEngine.js — Multi-Central-Bank Liquidity Gate.
//
// Scores each central bank's balance-sheet MOMENTUM (expanding vs
// contracting relative to its own recent pace) — Fed net of TGA/RRP (all
// USD, safe to net directly), ECB and BoJ independently in their own native
// currency. Deliberately does NOT net USD+EUR+JPY balance sheets into one
// dollar-equivalent number — the existing dormant "COG Liquidity Gate"
// family already attempted exactly that and is flagged (per
// MARKET_DESK_PROPOSAL.md / GLOBAL_LIQUIDITY_SYSTEM.md) as "downstream of
// the WALCL units bug, re-run needed" — an unresolved cross-currency
// unit-mismatch. This sidesteps that bug class entirely: only same-currency
// legs are ever summed. Combining the three legs' scores (sign agreement,
// not a further net) is the caller's job via js/pairCompositeEngine.js's
// pairComposite() — this file only scores individual legs.
//
// Context, not a backtested rule — same posture as every other combiner
// shipped this session (cot-extremes.html's crowding read,
// pairCompositeEngine.js). Descriptive, not predictive: this says which way
// liquidity is currently moving and how unusual the pace is, not that it
// forecasts anything.
const clip = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const round2 = v => (v == null ? null : +v.toFixed(2));

// FRED history point [{date,value}] (any order) -> sorted ascending, cleaned.
export function toSeries(points) {
  return (points ?? [])
    .filter(p => p && p.value != null && Number.isFinite(p.value))
    .map(p => ({ date: p.date, value: p.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// z-score of the latest period-over-period CHANGE against its own trailing
// history of changes — "is this an unusually large expansion/contraction
// move", not "is the level itself unusual" (a secularly-growing balance
// sheet would otherwise always read as high). Same shared convention every
// numeric engine in this project uses.
export function latestChangeZScore(series, lookback = 24, minBaseline = 6) {
  if (series.length < 2) return null;
  const chgs = [];
  for (let i = 1; i < series.length; i++) chgs.push(series[i].value - series[i - 1].value);
  if (chgs.length < minBaseline + 1) return null;
  const latest = chgs.at(-1);
  const baseline = chgs.slice(Math.max(0, chgs.length - 1 - lookback), chgs.length - 1);
  if (baseline.length < minBaseline) return null;
  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  const variance = baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length;
  const sd = Math.sqrt(variance);
  const flatFloor = Math.max(1e-9, Math.abs(mean) * 1e-9);
  if (sd < flatFloor) return Math.abs(latest - mean) < flatFloor ? 0 : (latest > mean ? 4 : -4);
  return +((latest - mean) / sd).toFixed(2);
}

const zToScore = z => (z == null ? null : round2(clip(z / 2.5)));

// One central bank's own balance sheet, in its own native currency —
// momentum only, never compared cross-currency to another bank's level.
export function cbLiquidityLeg(points, opts = {}) {
  const series = toSeries(points);
  const latest = series.at(-1);
  if (series.length < 8) return { latestValue: round2(latest?.value), latestDate: latest?.date ?? null, z: null, score: null };
  const z = latestChangeZScore(series, opts.lookback ?? 24);
  return { latestValue: round2(latest?.value), latestDate: latest?.date ?? null, z, score: zToScore(z) };
}

// Forward-fill merge of TGA and RRP (both potentially more frequent than
// WALCL) onto WALCL's own release dates — the same "attach the most
// recently KNOWN reading, never a future one" join yieldCurveEngine.js's
// mergeSlope already uses for two series; extended here to three.
export function mergeFedLiquidity(walclSeries, tgaSeries, rrpSeries) {
  const attach = (primary, other) => {
    let j = 0, val = null;
    return primary.map(p => {
      while (j < other.length && other[j].date <= p.date) { val = other[j].value; j++; }
      return val;
    });
  };
  const tgaAt = attach(walclSeries, tgaSeries);
  const rrpAt = attach(walclSeries, rrpSeries);
  return walclSeries
    .map((p, i) => (tgaAt[i] == null || rrpAt[i] == null) ? null : { date: p.date, value: round2(p.value - tgaAt[i] - rrpAt[i]) })
    .filter(Boolean);
}

// The one leg that legitimately nets (WALCL, TGA, RRP are all USD).
export function fedNetLiquidityLeg(walclPoints, tgaPoints, rrpPoints, opts = {}) {
  const merged = mergeFedLiquidity(toSeries(walclPoints), toSeries(tgaPoints), toSeries(rrpPoints));
  const latest = merged.at(-1);
  if (merged.length < 8) return { latestValue: latest?.value ?? null, latestDate: latest?.date ?? null, z: null, score: null };
  const z = latestChangeZScore(merged, opts.lookback ?? 24);
  return { latestValue: latest?.value ?? null, latestDate: latest?.date ?? null, z, score: zToScore(z) };
}

// Descriptive VIX-divergence read — NOT a claim that liquidity predicts VIX,
// just whether the two are currently pointing the same way. Takes the
// caller's own vix/vixPrev (already loaded elsewhere on the page) — this
// module fetches nothing itself.
export function liquidityVixNote(combinedScore, vix, vixPrev) {
  if (combinedScore == null || vix == null || vixPrev == null) return null;
  const liqDir = combinedScore > 0.12 ? 'expanding' : combinedScore < -0.12 ? 'contracting' : 'flat';
  const vixDir = vix > vixPrev + 0.3 ? 'rising' : vix < vixPrev - 0.3 ? 'falling' : 'flat';
  if (liqDir === 'flat' || vixDir === 'flat') return { liqDir, vixDir, read: 'flat' };
  const confirming = (liqDir === 'contracting' && vixDir === 'rising') || (liqDir === 'expanding' && vixDir === 'falling');
  return { liqDir, vixDir, read: confirming ? 'confirming' : 'diverging' };
}
