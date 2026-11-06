/**
 * The light half of js/pathSources.js: the horizon constants, which instruments have a Cboe path source, the selector's
 * choices and the as-of wording. No imports, so the Desk Terminal can load it without the chain and expiry-tracker code.
 * Tested by js/pathSources.test.mjs.
 */
/** Expiries drawn on the path: every listed expiry up to this many calendar days out. */
export const PATH_HORIZON_DAYS = 200;
/** The pre-registered window (expiry-tracker prereg, swing-walk record): the Swing Map's pull, signals, zones and the
 *  nightly walk record keep reading only this far, so their numbers do not move with the longer path. */
export const PATH_CORE_DAYS = 100;

const DAY = 864e5;
export const addDaysIso = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Rows ({expiry}) from `today` to `today + days` inclusive, in date order. */
export function withinHorizon(rows, { today, days = PATH_HORIZON_DAYS } = {}) {
  if (!today) return [];
  const end = addDaysIso(today, days);
  return (rows || []).filter(e => e?.expiry >= today && e.expiry <= end).sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0));
}

// ── which instruments have a Cboe source ──
//  unit: notional per one OI unit of that source's ladder, in the instrument's own money (gold: ounces; indices:
//  dollars per index point). Used only to weigh one source against the other in the combined view.
export const PATH_SOURCES = {
  GOLD:   { cme: { label: 'CME', unit: 100 }, cboe: { id: 'gld', sym: 'GLD', label: 'GLD', kind: 'etf', unit: 1, unitName: 'oz' } },
  SPX500: { cme: { label: 'CME', unit: 50 },  cboe: { id: 'spx', sym: '_SPX', pair: 'SPX500_USD', label: 'SPX', kind: 'index', unit: 100, unitName: 'contracts' } },
  NQ:     { cme: { label: 'CME', unit: 20 },  cboe: { id: 'ndx', sym: '_NDX', pair: 'NAS100_USD', label: 'NDX', kind: 'index', unit: 100, unitName: 'contracts' } },
};
export const SOURCE_IDS = ['cme', 'cboe', 'combined'];
/** ?source= → 'cme' | 'cboe' | 'combined'. Anything unknown, or an instrument without a Cboe book, is 'cme'. */
export function normaliseSource(inst, q) {
  const s = String(q ?? '').toLowerCase().trim(), cfg = PATH_SOURCES[inst];
  if (!cfg) return 'cme';
  if (s === 'combined' || s === 'both' || s === 'all') return 'combined';
  if (s === 'cboe' || s === cfg.cboe.id || s === cfg.cboe.sym.replace(/^_/, '').toLowerCase()) return 'cboe';
  return 'cme';
}
/** The selector's choices for an instrument: [{ id, label }]. One entry (CME) when there is no Cboe book. */
export function sourceChoices(inst) {
  const cfg = PATH_SOURCES[inst];
  if (!cfg) return [{ id: 'cme', label: 'CME' }];
  return [{ id: 'cme', label: 'CME' }, { id: 'cboe', label: `${cfg.cboe.label} (Cboe)` }, { id: 'combined', label: `CME + ${cfg.cboe.label}` }];
}

/** "OI as of …" and "greeks as of …" lines for one source (null fields are left out by the page). */
export function sourceAsOf(src) {
  if (!src) return null;
  if (src.id === 'cme') return { id: 'cme', label: 'CME', oi: src.captureDate ? `OI as of ${src.captureDate} (nightly CME capture)` : null, greeks: null };
  const t = Number.isFinite(src.asOfMs) ? new Date(src.asOfMs).toISOString().slice(11, 16) + ' UTC' : null;
  return { id: src.id, label: src.label, oi: src.oiDate ? `OI as of ${src.oiDate} (prior day, OCC)` : null, greeks: t ? `greeks as of ${t} (15-min delayed)` : null };
}
