/**
 * The institutional playbook — how the standard macro frameworks read today's state (owner, 2026-10-31: "we may not
 * have the data to prove it yet, but we have the knowledge to know how things should work").
 *
 * Each framework: classify today's regime from the engine's own readings → state the textbook expectation for the
 * cross-asset response → check whether markets are actually behaving that way. The point is the comparison: where
 * the market follows the playbook, the regime read is confirmed; where it does not, that is the story worth reading.
 *
 * Evidence discipline: every framework is labelled `theory` (widely used by institutions, NOT validated in this
 * repo) unless a banked test bears on it, in which case the ledger id and its audit status are shown. Nothing here is
 * a forecast or a trade. Pure; tested in js/statePlaybook.test.mjs.
 */

const R = (doc, key) => {
  for (const t of [...(doc?.tiers ?? []), doc?.drivers ?? {}]) for (const r of t.readings ?? []) if (r.key === key && !r.missing) return r;
  return null;
};
const dir = r => (r && r.moved ? r.dir : 'flat');
const UP = 'up', DOWN = 'down';

/** expectation row: asset key in the engine, expected direction, and what the market did. */
function expect(doc, key, want, label) {
  const r = R(doc, key);
  const did = r ? dir(r) : null;
  return { key, label: label ?? r?.label ?? key, expected: want, actual: did, ok: did == null ? null : did === 'flat' ? null : did === want };
}
function score(rows) {
  const judged = rows.filter(r => r.ok !== null);
  return { met: judged.filter(r => r.ok).length, judged: judged.length, of: rows.length };
}
const usSurprise = doc => doc?.economies?.rows?.find(r => r.ccy === 'USD')?.surprise?.score ?? null;
const otherSurprise = doc => {
  const xs = (doc?.economies?.rows ?? []).filter(r => r.ccy !== 'USD').map(r => r.surprise?.score).filter(Number.isFinite);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

/** 1. Growth × inflation quadrant (the all-weather / investment-clock family). */
export function quadrant(doc) {
  const us = usSurprise(doc), gdp = doc?.economies?.rows?.[0]?.nowcast?.gdpNow ?? null;
  const cpi = doc?.economies?.rows?.[0]?.nowcast?.coreMoM ?? null, bei = R(doc, 'bei');
  const growthUp = gdp != null ? gdp >= 2 : us != null ? us > 0 : null;
  const inflUp = cpi != null ? cpi * 12 >= 2.5 : bei ? dir(bei) === UP : null;
  if (growthUp == null || inflUp == null) return { id: 'quadrant', name: 'Growth × inflation quadrant', state: null, why: 'growth or inflation input not loaded' };
  const state = growthUp ? (inflUp ? 'Reflation' : 'Goldilocks') : (inflUp ? 'Stagflation' : 'Disinflationary slowdown');
  const E = {
    Reflation: [['spx', UP], ['us10y', UP], ['oil', UP], ['copper', UP], ['gold', UP]],
    Goldilocks: [['spx', UP], ['nq', UP], ['hy', DOWN], ['vix', DOWN]],
    Stagflation: [['gold', UP], ['spx', DOWN], ['us10y', UP], ['hy', UP]],
    'Disinflationary slowdown': [['us10y', DOWN], ['spx', DOWN], ['hy', UP], ['usdjpy', DOWN], ['copper', DOWN]],
  }[state];
  const rows = E.map(([k, w]) => expect(doc, k, w));
  return { id: 'quadrant', name: 'Growth × inflation quadrant', state,
    why: `growth ${growthUp ? 'above' : 'below'} trend (${gdp != null ? `GDPNow ${gdp.toFixed(1)}%` : `US surprises ${us?.toFixed(2)}σ`}), inflation ${inflUp ? 'running hot' : 'cooling'} (${cpi != null ? `core CPI nowcast ${(cpi * 12).toFixed(1)}% annualised` : 'breakevens'})`,
    expectations: rows, conformity: score(rows), evidence: { status: 'theory', note: 'The growth × inflation regime is tested here only as a 20-day FX direction descriptor (macro-regime-fx, descriptive); the quadrant asset map is theory.' } };
}

/** 2. The dollar smile: USD strong in risk-off (left) and on US outperformance (right), weak when growth is broad (bottom). */
export function dollarSmile(doc) {
  const vix = R(doc, 'vix'), hy = R(doc, 'hy');
  const riskOff = (vix && vix.last >= 22) || dir(vix) === UP && dir(hy) === UP;
  const us = usSurprise(doc), rest = otherSurprise(doc);
  const usLead = us != null && rest != null ? us - rest > 0.3 : null;
  const state = riskOff ? 'Left side (risk-off: dollar as haven)' : usLead ? 'Right side (US outperformance)' : usLead === false ? 'Bottom (broad global growth: dollar soft)' : null;
  if (!state) return { id: 'smile', name: 'Dollar smile', state: null, why: 'needs VIX/credit and US-vs-rest surprises' };
  const want = state.startsWith('Bottom') ? DOWN : UP;
  const rows = [expect(doc, 'dxy', want, 'Dollar (broad)'), expect(doc, 'emdollar', want, 'Dollar vs EM')];
  if (state.startsWith('Left')) rows.push(expect(doc, 'usdjpy', DOWN, 'USD/JPY (yen as the other haven)'));
  return { id: 'smile', name: 'Dollar smile', state, why: `VIX ${vix?.last?.toFixed?.(1) ?? '—'}, credit ${dir(hy)}; US surprises ${us?.toFixed?.(2) ?? '—'}σ vs rest ${rest?.toFixed?.(2) ?? '—'}σ`,
    expectations: rows, conformity: score(rows), evidence: { status: 'theory', note: 'Yields → FX direction was tested here as a one-pair lead and reopened by the audit (yields-to-fx-direction); the smile itself is untested.' } };
}

/** 3. Credit cycle: spread level × direction. */
export function creditCycle(doc) {
  const hy = R(doc, 'hy'); if (!hy || hy.d20 == null) return { id: 'credit', name: 'Credit cycle', state: null, why: 'HY spread not loaded' };
  const wide = (hy.pctile?.pct ?? 50) >= 60, widening = hy.d20 > 0;
  const state = !wide && !widening ? 'Expansion (tight and tightening)' : !wide && widening ? 'Late cycle (tight but widening)' : wide && widening ? 'Stress (wide and widening)' : 'Repair (wide but tightening)';
  const eq = widening ? DOWN : UP;
  const rows = [expect(doc, 'spx', eq), expect(doc, 'ccc', widening ? UP : DOWN, 'CCC spread (should lead HY)'), expect(doc, 'vix', widening ? UP : DOWN)];
  return { id: 'credit', name: 'Credit cycle', state, why: `HY ${hy.d20 > 0 ? '+' : ''}${hy.d20.toFixed(0)}bp over 20d, level at the ${hy.pctile?.pct ?? '?'}th percentile of its ${hy.pctile ? Math.round(hy.pctile.spanDays / 30) + '-month' : ''} range`,
    expectations: rows, conformity: score(rows), evidence: { status: 'reopened', ids: ['credit-leads-equities'], note: 'Credit → equities was tested on IG only and reopened (the HY leg gave IC +0.26 and was never followed up).' } };
}

/** 4. Vol regime: level × term structure. */
export function volRegime(doc) {
  const hv = doc?.history?.long?.find(r => r.id === 'VIX')?.ctx;
  const vix = R(doc, 'vix') ?? (hv ? { last: hv.last, moved: Math.abs(hv.chg20 ?? 0) >= 3, dir: (hv.chg20 ?? 0) > 0 ? 'up' : 'down' } : null);
  const term = doc?.history?.long?.find(r => r.id === 'VIX_TERM')?.ctx?.last ?? null;
  if (!vix) return { id: 'vol', name: 'Volatility regime', state: null, why: 'VIX not loaded' };
  const inverted = term != null ? term > 1 : null;
  const state = inverted ? 'Stress (curve inverted)' : vix.last >= 22 ? 'Elevated' : vix.last <= 14 ? 'Calm (compressed)' : 'Normal';
  const rows = state.startsWith('Stress') || state === 'Elevated'
    ? [expect(doc, 'spx', DOWN), expect(doc, 'hy', UP), expect(doc, 'usdjpy', DOWN, 'USD/JPY (carry unwinds)'), expect(doc, 'gold', UP)]
    : [expect(doc, 'spx', UP), expect(doc, 'hy', DOWN), expect(doc, 'audusd', UP, 'AUD/USD (carry works)')];
  return { id: 'vol', name: 'Volatility regime', state, why: `VIX ${vix.last.toFixed(1)}${term != null ? `, VIX/VIX3M ${term.toFixed(3)}` : ''}`,
    expectations: rows, conformity: score(rows), evidence: { status: 'stands', ids: ['vix-inversion', 'vol-curve-front', 'forecast-miss-shock-fx'], note: 'Validated here for RANGE: an inverted or dear front means wider ranges ahead. The directional expectations are theory.' } };
}

/** 5. Policy and the curve: bull/bear × steepener/flattener from the 2Y and 10Y moves. */
export function curveRegime(doc) {
  const s2 = R(doc, 'us2y'), s10 = R(doc, 'us10y');
  if (!s2 || !s10 || s2.d20 == null || s10.d20 == null) return { id: 'curve', name: 'Policy & the curve', state: null, why: '2Y or 10Y not loaded' };
  const slope = s10.d20 - s2.d20, level = (s2.d20 + s10.d20) / 2;
  if (Math.abs(slope) < 5 && Math.abs(level) < 8) return { id: 'curve', name: 'Policy & the curve', state: 'Quiet curve', why: `2Y ${s2.d20.toFixed(0)}bp, 10Y ${s10.d20.toFixed(0)}bp`, expectations: [], conformity: score([]), evidence: { status: 'theory' } };
  const bull = level < 0, steep = slope > 0;
  const state = `${bull ? 'Bull' : 'Bear'} ${steep ? 'steepener' : 'flattener'}`;
  const meaning = { 'Bull steepener': 'the market prices cuts (easing or a growth scare)', 'Bear steepener': 'term premium or inflation fear at the long end', 'Bull flattener': 'flight to quality / growth worries', 'Bear flattener': 'a hawkish central bank repricing the front end' }[state];
  const E = { 'Bull steepener': [['dxy', DOWN], ['gold', UP]], 'Bear steepener': [['gold', DOWN], ['nq', DOWN]], 'Bull flattener': [['spx', DOWN], ['usdjpy', DOWN]], 'Bear flattener': [['dxy', UP], ['nq', DOWN]] }[state];
  const rows = E.map(([k, w]) => expect(doc, k, w));
  return { id: 'curve', name: 'Policy & the curve', state, why: `${meaning}: 2Y ${s2.d20 > 0 ? '+' : ''}${s2.d20.toFixed(0)}bp, 10Y ${s10.d20 > 0 ? '+' : ''}${s10.d20.toFixed(0)}bp over 20d`,
    expectations: rows, conformity: score(rows), evidence: { status: 'theory', note: 'Curve-shape → asset direction tested only as single-instrument time series (rate-curve-structure, null); the regime map is theory.' } };
}

/** 6. Risk-on / risk-off: do the classic barometers agree? */
export function riskBarometer(doc) {
  const votes = [['spx', UP], ['hy', DOWN], ['vix', DOWN], ['audusd', UP], ['usdjpy', UP], ['copper', UP], ['gold', DOWN]]
    .map(([k, w]) => { const r = R(doc, k); const d = r ? dir(r) : null; return { key: k, label: r?.label ?? k, riskOn: d == null || d === 'flat' ? null : d === w }; });
  const v = votes.filter(x => x.riskOn !== null), on = v.filter(x => x.riskOn).length;
  const state = !v.length ? null : on / v.length >= 0.7 ? 'Risk-on (broad agreement)' : on / v.length <= 0.3 ? 'Risk-off (broad agreement)' : 'Mixed: barometers disagree';
  return { id: 'risk', name: 'Risk-on / risk-off', state, why: `${on} of ${v.length} moving barometers read risk-on`, votes,
    expectations: [], conformity: null, barometers: { riskOn: on, moving: v.length, of: votes.length }, evidence: { status: 'theory', note: 'A description of agreement, not a lean.' } };
}

/** 7. Capital-flow order (C.OG hierarchy): did information move the way the hierarchy says? From doc.flow. */
export function flowOrder(doc) {
  const f = doc?.flow; if (!f) return { id: 'flow', name: 'Capital-flow order', state: null, why: 'flow not computed' };
  return { id: 'flow', name: 'Capital-flow order (rates → credit → FX → equities → vol)', state: f.textbook == null ? 'Too few layers moved' : f.textbook ? 'Textbook order' : 'Out of order', why: f.text,
    expectations: [], conformity: null, evidence: { status: 'theory', note: 'Same-bar coupling, not a tested lead (rates-pivot-lead: null; capital-flow-lags: exploratory).' } };
}

export function playbook(doc) {
  const frames = [quadrant, dollarSmile, creditCycle, volRegime, curveRegime, riskBarometer, flowOrder].map(f => { try { return f(doc); } catch (e) { return { id: f.name, state: null, why: `error: ${e.message}` }; } });
  const judged = frames.filter(f => f.conformity?.judged);
  const met = judged.reduce((a, f) => a + f.conformity.met, 0), of = judged.reduce((a, f) => a + f.conformity.judged, 0);
  return { frames, overall: of ? { met, of, pct: Math.round(100 * met / of) } : null,
    note: 'Institutional frameworks applied to today: theory priors, labelled with any evidence this repo holds. Where markets break the playbook is where the story is.' };
}
