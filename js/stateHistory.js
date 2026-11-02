/**
 * Long-history context for the Market State Engine (plans/DATA_ASSET_MAP.md §4C).
 *
 * Turns the deep series the repo holds (Cboe vol indices from 1990, MOVE from 2002, the 10Y from 1970, credit and
 * duration ETFs, 20 FX crosses incl. EM, the 26,403-release surprise backfill, COT at full depth) into the sections
 * /api/state serves: where today sits in ALL of its history, the EM/G10 FX board, the surprise history per economy and
 * the full COT board. Pure; tested in js/stateHistory.test.mjs. Descriptive: none of this is a forecast.
 */

const DAY = 864e5;
const ts = d => Date.parse(d);

function pctOf(values, x) { if (!values.length) return null; return Math.round(100 * values.filter(v => v < x).length / values.length); }

/** Where the last value sits: full-history and 5-year percentiles (prior points only), 20d change, extremes. */
export function contextOf(pts, { years = 5 } = {}) {
  if (!Array.isArray(pts) || pts.length < 60) return null;
  const last = pts[pts.length - 1], lt = ts(last.date), prior = pts.slice(0, -1);
  const vals = prior.map(p => p.value);
  const recent = prior.filter(p => ts(p.date) >= lt - years * 365 * DAY).map(p => p.value);
  let ref = null; for (let i = pts.length - 2; i >= 0; i--) if (ts(pts[i].date) <= lt - 20 * DAY) { ref = pts[i]; break; }
  let hi = prior[0], lo = prior[0]; for (const p of prior) { if (p.value > hi.value) hi = p; if (p.value < lo.value) lo = p; }
  const mean5 = recent.reduce((a, b) => a + b, 0) / (recent.length || 1);
  const sd5 = Math.sqrt(recent.reduce((a, b) => a + (b - mean5) ** 2, 0) / (recent.length || 1));
  return {
    last: last.value, asOf: last.date, since: pts[0].date, n: pts.length,
    pctAll: pctOf(vals, last.value), pct5y: recent.length >= 60 ? pctOf(recent, last.value) : null,
    z5y: sd5 > 0 ? +((last.value - mean5) / sd5).toFixed(2) : null,
    chg20: ref ? last.value - ref.value : null, chg20Pct: ref && ref.value ? (last.value / ref.value - 1) * 100 : null,
    high: { value: hi.value, date: hi.date }, low: { value: lo.value, date: lo.date },
    spark: pts.slice(-260).map(p => [p.date, p.value]),
  };
}

/** Ratio series on common dates (e.g. VIX/VIX3M, HYG/IEF). */
export function ratio(a, b) {
  const by = new Map((b ?? []).map(p => [p.date, p.value]));
  return (a ?? []).filter(p => by.get(p.date) > 0).map(p => ({ date: p.date, value: p.value / by.get(p.date) }));
}

export const LONG_ROWS = [
  { id: 'VIX', label: 'VIX (equity fear)', group: 'vol', unit: 'pt' },
  { id: 'VIX_TERM', label: 'VIX ÷ VIX3M (above 1 = inverted)', group: 'vol', unit: 'ratio' },
  { id: 'VVIX', label: 'VVIX (vol of vol)', group: 'vol', unit: 'pt' },
  { id: 'SKEW', label: 'SKEW (tail-risk pricing)', group: 'vol', unit: 'pt' },
  { id: 'MOVE', label: 'MOVE (bond-market fear)', group: 'vol', unit: 'pt' },
  { id: 'OVX', label: 'OVX (oil vol)', group: 'vol', unit: 'pt' },
  { id: 'GVZ', label: 'GVZ (gold vol)', group: 'vol', unit: 'pt' },
  { id: 'VXEEM', label: 'VXEEM (EM equity vol)', group: 'vol', unit: 'pt' },
  { id: 'VXTLT', label: 'VXTLT (long-bond vol)', group: 'vol', unit: 'pt' },
  { id: 'TNX', label: 'US 10Y yield (since 1970)', group: 'rates', unit: 'pct' },   // Yahoo ^TNX is the yield in % (checked: 15.84 in Sep 1981)
  { id: 'CREDIT_RATIO', label: 'HYG ÷ IEF (credit vs Treasuries)', group: 'credit', unit: 'ratio' },
  { id: 'IG_RATIO', label: 'LQD ÷ IEF (IG credit vs Treasuries)', group: 'credit', unit: 'ratio' },
];

/** The long-history panel: one row per LONG_ROWS id whose series is present. */
export function longContext(series = {}) {
  const s = { ...series };
  if (s.VIX && s.VIX3M) s.VIX_TERM = ratio(s.VIX, s.VIX3M);
  if (s.HYG && s.IEF) s.CREDIT_RATIO = ratio(s.HYG, s.IEF);
  if (s.LQD && s.IEF) s.IG_RATIO = ratio(s.LQD, s.IEF);
  return LONG_ROWS.map(r => ({ ...r, ctx: contextOf(s[r.id]) })).filter(r => r.ctx);
}

/** FX crosses: + = the non-USD currency STRONGER over 20 days (USD/xxx quotes inverted). */
export const FX_BOARD = [
  ['EURUSD', 'EUR', 'G10', false], ['GBPUSD', 'GBP', 'G10', false], ['AUDUSD', 'AUD', 'G10', false], ['NZDUSD', 'NZD', 'G10', false],
  ['JPY', 'JPY', 'G10', true], ['CAD', 'CAD', 'G10', true], ['CHF', 'CHF', 'G10', true], ['NOK', 'NOK', 'G10', true], ['SEK', 'SEK', 'G10', true],
  ['MXN', 'MXN', 'EM', true], ['BRL', 'BRL', 'EM', true], ['TRY', 'TRY', 'EM', true], ['INR', 'INR', 'EM', true], ['IDR', 'IDR', 'EM', true],
  ['KRW', 'KRW', 'EM', true], ['TWD', 'TWD', 'EM', true], ['SGD', 'SGD', 'EM', true], ['MYR', 'MYR', 'EM', true], ['PHP', 'PHP', 'EM', true], ['THB', 'THB', 'EM', true],
];

export function fxBoard(series = {}) {
  const rows = [];
  for (const [id, ccy, group, usdBase] of FX_BOARD) {
    const pts = series[`FX_${id}`]; if (!Array.isArray(pts) || pts.length < 300) continue;
    const vs = pts.map(p => ({ date: p.date, value: usdBase ? 1 / p.value : p.value }));
    const lt = ts(vs.at(-1).date); let ref = null;
    for (let i = vs.length - 2; i >= 0; i--) if (ts(vs[i].date) <= lt - 20 * DAY) { ref = vs[i]; break; }
    if (!ref) continue;
    const chg = (vs.at(-1).value / ref.value - 1) * 100;
    // history of 20d moves, prior only, to say how unusual this one is
    const moves = []; for (let i = 20; i < vs.length - 1; i++) moves.push((vs[i].value / vs[i - 20].value - 1) * 100);
    rows.push({ ccy, group, chg20: +chg.toFixed(2), pctMove: pctOf(moves, chg), asOf: vs.at(-1).date, since: vs[0].date });
  }
  const em = rows.filter(r => r.group === 'EM');
  const weak = em.filter(r => r.chg20 <= -2).length;
  return { rows: rows.sort((a, b) => a.chg20 - b.chg20), emStress: em.length ? { weak, of: em.length, text: `${weak} of ${em.length} EM currencies down 2%+ against USD over 20 days` } : null };
}

// ── surprise history (ForexFactory backfill 2007–2025, consensus vs actual) ─────────────────────────────────────────
const num = s => { if (s == null) return null; const m = String(s).replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)\s*([KMBT%])?/i); if (!m) return null; const k = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2]?.toUpperCase()] ?? 1; return +m[1] * k; };

/**
 * Monthly surprise index per country from the backfill: each release's (actual − consensus) scaled by that event's own
 * PRIOR standard deviation (no lookahead), signs as printed (unemployment-style polarity is NOT corrected here, so
 * read it as "data above / below consensus", not "good / bad"), averaged per month. Returns { country: [{date, value, n}] }.
 */
export function surpriseHistory(backfill) {
  const cols = backfill?.cols ?? [], rows = backfill?.rows ?? [];
  const ci = cols.indexOf('country'), ei = cols.indexOf('event'), mi = cols.indexOf('ms'), esti = cols.indexOf('estimate'), ai = cols.indexOf('actual'), ii = cols.indexOf('impact');
  if ([ci, ei, mi, esti, ai].some(i => i < 0)) return {};
  const sorted = rows.filter(r => r[ii] !== 'low').map(r => ({ c: r[ci], e: r[ei], ms: +r[mi], d: num(r[ai]) != null && num(r[esti]) != null ? num(r[ai]) - num(r[esti]) : null }))
    .filter(r => r.d != null && Number.isFinite(r.ms)).sort((a, b) => a.ms - b.ms);
  const hist = new Map(), byMonth = new Map();
  for (const r of sorted) {
    const k = `${r.c}|${r.e}`, h = hist.get(k) ?? [];
    if (h.length >= 8) {
      const m = h.reduce((a, b) => a + b, 0) / h.length, sd = Math.sqrt(h.reduce((a, b) => a + (b - m) ** 2, 0) / h.length);
      if (sd > 0) {
        const z = Math.max(-4, Math.min(4, r.d / sd));
        const mk = `${r.c}|${new Date(r.ms).toISOString().slice(0, 7)}`;
        const b = byMonth.get(mk) ?? { s: 0, n: 0 }; b.s += z; b.n++; byMonth.set(mk, b);
      }
    }
    h.push(r.d); hist.set(k, h);
  }
  const out = {};
  for (const [mk, b] of byMonth) { const [c, ym] = mk.split('|'); (out[c] ??= []).push({ date: `${ym}-01`, value: +(b.s / b.n).toFixed(3), n: b.n }); }
  for (const c of Object.keys(out)) out[c].sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

// ── COT at full depth ───────────────────────────────────────────────────────────────────────────────────────────────
/** Speculative net share of OI: leveraged funds (TFF) or managed money (Disaggregated). */
export function specShare(row) {
  const L = row.lev_money_positions_long ?? row.lev_money_positions_long_all ?? row.m_money_positions_long_all ?? row.m_money_positions_long;
  const S = row.lev_money_positions_short ?? row.lev_money_positions_short_all ?? row.m_money_positions_short_all ?? row.m_money_positions_short;
  const oi = row.open_interest_all ?? row.open_interest;
  return Number.isFinite(L) && Number.isFinite(S) && oi > 0 ? (L - S) / oi : null;
}

/** One row per market: latest spec net share and its percentile over 3 years and over all history (prior weeks only). */
export function cotBoard(tables = {}) {
  const out = [];
  for (const [sym, t] of Object.entries(tables)) {
    const rows = (t?.rows ?? []).map(r => ({ date: r.date, v: specShare(r) })).filter(r => r.v != null);
    if (rows.length < 60) continue;
    const last = rows.at(-1), prior = rows.slice(0, -1).map(r => r.v), p3 = rows.slice(-157, -1).map(r => r.v);
    out.push({ sym, group: t.group ?? null, share: +(100 * last.v).toFixed(1), pct3y: pctOf(p3, last.v), pctAll: pctOf(prior, last.v), since: rows[0].date, asOf: last.date, weeks: rows.length, flipInLiveReads: !!t.flipInLiveReads });
  }
  return out.sort((a, b) => Math.abs(b.pctAll - 50) - Math.abs(a.pctAll - 50));
}
