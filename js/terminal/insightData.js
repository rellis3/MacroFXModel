// js/terminal/insightData.js: the one fetch the Insight boards share. /api/drill-series is the daily market bundle ({ dates, series }, ~6 years, completed
// closes, rebuilt once a day), about 0.8 MB, so it is fetched once and kept for ten minutes; the boards that read it (what is unusual, the cross-asset
// matrix, the gold board) all take the same copy. A failed fetch is not cached. Pure apart from the injected fetch and clock.

const TTL = 10 * 60_000;
let held = null, inflight = null;

/** The bundle, or { ok: false, error } in words. fetchJson(url) resolves to parsed JSON. force skips the held copy. */
export async function getBundle({ fetchJson, now = () => Date.now(), force = false } = {}) {
  if (!force && held && now() - held.at < TTL) return held.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const j = await fetchJson('/api/drill-series');
      if (!j?.ok || !Array.isArray(j.dates) || !j.series || !j.dates.length) return { ok: false, error: j?.error ? String(j.error) : 'The daily market bundle came back empty.' };
      held = { at: now(), data: j };
      return j;
    } catch (e) { return { ok: false, error: `Could not load the daily market bundle (${e?.message ?? e}).` }; }
    finally { inflight = null; }
  })();
  return inflight;
}
/** Forget the held copy (tests, and a manual refresh). */
export const forgetBundle = () => { held = null; inflight = null; };

// The eight extra FRED series the Spreads & ratios board lays beside the bundle (/api/spread-extras, js/spreadExtrasRoutes.js). A few KB per series, held for ten
// minutes like the bundle; a failure is not held and comes back as { ok: false } so the board still draws every pair that does not need an extra.
let heldX = null, inflightX = null;
export async function getExtras({ fetchJson, now = () => Date.now(), force = false } = {}) {
  if (!force && heldX && now() - heldX.at < TTL) return heldX.data;
  if (inflightX) return inflightX;
  inflightX = (async () => {
    try {
      const j = await fetchJson('/api/spread-extras');
      if (!j?.ok || !j.series) return { ok: false, error: j?.error ? String(j.error) : 'The extra series came back empty.' };
      heldX = { at: now(), data: j }; return j;
    } catch (e) { return { ok: false, error: `Could not load the extra series (${e?.message ?? e}).` }; }
    finally { inflightX = null; }
  })();
  return inflightX;
}
export const forgetExtras = () => { heldX = null; inflightX = null; };
