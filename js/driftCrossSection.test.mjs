import test from 'node:test';
import assert from 'node:assert/strict';
import { decomposeCurrencyDrift, pooledGain } from './driftCrossSection.js';

// The real G8 universe this repo caches, minus gold — the shape the fit must handle.
const UNIVERSE = [
  ['EUR','USD'],['GBP','USD'],['AUD','USD'],['NZD','USD'],['USD','JPY'],['USD','CAD'],['USD','CHF'],
  ['EUR','GBP'],['EUR','JPY'],['EUR','CHF'],['EUR','CAD'],['EUR','AUD'],['EUR','NZD'],
  ['GBP','JPY'],['GBP','CHF'],['GBP','CAD'],['GBP','AUD'],['GBP','NZD'],
  ['AUD','JPY'],['AUD','CHF'],['AUD','CAD'],['AUD','NZD'],
  ['CAD','JPY'],['CHF','JPY'],['NZD','JPY'],
];

/** Build observations from a KNOWN set of currency drifts, so the fit has a truth
 *  to be checked against. `noise` is added per pair with a deterministic generator. */
function synth(truth, { noise = 0, sigma = null, seed = 5 } = {}) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5;
  return UNIVERSE.map(([b, q]) => ({
    pair: b + q, base: b, quote: q,
    mu: (truth[b] ?? 0) - (truth[q] ?? 0) + (noise ? rnd() * noise : 0),
    ...(sigma ? { sigma: typeof sigma === 'function' ? sigma(b, q) : sigma } : {}),
  }));
}

// ── Identification and recovery ──────────────────────────────────────────────

test('recovers known currency drifts exactly when there is no noise', () => {
  const truth = { USD: 0.30, EUR: -0.10, GBP: -0.05, JPY: -0.20, AUD: 0.05, NZD: 0.02, CAD: -0.01, CHF: -0.01 };
  // Re-centre the truth so it satisfies the fit's own sum(s)=0 normalisation.
  const mean = Object.values(truth).reduce((a, b) => a + b, 0) / 8;
  const centred = Object.fromEntries(Object.entries(truth).map(([c, v]) => [c, v - mean]));

  const fit = decomposeCurrencyDrift(synth(centred));
  assert.ok(fit && !fit.error, JSON.stringify(fit?.error));
  for (const [c, v] of Object.entries(centred)) {
    assert.ok(Math.abs(fit.currencies[c].drift - v) < 1e-8,
      `${c}: fitted ${fit.currencies[c].drift} vs true ${v}`);
  }
});

test('the solution satisfies the sum(s)=0 normalisation', () => {
  const fit = decomposeCurrencyDrift(synth({ USD: 0.4, EUR: -0.2, JPY: -0.1 }, { noise: 0.05 }));
  const total = Object.values(fit.currencies).reduce((a, c) => a + c.drift, 0);
  assert.ok(Math.abs(total) < 1e-9, `sum = ${total}`);
});

test('only DIFFERENCES are identified — shifting every truth by a constant is a no-op', () => {
  // EVERY currency in the universe must be shifted, including the ones defaulting to
  // zero — shifting only the three named ones is not a uniform shift at all, and an
  // earlier draft of this test failed for that reason rather than finding a bug.
  const ALL = [...new Set(UNIVERSE.flat())];
  const base = Object.fromEntries(ALL.map(c => [c, 0]));
  Object.assign(base, { USD: 0.30, EUR: -0.10, JPY: -0.20 });
  const shifted = Object.fromEntries(Object.entries(base).map(([c, v]) => [c, v + 7.5]));
  const a = decomposeCurrencyDrift(synth(base));
  const b = decomposeCurrencyDrift(synth(shifted));
  for (const c of Object.keys(a.currencies)) {
    assert.ok(Math.abs(a.currencies[c].drift - b.currencies[c].drift) < 1e-9,
      `${c} moved: ${a.currencies[c].drift} vs ${b.currencies[c].drift}`);
  }
});

test('fitted pair drift reconstructs the input when the model is exact', () => {
  const fit = decomposeCurrencyDrift(synth({ USD: 0.25, EUR: -0.15, GBP: 0.05 }));
  for (const r of fit.residuals) assert.ok(Math.abs(r.resid) < 1e-8, `${r.pair} resid ${r.resid}`);
  assert.ok(fit.r2 > 0.999, `r2 = ${fit.r2}`);
});

// ── The reason the module exists: pooling beats the per-pair read ─────────────

test('a currency leg is estimated from many pairs, so its SE beats the per-pair SE', () => {
  const sigma = 0.9, win = 14;                         // %/day, typical major
  const fit = decomposeCurrencyDrift(
    synth({ USD: 0.3, EUR: -0.1 }, { noise: 0.4, sigma }), { win });
  // Every G8 currency here appears in 5+ pairs (CAD and CHF are the thinnest at 5).
  const perPairSE = sigma / Math.sqrt(win);
  for (const c of Object.keys(fit.currencies)) {
    assert.ok(fit.currencies[c].nPairs >= 5, `${c} only in ${fit.currencies[c].nPairs} pairs`);
    assert.ok(fit.currencies[c].se < perPairSE,
      `${c} SE ${fit.currencies[c].se} not below the per-pair SE ${perPairSE.toFixed(4)}`);
  }
  // The headline claim: pooling across the cross-section beats the single-pair read.
  const g = pooledGain(fit, 'EUR', 'USD', sigma, win);
  assert.ok(g.ratio > 1.4, `pooling should tighten the estimate, ratio = ${g.ratio}`);
});

// The units bug this module shipped with in draft: weighting by the raw daily vol
// instead of the SE of the drift inflated every currency SE by sqrt(win), which
// inverted the module's whole claim (gain came out 0.57x instead of ~1.8x). The
// fitted DRIFTS are unaffected — a common weight factor cancels — so only the SEs
// catch it.
test('win scales the standard errors but leaves the fitted drifts untouched', () => {
  const rows = synth({ USD: 0.3, EUR: -0.1 }, { noise: 0.4, sigma: 0.9 });
  const w1 = decomposeCurrencyDrift(rows, { win: 1 });
  const w14 = decomposeCurrencyDrift(rows, { win: 14 });
  for (const c of Object.keys(w1.currencies)) {
    assert.ok(Math.abs(w1.currencies[c].drift - w14.currencies[c].drift) < 1e-9,
      `${c} drift moved with win`);
    const ratio = w1.currencies[c].seModel / w14.currencies[c].seModel;
    assert.ok(Math.abs(ratio - Math.sqrt(14)) < 0.01,
      `${c} SE should scale by sqrt(14); got ${ratio.toFixed(3)}`);
  }
});

test('more pairs per currency tightens its standard error', () => {
  const wide = decomposeCurrencyDrift(synth({ USD: 0.2 }, { sigma: 1 }));
  // A minimal chain: each currency touches only one or two pairs.
  const thin = decomposeCurrencyDrift([
    { pair: 'EURUSD', base: 'EUR', quote: 'USD', mu: 0.1, sigma: 1 },
    { pair: 'USDJPY', base: 'USD', quote: 'JPY', mu: 0.1, sigma: 1 },
  ]);
  assert.ok(wide.currencies.USD.se < thin.currencies.USD.se,
    `${wide.currencies.USD.se} should be tighter than ${thin.currencies.USD.se}`);
});

// ── Weighting ────────────────────────────────────────────────────────────────

test('inverse-variance weighting is used only when every row has a sigma', () => {
  assert.equal(decomposeCurrencyDrift(synth({ USD: 0.2 }, { sigma: 1 })).weighting, 'inverse-variance');
  assert.equal(decomposeCurrencyDrift(synth({ USD: 0.2 })).weighting, 'equal');
  // One missing sigma drops the whole fit to equal weights rather than treating the
  // unweighted row as infinitely precise.
  const mixed = synth({ USD: 0.2 }, { sigma: 1 });
  delete mixed[3].sigma;
  assert.equal(decomposeCurrencyDrift(mixed).weighting, 'equal');
});

test('a noisy pair is down-weighted: its outlier pulls the fit less', () => {
  const truth = { USD: 0.20, EUR: -0.05 };
  const clean = synth(truth, { sigma: 1 });
  const contaminate = rows => rows.map(r =>
    r.pair === 'EURUSD' ? { ...r, mu: r.mu + 3 } : r);      // a big rogue move

  const equalW = decomposeCurrencyDrift(contaminate(clean).map(({ sigma, ...r }) => r));
  const noisyFlagged = decomposeCurrencyDrift(
    contaminate(clean).map(r => r.pair === 'EURUSD' ? { ...r, sigma: 10 } : r));

  const pull = f => Math.abs(f.currencies.EUR.drift - f.currencies.USD.drift - (truth.EUR - truth.USD));
  assert.ok(pull(noisyFlagged) < pull(equalW),
    `declaring the pair noisy should reduce its pull: ${pull(noisyFlagged)} vs ${pull(equalW)}`);
});

test('dispersion flags sigmas that are too small for the observed scatter', () => {
  // Scatter of ~0.4 declared as sigma 0.02 -> dispersion should be far above 1.
  const bad = decomposeCurrencyDrift(synth({ USD: 0.2 }, { noise: 0.4, sigma: 0.02 }));
  assert.ok(bad.dispersion > 5, `dispersion = ${bad.dispersion}`);
  // …and the correction makes the reported SE wider than the raw model SE.
  const c = bad.currencies.USD;
  assert.ok(c.se > c.seModel, `${c.se} should exceed ${c.seModel}`);
});

// Regression: an exactly-determined system fits perfectly, so weighted RSS is
// floating-point residue rather than a real zero. Treating that as a dispersion
// estimate collapsed every SE to ~1e-17 — a fit claiming perfect certainty exactly
// where it had no degrees of freedom left to justify any.
test('an exactly-determined fit reports no dispersion, not a zero standard error', () => {
  const fit = decomposeCurrencyDrift([
    { pair: 'EURUSD', base: 'EUR', quote: 'USD', mu: 0.1, sigma: 1 },
    { pair: 'USDJPY', base: 'USD', quote: 'JPY', mu: 0.1, sigma: 1 },
  ]);                                        // n=2, k=3 -> dof = 0
  assert.equal(fit.dispersion, null, 'dispersion is not estimable with zero dof');
  for (const [c, v] of Object.entries(fit.currencies)) {
    assert.ok(v.se > 0.1, `${c} SE collapsed to ${v.se}`);
    assert.equal(v.se, v.seModel, `${c}: no correction should be applied without dof`);
    assert.ok(Number.isFinite(v.t) && Math.abs(v.t) < 10, `${c} t exploded to ${v.t}`);
  }
});

test('the dispersion correction inflates but never shrinks', () => {
  // Scatter well under the declared sigma -> dispersion < 1, but SEs must not shrink.
  const fit = decomposeCurrencyDrift(synth({ USD: 0.2 }, { noise: 0.001, sigma: 5 }));
  assert.ok(fit.dispersion < 1, `dispersion = ${fit.dispersion}`);
  for (const [c, v] of Object.entries(fit.currencies)) {
    assert.equal(v.se, v.seModel, `${c}: under-dispersion must not tighten the SE`);
  }
});

test('dispersion sits near 1 when the sigmas describe the scatter', () => {
  const noise = 0.3;
  // Uniform noise on [-noise/2, noise/2] has sd = noise/sqrt(12).
  const fit = decomposeCurrencyDrift(synth({ USD: 0.2 }, { noise, sigma: noise / Math.sqrt(12) }));
  assert.ok(fit.dispersion > 0.3 && fit.dispersion < 3, `dispersion = ${fit.dispersion}`);
});

// ── Residuals ────────────────────────────────────────────────────────────────

test('a pair-specific move lands in that pair residual, not in the currency legs', () => {
  const truth = { USD: 0.2, EUR: -0.1 };
  const rows = synth(truth, { sigma: 1 }).map(r =>
    r.pair === 'EURCHF' ? { ...r, mu: r.mu - 2.0 } : r);      // an SNB-shaped shock
  const fit = decomposeCurrencyDrift(rows);
  const byPair = Object.fromEntries(fit.residuals.map(r => [r.pair, r]));
  const worst = fit.residuals.slice().sort((a, b) => Math.abs(b.resid) - Math.abs(a.resid))[0];
  assert.equal(worst.pair, 'EURCHF', `largest residual was ${worst.pair}`);
  assert.ok(Math.abs(byPair.EURCHF.residZ) > 1, `residZ = ${byPair.EURCHF.residZ}`);
});

// ── Refusals and edges ───────────────────────────────────────────────────────

test('a disconnected universe is refused, not silently fitted', () => {
  const fit = decomposeCurrencyDrift([
    { pair: 'EURUSD', base: 'EUR', quote: 'USD', mu: 0.1 },
    { pair: 'AUDNZD', base: 'AUD', quote: 'NZD', mu: 0.2 },   // no link to EUR/USD
  ]);
  assert.equal(fit.error, 'disconnected');
  assert.equal(fit.components, 2);
  assert.equal(fit.currencies, null);
});

test('a two-currency universe is identifiable and splits the move symmetrically', () => {
  const fit = decomposeCurrencyDrift([{ pair: 'EURUSD', base: 'EUR', quote: 'USD', mu: 0.4 }]);
  assert.ok(!fit.error);
  assert.ok(Math.abs(fit.currencies.EUR.drift - 0.2) < 1e-9, fit.currencies.EUR.drift);
  assert.ok(Math.abs(fit.currencies.USD.drift + 0.2) < 1e-9, fit.currencies.USD.drift);
});

test('thin currencies are flagged rather than dropped', () => {
  const fit = decomposeCurrencyDrift([
    { pair: 'EURUSD', base: 'EUR', quote: 'USD', mu: 0.1 },
    { pair: 'GBPUSD', base: 'GBP', quote: 'USD', mu: 0.2 },
    { pair: 'EURGBP', base: 'EUR', quote: 'GBP', mu: -0.1 },
    { pair: 'USDTRY', base: 'USD', quote: 'TRY', mu: 2.0 },   // TRY seen once
  ]);
  assert.equal(fit.currencies.TRY.thin, true);
  assert.equal(fit.currencies.TRY.nPairs, 1);
  assert.equal(fit.currencies.USD.thin, false);
});

test('rank is ordered strongest-first and spread matches its endpoints', () => {
  const fit = decomposeCurrencyDrift(synth({ USD: 0.5, EUR: -0.3, JPY: -0.4 }, { noise: 0.02 }));
  for (let i = 1; i < fit.rank.length; i++) {
    assert.ok(fit.rank[i - 1].drift >= fit.rank[i].drift, 'rank not sorted');
  }
  assert.ok(Math.abs(fit.spread - (fit.rank[0].drift - fit.rank.at(-1).drift)) < 1e-9);
  assert.equal(fit.strongest, fit.rank[0].ccy);
  assert.equal(fit.weakest, fit.rank.at(-1).ccy);
});

test('gold slots in as just another leg against USD', () => {
  const rows = [...synth({ USD: 0.2, EUR: -0.1 }, { sigma: 0.9 }),
                { pair: 'XAUUSD', base: 'XAU', quote: 'USD', mu: 1.4, sigma: 1.6 }];
  const fit = decomposeCurrencyDrift(rows);
  assert.ok(!fit.error);
  assert.equal(fit.currencies.XAU.nPairs, 1);
  assert.equal(fit.currencies.XAU.thin, true);
  assert.equal(fit.strongest, 'XAU', 'a +1.4%/day leg should top the ranking');
});

test('degenerate input returns null rather than throwing', () => {
  assert.equal(decomposeCurrencyDrift([]), null);
  assert.equal(decomposeCurrencyDrift(null), null);
  assert.equal(decomposeCurrencyDrift([{ base: 'EUR', quote: 'EUR', mu: 1 }]), null);
  assert.equal(decomposeCurrencyDrift([{ base: 'EUR', quote: 'USD', mu: NaN }]), null);
});

test('pooledGain refuses unusable input rather than inventing a ratio', () => {
  const fit = decomposeCurrencyDrift(synth({ USD: 0.2 }, { sigma: 1 }));
  assert.equal(pooledGain(fit, 'EUR', 'ZZZ', 0.9, 14), null);
  assert.equal(pooledGain(fit, 'EUR', 'USD', 0, 14), null);
  assert.equal(pooledGain(null, 'EUR', 'USD', 0.9, 14), null);
});
