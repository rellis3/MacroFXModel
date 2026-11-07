/**
 * Anthropic's own daily cost figures (the Console's Cost page), read from the Admin API's cost report, next to the
 * app's own spend ledger (js/aiSpend.js).
 *
 * GET https://api.anthropic.com/v1/organizations/cost_report?starting_at=...&ending_at=...&group_by[]=description
 * Needs an Admin API key (ANTHROPIC_ADMIN_KEY). Anthropic: "The Admin API is unavailable for individual accounts";
 * the account must be set up as an organization in the Claude Console first. Amounts are USD in cents, as decimal
 * strings ("123.45" = $1.23). Daily buckets only, at most 31 a page. Data lands within about 5 minutes of a call.
 * Polling once a minute is allowed; the server caches for 5.
 *
 * Pure: no fetch, no clock. server.js does the request.
 */

/** The Admin API's cost report (not a model call: it reads the bill). */
export const COST_REPORT_URL = 'https://api.anthropic.com/v1/organizations/cost_report';

/** The query string for the last `days` UTC days up to and including the day of `nowMs`. */
export function costReportQuery(nowMs, days = 14) {
  const end = new Date(nowMs); end.setUTCHours(0, 0, 0, 0); end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - Math.max(1, Math.min(31, days)));
  return `starting_at=${start.toISOString().replace('.000', '')}&ending_at=${end.toISOString().replace('.000', '')}&group_by[]=description&limit=31`;
}

/**
 * One page or several (concatenate `data`) into [{ day, usd, byModel: { model: usd }, byKind: { kind: usd } }],
 * oldest first. kind is the token type in plain words (input, output, cache read, cache write) or the cost type.
 */
export function parseCostReport(pages) {
  const buckets = (Array.isArray(pages) ? pages : [pages]).flatMap(p => p?.data ?? []);
  const KIND = { uncached_input_tokens: 'input', output_tokens: 'output', cache_read_input_tokens: 'cache read',
    'cache_creation.ephemeral_5m_input_tokens': 'cache write', 'cache_creation.ephemeral_1h_input_tokens': 'cache write' };
  const days = new Map();
  for (const b of buckets) {
    const day = String(b?.starting_at ?? '').slice(0, 10);
    if (!day) continue;
    const d = days.get(day) ?? { day, usd: 0, byModel: {}, byKind: {} };
    for (const r of b.results ?? []) {
      const usd = (Number(r?.amount) || 0) / 100;
      d.usd += usd;
      const m = r?.model ?? (r?.cost_type && r.cost_type !== 'tokens' ? r.cost_type.replace(/_/g, ' ') : 'other');
      d.byModel[m] = (d.byModel[m] ?? 0) + usd;
      const k = KIND[r?.token_type] ?? (r?.cost_type ?? 'other');
      d.byKind[k] = (d.byKind[k] ?? 0) + usd;
    }
    days.set(day, d);
  }
  const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(4)]));
  return [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1))
    .map(d => ({ day: d.day, usd: +d.usd.toFixed(4), byModel: round(d.byModel), byKind: round(d.byKind) }));
}

/**
 * Is a day unusual? Against the median of the other days in the window (days with spend only): 'high' at 2x or more,
 * 'very high' at 4x or more and at least $5. Returns null when there are fewer than 3 other days to compare with.
 */
export function dayFlag(usd, others) {
  const xs = others.filter(v => v > 0).sort((a, b) => a - b);
  if (xs.length < 3) return null;
  const med = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  if (!(med > 0)) return null;
  const x = usd / med;
  return { median: +med.toFixed(4), times: +x.toFixed(2), level: x >= 4 && usd >= 5 ? 'very high' : x >= 2 ? 'high' : 'normal' };
}
