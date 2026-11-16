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
export function fetchBlock({ haveToday, reason = null, attemptedAt = null, okAt = null, source = null, now = Date.now() } = {}) {
  const ok = !!haveToday;
  return {
    ok,
    source: source ?? null,
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
  if (series.length || f.ok || data?.tonnes) return { ok: true, ...data };   // tonnes alone (one fund answered) is still something to draw
  return { ok: false, error: f.reason, reason: f.reason, ...data };
}

/** The data-health row's label suffix and its 'last good' time. */
export function healthParts(status, data) {
  const reason = data?.fetch && !data.fetch.ok ? data.fetch.reason : (status?.lastError ?? null);
  const lastIso = status?.lastOkAt ? new Date(status.lastOkAt).toISOString() : (data?.asOf ? `${data.asOf}T12:00:00.000Z` : null);
  const via = data?.fetch?.source ? Object.entries(data.fetch.source).map(([k, v]) => `${k} ${v}`).join(', ') : '';
  return { suffix: reason ? ` (${String(reason).slice(0, 120)})` : (via ? ` (via ${via})` : ''), lastIso };
}

// ── tonnes held: the series a flow is read from (a flow is the change in tonnes; dollars also move with the gold price) ────────────────────────────────────────
/** series [{ date, gld?, iau? }] ascending. gld = [{ date, tonnes }] (SPDR's archive, any length), iau = { date, tonnes } (today's read). Returns the merged series, last 1000 rows. */
export function mergeTonnes(series, { gld = [], iau = null, keep = 800 } = {}) {
  const by = new Map((Array.isArray(series) ? series : []).filter(r => r?.date).map(r => [r.date, { ...r }]));
  for (const g of gld.slice(-keep)) if (g?.date && g.tonnes > 0) by.set(g.date, { ...(by.get(g.date) ?? { date: g.date }), gld: g.tonnes });
  if (iau?.date && iau.tonnes > 0) by.set(iau.date, { ...(by.get(iau.date) ?? { date: iau.date }), iau: iau.tonnes });
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-1000);
}
const r2 = v => Math.round(v * 100) / 100;
function deltasOf(rows, pick) {
  const v = rows.map(pick).filter(x => Number.isFinite(x)), out = {};
  for (const n of [1, 5, 20]) out[n] = v.length > n ? r2(v[v.length - 1] - v[v.length - 1 - n]) : null;
  return out;
}
/** The response block: the latest read of each fund, their sum where both exist on one date, and the change in tonnes over 1, 5 and 20 reads. */
export function tonnesBlock(series, keep = 260) {
  const rows = Array.isArray(series) ? series : [];
  const lastG = [...rows].reverse().find(r => Number.isFinite(r.gld)), lastI = [...rows].reverse().find(r => Number.isFinite(r.iau));
  const both = rows.filter(r => Number.isFinite(r.gld) && Number.isFinite(r.iau)).map(r => ({ date: r.date, total: r16(r.gld + r.iau) }));
  if (!lastG && !lastI) return null;
  return {
    unit: 'tonnes', note: 'tonnes of gold held in the trusts; a flow is the change in tonnes, not the change in dollars (dollars also move with the gold price)',
    asOf: [lastG?.date, lastI?.date].filter(Boolean).sort().pop() ?? null,
    last: { gld: lastG ? { date: lastG.date, tonnes: lastG.gld } : null, iau: lastI ? { date: lastI.date, tonnes: lastI.iau } : null, total: both.length ? both[both.length - 1] : null },
    deltas: { gld: deltasOf(rows, r => r.gld), total: deltasOf(both, r => r.total) },
    series: rows.slice(-keep).map(r => ({ date: r.date, gld: r.gld ?? null, iau: r.iau ?? null })),
  };
}
const r16 = v => Math.round(v * 100) / 100;
