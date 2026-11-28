// js/terminal/jarvisSkewCore.js: the pure half of Helix's SKEW view (view id 'skew', js/terminal/jarvisViewSkew.js). No DOM, no fetch; tested by jarvisSkewCore.test.mjs.
// Input: GET /api/options-skew (js/optionsSkew.js skewBoard: the laptop's IBKR pull, scripts/rates_line/refresh_options_skew.py). Per market: the 25-delta risk reversal (RR, call vol minus put
// vol, vol points) and butterfly (BF, the wings over ATM), each with where today sits among its last 20 daily prints (a percentile) and its change over 1 and 5 prints.
// DESCRIPTION ONLY. The Evidence Book: skew-fade (null: skew does not choose fades at the lines), positioning-flow-rr (underpowered: the RR is vol / skew information, not a direction lean).
export const SKEW_EVIDENCE = ['skew-fade', 'positioning-flow-rr'];
export const SKEW_NOTE = 'What the options market is paying for, a description. Skew has not been shown to choose fades at the lines (Evidence Book skew-fade, null) or to lean direction (positioning-flow-rr, underpowered).';
const WIN = 20, MIN = 10;
const fin = v => typeof v === 'number' && Number.isFinite(v);
const r2 = v => (fin(v) ? Math.round(v * 100) / 100 + 0 : null);

/** Where the last value sits among the up-to-19 prints before it (0-100, ties count half); null under 10 prints in the window. */
export function pct20(xs) {
  const v = (xs ?? []).filter(fin).slice(-WIN); if (v.length < MIN) return null;
  const now = v.at(-1), prior = v.slice(0, -1); let below = 0, eq = 0;
  for (const x of prior) { if (x < now) below++; else if (x === now) eq++; }
  return Math.round((below + eq / 2) / prior.length * 100);
}
/** Last minus the value k prints back (finite prints only); null when there are not enough. */
export function chgK(xs, k) { const v = (xs ?? []).filter(fin); return v.length > k ? r2(v.at(-1) - v[v.length - 1 - k]) : null; }
/** The 20-print low and high (the band drawn behind today's dot). */
export function range20(xs) { const v = (xs ?? []).filter(fin).slice(-WIN); return v.length >= 2 ? [Math.min(...v), Math.max(...v)] : null; }

/** A percentile in words, description only. */
export function pctWord(p) { return p == null ? 'too few prints for a 20-day read' : p >= 80 ? 'high end of its last 20 prints' : p <= 20 ? 'low end of its last 20 prints' : 'middle of its last 20 prints'; }

/** board = the /api/options-skew payload -> [{ id, label, pair, rr, bf, atm, lean, rrPct, bfPct, rrChg1, rrChg5, bfChg1, bfChg5, rrBand, bfBand, n }] (markets with an RR only). */
export function skewRows(board) {
  if (!board?.ok || !Array.isArray(board.rows)) return [];
  return board.rows.filter(r => fin(r?.rr)).map(r => {
    const rs = Array.isArray(r.spark) ? r.spark : [], bs = Array.isArray(r.bfSpark) ? r.bfSpark : [];
    return { id: r.id, label: r.label ?? r.id, pair: r.pair ?? r.id, rr: r2(r.rr), bf: r2(r.bf), atm: r2(r.atm), lean: r.lean ?? '',
      rrPct: pct20(rs), bfPct: pct20(bs), rrChg1: chgK(rs, 1), rrChg5: chgK(rs, 5), bfChg1: chgK(bs, 1), bfChg5: chgK(bs, 5), rrBand: range20(rs), bfBand: range20(bs), n: rs.filter(fin).length };
  });
}

const sg = v => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`);
export const signed = sg;

/** One sentence per market, description only. */
export function skewLine(r) {
  return `${r.label}: RR ${sg(r.rr)} (${r.lean || 'balanced'}; ${pctWord(r.rrPct)}${r.rrChg5 != null ? `, ${sg(r.rrChg5)} over 5 prints` : ''}) · BF ${sg(r.bf)} (${pctWord(r.bfPct)}).`;
}

/** The view's headline: the market whose RR sits furthest from the middle of its 20 prints, or null. */
export function skewHeadline(rows, ageH = null) {
  const ranked = rows.filter(r => r.rrPct != null).sort((a, b) => Math.abs(b.rrPct - 50) - Math.abs(a.rrPct - 50));
  const top = ranked[0];
  if (!top) return rows.length ? { hero: `${rows.length} markets`, sub: 'risk reversals and butterflies; too few prints yet for a 20-day read' } : null;
  return { hero: `${top.label} RR ${top.rrPct}th pct`, sub: `${pctWord(top.rrPct)}${fin(ageH) ? ` · pulled ${ageH}h ago` : ''} · a description` };
}
