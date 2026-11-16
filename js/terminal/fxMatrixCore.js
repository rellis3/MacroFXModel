// js/terminal/fxMatrixCore.js: the Currency rates matrix (Insight tab). Pure: reads the payload of /api/ccy-strength (js/ccyStrengthCore.js: eight currencies,
// four windows 1H / 4H / 1D / 1W, scores in sigma that sum to zero) and builds
//   strengthTable   the eight currencies by the four windows: score, rank, and a plain "where it is turning" word comparing the short windows with the long ones
//   pairMatrix      the 8 x 8 grid for one window: a cell = the row currency's score minus the column currency's, i.e. how far the row has out-run the column in
//                   units of a normal move (the fit makes the grid consistent: no triangle can contradict itself)
// Ordering and size only. Nothing here is a direction call or a trade; the words say what has happened over each window.
import { CCYS, HORIZONS, PAIRS } from '../ccyStrengthCore.js';

const fin = v => v != null && Number.isFinite(+v);
export const KEYS = HORIZONS.map(h => h.key);

/** Which instrument key (Pair page) is this two-currency combination, in the orientation the market quotes it? null when there is none. */
export function pairOf(a, b) {
  if (PAIRS.includes(`${a}_${b}`)) return { inst: `${a}${b}`, base: a, quote: b };
  if (PAIRS.includes(`${b}_${a}`)) return { inst: `${b}${a}`, base: b, quote: a };
  return null;
}

/** Rows for the table, ordered by the 1D rank (or the first window that has data). window availability is kept per column. */
export function strengthTable(payload) {
  if (!payload?.ok) return { ok: false, error: payload?.error ?? 'currency strength is not available' };
  const hz = payload.horizons ?? {};
  const cols = KEYS.map(k => { const h = hz[k]; return h?.available ? { key: k, available: true, flat: !!h.flat, from: h.from, to: h.to, unitPct: h.unitPct, leader: h.leader, laggard: h.laggard, spread: h.spread } : { key: k, available: false, reason: h?.reason ?? 'no data for this window' }; });
  const get = (k, c) => hz[k]?.scores?.find(s => s.ccy === c) ?? null;
  const rows = CCYS.map(c => {
    const cells = Object.fromEntries(KEYS.map(k => { const s = get(k, c); return [k, s ? { score: s.score, rank: s.rank } : null]; }));
    return { ccy: c, cells, turning: turning(cells) };
  });
  const first = KEYS.find(k => cols.find(x => x.key === k)?.available) ?? null;
  const key = cols.find(x => x.key === '1D')?.available ? '1D' : first;
  if (key) rows.sort((a, b) => (a.cells[key]?.rank ?? 99) - (b.cells[key]?.rank ?? 99));
  return { ok: true, cols, rows, orderedBy: key, asOf: payload.asOf ?? null, closed: !!payload.closed, closeLabel: payload.closeLabel ?? null, anyAvailable: cols.some(c => c.available) };
}

/**
 * Where a currency is turning: compares its mean rank on the short windows (1H, 4H) with its mean rank on the long ones (1D, 1W). Needs one of each.
 * 'firming' = clearly stronger lately than over the longer windows, 'fading' = clearly weaker lately, otherwise 'steady'. A gap of 3 places or more of 8.
 */
export function turning(cells) {
  const mean = ks => { const v = ks.map(k => cells[k]?.rank).filter(fin); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const s = mean(['1H', '4H']), l = mean(['1D', '1W']);
  if (s == null || l == null) return null;
  const d = l - s;                       // positive = a better (lower) rank on the short windows
  return d >= 3 ? 'firming' : d <= -3 ? 'fading' : 'steady';
}
export const TURN_WORDS = {
  firming: 'stronger lately than over the longer windows',
  fading: 'weaker lately than over the longer windows',
  steady: 'about the same lately as over the longer windows',
};

/** The 8 x 8 grid for a window: cells[i][j] = score(row i) - score(col j); null when that window has no data. Ordered by the window's own ranking. */
export function pairMatrix(payload, hz) {
  const h = payload?.horizons?.[hz];
  if (!payload?.ok || !h?.available || !Array.isArray(h.scores)) return null;
  const order = [...h.scores].sort((a, b) => b.score - a.score), by = Object.fromEntries(h.scores.map(s => [s.ccy, s.score]));
  const ccys = order.map(s => s.ccy);
  const cells = ccys.map(a => ccys.map(b => (a === b ? null : by[a] - by[b])));
  const max = Math.max(0.01, ...cells.flat().filter(fin).map(Math.abs));
  return { hz, ccys, cells, max, unitPct: h.unitPct, from: h.from, to: h.to, flat: !!h.flat };
}

/** The rule-built sentence over the table: who leads and trails on each available window, and who is firming or fading. No direction or trade wording. */
export function tableSentence(t) {
  if (!t?.ok || !t.anyAvailable) return null;
  const parts = t.cols.filter(c => c.available && !c.flat).map(c => `${c.key} ${c.leader} over ${c.laggard}`);
  const f = t.rows.filter(r => r.turning === 'firming').map(r => r.ccy), d = t.rows.filter(r => r.turning === 'fading').map(r => r.ccy);
  let s = parts.length ? `Strongest over weakest: ${parts.join(', ')}.` : 'The market has not moved on any window yet.';
  if (f.length) s += ` Stronger lately than their longer windows: ${f.join(', ')}.`;
  if (d.length) s += ` Weaker lately: ${d.join(', ')}.`;
  return s;
}
