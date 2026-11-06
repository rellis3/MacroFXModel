/**
 * The scenario engine (owner's build list item 2, 2026-11-04; plans/DESK_ANALYST_PIPELINE.md §9ak).
 *
 * "What if the Fed hikes 25bp, oil +10%, VIX to 30?" A scenario is a set of shocks on the drivers of
 * js/factorRisk.js (USD %, CARRY %, RISK %, COMMOD %, RATES bp, and OIL %, VIX points, US10Y bp, GOLD %). Each shock is
 * a change, or { to: level } for VIX and the yields ("VIX to 30" = 30 less today's close).
 *
 * HOW A SHOCK SPREADS. Drivers that are not shocked are filled in by their history with the shocked ones: the Gaussian
 * conditional expectation E[rest | shocked] = Σ_rs Σ_ss⁻¹ s on the joint daily covariance (mode "conditional", the
 * default). So "oil +10%" moves the commodity factor through oil's share of it, and the dollar and risk factors by
 * however much they have moved with oil. Mode "isolated" moves only the factors named (aux drivers such as OIL and
 * VIX still map onto the factors, since they are not factors themselves). Then every instrument moves by Σ β·factor
 * (its historical sensitivity), and the book's P&L is Σ x·move in card-σ (js/factorRisk.js units) and in % of the
 * book's gross notional. A linear, one-day map: big shocks are where linear betas are least reliable, and the R² of
 * each fit says how much of a market the factors explain at all.
 *
 * REPLAYS. Declared windows (picked by event, not by the book's results), replayed with the instruments' realised
 * moves over the window where the price history covers it; instruments it does not cover are listed.
 *
 * Pure. Tested in js/scenarioEngine.test.mjs.
 */
import { DRIVERS, FACTORS, CCY_LEGS, solve, positions, commonDates, rnd } from './factorRisk.js';

export const STANDARD_SCENARIOS = [
  { key: 'fed_hike_25', label: 'Fed surprise hike, +25bp', shocks: { RATES: 25 }, note: 'an unexpected hike: the US 2-year up 25bp. A hike already priced moves nothing.' },
  { key: 'fed_cut_25', label: 'Fed surprise cut, −25bp', shocks: { RATES: -25 } },
  { key: 'oil_up_10', label: 'Oil +10%', shocks: { OIL: 10 } },
  { key: 'vix_30', label: 'VIX to 30', shocks: { VIX: { to: 30 } } },
  { key: 'usd_up_2', label: 'Dollar +2%', shocks: { USD: 2 } },
  { key: 'carry_unwind', label: 'Carry unwind, carry factor −1.5%', shocks: { CARRY: -1.5 } },
  { key: 'risk_off_day', label: 'Risk-off day (average of the worst 5% S&P days)', special: 'riskOffDay' },
  { key: 'owner_combo', label: 'Fed +25bp, oil +10%, VIX to 30', shocks: { RATES: 25, OIL: 10, VIX: { to: 30 } } },
];
// Declared by event before any book was scored on them. Close of `from` to close of `to` (OANDA 17:00 New York days).
export const REPLAYS = [
  { key: 'covid_2020', label: 'COVID dash for cash, March 2020', from: '2020-03-06', to: '2020-03-19' },
  { key: 'fed_2022', label: '2022 Fed: the June CPI shock and 75bp hike', from: '2022-06-09', to: '2022-06-16' },
  { key: 'svb_2023', label: 'SVB, March 2023', from: '2023-03-08', to: '2023-03-13' },
  { key: 'yen_carry_2024', label: 'Yen carry unwind, August 2024', from: '2024-07-31', to: '2024-08-05' },
  { key: 'tariffs_2025', label: 'Tariff shock, April 2025', from: '2025-04-02', to: '2025-04-08' },
];
const LEVEL_OF = { VIX: 'VIX', RATES: 'US2Y', US10Y: 'US10Y' };
const LEVEL_SCALE = { VIX: 1, RATES: 100, US10Y: 100 };   // a level in % → a change in bp

/** Shocks → { key: change }, with errors for unknown drivers or levels the model has no close for. */
export function normaliseShocks(model, shocks) {
  const out = {}, errors = [], known = new Set(DRIVERS.map(d => d.key));
  for (const [k0, v] of Object.entries(shocks ?? {})) {
    const k = String(k0).toUpperCase();
    if (!known.has(k)) { errors.push(`${k0}: not a driver (use ${[...known].join(', ')})`); continue; }
    if (!model.joint.includes(k)) { errors.push(`${k}: no history for this driver today`); continue; }
    let ch = null;
    if (v && typeof v === 'object' && Number.isFinite(+v.to)) {
      const lv = model.levels?.[LEVEL_OF[k]];
      if (!LEVEL_OF[k]) { errors.push(`${k}: a level ("to") is only for VIX, RATES and US10Y`); continue; }
      if (!lv) { errors.push(`${k}: no current level to shock from`); continue; }
      ch = (+v.to - lv.value) * LEVEL_SCALE[k];
    } else if (Number.isFinite(+v) && v !== null && v !== '') ch = +v;
    if (ch === null) { errors.push(`${k}: give a number or { "to": level }`); continue; }
    out[k] = ch;
  }
  return { shocks: out, errors };
}

/** Fill the drivers that are not shocked. Returns { KEY: { value, given } } over the model's joint drivers. */
export function fillDrivers(model, shocks, { mode = 'conditional' } = {}) {
  const K = model.joint, C = model.jointCov, idx = Object.fromEntries(K.map((k, i) => [k, i]));
  const given = Object.keys(shocks).filter(k => k in idx);
  const out = Object.fromEntries(K.map(k => [k, { value: k in shocks ? shocks[k] : 0, given: k in shocks }]));
  // conditional: on every shock; isolated: only aux shocks spread, and only onto the factors not named
  const cond = mode === 'isolated' ? given.filter(k => !model.factors.includes(k)) : given;
  if (!C || !cond.length) return out;
  const Css = cond.map(a => cond.map(b => C[idx[a]][idx[b]])), coef = solve(Css, cond.map(k => shocks[k]));
  if (!coef) return out;
  for (const k of K) {
    if (out[k].given) continue;
    if (mode === 'isolated' && !model.factors.includes(k)) continue;
    out[k].value = cond.reduce((s, a, j) => s + C[idx[k]][idx[a]] * coef[j], 0);
  }
  return out;
}

/** Each instrument's move (%) from a factor vector { KEY: value }, through its betas. */
export function instrumentMoves(model, f) {
  return Object.fromEntries(Object.entries(model.instruments).filter(([, m]) => m.ok).map(([n, m]) => [n, model.factors.reduce((s, k) => s + m.beta[k] * (f[k] ?? 0), 0)]));
}
/** Each currency against the dollar (%), from the majors' moves. */
export function currencyMoves(moves) {
  return Object.fromEntries(Object.entries(CCY_LEGS).filter(([, [p]]) => Number.isFinite(moves[p])).map(([c, [p, s]]) => [c, rnd(s * moves[p], 3)]));
}

/** The book's P&L on a set of instrument moves (%): card-σ and % of gross notional, with each card's share. */
export function bookPnl(model, cards, moves) {
  const { live, uncovered } = positions(model, cards), grossX = live.reduce((s, p) => s + Math.abs(p.x), 0);
  const rows = live.filter(p => Number.isFinite(moves[p.name])).map(p => ({ name: p.name, weight: rnd(p.w, 2), move: rnd(moves[p.name], 3), pnl: rnd(p.x * moves[p.name], 3) }));
  const pnl = live.reduce((s, p) => s + (Number.isFinite(moves[p.name]) ? p.x * moves[p.name] : 0), 0);
  return { pnl: rnd(pnl, 3), pnlPct: grossX > 0 ? rnd(pnl / grossX, 3) : null, cards: rows.sort((a, b) => a.pnl - b.pnl), missing: [...uncovered, ...live.filter(p => !Number.isFinite(moves[p.name])).map(p => p.name)] };
}

/** One scenario on the book. shocks as in normaliseShocks. */
export function runScenario(model, cards, shocks, { mode = 'conditional', label = 'custom', top = 6 } = {}) {
  const { shocks: s, errors } = normaliseShocks(model, shocks);
  if (!Object.keys(s).length) return { ok: false, label, errors: errors.length ? errors : ['no shocks given'] };
  const drivers = fillDrivers(model, s, { mode });
  const f = Object.fromEntries(model.factors.map(k => [k, drivers[k]?.value ?? 0]));
  const moves = instrumentMoves(model, f), book = bookPnl(model, cards, moves);
  return { ok: true, label, mode, errors, drivers: Object.fromEntries(Object.entries(drivers).map(([k, v]) => [k, { value: rnd(v.value, 3), given: v.given }])),
    book: { pnl: book.pnl, pnlPct: book.pnlPct, worst: book.cards.filter(c => c.pnl < 0).slice(0, top), best: book.cards.filter(c => c.pnl > 0).reverse().slice(0, top), missing: book.missing },
    currencies: currencyMoves(moves), moves: Object.fromEntries(Object.entries(moves).map(([k, v]) => [k, rnd(v, 3)])) };
}

/** The average driver move on the worst q of RISK days over the joint history (every driver given). */
export function riskOffShock(model, { q = 0.05 } = {}) {
  const D = model._drivers, dates = commonDates(model.joint.map(k => D[k]));
  if (!D.RISK || dates.length < 100) return null;
  const sorted = [...dates].sort((a, b) => D.RISK.get(a) - D.RISK.get(b)), worst = sorted.slice(0, Math.max(5, Math.floor(q * dates.length)));
  return { shocks: Object.fromEntries(model.joint.map(k => [k, worst.reduce((s, d) => s + D[k].get(d), 0) / worst.length])), n: worst.length, from: dates[0], to: dates.at(-1) };
}

/** A declared window replayed with realised moves (sum of daily log returns after `from` up to `to`). */
export function replay(model, cards, rep, { top = 4 } = {}) {
  const R = model._returns, moves = {}, notCovered = [];
  for (const [n, m] of Object.entries(R)) {
    const ds = [...m.keys()];
    if (!ds.length || ds[0] > rep.from || ds.at(-1) < rep.to) { notCovered.push(n); continue; }
    let s = 0, k = 0; for (const d of ds) if (d > rep.from && d <= rep.to) { s += m.get(d); k++; }
    if (k) moves[n] = s; else notCovered.push(n);
  }
  const D = model._drivers ?? {}, drv = {};
  for (const k of model.joint) { const m = D[k]; if (!m) continue; const ds = [...m.keys()]; if (!ds.length || ds[0] > rep.from) continue; let s = 0; for (const d of ds) if (d > rep.from && d <= rep.to) s += m.get(d); drv[k] = rnd(s, 2); }
  const book = bookPnl(model, cards, moves);
  const liveMissing = book.missing;
  return { key: rep.key, label: rep.label, from: rep.from, to: rep.to, covered: Object.keys(moves).length > 0, pnl: book.pnl, pnlPct: book.pnlPct, worst: book.cards.slice(0, top), missing: liveMissing, drivers: drv, notCovered: notCovered.length };
}

/** The standard set and the replays on a book. { top, replayTop } list more cards per row (the Desk Terminal's scenario map asks for every card). */
export function standardScenarios(model, cards, { top = 6, replayTop = 4 } = {}) {
  const rows = STANDARD_SCENARIOS.map(sc => {
    if (sc.special === 'riskOffDay') {
      const ro = riskOffShock(model);
      if (!ro) return { key: sc.key, label: sc.label, ok: false, errors: ['not enough joint history'] };
      return { key: sc.key, ...runScenario(model, cards, ro.shocks, { label: sc.label, top }), basis: `${ro.n} worst S&P days, ${ro.from} to ${ro.to}` };
    }
    return { key: sc.key, note: sc.note, ...runScenario(model, cards, sc.shocks, { label: sc.label, top }) };
  });
  return { scenarios: rows.map(({ moves, ...r }) => r), replays: REPLAYS.map(r => replay(model, cards, r, { top: replayTop })) };
}

/** Compact text for a prompt (risk desk, Head, Ask the desk): exposure, VaR, concentration, scenarios. */
export function bookRiskText(risk, scen, { title = 'the book' } = {}) {
  if (!risk?.ok) return `(book factor risk not available: ${risk?.reason ?? risk?.error ?? 'no data'})`;
  const p = risk.var.parametric, h = risk.var.historical, L = [];
  L.push(`Units: card-σ (one size-1 card moving one daily σ = 1); % = of the book's gross notional when each card holds notional of size ÷ σ. ${risk.cards} live cards in ${title}, ${risk.days} common days (${risk.from} to ${risk.to}).`);
  L.push(`Book daily σ ${risk.sigma} card-σ (${risk.sigmaPct}%). 1-day VaR/ES parametric 95% ${p['0.95'].var}/${p['0.95'].es}, 99% ${p['0.99'].var}/${p['0.99'].es}${h ? `; historical 95% ${h['0.95'].var}/${h['0.95'].es}, 99% ${h['0.99'].var}/${h['0.99'].es}` : ''} card-σ. Worst day held: ${risk.var.worstDay.pnl} on ${risk.var.worstDay.date}.`);
  L.push(`Concentration: effective bets ${risk.concentration.effectiveBets} by correlation, ${risk.concentration.enb} by principal components; top factor ${risk.concentration.topFactor?.label ?? '-'} ${Math.round((risk.concentration.topFactor?.share ?? 0) * 100)}% of risk; stock-specific ${Math.round(risk.idiosyncraticShare * 100)}%.${risk.concentration.flag ? ` WARNING: ${risk.concentration.flag}.` : ''}`);
  L.push(`Factor exposure (card-σ for a one-σ factor move; share of book risk): ${risk.factors.map(f => `${f.label} ${f.perSigma > 0 ? '+' : ''}${f.perSigma} (${Math.round(f.share * 100)}%; ${f.cards.slice(0, 3).map(c => c.name).join(', ')})`).join('; ')}.`);
  L.push(`Top risk contributors (share of variance): ${risk.contributors.slice(0, 6).map(c => `${c.name} ${Math.round(c.share * 100)}%`).join(', ')}.${risk.uncovered?.length ? ` No history: ${risk.uncovered.join(', ')}.` : ''}`);
  if (scen) {
    L.push(`Scenarios (book P&L, card-σ / %): ${scen.scenarios.filter(s => s.ok).map(s => `${s.label}: ${s.book.pnl} / ${s.book.pnlPct}%${s.book.worst[0] ? ` (worst ${s.book.worst[0].name} ${s.book.worst[0].pnl})` : ''}`).join('; ')}.`);
    const rp = scen.replays.filter(r => r.covered);
    if (rp.length) L.push(`Replays with realised moves: ${rp.map(r => `${r.label} (${r.from} to ${r.to}): ${r.pnl} / ${r.pnlPct}%${r.missing.length ? `, ${r.missing.length} cards without history` : ''}`).join('; ')}.`);
  }
  L.push('Description on the history, not a forecast: betas are linear and move; in a crisis correlations rise.');
  return L.join('\n');
}

export const SCENARIO_DRIVERS = DRIVERS.map(d => ({ key: d.key, label: d.label, unit: d.unit, factor: FACTORS.some(f => f.key === d.key) }));

/**
 * "Ask the desk" questions in plain words → shocks, when the question names them: "Fed hikes 25bp", "oil +10%",
 * "VIX to 30", "dollar down 2%", "S&P −3%", "2y +20bp", "10y −15bp", "gold +5%". Returns {} when it finds none; the
 * model then answers from the standard set.
 */
export function parseScenarioQuestion(q) {
  const s = String(q ?? '').toLowerCase().replace(/[−–]/g, '-'), out = {};
  const NEG = /(cut|cuts|lower|lowers|down|fall|falls|drop|drops|slump|slumps|crash|crashes|weaker|minus)\s*$/;
  const val = (pre, num) => { const v = Math.abs(+num); return NEG.test(pre) || /^-/.test(num) ? -v : v; };
  const grab = (key, re) => { const m = s.match(re); if (m) out[key] = val(m[1] ?? '', m[2]); };
  // the Fed: "fed hikes 25bp", "a 50bp fed cut", "fomc cuts by 25 bp"
  let m = s.match(/\b(?:fed|fomc|powell)\b[^.?!]{0,30}?\b(hikes?|raises?|cuts?|lowers?)\b[^.?!\d]{0,12}?(\d+(?:\.\d+)?)\s*(?:bp|bps|basis)/);
  if (m) out.RATES = (/cut|lower/.test(m[1]) ? -1 : 1) * +m[2];
  else if ((m = s.match(/(\d+(?:\.\d+)?)\s*(?:bp|bps)\s*(?:fed\s*|fomc\s*)?(hike|raise|cut)/))) out.RATES = (m[2] === 'cut' ? -1 : 1) * +m[1];
  else grab('RATES', /\b(?:us\s*)?2[\s-]?y(?:ear|r)?s?\b([^.?!\d]{0,15}?)([+-]?\d+(?:\.\d+)?)\s*(?:bp|bps)/);
  grab('US10Y', /\b(?:us\s*)?10[\s-]?y(?:ear|r)?s?\b([^.?!\d]{0,15}?)([+-]?\d+(?:\.\d+)?)\s*(?:bp|bps)/);
  grab('OIL', /\b(?:oil|crude|wti|brent)\b([^.?!\d]{0,15}?)([+-]?\d+(?:\.\d+)?)\s*%/);
  grab('USD', /\b(?:dollar|usd|dxy|greenback)\b([^.?!\d]{0,15}?)([+-]?\d+(?:\.\d+)?)\s*%/);
  grab('RISK', /(?:s&p|\bspx\b|\bstocks\b|\bequities\b|\bnasdaq\b)([^.?!\d]{0,15}?)([+-]?\d+(?:\.\d+)?)\s*%/);
  grab('GOLD', /\b(?:gold|xau)\b([^.?!\d]{0,15}?)([+-]?\d+(?:\.\d+)?)\s*%/);
  m = s.match(/\bvix\b[^.?!\d]{0,15}?(?:to|at|hits?|of|reaches)\s*(\d+(?:\.\d+)?)/);
  if (m) out.VIX = { to: +m[1] };
  else grab('VIX', /\bvix\b([^.?!\d]{0,15}?)([+-]?\d+(?:\.\d+)?)\s*(?:pts?|points?)/);
  return out;
}
