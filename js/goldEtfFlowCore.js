// js/goldEtfFlowCore.js: the cache and response rules of /api/gold-etf-flow (server.js _goldEtfFlowSeries), pure so they can be tested.
//
// Why this exists (2026-11-15): the route cached whatever it built for six hours, INCLUDING an empty or failed result, so one failed Yahoo call left the
// board reading "no history" until the cache expired, and nothing said why. The rules now are:
//   - a good day (today's point is held) is cached for six hours, as before: assets do not move intraday;
//   - an empty or failed try is cached for two minutes only, so the next visit tries again;
//   - the failure reason travels in the response ({ ok: false, error, reason, fetch }) and into the data-health row, in words.
export const OK_TTL_MS = 6 * 3600 * 1000;
export const RETRY_MS = 2 * 60 * 1000;

export const todayUtc = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** How long a built result may be reused. */
export const cacheTtlMs = haveToday => (haveToday ? OK_TTL_MS : RETRY_MS);

/** A short, secret-free reason from whatever was thrown (the fetcher's messages carry the HTTP status, e.g. 'Yahoo crumb HTTP 429'). */
export function reasonOf(e) {
  const m = String(e?.message ?? e ?? 'unknown error').replace(/\s+/g, ' ').replace(/crumb=[^&\s]+/gi, 'crumb=…').trim();
  return (m || 'unknown error').slice(0, 160);
}

/**
 * The fetch block carried in every response.
 *   haveToday  today's point is in the series; reason  why the last try failed (null when it did not); attemptedAt / okAt  epoch ms or null.
 */
export function fetchBlock({ haveToday, reason = null, attemptedAt = null, okAt = null, now = Date.now() } = {}) {
  const ok = !!haveToday;
  return {
    ok,
    reason: ok ? null : (reason ?? 'No point recorded for today yet (the first fetch has not run or has not finished).'),
    attemptedAt: attemptedAt ? new Date(attemptedAt).toISOString() : null,
    lastOkAt: okAt ? new Date(okAt).toISOString() : null,
    retryInSec: ok ? null : Math.max(0, Math.round((RETRY_MS - (attemptedAt ? now - attemptedAt : 0)) / 1000)),
  };
}

/**
 * The route's body. ok:true whenever there is any history to draw (a stale series still carries fetch.reason); ok:false only when there is NOTHING
 * and the last try failed, so a consumer that checks ok shows the reason instead of an empty card.
 */
export function routeBody(data) {
  const series = Array.isArray(data?.series) ? data.series : [];
  const f = data?.fetch ?? fetchBlock({ haveToday: false });
  if (series.length || f.ok) return { ok: true, ...data };
  return { ok: false, error: f.reason, reason: f.reason, ...data };
}

/** The data-health row's label suffix and its 'last good' time. */
export function healthParts(status, data) {
  const reason = data?.fetch && !data.fetch.ok ? data.fetch.reason : (status?.lastError ?? null);
  const lastIso = status?.lastOkAt ? new Date(status.lastOkAt).toISOString() : (data?.asOf ? `${data.asOf}T12:00:00.000Z` : null);
  return { suffix: reason ? ` (${String(reason).slice(0, 120)})` : '', lastIso };
}
