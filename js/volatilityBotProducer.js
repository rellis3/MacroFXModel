/**
 * Volatility Bot — plan PRODUCER (Slice 2).
 *
 * Builds the frozen `volatility_bot_plan` artifact from the locked per-line book
 * + today's live per-pair σ/open, and writes it to KV. The Python bot reads that
 * artifact each state-refresh (PYTHON_LEGO.md "ship it a file"), never calling
 * this in its tight loop.
 *
 * σ is computed the SAME way the book was learned — `volSigmaSeries` (the
 * volBacktestEngine path) + `computeBands` (inside buildVolatilityPlan) — NOT the
 * live `volForecast.js` forecaster, whose correction constants are a flagged
 * drift (LEGO_MODULES §2 P0 #1). Same math source ⇒ the live lines match the
 * backtested lines, which is the whole point of the bot.
 *
 * Network/IO is INJECTED (getBook/fetchD1/sigmaSeries/kvPut) so the core is
 * offline-testable; the server route wires the real OANDA + KV dependencies.
 */

import { buildVolatilityPlan } from './volatilityBotPlan.js';
import { instrument as _instrument, pipSize as _pipSize } from './instrumentRegistry.js';

// Default symbol resolver: the canonical instrument registry (fail-loud).
function defaultResolve(pair) {
  const inst = _instrument(pair);                 // throws on unknown — never silently default
  return { oanda: inst.oanda, assetClass: inst.assetClass, pip: _pipSize(pair) };
}

// Refresh the plan and persist it to KV. Returns the plan (with generatedAt).
export async function refreshVolatilityPlan({
  getBook, fetchD1, sigmaSeries, kvPut, fetchSessionOpen = null,
  resolveInstrument = defaultResolve, buildPlan = buildVolatilityPlan,
  horizon = 'daily', count = 400,
  now = () => new Date().toISOString(), stamp = () => Date.now(),
  onLog = () => {},
} = {}) {
  if ([getBook, fetchD1, sigmaSeries, kvPut].some(f => typeof f !== 'function'))
    throw new Error('refreshVolatilityPlan: getBook/fetchD1/sigmaSeries/kvPut are required functions');

  const book = await getBook(horizon);
  if (!book || !Array.isArray(book.survivors?.pairs) || !book.survivors.pairs.length)
    throw new Error('no per-line book / survivor universe — build the book first');

  const volByPair = {};
  const seenOanda = new Set();          // collapse survivors that are the SAME instrument
  let ok = 0, fail = 0;
  for (const pair of book.survivors.pairs) {
    try {
      const inst = resolveInstrument(pair);
      if (!inst?.oanda) { onLog(`${pair}: no OANDA symbol — skipped`); fail++; continue; }
      // The survivor list can carry two names for one instrument (e.g. 'us30' AND
      // 'dow', 'spx' AND 'spx500' — short key + long alias). They resolve to the
      // same OANDA symbol, so without this the universe would hold the instrument
      // twice and the bot would open DOUBLE exposure on it. Keep the first, drop
      // the rest.
      if (seenOanda.has(inst.oanda)) { onLog(`${pair}: duplicate of ${inst.oanda} — skipped`); continue; }
      const bars = await fetchD1(inst.oanda, count);
      if (!bars?.length) { onLog(`${pair}: no D1 bars — skipped`); fail++; continue; }
      const sig = sigmaSeries(bars, inst.assetClass);
      // volSigmaSeries returns a Float64Array — Array.isArray() is FALSE for typed
      // arrays, so `sig` itself (not its last element) would leak through and
      // `sigma > 0` would be false, silently skipping EVERY pair. Accept both
      // plain arrays and typed arrays; treat anything else as a scalar.
      const isSeries = Array.isArray(sig) || ArrayBuffer.isView(sig);
      const sigma = isSeries ? sig[sig.length - 1] : sig;               // today's daily σ (frac)
      // OPEN must be the MIDNIGHT-EUROPE/LONDON session open (the bands hang off it,
      // and the book's sessions are London days). `fetchD1`'s last bar opens at
      // 22:00 UTC and drops the forming candle, so it's a prior session's open —
      // the stale value the bot showed (gold 4018.65 vs the real ~4013.x). Prefer
      // the London-aligned session open; fall back to the D1 open only if it's
      // unavailable (keeps the producer working offline / if the call fails).
      let open = null;
      if (typeof fetchSessionOpen === 'function') {
        try { open = await fetchSessionOpen(inst.oanda); }
        catch (e) { onLog(`${pair}: session-open fetch failed (${e.message}) — falling back to D1 open`); }
      }
      if (!(open > 0)) open = bars[bars.length - 1]?.open;              // fallback: D1 open (22:00 UTC)
      if (!(sigma > 0) || !(open > 0)) {
        onLog(`${pair}: bad σ/open — skipped (σ=${sigma}, open=${open}, bars=${bars.length})`); fail++; continue;
      }
      // Key by the lowercased pair: buildVolatilityPlan lowercases its survivor
      // list before looking up volByPair, so a survivor name that isn't already
      // lowercase (e.g. an upper-case R2 parquet name) would otherwise miss the
      // lookup and silently drop EVERY pair → an empty universe.
      volByPair[String(pair).toLowerCase()] = { open, sigma, assetClass: inst.assetClass || 'fx', pip: inst.pip ?? null };
      seenOanda.add(inst.oanda);          // first priced wins; later aliases of it are skipped
      ok++;
    } catch (e) { onLog(`${pair}: ${e.message}`); fail++; }
  }

  const plan = { generatedAt: now(), source: 'per-line book', horizonScale: horizon, ...buildPlan(book, volByPair) };
  // Refuse to publish an empty universe. A 0-pair plan is never tradeable and
  // always means pricing failed (OANDA unreachable at the moment, or survivor
  // names that didn't resolve) — writing it would silently strand the bot
  // ("0 pairs synced") AND clobber a previously-good plan. Throw instead so the
  // failure is visible in the server log and any prior plan is left intact.
  if (!plan.universe.length)
    throw new Error(`volatility plan has 0 tradeable pairs (${ok} priced, ${fail} skipped) — not publishing an empty plan; check OANDA reachability and survivor pair names`);
  await kvPut('volatility_bot_plan', JSON.stringify({ data: plan, timestamp: stamp() }));
  onLog(`plan written: ${plan.universe.length} pairs live (${ok} priced, ${fail} skipped)`);
  return plan;
}
