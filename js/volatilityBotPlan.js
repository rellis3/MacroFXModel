/**
 * Volatility Bot — the frozen "plan" the live bot consumes (Category-A contract).
 *
 * PYTHON_LEGO.md doctrine: the trading bot must NOT re-implement the strategy
 * math or call live dashboard endpoints inside its loop — it consumes the frozen
 * artifact the JS offline learner produces (here, the per-line book). This module
 * turns the stored per-line book + today's live per-pair vol into a compact,
 * self-contained plan the Python `volatility_bot` reads each state-refresh:
 *
 *   { horizon, conditions, marginPct, survivorMargin,
 *     universe: [pair,...],                       // survivor pairs only
 *     policy:   { cell: { decision } },            // fade/follow cells (skips dropped)
 *     pairs:    { pair: { open, sigma, assetClass, pip, hl50, hl75, ocMed, oc75 } } }
 *
 * The band FRACTIONS are computed here with the canonical `computeBands` brick —
 * so the bot never owns the vol math. The only thing the bot computes live is the
 * dynamic-HL line geometry (trivial arithmetic off the fractions) + the
 * approach-velocity bucket (one golden-tested port) to pick the policy cell.
 *
 * Pure + synthetic-testable (no network): the live σ/open per pair are passed in
 * via `volByPair`; the producer route fetches those (fetchD1) and stamps time.
 */

import { computeBands } from './forecastCore.js';

// Build the plan from a stored per-line book + live per-pair vol.
//   book      — the object getPerLineBook() returns (policy, survivors, config…)
//   volByPair — { pair: { open, sigma, assetClass, pip } } today's daily σ (frac),
//               session open, asset class and pip size for each pair.
// Returns the plan object (caller stamps generatedAt). Only survivor pairs that
// have usable vol are included; only tradeable (non-skip) policy cells are kept.
export function buildVolatilityPlan(book, volByPair = {}, { universe } = {}) {
  if (!book || typeof book !== 'object') throw new Error('buildVolatilityPlan: book required');
  const pairsWanted = Array.isArray(universe) && universe.length
    ? universe.map(p => String(p).toLowerCase())
    : (book.survivors?.pairs || []).map(p => String(p).toLowerCase());

  // Trim the policy to the cells the bot can act on (fade/follow) — a touched
  // cell absent from this map is a skip by construction, so the bot does nothing.
  const policy = {};
  for (const [cell, p] of Object.entries(book.policy || {})) {
    if (p && p.decision && p.decision !== 'skip') policy[cell] = { decision: p.decision };
  }

  const pairs = {};
  for (const pair of pairsWanted) {
    const v = volByPair[pair];
    if (!v || !(v.open > 0) || !(v.sigma > 0)) continue;        // no live vol → not tradeable today
    const assetClass = v.assetClass || 'fx';
    const b = computeBands(v.open, v.sigma, assetClass);        // canonical vol math (never ported)
    pairs[pair] = {
      open: +v.open.toFixed(6), sigma: +v.sigma.toFixed(8),
      assetClass, pip: v.pip ?? null,
      hl50: +b.hl50.toFixed(8), hl75: +b.hl75.toFixed(8),
      ocMed: +b.ocMed.toFixed(8), oc75: +b.oc75.toFixed(8),
    };
  }

  return {
    horizon: book.horizon || 'daily',
    conditions: book.conditions || ['approachVel'],
    marginPct: book.marginPct ?? 0.01,
    survivorMargin: book.survivorMargin ?? 0.5,
    universe: Object.keys(pairs),                               // only pairs with a live plan today
    policy,
    pairs,
  };
}
