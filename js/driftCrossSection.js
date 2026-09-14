/**
 * driftCrossSection — currency-factor decomposition of per-pair drift.
 *
 * The institutional answer to the problem `driftAnatomy` measures.
 *
 * ## The problem, restated
 *
 * `driftAnatomy.driftPrecision` says a 14-day drift has SE(d) = 1/sqrt(14) = 0.267,
 * so a "Strong" reading (|d| >= 0.25) carries t = 0.94. That is not a flaw in the
 * estimator — it is Merton (1980). The standard error of a drift estimate is
 * sigma/sqrt(T) in CALENDAR span and does not shrink with sampling frequency, so no
 * amount of finer data rescues a per-pair drift read over a fortnight.
 *
 * There are exactly two levers on SE(mu): a longer T, or MORE INDEPENDENT
 * OBSERVATIONS of the same underlying quantity. The first is unavailable (a 14-day
 * read is 14 days by definition, and lengthening it measures a staler thing). The
 * second is what a desk actually uses, and it is available here for free.
 *
 * ## The decomposition
 *
 * EURUSD does not have a drift. EUR has a drift and USD has a drift, and EURUSD's
 * is the difference. For a pair quoted as QUOTE-per-BASE,
 *
 *     r_pair  =  s_base  -  s_quote  +  e_pair
 *
 * where s_X is currency X's drift against a common numeraire and e_pair is whatever
 * is genuinely specific to that cross. With 25 pairs over 8 currencies this is a
 * heavily over-determined linear system: each currency appears in ~6-8 pairs, so its
 * drift is estimated from 6-8 observations rather than 1, cutting its standard error
 * by ~sqrt(7) ~ 2.6x against the per-pair read.
 *
 * That is a real statistical gain, not a presentational one, and it is the same move
 * that makes a CTA's momentum book work: pool an individually-unestimable quantity
 * across enough correlated-but-not-identical observations that the noise partly
 * cancels.
 *
 * It also answers the question the per-pair number structurally cannot. "EURUSD is
 * falling" is compatible with a weak EUR, a strong USD, or both. A desk needs to know
 * which, because it determines whether the expression is EURUSD or a EUR cross that
 * avoids the dollar leg entirely.
 *
 * ## Identification, and the constraint
 *
 * Only DIFFERENCES are observable: adding a constant to every s_X leaves every pair
 * return unchanged. The system is therefore rank k-1 in k currencies, and needs one
 * normalisation. This module uses sum(s) = 0 — an equal-weighted basket numeraire —
 * rather than pinning USD to zero. The choice matters for interpretation: under
 * sum(s)=0 a positive s_USD means "USD strong against the average currency", which is
 * the reading a dollar-index user expects; under s_USD=0 every other currency's
 * number silently becomes a USD-relative one and the dollar's own move is invisible.
 *
 * Implemented by solving (L + J/k)·s = A'W·r, where L = A'WA is the weighted graph
 * Laplacian of the currency network and J = 11'. Since L·1 = 0, that shift makes the
 * system non-singular while leaving the fitted differences untouched, and the
 * solution satisfies sum(s) = 0 automatically (proof: 1'A' = (A1)' = 0, so the
 * right-hand side is orthogonal to 1).
 *
 * ## Weighting
 *
 * Pair vols differ by 3x across this universe (EURCHF vs GBPNZD), so an unweighted
 * fit lets the noisiest crosses dominate. Weights are 1/sigma_pair^2 — inverse
 * variance, the efficient choice and the one a risk desk would use anyway. Supply
 * `sigma` per observation; omit it and the fit falls back to equal weights and says
 * so in `weighting`.
 *
 * ## Standard errors, honestly
 *
 * With correct inverse-variance weights, Var(s_hat) = G - J/k exactly, where
 * G = (L + J/k)^-1. No residual-variance scaling is needed because it is already in
 * the weights. That exactness depends on the supplied sigmas being right, which they
 * are only approximately — so `dispersion` (weighted RSS over its degrees of freedom)
 * is reported as the calibration check. It should sit near 1.0; well above means the
 * sigmas are too small for the scatter actually observed, and the reported SEs would
 * be too tight. `se` carries that correction applied, `seModel` does not, and both
 * are returned so the correction is visible rather than silent.
 *
 * ## The standard errors are an UPPER BOUND on significance
 *
 * Var(s_hat) = G - J/k is exact under the model's own assumption that pair residuals
 * are INDEPENDENT once the two currency legs are removed. They are not. FX pairs
 * share risk-on/risk-off, carry and liquidity factors that survive the currency
 * decomposition, so residuals are positively correlated and the true standard errors
 * are wider than the ones reported here — by how much depends on the factor structure
 * this module does not attempt to estimate.
 *
 * `dispersion` catches part of it (correlated residuals usually inflate the weighted
 * RSS), but only the part that shows up as scale, and the inflate-only rule means an
 * under-dispersed fit gets no correction at all. So read a t-stat here the same way
 * `driftAnatomy.driftPrecision` says to read its own: as the most favourable reading
 * the data supports, not a p-value to act on. A leg at t = 6 is well resolved; a leg
 * at t = 2.1 should not be treated as 96% confident.
 *
 * ## What this is NOT
 *
 * Descriptive, like every other drift surface in this repo. It decomposes a drift
 * that ALREADY HAPPENED into currency legs; it forecasts nothing, and the standing
 * verdicts hold unchanged — drift does not condition the O-H/O-L rungs (forge/drift.py)
 * and jumps carry no directional information (volatilityExhaustion Phase 13). A
 * currency leg with t = 3 means that leg's recent move is well resolved, NOT that it
 * continues. Any predictive use needs its own pre-registered IS/OOS study.
 *
 * Pure: no fetch, no fs, no clock. Callers supply the observations.
 */

// ── Small dense linear algebra (k <= ~12 here, so clarity beats cleverness) ───

/** Solve M·x = b for symmetric positive-definite M by Gaussian elimination with
 *  partial pivoting. Returns null when M is singular to working precision. */
function solve(M, b) {
  const k = b.length;
  const a = M.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (Math.abs(a[piv][col]) < 1e-12) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      if (f === 0) continue;
      for (let c = col; c <= k; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row, i) => row[k] / a[i][i]);
}

/** Inverse of a symmetric matrix, by solving against each identity column. */
function inverse(M) {
  const k = M.length;
  const cols = [];
  for (let j = 0; j < k; j++) {
    const e = new Array(k).fill(0); e[j] = 1;
    const x = solve(M, e);
    if (!x) return null;
    cols.push(x);
  }
  // cols[j] is the j-th COLUMN of the inverse.
  return Array.from({ length: k }, (_, i) => cols.map(c => c[i]));
}

/** Connected components of the currency graph, by union-find over the pairs.
 *  A disconnected graph is NOT identifiable: sum(s)=0 pins one degree of freedom,
 *  but each extra component adds another, and the fit would silently invent a
 *  relative level between two groups of currencies that never trade against each
 *  other in this universe. Detected and refused rather than returned. */
function components(ccys, obs, idx) {
  const parent = ccys.map((_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const o of obs) {
    const a = find(idx.get(o.base)), b = find(idx.get(o.quote));
    if (a !== b) parent[a] = b;
  }
  const roots = new Set(ccys.map((_, i) => find(i)));
  return roots.size;
}

// ── The decomposition ────────────────────────────────────────────────────────

/**
 * @param {Array} observations  [{ pair, base, quote, mu, sigma? }]
 *   `mu`    the pair's drift, in whatever unit you want the answer in (e.g. %/day,
 *           or a log return per day). Units pass straight through.
 *   `sigma` that pair's daily vol in the SAME unit, for inverse-variance weighting.
 *           Omit on every row for an equal-weighted fit.
 * @param {object} [opts]
 *   `win`             how many returns each `mu` was averaged over (14 to match
 *                     `_driftD`). Sets SE(mu) = sigma/sqrt(win), which is what the
 *                     weights and every reported standard error depend on. Default 1,
 *                     meaning `sigma` is already the standard error of `mu`.
 *   `minPairsPerCcy`  currencies appearing in fewer pairs than this are reported but
 *                     flagged `thin` (default 2 — a currency seen once is just a
 *                     restatement of that one pair).
 * @returns {object|null} null when there is nothing identifiable to fit.
 */
export function decomposeCurrencyDrift(observations, opts = {}) {
  const minPairs = opts.minPairsPerCcy ?? 2;

  const obs = (observations ?? []).filter(o =>
    o && o.base && o.quote && o.base !== o.quote && Number.isFinite(o.mu));
  // ONE pair is already identifiable: two currencies, one observed difference, and
  // sum(s)=0 pins the level. Requiring two rows would refuse a legitimate fit.
  if (obs.length < 1) return null;

  const ccys = [...new Set(obs.flatMap(o => [o.base, o.quote]))].sort();
  const k = ccys.length;
  const n = obs.length;
  if (k < 2) return null;

  const idx = new Map(ccys.map((c, i) => [c, i]));

  // Connectivity is checked BEFORE any rank test, because it is the same condition
  // stated more usefully: a connected graph on k nodes has at least k-1 edges, so
  // `n < k-1` can only happen when the universe is disconnected. Testing rank first
  // returned a bare null and threw away the reason.
  const nComp = components(ccys, obs, idx);
  if (nComp > 1) {
    return { error: 'disconnected', components: nComp, currencies: null,
             note: `${nComp} currency groups never trade against each other in this universe — `
                 + 'their relative drift is not identifiable. Supply a linking pair.' };
  }

  // Inverse-variance weights. All-or-nothing: a mix of weighted and unweighted rows
  // would silently rank the unweighted ones as infinitely precise.
  //
  // THE UNIT TRAP. The quantity being fitted is a DRIFT — a mean of `win` returns —
  // so the weight must be the inverse variance OF THAT MEAN, which is win/sigma^2,
  // not 1/sigma^2. Weighting by the raw daily vol inflates every currency SE by
  // sqrt(win) and makes the pooled estimate look WORSE than the per-pair one it is
  // supposed to beat: at win=14 the headline gain came out at 0.57x instead of
  // ~1.8x. The error is invisible in the fitted drifts (a common factor cancels out
  // of a weighted least-squares solution) and shows up only in the standard errors,
  // which is exactly the sort of bug that ships.
  //
  // `opts.win` is the number of returns each `mu` was averaged over — 14 to match
  // `_driftD`. Omit it and `sigma` is taken to be the standard error of `mu` already.
  const win = Number.isFinite(opts.win) && opts.win >= 1 ? opts.win : 1;
  const haveSigma = obs.every(o => Number.isFinite(o.sigma) && o.sigma > 0);
  const seObs = obs.map(o => (haveSigma ? o.sigma / Math.sqrt(win) : 1));
  const w = seObs.map(s => 1 / (s * s));

  // L = A'WA (weighted Laplacian) and rhs = A'W r, built without materialising A:
  // each row contributes +1 at base and -1 at quote.
  const L = Array.from({ length: k }, () => new Array(k).fill(0));
  const rhs = new Array(k).fill(0);
  const degree = new Array(k).fill(0);
  obs.forEach((o, p) => {
    const b = idx.get(o.base), q = idx.get(o.quote), wp = w[p];
    L[b][b] += wp; L[q][q] += wp;
    L[b][q] -= wp; L[q][b] -= wp;
    rhs[b] += wp * o.mu; rhs[q] -= wp * o.mu;
    degree[b]++; degree[q]++;
  });

  // Shift by J/k to kill the constant null space; the fitted DIFFERENCES are
  // untouched and the solution comes out satisfying sum(s) = 0.
  const M = L.map((row, i) => row.map((v, j) => v + 1 / k));
  const s = solve(M, rhs);
  const G = inverse(M);
  if (!s || !G) return { error: 'singular', currencies: null };

  // Residuals: what each pair did beyond what its two currency legs explain.
  let rssW = 0, tssW = 0;
  const muBarW = obs.reduce((acc, o, p) => acc + w[p] * o.mu, 0) / w.reduce((a, b) => a + b, 0);
  const residuals = obs.map((o, p) => {
    const fit = s[idx.get(o.base)] - s[idx.get(o.quote)];
    const e = o.mu - fit;
    rssW += w[p] * e * e;
    tssW += w[p] * (o.mu - muBarW) ** 2;
    return {
      pair: o.pair ?? `${o.base}${o.quote}`, base: o.base, quote: o.quote,
      mu: r6(o.mu), fitted: r6(fit), resid: r6(e),
      // Scaled by the SE of the DRIFT, not the daily vol — the question is whether
      // this pair's unexplained move is large against the noise in the estimate.
      residZ: haveSigma ? r4(e / seObs[p]) : null,
    };
  });

  // Dispersion: weighted RSS per degree of freedom. ~1 means the supplied sigmas
  // describe the observed scatter; >>1 means they are too small and the model SEs
  // below would be optimistic.
  //
  // TWO TRAPS HERE, both of which produced wrong numbers in a first draft:
  //
  // 1. dof can be ZERO OR NEGATIVE. With k currencies the fit spends k-1 degrees of
  //    freedom, so a universe of 2 pairs over 3 currencies has none left. The system
  //    then fits EXACTLY and rssW is not 0 but floating-point residue (~1e-34).
  //    Clamping dof to 1 and taking it at face value gave dispersion ~1e-34, a scale
  //    of ~1e-17, and every standard error collapsing to zero — a fit reporting
  //    perfect certainty precisely when it had no evidence at all. When dof < 1 the
  //    dispersion is simply not estimable and must be null, not small.
  // 2. The correction INFLATES ONLY. A dispersion below 1 says the observed scatter
  //    came in under what the sigmas predicted, which on a handful of degrees of
  //    freedom is far more likely to be luck than genuine precision — and shrinking
  //    an error bar on the strength of a lucky-tight fit is the wrong direction to be
  //    wrong in. So scale = max(1, sqrt(dispersion)), the usual conservative
  //    quasi-likelihood convention. Under-dispersion stays visible in `dispersion`
  //    for anyone who wants to read it.
  const dof = n - (k - 1);
  const dispersion = (haveSigma && dof >= 1) ? rssW / dof : null;
  const scale = dispersion != null ? Math.max(1, Math.sqrt(dispersion)) : 1;

  const currencies = {};
  ccys.forEach((c, i) => {
    // Var(s_hat) = G - J/k exactly, under correct inverse-variance weights.
    const v = G[i][i] - 1 / k;
    const seModel = v > 0 ? Math.sqrt(v) : null;
    const se = seModel == null ? null : seModel * scale;
    currencies[c] = {
      drift: r6(s[i]),
      se: se == null ? null : r6(se),
      seModel: seModel == null ? null : r6(seModel),
      t: se && se > 0 ? r4(s[i] / se) : null,
      nPairs: degree[i],
      thin: degree[i] < minPairs,
    };
  });

  const rank = ccys
    .map(c => ({ ccy: c, ...currencies[c] }))
    .sort((a, b) => b.drift - a.drift);

  return {
    currencies, rank, residuals,
    n, nCcy: k,
    weighting: haveSigma ? 'inverse-variance' : 'equal',
    dispersion: dispersion == null ? null : r4(dispersion),
    r2: tssW > 0 ? r4(1 - rssW / tssW) : null,
    // The relative-value quantity: strongest leg minus weakest. A desk expresses a
    // cross-sectional view on this spread, not on any single currency's level.
    spread: rank.length >= 2 ? r6(rank[0].drift - rank.at(-1).drift) : null,
    strongest: rank[0]?.ccy ?? null,
    weakest: rank.at(-1)?.ccy ?? null,
  };
}

/**
 * How much did pooling actually buy, for one pair?
 *
 * Compares the per-pair SE (`driftAnatomy`'s 1/sqrt(win), in mu units) against the
 * SE of the same drift rebuilt from its two currency legs. The ratio is the honest
 * statement of what the cross-section is worth on this universe — and it is a number
 * to CHECK, not to assume: legs sharing pairs are correlated, so the gain is always
 * less than the naive sqrt(nPairs).
 *
 *   pooledGain(fit, 'EUR', 'USD', sigmaPairPerDay, 14)
 *     -> { perPairSE, pooledSE, ratio, note }
 */
export function pooledGain(fit, base, quote, sigmaPerDay, win = 14) {
  if (!fit?.currencies) return null;
  const b = fit.currencies[base], q = fit.currencies[quote];
  if (!b || !q || b.se == null || q.se == null) return null;
  if (!Number.isFinite(sigmaPerDay) || !(sigmaPerDay > 0) || !(win >= 2)) return null;

  // Per-pair: SE(mu_hat) = sigma/sqrt(win), the Merton bound in mu units.
  const perPairSE = sigmaPerDay / Math.sqrt(win);
  // Pooled: Var(s_b - s_q) = Var(s_b) + Var(s_q) - 2Cov. The covariance is not
  // recoverable from the per-currency summary alone, so this is the CONSERVATIVE
  // zero-covariance bound; legs that share pairs are positively correlated, which
  // makes the true pooled SE smaller still.
  const pooledSE = Math.sqrt(b.se * b.se + q.se * q.se);
  return {
    perPairSE: r6(perPairSE),
    pooledSE: r6(pooledSE),
    ratio: r4(perPairSE / pooledSE),
    note: 'pooledSE ignores cross-leg covariance, so the true gain is at least this',
  };
}

const r4 = x => Math.round(x * 1e4) / 1e4 || 0;
const r6 = x => Math.round(x * 1e6) / 1e6 || 0;
