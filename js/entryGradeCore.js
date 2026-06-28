/**
 * Entry Grade Core — the live star / signal-score weighting as one shared brick,
 * so the Asia-range backtest grades a level the SAME way levels.js does before it
 * fires a Telegram alert. Pure formulas (no data fetch); the actual A/B/C grade
 * is delegated to js/trade-grade.js (`gradeEntry`), the single grader both sides
 * already share. Extracted verbatim from levels.js — golden-tested in
 * js/entryGradeCore.test.mjs so wiring levels.js to it changes no alert.
 */

// Structural star rating (raw count; caller caps at 5 for display, as live does).
//   1 base + tight + density≥2 + density≥3 + cross-session + pivot-match
export function computeStars({ isTight = false, density = 1, crossSessionMatch = false, pivotMatch = false } = {}) {
  let stars = 1;
  if (isTight)            stars++;
  if ((density || 1) >= 2) stars++;
  if ((density || 1) >= 3) stars++;
  if (crossSessionMatch)  stars++;
  if (pivotMatch)         stars++;
  return stars;
}

// Structural score (0–1) used as the structural component of signalScore.
export function computeStructScore({ stars = 1, isTight = false, crossSessionMatch = false, pivotMatch = false } = {}) {
  return Math.min(1,
    Math.min(stars, 5) / 5 * 0.5 +
    (isTight ? 0.2 : 0) +
    (crossSessionMatch ? 0.2 : 0) +
    (pivotMatch ? 0.1 : 0));
}

// Momentum component from the EMA/RSI feature signal vs the trade direction.
export function momScoreFrom(emaRsiSignal, direction) {
  return emaRsiSignal === direction ? 0.78
       : emaRsiSignal && emaRsiSignal !== direction ? 0.22
       : 0.50;
}

// Range-bias component from conviction ∈ [-1,1] → [0,1].
export const rbScoreFrom = conviction => (conviction + 1) / 2;

// Signal score 0–100 from the component scores. With macroScore (FRED on) the
// live engine uses the 25/25/20/20/10 blend; without it, 38/25/25/12.
export function computeSignalScore({ hmmScore = 0.5, momScore = 0.5, rbScore = 0.5, structScore = 0, macroScore = null }) {
  if (macroScore != null) {
    return Math.round((
      hmmScore   * 0.25 +
      macroScore * 0.25 +
      rbScore    * 0.20 +
      momScore   * 0.20 +
      structScore * 0.10
    ) * 100);
  }
  return Math.round((
    hmmScore   * 0.38 +
    momScore   * 0.25 +
    rbScore    * 0.25 +
    structScore * 0.12
  ) * 100);
}
