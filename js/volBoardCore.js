/**
 * Vol board (Desk Terminal, Macro tab): the pure shaping. No fetch, no DOM; `now` is passed in.
 *
 *   buildVolBoard({ state, skew, now })   what /api/vol-board serves
 *   describeVol(vb)                       the rule-built sentence
 *
 * The fear complex in one place: VIX, VVIX, SKEW, MOVE, OVX, GVZ, VXEEM and VXTLT each against their own five-year history (the market state
 * document keeps 1990-on context and a year of closes for each), the VIX curve (VIX / VIX3M), realised volatility by market against its own
 * history (js/stateLayers.js vol rows) and the FX risk reversals from the laptop's IBKR pull, with their age. What is NOT here: a vol surface
 * (the Surface Lab page is the drill-down, linked for the owner), CVOL (frozen since 2026-08-21) and any short-vol rule.
 *
 * Wording from the Evidence Book: vix-inversion and vol-curve-front say a stressed curve means a WIDER week; vvix-ratio-range says fear that has
 * run ahead of the index tended to give back about 7% of VIX over the month (a vol read, not an index call); skew-fade is NULL. Vol here is
 * size, never direction.
 */
const fin = v => v != null && Number.isFinite(+v);
const r1 = v => (fin(v) ? Math.round(v * 10) / 10 : null);
const r2 = v => (fin(v) ? Math.round(v * 100) / 100 : null);

export const GAUGES = [
  ['VIX', 'VIX', 'S&P 500 implied vol'], ['VVIX', 'VVIX', 'vol of VIX'], ['SKEW', 'SKEW', 'tail pricing, S&P'], ['MOVE', 'MOVE', 'Treasury implied vol'],
  ['OVX', 'OVX', 'crude oil implied vol'], ['GVZ', 'GVZ', 'gold implied vol'], ['VXEEM', 'VXEEM', 'emerging-market implied vol'], ['VXTLT', 'VXTLT', 'long-bond implied vol'],
];

const every = (a, k) => a.filter((_, i) => (a.length - 1 - i) % k === 0);

export function buildVolBoard({ state, skew = null, now = Date.now() } = {}) {
  const long = state?.history?.long ?? [];
  const by = Object.fromEntries(long.map(x => [x.id, x]));
  const gauges = GAUGES.map(([id, label, what]) => { const c = by[id]?.ctx; if (!c) return null;
    return { id, label, what, last: r2(c.last), asOf: c.asOf, pct5y: c.pct5y ?? null, pctAll: c.pctAll ?? null, z5y: r2(c.z5y), chg20: r2(c.chg20), chg20Pct: r1(c.chg20Pct), since: c.since ?? null,
      high: c.high ?? null, low: c.low ?? null, spark: every((c.spark ?? []).map(p => p[1]).filter(fin), 3) }; }).filter(Boolean);
  const t = by.VIX_TERM?.ctx;
  const term = t ? { ratio: r2(t.last), asOf: t.asOf, pct5y: t.pct5y ?? null, chg20: r2(t.chg20), spark: every((t.spark ?? []).map(p => p[1]).filter(fin), 3), inverted: t.last >= 1 } : null;
  const rv = (state?.layers?.vol?.rows ?? []).filter(r => fin(r.volPct)).map(r => ({ sym: r.sym, pct: r.volPct, ann: r2(r.volAnnual), stale: !!r.stale })).sort((a, b) => b.pct - a.pct);
  const sk = (skew?.ok ? skew.rows ?? [] : []).filter(r => fin(r.pairRr ?? r.rr)).map(r => ({ pair: r.pair ?? r.label, rr: r2(r.pairRr ?? r.rr), bf: r2(r.bf), atm: r2(r.atm), slope: r2(r.slope), lean: r.lean ?? null, data: r.data ?? null }));
  if (!gauges.length && !rv.length && !sk.length) return { ok: false, error: 'the market state document is not built yet' };
  return { ok: true, builtAt: new Date(now).toISOString(), gauges, term, realised: { n: rv.length, rows: rv }, skew: sk.length ? { ageH: skew.ageH ?? null, asOf: skew.asOf ?? null, rows: sk } : null };
}

const ord = n => { const k = Math.abs(n) % 100, j = k % 10; return `${n}${k >= 11 && k <= 13 ? 'th' : j === 1 ? 'st' : j === 2 ? 'nd' : j === 3 ? 'rd' : 'th'}`; };
/** One paragraph by rule: the headline gauges with their five-year percentile, the extremes, and the curve. Size, never direction. */
export function describeVol(vb) {
  if (!vb?.ok) return null;
  const g = id => vb.gauges.find(x => x.id === id), p = [];
  for (const id of ['VIX', 'VVIX', 'SKEW', 'MOVE']) { const x = g(id); if (x && x.pct5y != null) p.push(`${x.label} ${x.last} (${ord(x.pct5y)} percentile of five years)`); }
  let out = p.length ? `${p.join(', ')}.` : '';
  const ranked = vb.gauges.filter(x => x.pct5y != null).sort((a, b) => b.pct5y - a.pct5y);
  if (ranked.length >= 3) out += ` Dearest against its own history: ${ranked[0].label} (${ord(ranked[0].pct5y)}); cheapest: ${ranked.at(-1).label} (${ord(ranked.at(-1).pct5y)}).`;
  if (vb.term) out += ` The VIX curve (VIX over VIX3M) is ${vb.term.ratio.toFixed(2)}: ${vb.term.inverted ? 'inverted, near-term fear above the three-month' : 'not inverted'}.`;
  const hot = vb.realised.rows.filter(r => r.pct >= 90).length;
  if (vb.realised.n) out += ` ${hot} of ${vb.realised.n} markets are running realised volatility above their 90th percentile.`;
  return `${out.trim()} This is how big moves are priced and running, not which way.`;
}
