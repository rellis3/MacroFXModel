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
 * Generic: growth and inflation legs -> monthly labels. Each leg is
 * { obs: [{date, value}], kind } with kind one of
 *   mean3     the 3-month mean of the level (CFNAI)
 *   negLogMom -(3m mean - 12m mean) of log level (claims: falling = stronger)
 *   annLog3   3-month annualised log change of an index (production, payrolls, GDP levels, CPI index)
 *   level     the level itself (a rate: CPI y/y, GDP q/q)
 *   negLevel  minus the level (unemployment: lower = stronger)
 * Growth score = the growth composite's 3-month mean minus its 12-month mean;
 * inflation score = the inflation composite's 3-month change.
 */
export function regimeFromLegs({ growth = [], inflation = [] }, { lagMonths = 1, zWin = 120, minGrowthLegs = 2, minInflLegs = 1 } = {}) {
  const all = [...growth, ...inflation].map(l => monthEnd(l.obs));
  const months = [...new Set(all.flatMap(a => a.map(x => x.m)))].sort();
  const val = (me) => { const by = new Map(me.map(x => [x.m, x.v])); return months.map(m => by.get(m) ?? null); };
  const derive = (leg, me) => {
    const v = val(me); const nn = v.map(x => x ?? NaN);
    switch (leg.kind) {
      case 'mean3': return v.map((_, i) => { const x = meanLast(nn, i, 3); return Number.isFinite(x) ? x : null; });
      case 'negLogMom': return v.map((_, i) => { const a = meanLast(nn.map(x => x > 0 ? Math.log(x) : NaN), i, 3), b = meanLast(nn.map(x => x > 0 ? Math.log(x) : NaN), i, 12); return Number.isFinite(a) && Number.isFinite(b) ? -(a - b) * 100 : null; });
      case 'annLog3': return v.map((_, i) => { const x = annLog(nn, i, 3); return Number.isFinite(x) ? x : null; });
      case 'negLevel': return v.map(x => x == null ? null : -x);
      default: return v;
    }
  };
  const gz = growth.map((l, i) => zTrail(derive(l, all[i]), zWin)), iz = inflation.map((l, i) => zTrail(derive(l, all[growth.length + i]), zWin));
  const gComp = months.map((_, i) => { const v = gz.map(a => a[i]).filter(x => x != null); return v.length >= minGrowthLegs ? mean(v) : null; });
  const iComp = months.map((_, i) => { const v = iz.map(a => a[i]).filter(x => x != null); return v.length >= minInflLegs ? mean(v) : null; });
  const gScore = gComp.map((_, i) => { const a = meanLast(gComp.map(x => x ?? NaN), i, 3), b = meanLast(gComp.map(x => x ?? NaN), i, 12); return Number.isFinite(a) && Number.isFinite(b) ? a - b : null; });
  const iScore = iComp.map((v, i) => v != null && iComp[i - 3] != null ? v - iComp[i - 3] : null);
  const gL = shift(gScore, lagMonths), iL = shift(iScore, lagMonths), gcL = shift(gComp, lagMonths), icL = shift(iComp, lagMonths);
  return months.map((m, i) => ({ m, growth: gL[i] != null ? +gL[i].toFixed(3) : null, inflation: iL[i] != null ? +iL[i].toFixed(3) : null, gComp: gcL[i] != null ? +gcL[i].toFixed(3) : null, iComp: icL[i] != null ? +icL[i].toFixed(3) : null,
    regime: gL[i] != null && iL[i] != null ? REGIMES[`${gL[i] > 0 ? '+' : '-'}${iL[i] > 0 ? '+' : '-'}`] : null })).filter(r => r.regime);
}

/**
 * The US: series { cfnai, claims, indpro, payems, corecpi, corepce, bei5 }.
 */
export function regimeHistory(series, opts = {}) {
  return regimeFromLegs({
    growth: [{ obs: series.cfnai, kind: 'mean3' }, { obs: series.claims, kind: 'negLogMom' }, { obs: series.indpro, kind: 'annLog3' }, { obs: series.payems, kind: 'annLog3' }],
    inflation: [{ obs: series.corecpi, kind: 'annLog3' }, { obs: series.corepce, kind: 'annLog3' }, { obs: series.bei5, kind: 'level' }],
  }, { minGrowthLegs: 3, minInflLegs: 2, ...opts });
}
// The other currencies, on the series validated this week. AUD/JPY/CHF/NZD: no read.
export const CURRENCY_LEGS = {
  GBP: { growth: [['gb_unemp', 'negLevel'], ['gb_gdp', 'annLog3']], inflation: [['gb_cpi', 'level'], ['gb_core', 'level']] },
  EUR: { growth: [['ea_unemp', 'negLevel'], ['ea_gdp', 'level']], inflation: [['ea_hicp', 'level'], ['ea_core', 'level']] },
  CAD: { growth: [['ca_unemp', 'negLevel'], ['ca_gdp', 'annLog3']], inflation: [['ca_cpi_yoy', 'level'], ['ca_trim', 'level'], ['ca_median', 'level']] },
};
export function currencyRegime(ccy, series, opts = {}) {
  const L = CURRENCY_LEGS[ccy]; if (!L) return null;
  const legs = k => L[k].map(([id, kind]) => ({ obs: series[id] ?? [], kind })).filter(l => l.obs.length);
  const g = legs('growth'), i = legs('inflation'); if (g.length < 2 || i.length < 1) return null;
  return regimeFromLegs({ growth: g, inflation: i }, { minGrowthLegs: 2, minInflLegs: 1, ...opts });
}
// y/y from a monthly index
export const yoy = obs => { const me = monthEnd(obs); return me.map((x, i) => i >= 12 && me[i - 12].v ? { date: `${x.m}-01`, value: (x.v / me[i - 12].v - 1) * 100 } : null).filter(Boolean); };

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
