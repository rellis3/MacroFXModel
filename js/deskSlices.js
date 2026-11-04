/**
 * Hand-written slices: what each feed hands its analyst, cut from the payload the Desk Pack saved.
 *
 * WHY. The first Railway pack (2026-11-03, 84 of 107 feeds usable) showed the generic cut wasted most of each
 * analyst's budget on series, history arrays, equity curves and document diff segments: vol-forecast alone was
 * 210 KB, with 70 numbers per instrument of which a dozen matter for a morning read. A slice keeps the fields a
 * desk analyst would read and drops the rest, so the budget goes on substance and all 51 instruments fit.
 *
 * Every feed without its own slice goes through `slimDefault`, which drops the known noise keys and shortens
 * arrays and strings. A slice never invents or computes a number: it only selects.
 *
 * Pure. Tested in js/deskSlices.test.mjs. Built from the payload shapes in the 2026-11-03 Railway pack; if a route
 * changes shape, its slice returns what it can find and `slimDefault` covers the rest.
 */

// Keys that are bulk, not substance, wherever they appear.
const DROP = new Set(['series', 'history', 'equity', 'perYear', 'diffSegments', 'tableDiffLines', 'log', 'wtiSeries',
  'csiSeries', 'legs', 'pivots', 'paths', 'bands', 'spells', 'transitions', 'dates', 'nqClose', 'tga', 'rrp', 'dTga',
  'dRrp', 'nqRet', 'nqRetFwd', 'isSettlementDay', 'etag', 'lastModified', 'sourceUrl', 'snapKey', 'snapshotKey',
  'availability', 'priceAvailability', 'fredAvailability', 'params', 'econParams', 'spec', 'file', 'cached', 'hariv_diag',
  'har', 'harLog', 'harIv', 'ladder_weekly_rev', 'ladder_monthly_rev', 'ladder_flat']);

/** Drop noise keys, shorten arrays (`maxArray`, keeping the end unless keep:'first') and strings, cap the depth. */
export function slimDefault(v, { maxArray = 8, maxString = 600, maxDepth = 4, keep = 'last' } = {}, depth = 0) {
  if (typeof v === 'string') return v.length > maxString ? v.slice(0, maxString) + '…' : v;
  if (!v || typeof v !== 'object') return v;
  if (depth >= maxDepth) return Array.isArray(v) ? `[${v.length} items]` : '{…}';
  if (Array.isArray(v)) {
    const arr = v.length > maxArray ? (keep === 'first' ? v.slice(0, maxArray) : v.slice(-maxArray)) : v;
    return arr.map(x => slimDefault(x, { maxArray, maxString, maxDepth, keep }, depth + 1));
  }
  const o = {};
  for (const [k, x] of Object.entries(v)) if (!DROP.has(k)) o[k] = slimDefault(x, { maxArray, maxString, maxDepth, keep }, depth + 1);
  return o;
}

const pick = (o, keys) => { if (!o || typeof o !== 'object') return o ?? null; const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
const mapObj = (o, fn) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, fn(v, k)]));
const CB = d => ({ kind: d.kind, meetingDate: d.meetingDate, generatedAt: d.generatedAt, vote: d.vote ?? null, analysis: slimDefault(d.analysis, { maxArray: 6, maxString: 500 }) });

/** Feed id (instrument feeds use their base, e.g. swing-map) → slice. */
export const SLICES = {
  // ── global ──
  'global-read': d => ({ ...slimDefault(pick(d, ['headline', 'envLabel', 'axes', 'conviction', 'currencies', 'scenarios', 'invalidation', 'flags', 'dataQuality', 'meta']), { maxArray: 6 }),
    ranked: slimDefault(d.ranked, { maxArray: 10 }) }),
  'regime': d => slimDefault(pick(d, ['now', 'share', 'currencies', 'pairs', 'liveAt'])),
  'macro-regime-fx': d => slimDefault(pick(d, ['now', 'policy', 'events', 'builtAt'])),
  'desk-watch': d => ({ updatedAt: d.updatedAt, active: (d.states ?? []).filter(s => s?.on || s?.active || s?.firing), gauges: slimDefault(d.gauges), recentFires: slimDefault((d.log ?? []).slice(-5)) }),
  'crack': d => slimDefault(pick(d, ['last', 'change20', 'context', 'study', 'at'])),
  'trend-basket': d => slimDefault(pick(d, ['last', 'current', 'oos'])),
  'daily-snapshot': d => slimDefault((d.days ?? []).slice(-1)[0] ?? null, { maxArray: 6 }),
  // ── credit and funding ──
  'credit-stress': d => slimDefault(pick(d, ['last', 'current', 'primary', 'secondary', 'vega'])),
  'liquidity-pulse/data': d => ({ stats: slimDefault(d.stats), recent: (d.dates ?? []).slice(-5).map((dt, i, a) => ({ date: dt, liqPulse: d.liqPulse?.slice(-a.length)[i] ?? null })) }),
  'bank-credit': d => slimDefault(pick(d, ['latest', 'firstSeen', 'line', 'headline', 'currencies']), { maxArray: 5 }),
  // ── events ──
  'calendar-ahead': d => ({ at: d.at, rows: slimDefault(d.rows, { maxArray: 40, keep: 'first' }) }),
  'events': d => slimDefault(Array.isArray(d) ? d : [], { maxArray: 40, keep: 'first' }),
  'release-calls': d => slimDefault(pick(d, ['calls', 'summary']), { maxArray: 10 }),
  'fiscal/events': d => slimDefault(pick(d, ['events']), { maxArray: 5, keep: 'first' }),
  // ── rates and central banks ──
  'rates': d => slimDefault(pick(d, ['now', 'change20d', 'pct5y', 'pct10y', 'plumbing', 'at'])),
  'fed-path': d => slimDefault(pick(d, ['asOf', 'ageDays', 'currentRange', 'note', 'windows', 'zq', 'source'])),
  ...Object.fromEntries(['fomc', 'ecb', 'boe', 'boj', 'boc', 'rba', 'rbnz', 'snb'].map(b => [`${b}/latest`, CB])),
  // the speakers since each bank's last statement: drift per bank and the scored speeches (no full texts)
  'speech-drift': d => ({ label: d.label, banks: mapObj(d.banks, b => pick(b, ['statement', 'speeches', 'speechAvg', 'drift', 'label', 'big', 'latest'])),
    recent: (d.recent ?? []).slice(0, 14).map(e => ({ ...pick(e, ['bank', 'date', 'speaker', 'role', 'tier', 'relevance', 'score', 'delta', 'headline', 'currency']), quote: e.keyQuotes?.[0]?.quote ?? null })) }),
  'beigebook/latest': d => ({ meetingDate: d.meetingDate, generatedAt: d.generatedAt, analysis: slimDefault(d.analysis, { maxArray: 6, maxString: 500 }) }),
  // ── yields ──
  'yield-coupling': d => slimDefault(pick(d, ['fxInstrument', 'spreads', 'ceiling', 'note'])),
  'intl-yields': d => ({ meta: d.meta, latest: mapObj(d.series, s => (Array.isArray(s) ? s.slice(-5) : s)) }),
  // ── macro ──
  'econ-trend': d => slimDefault(pick(d, ['last', 'current', 'oos'])),
  'econ-surprise': d => slimDefault(d, { maxArray: 12 }),
  // ── vol ──
  'vol-forecast': d => ({ session_date: d.session_date, session_label: d.session_label, computed_at: d.computed_at, news_flag: d.meta?.news_flag ?? null,
    instruments: mapObj(d.instruments, i => pick(i, ['vol_annual', 'vol_pct', 'cone_5d', 'cone_21d', 'vol_vov_label', 'hl_median', 'hl_75', 'oc_median', 'oc_75', 'oh_median', 'ol_median', 'hl_5d', 'news_mult', 'drift_d', 'term_structure', 'vol_accel'])) }),
  'vol-forecast/session': d => ({ session_date: d.session_date, session_label: d.session_label, fetched_at: d.fetched_at,
    instruments: mapObj(d.instruments, i => pick(i, ['hl', 'oc', 'hl_vs_med', 'oh_rem', 'ol_rem', 'bias', 'shape', 'outlook', 'complete'])) }),
  'vol-forecast/intelligence': d => ({ computed_at: d.computed_at, ranking: (d.cross_asset_vol_ranking ?? []).slice(0, 12),
    instruments: mapObj(d.instruments, i => pick(i, ['vrp', 'iv_term_structure', 'risk_reversal', 'time_to_touch', 'carry_to_vol'])) }),
  'vol-forecast/weekly': d => ({ week_label: d.week_label, is_preview: d.is_preview, instruments: mapObj(d.instruments, i => slimDefault(i, { maxDepth: 2, maxArray: 3 })) }),
  'daily-read': d => { const day = Object.keys(d.days ?? {}).sort().at(-1); return { updatedAt: d.updatedAt, day, today: slimDefault(d.days?.[day], { maxArray: 51 }), tally: d.tally, tags: d.tags }; },
  // A historical fit (turn sizes in sigma, out-of-sample), not a daily read: the typical and the dominant turn per pair.
  'exhaustion-ladder': d => ({ computedAt: d.computedAt, note: 'turn sizes in daily sigma, out-of-sample fit', perPair: mapObj(d.perPair, p => ({
    all: pick(p.ladder?.all?.oos, ['p50', 'p75', 'p90']), dominant: pick(p.ladder?.dominant?.oos, ['p50', 'p75', 'p90']) })) }),
  // ── options ──
  'swing-map': d => slimDefault(pick(d, ['generatedFor', 'live', 'state', 'barriers', 'pull', 'signals', 'bandDaily', 'expiries']), { maxArray: 5, keep: 'first' }),
  'oi-today': d => slimDefault(d, { maxArray: 11, maxDepth: 4 }),
  // ── levels ──
  'range-calls': d => slimDefault(pick(d, ['summary', 'rows']), { maxArray: 15 }),
  'trade-decision/state': d => slimDefault(pick(d, ['pair', 'mode', 'regime', 'price', 'dayOpen', 'sigmaDaily', 'volPct', 'macro', 'credit', 'oi', 'intraday', 'zones', 'permissions'])),
  // ── evidence and memory ──
  'data-health': d => ({ summary: d.summary, worst: d.worst, counts: d.counts, needsEyes: d.needsEyes, problems: slimDefault((d.rows ?? []).filter(r => r && r.status && r.status !== 'ok'), { maxArray: 15, keep: 'first' }) }),
  'ledger': d => slimDefault(pick(d, ['summary', 'latestDay'])),
  'morning-brief': d => ({ generatedAt: d.generatedAt, session: d.session, analysis: slimDefault(d.analysis, { maxArray: 5, maxString: 500 }) }),
  'eod-review': d => ({ generatedAt: d.generatedAt, stale: d.stale, review: slimDefault(d.review, { maxArray: 5, maxString: 500 }) }),
};

/** The slice for one pack entry: its own slice if it has one, else the default cut. A slice that throws falls back. */
export function sliceFeed(id, data) {
  const base = String(id).split(':')[0];
  const fn = SLICES[id] ?? SLICES[base];
  if (fn) { try { const out = fn(data); if (out != null) return out; } catch { /* fall through to the default cut */ } }
  return slimDefault(data);
}
