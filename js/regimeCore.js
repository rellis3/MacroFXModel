/**
 * Regime core -- the growth x inflation quadrant, monthly, from FRED series.
 * Design frozen in MD files/REGIME.md. Pure: series in, labels out; the server
 * fetches and the study script scores assets against the labels.
 *
 * Inputs are date-keyed observations ({date:'YYYY-MM-DD', value}) at whatever
 * frequency FRED publishes; everything is reduced to month-end values first,
 * then aligned by the PUBLICATION month (one-month lag for the monthly series:
 * August CPI is known in September) so a label never uses a number that had
 * not printed yet.
 */
const REGIMES = { '+-': 'goldilocks', '++': 'reflation', '-+': 'stagflation', '--': 'deflation' };
export const REGIME_WORDS = {
  goldilocks: { label: 'Goldilocks', what: 'growth improving, inflation easing', usual: 'the backdrop that lets central banks sit still: risk assets have liked it, gold and the dollar have not' },
  reflation:  { label: 'Reflation',  what: 'growth improving, inflation rising', usual: 'commodities and value have liked it; bonds and long-duration growth stocks have not' },
  stagflation:{ label: 'Stagflation', what: 'growth fading, inflation rising', usual: 'the trap: gold and cash have held; equities and bonds both struggled' },
  deflation:  { label: 'Deflation / risk-off', what: 'growth fading, inflation easing', usual: 'duration and the dollar have been the shelter; cyclicals, EM and credit the casualties' },
};
export const TRANSITIONS = [
  { from: 'goldilocks', to: 'reflation', tells: 'wages accelerating, commodities rising, breakevens widening', typical: '3-6 months' },
  { from: 'reflation', to: 'stagflation', tells: 'PMIs rolling over with inflation sticky, curve flattening', typical: '2-4 months' },
  { from: 'stagflation', to: 'deflation', tells: 'credit spreads widening, breakevens falling, PMIs contracting', typical: '1-3 months, often fast -- credit-led' },
  { from: 'deflation', to: 'goldilocks', tells: 'PMIs troughing, credit narrowing, central banks easing', typical: '3-6 months' },
];

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const sd = a => { const m = mean(a); return a.length > 2 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)) : null; };
const monthKey = d => String(d).slice(0, 7);

// last observation of each month -> [{m:'YYYY-MM', v}]
export function monthEnd(obs) {
  const by = new Map();
  for (const o of obs ?? []) { if (o && Number.isFinite(o.value)) by.set(monthKey(o.date), o.value); }
  return [...by.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([m, v]) => ({ m, v }));
}
// mean of the last n months' values
const meanLast = (arr, i, n) => { const s = arr.slice(Math.max(0, i - n + 1), i + 1); return s.length === n ? mean(s) : null; };
// log change over n months, annualised
const annLog = (arr, i, n) => (i - n >= 0 && arr[i] > 0 && arr[i - n] > 0) ? Math.log(arr[i] / arr[i - n]) * (12 / n) * 100 : null;
// trailing z-score over `win` months of a derived series (null-safe)
function zTrail(series, win = 120) {
  return series.map((v, i) => { if (v == null) return null; const w = series.slice(Math.max(0, i - win + 1), i + 1).filter(x => x != null); if (w.length < 36) return null; const s = sd(w); return s ? (v - mean(w)) / s : null; });
}
const shift = (arr, k) => arr.map((_, i) => i - k >= 0 ? arr[i - k] : null);

/**
 * series: { cfnai, claims, indpro, payems, corecpi, corepce, bei5 } each [{date, value}]
 * returns [{ m, growth, inflation, regime, gComp, iComp }] by publication month
 */
export function regimeHistory(series, { lagMonths = 1, zWin = 120 } = {}) {
  const S = Object.fromEntries(Object.entries(series).map(([k, v]) => [k, monthEnd(v)]));
  const months = [...new Set(Object.values(S).flatMap(a => a.map(x => x.m)))].sort();
  const val = (k) => { const by = new Map(S[k].map(x => [x.m, x.v])); return months.map(m => by.get(m) ?? null); };
  const cf = val('cfnai'), cl = val('claims'), ip = val('indpro'), pe = val('payems'), cc = val('corecpi'), cp = val('corepce'), be = val('bei5');
  // growth legs (higher = stronger)
  const g1 = cf.map((_, i) => meanLast(cf.map(x => x ?? NaN), i, 3)).map(x => Number.isFinite(x) ? x : null);
  const g2 = cl.map((_, i) => { const a = meanLast(cl.map(x => x != null ? Math.log(x) : NaN), i, 3), b = meanLast(cl.map(x => x != null ? Math.log(x) : NaN), i, 12); return Number.isFinite(a) && Number.isFinite(b) ? -(a - b) * 100 : null; });
  const g3 = ip.map((_, i) => annLog(ip.map(x => x ?? NaN), i, 3)).map(x => Number.isFinite(x) ? x : null);
  const g4 = pe.map((_, i) => annLog(pe.map(x => x ?? NaN), i, 3)).map(x => Number.isFinite(x) ? x : null);
  // inflation legs (higher = hotter)
  const i1 = cc.map((_, i) => annLog(cc.map(x => x ?? NaN), i, 3)).map(x => Number.isFinite(x) ? x : null);
  const i2 = cp.map((_, i) => annLog(cp.map(x => x ?? NaN), i, 3)).map(x => Number.isFinite(x) ? x : null);
  const i3 = be;
  const zs = [g1, g2, g3, g4].map(a => zTrail(a, zWin)), zi = [i1, i2, i3].map(a => zTrail(a, zWin));
  const gComp = months.map((_, i) => { const v = zs.map(a => a[i]).filter(x => x != null); return v.length >= 3 ? mean(v) : null; });
  const iComp = months.map((_, i) => { const v = zi.map(a => a[i]).filter(x => x != null); return v.length >= 2 ? mean(v) : null; });
  const gScore = gComp.map((_, i) => { const a = meanLast(gComp.map(x => x ?? NaN), i, 3), b = meanLast(gComp.map(x => x ?? NaN), i, 12); return Number.isFinite(a) && Number.isFinite(b) ? a - b : null; });
  const iScore = iComp.map((v, i) => v != null && iComp[i - 3] != null ? v - iComp[i - 3] : null);
  // publication lag: the label for month m uses scores computed from data through m-lag
  const gL = shift(gScore, lagMonths), iL = shift(iScore, lagMonths), gcL = shift(gComp, lagMonths), icL = shift(iComp, lagMonths);
  return months.map((m, i) => ({ m, growth: gL[i] != null ? +gL[i].toFixed(3) : null, inflation: iL[i] != null ? +iL[i].toFixed(3) : null, gComp: gcL[i] != null ? +gcL[i].toFixed(3) : null, iComp: icL[i] != null ? +icL[i].toFixed(3) : null,
    regime: gL[i] != null && iL[i] != null ? REGIMES[`${gL[i] > 0 ? '+' : '-'}${iL[i] > 0 ? '+' : '-'}`] : null })).filter(r => r.regime);
}

// spells: consecutive months in one regime
export function spells(hist) {
  const out = []; for (const r of hist) { const last = out[out.length - 1]; if (last && last.regime === r.regime) { last.months++; last.to = r.m; } else out.push({ regime: r.regime, from: r.m, to: r.m, months: 1 }); }
  return out;
}
// the current state in words
export function regimeNow(hist) {
  if (!hist?.length) return null;
  const sp = spells(hist); const cur = sp[sp.length - 1]; const prev = sp[sp.length - 2] ?? null;
  const w = REGIME_WORDS[cur.regime]; const next = TRANSITIONS.find(t => t.from === cur.regime);
  return { regime: cur.regime, label: w.label, what: w.what, usual: w.usual, months: cur.months, since: cur.from, previous: prev ? { regime: prev.regime, months: prev.months } : null, watchFor: next ? { to: next.to, tells: next.tells, typical: next.typical } : null, scores: { growth: hist[hist.length - 1].growth, inflation: hist[hist.length - 1].inflation } };
}
