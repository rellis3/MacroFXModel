/**
 * Regime board (Desk Terminal, Macro tab): the pure shaping. No fetch, no DOM; `now` is passed in.
 *
 *   buildRegimeBoard({ state, hmm, hist, hedge, now })   what /api/regime-board serves
 *   correlationRegime(hedge)                             the board-wide correlation headline (the same rule today.html uses)
 *   describeRegime(rb)                                   the rule-built sentence
 *
 * Inputs are all existing feeds: the market state document (/api/state: the seven regime lenses, risk flags, vol percentiles, registered edges),
 * the daily two-state HMM (/api/hmm/regimes, /api/hmm-daily-history) and the rolling pair correlations (/api/hedge-alerts).
 *
 * What the words mean here, because the Evidence Book is clear on them: the HMM's RANGE state is QUIET (low variance), not directionless, and
 * its TREND state is ACTIVE; neither says which way price goes next (gr-hmm-trend-direction NULL). The regime lenses are descriptions of where
 * the market is, with the theory's expected reaction kept off this board (untested as direction). The correlation regime changes how many
 * independent bets a book really holds; it is a sizing fact, not a direction.
 */
const fin = v => v != null && Number.isFinite(+v);
const r2 = v => (fin(v) ? Math.round(v * 100) / 100 : null);

/** Mean |rho| across the tracked pair combinations against each one's own 5-year normal (the rule today.html uses: HIGH at z >= 1, LOW at z <= -1). */
export function correlationRegime(h) {
  const lc = h?.last_corr, av = h?.avg_corr, sd = h?.corr_std;
  if (!lc || !Object.keys(lc).length) return null;
  const now = [], zs = []; let high = 0;
  for (const [k, v] of Object.entries(lc)) {
    if (!fin(v)) continue;
    now.push(Math.abs(v)); if (Math.abs(v) >= 0.7) high++;
    const mu = av?.[k], sg = sd?.[k];
    if (fin(mu) && fin(sg) && sg > 0.01) zs.push((Math.abs(v) - Math.abs(mu)) / sg);
  }
  if (now.length < 6) return null;
  const mean = now.reduce((a, x) => a + x, 0) / now.length, z = zs.length >= 6 ? zs.reduce((a, x) => a + x, 0) / zs.length : null;
  const state = z == null ? (mean >= 0.6 ? 'HIGH' : mean <= 0.35 ? 'LOW' : 'NORMAL') : z >= 1 ? 'HIGH' : z <= -1 ? 'LOW' : 'NORMAL';
  return { state, mean: r2(mean), z: z == null ? null : r2(z), n: now.length, highShare: r2(high / now.length), asOf: h.generated ?? null };
}

/** Growth and inflation direction behind the quadrant's name, so the board can light the right cell. */
export function quadrantCell(name) {
  const n = String(name ?? '').toLowerCase();
  if (/goldilocks/.test(n)) return { growth: 'up', inflation: 'down', cell: 'goldilocks' };
  if (/reflat|overheat/.test(n)) return { growth: 'up', inflation: 'up', cell: 'reflation' };
  if (/stagfl/.test(n)) return { growth: 'down', inflation: 'up', cell: 'stagflation' };
  if (/deflat|slowdown|recession|contraction|disinfl/.test(n)) return { growth: 'down', inflation: 'down', cell: 'deflation' };
  return { growth: null, inflation: null, cell: null };
}

const FRAME_SHORT = { quadrant: 'Growth × inflation', smile: 'Dollar smile', credit: 'Credit cycle', vol: 'Volatility', curve: 'Policy & curve', risk: 'Risk on / off', flow: 'Capital-flow order' };

export function buildRegimeBoard({ state, hmm = null, hist = null, hedge = null, now = Date.now() } = {}) {
  const frames = (state?.playbook?.frames ?? []).map(f => ({ id: f.id, name: FRAME_SHORT[f.id] ?? f.name, full: f.name, state: f.state, why: f.why,
    conformity: f.conformity ? { met: f.conformity.met, judged: f.conformity.judged, of: f.conformity.of } : null, evidence: f.evidence?.status ?? null }));
  if (!frames.length && !hmm && !hedge) return { ok: false, error: 'the market state document is not built yet' };
  const q = frames.find(f => f.id === 'quadrant'), risk = state?.global?.risk ?? null;
  const vol = (state?.layers?.vol?.rows ?? []).filter(r => fin(r.volPct));
  const hmmRows = hmm ? Object.entries(hmm).filter(([, v]) => v && v.regime).map(([sym, v]) => ({ sym, regime: v.regime, rangeProb: r2(v.rangeProb), trendProb: r2(v.trendProb), reliable: v.reliable !== false, sigmaRatio: r2(v.sigmaRatio) })) : [];
  const strips = hist?.pairs ? Object.entries(hist.pairs).map(([sym, s]) => ({ sym, s: String(s), active: (String(s).match(/a/g) ?? []).length, quiet: (String(s).match(/q/g) ?? []).length })).sort((a, b) => b.active - a.active || a.sym.localeCompare(b.sym)) : [];
  return {
    ok: true, builtAt: new Date(now).toISOString(), asOf: state?.asOf ?? null,
    frames, overall: state?.playbook?.overall ?? null,
    quadrant: q ? { name: q.state, why: q.why, ...quadrantCell(q.state) } : null,
    risk: risk ? { level: risk.level, active: risk.active, available: risk.available, asOf: risk.asOf ?? null, note: risk.note ?? null,
      flags: (risk.flags ?? []).map(f => ({ key: f.key, label: f.label, on: f.on, value: f.value ?? null, detail: f.detail ?? '' })), move: risk.move ?? null } : null,
    regimeLine: state?.global?.regime?.describe ?? null,
    corr: correlationRegime(hedge),
    vol: vol.length ? { n: vol.length, hot: vol.filter(r => r.volPct >= 80).length, cold: vol.filter(r => r.volPct <= 20).length,
      top: [...vol].sort((a, b) => b.volPct - a.volPct).slice(0, 5).map(r => ({ sym: r.sym, pct: r.volPct, ann: r.volAnnual })),
      bottom: [...vol].sort((a, b) => a.volPct - b.volPct).slice(0, 5).map(r => ({ sym: r.sym, pct: r.volPct, ann: r.volAnnual })) } : null,
    hmm: hmmRows.length ? { n: hmmRows.length, quiet: hmmRows.filter(r => r.regime === 'RANGE').length, active: hmmRows.filter(r => r.regime === 'TREND').length, rows: hmmRows } : null,
    hist: strips.length ? { days: hist.days ?? [], rows: strips } : null,
    edges: (state?.edges ?? []).map(e => ({ id: e.id, label: e.label, applies: e.applies, active: e.active, grade: e.grade, standing: e.standing, why: e.why })),
  };
}

/** One paragraph by rule. Every claim is a reading; the quiet/active sentence says what the state is and is not. */
export function describeRegime(rb) {
  if (!rb?.ok) return null;
  const p = [], f = id => rb.frames.find(x => x.id === id);
  const lens = ['quadrant', 'vol', 'curve', 'credit'].map(id => f(id)).filter(Boolean);
  if (lens.length) p.push(`${lens.map(x => `${x.name.toLowerCase()} reads ${x.state}`).join(', ')}`);
  if (rb.risk) p.push(`the risk state is ${String(rb.risk.level).replace('_', ' ').toLowerCase()} (${rb.risk.active} of ${rb.risk.available} flags on)`);
  if (rb.corr) p.push(`correlations are ${rb.corr.state === 'HIGH' ? 'unusually high' : rb.corr.state === 'LOW' ? 'unusually low' : 'about normal'} (mean |ρ| ${rb.corr.mean.toFixed(2)}${rb.corr.z != null ? `, z ${rb.corr.z >= 0 ? '+' : '−'}${Math.abs(rb.corr.z).toFixed(2)}` : ''})`);
  let out = p.length ? `${p[0][0].toUpperCase()}${p.join('; ').slice(1)}.` : '';
  if (rb.hmm) out += ` ${rb.hmm.quiet} of ${rb.hmm.n} markets are in the quiet state and ${rb.hmm.active} in the active one: that describes how big recent moves have been, not which way price goes next.`;
  return out.trim() || null;
}
