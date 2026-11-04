/**
 * The world-impact boards (plans/DESK_ANALYST_PIPELINE.md §9ag): the global yield board, the credit board, the
 * liquidity board, the cross-currency basis, the term premium and the World stress strip. Each is built from series
 * the server fetches ([{ date, value }] ascending) and goes two ways: the Desk Terminal and the Desk Pack.
 *
 * Pure. Tested in js/marketBoards.test.mjs.
 */
const r1 = x => (Number.isFinite(x) ? +x.toFixed(1) : null), r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);
const last = s => (s?.length ? s.at(-1) : null);
/** The value n observations before the last (or null). */
const ago = (s, n) => (s?.length > n ? s.at(-1 - n).value : null);
/** Value on or before a date. */
export const asOf = (s, date) => { let v = null; for (const p of s ?? []) { if (p.date <= date) v = p.value; else break; } return v; };
/** Where the last value sits in the last `n` observations (0-100). */
export const pctile = (s, n = 252) => { const w = (s ?? []).slice(-n).map(p => p.value), v = w.at(-1); if (w.length < 20) return null; return Math.round((w.filter(x => x <= v).length / w.length) * 100); };
const z = (s, n = 252) => { const w = (s ?? []).slice(-n).map(p => p.value); if (w.length < 20) return null; const m = w.reduce((a, b) => a + b, 0) / w.length, sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (w.length - 1)); return sd > 0 ? r2((w.at(-1) - m) / sd) : null; };
const spark = (s, n = 60) => (s ?? []).slice(-n).map(p => p.value);

// ── 1. The global yield board ────────────────────────────────────────────────────────────────────────────────────
export const YIELD_COUNTRIES = [
  { ccy: 'USD', name: 'United States', short: 'US', y2: 'Treasury 2Y', y10: 'Treasury 10Y' },
  { ccy: 'EUR', name: 'Germany', short: 'DE', y2: 'Bund 2Y', y10: 'Bund 10Y' },
  { ccy: 'GBP', name: 'United Kingdom', short: 'UK', y2: 'Gilt 5Y', y10: 'Gilt 10Y', note: 'the BoE publishes no clean 2-year gilt series: the 5-year stands in for the front end' },
  { ccy: 'JPY', name: 'Japan', short: 'JP', y2: 'JGB 2Y', y10: 'JGB 10Y' },
  { ccy: 'CAD', name: 'Canada', short: 'CA', y2: 'Canada 2Y', y10: 'Canada 10Y' },
  { ccy: 'AUD', name: 'Australia', short: 'AU', y2: 'ACGB 2Y', y10: 'ACGB 10Y' },
];
/** Correlation of daily changes of two date-keyed series over their last `n` common dates. */
export function changeCorr(a, b, n = 60) {
  const mb = new Map((b ?? []).map(p => [p.date, p.value])), common = (a ?? []).filter(p => mb.has(p.date));
  const da = [], db = []; for (let i = 1; i < common.length; i++) { da.push(common[i].value - common[i - 1].value); db.push(mb.get(common[i].date) - mb.get(common[i - 1].date)); }
  const x = da.slice(-n), y = db.slice(-n); if (x.length < 20) return null;
  const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
  let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; }
  return sx > 0 && sy > 0 ? r2(sxy / Math.sqrt(sx * sy)) : null;
}
/**
 * series: { USD: { y2, y10 }, EUR: {...}, ... } each [{date, value}] in %; fx: { EUR: [{date, value}] } the currency's
 * value in dollars (EURUSD, 1/USDJPY ...) so up = the currency stronger. Per country: the 2y and 10y, the slope, the
 * 20-day changes in bp, the 2y gap to the US and its 20-day change, the currency's 20-day move, and how the 2y gap and
 * the currency have moved together over 60 days (correlation of daily changes).
 */
export function yieldBoard(series, fx = {}) {
  const us2 = series.USD?.y2 ?? [];
  const rows = YIELD_COUNTRIES.map(c => {
    const s = series[c.ccy] ?? {}, y2 = last(s.y2), y10 = last(s.y10);
    const gap = c.ccy === 'USD' ? null : (s.y2 ?? []).map(p => ({ date: p.date, value: p.value - (asOf(us2, p.date) ?? NaN) })).filter(p => Number.isFinite(p.value));
    const f = fx[c.ccy] ?? [];
    return { ...c, y2: y2?.value ?? null, y10: y10?.value ?? null, asOf: [y2?.date, y10?.date].filter(Boolean).sort()[0] ?? null,
      slope: y2 && y10 ? r1((y10.value - y2.value) * 100) : null,
      chg2y20d: y2 && ago(s.y2, 20) != null ? r1((y2.value - ago(s.y2, 20)) * 100) : null, chg10y20d: y10 && ago(s.y10, 20) != null ? r1((y10.value - ago(s.y10, 20)) * 100) : null,
      gapToUs: gap?.length ? r1(gap.at(-1).value * 100) : null, gapChg20d: gap?.length > 20 ? r1((gap.at(-1).value - gap.at(-21).value) * 100) : null,
      fxChg20d: f.length > 20 ? r2((f.at(-1).value / f.at(-21).value - 1) * 100) : null, gapFxCorr: gap ? changeCorr(gap, f) : null,
      spark2y: spark(s.y2), sparkGap: gap ? spark(gap) : [] };
  });
  return { rows, label: 'government yields, daily from each issuer; gap = 2y minus the US 2y (bp); currency move vs the dollar' };
}

// ── 2. The credit board ──────────────────────────────────────────────────────────────────────────────────────────
export const CREDIT_SERIES = [
  { id: 'BAMLC0A0CM', label: 'US investment grade', group: 'US' }, { id: 'BAMLC0A4CBBB', label: 'US BBB', group: 'US' },
  { id: 'BAMLH0A0HYM2', label: 'US high yield', group: 'US' }, { id: 'BAMLH0A3HYC', label: 'US CCC', group: 'US' },
  { id: 'BAMLHE00EHYIOAS', label: 'Euro high yield', group: 'Europe' }, { id: 'BAMLEMCBPIOAS', label: 'EM corporate', group: 'EM' },
];
/** series: { FREDID: [{date, value}] } option-adjusted spreads in %. Spreads reported in bp. */
export function creditBoard(series) {
  const rows = CREDIT_SERIES.map(c => { const s = series[c.id] ?? [], l = last(s);
    return { ...c, oas: l ? Math.round(l.value * 100) : null, asOf: l?.date ?? null, chg20d: l && ago(s, 20) != null ? Math.round((l.value - ago(s, 20)) * 100) : null,
      pctile1y: pctile(s), pctile5y: pctile(s, 1260), z1y: z(s), spark: spark(s, 120) }; });
  const hy = rows.find(r => r.id === 'BAMLH0A0HYM2');
  const state = !hy?.oas ? null : hy.chg20d >= 75 || hy.pctile1y >= 90 ? 'stress' : hy.chg20d >= 30 || hy.pctile1y >= 75 ? 'widening' : hy.pctile1y <= 15 ? 'tight' : 'normal';
  return { rows, state, label: 'ICE BofA option-adjusted spreads via FRED; bp; percentile = where today sits in the last year' };
}

// ── 3. The liquidity board ───────────────────────────────────────────────────────────────────────────────────────
/**
 * Fed net liquidity = the Fed's balance sheet (WALCL, $m weekly) minus the Treasury General Account (WTREGEN, $m
 * weekly) minus reverse repo (RRPONTSYD, $bn daily); reserves (WRESBAL, $m weekly) beside it. Reported in $bn.
 */
export function liquidityBoard({ WALCL = [], WTREGEN = [], RRPONTSYD = [], WRESBAL = [] } = {}) {
  const net = WALCL.map(p => { const tga = asOf(WTREGEN, p.date), rrp = asOf(RRPONTSYD, p.date); return tga != null && rrp != null ? { date: p.date, value: (p.value - tga) / 1000 - rrp } : null; }).filter(Boolean);
  const chg = (s, n) => (s.length > n ? r1(s.at(-1).value - s.at(-1 - n).value) : null);
  const item = (label, s, scale = 1, weeks = true) => { const v = s.map(p => ({ date: p.date, value: p.value * scale })), l = last(v); return { label, value: l ? r1(l.value) : null, asOf: l?.date ?? null, chg4w: weeks ? chg(v, 4) : chg(v, 20), chg13w: weeks ? chg(v, 13) : chg(v, 65), pctile: pctile(v, weeks ? 260 : 1260), spark: spark(v, weeks ? 52 : 120) }; };
  const items = [item('Net liquidity', net), item('Fed balance sheet', WALCL, 1 / 1000), item('Treasury cash (TGA)', WTREGEN, 1 / 1000), item('Reverse repo', RRPONTSYD, 1, false), item('Bank reserves', WRESBAL, 1 / 1000)];
  const n = items[0], state = n.chg4w == null ? null : n.chg4w <= -150 ? 'draining' : n.chg4w >= 150 ? 'adding' : 'steady';
  return { items, state, label: '$bn; net liquidity = Fed assets - TGA - reverse repo (weekly)' };
}

// ── 4. Cross-currency basis ──────────────────────────────────────────────────────────────────────────────────────
/**
 * Covered-interest-parity basis in bp, exactly as scripts/xccy-basis/build.py: F and S in USD per unit of the foreign
 * currency, t = days from spot value to delivery, ru and rf overnight rates in %, fxBasis 360 (EUR, JPY, CHF) or 365
 * (GBP). Negative = dollars are expensive offshore.
 */
export const xccyBasis = (F, S, t, ru, rf, fxBasis = 360) => ((S * (1 + (ru / 100) * t / 360) / F - 1) * fxBasis / t * 100 - rf) * 100;
export const XCCY = { EUR: { root: '6E', fxBasis: 360, rate: '€STR' }, GBP: { root: '6B', fxBasis: 365, rate: 'SONIA' }, JPY: { root: '6J', fxBasis: 360, rate: 'TONA' }, CHF: { root: '6S', fxBasis: 360, rate: 'SARON (policy rate proxy)' } };
/** The live board from the laptop's pull: { asOf, legs: { EUR: { F, S, t, contract } } } and overnight rates { USD, EUR, GBP, JPY, CHF } (%). */
export function basisBoard(pull, rates, history = {}) {
  const rows = Object.entries(XCCY).map(([ccy, c]) => {
    const l = pull?.legs?.[ccy], ru = rates?.USD, rf = rates?.[ccy];
    const b = l && [l.F, l.S, l.t, ru, rf].every(Number.isFinite) && l.t >= 10 ? r1(xccyBasis(l.F, l.S, l.t, ru, rf, c.fxBasis)) : null;
    const h = history[ccy] ?? [];
    return { ccy, ...c, basis: b, contract: l?.contract ?? null, t: l?.t ?? null, chg5d: b != null && h.length > 5 ? r1(b - h.at(-6).value) : null, spark: [...h.map(p => p.value).slice(-59), ...(b != null ? [b] : [])] };
  });
  const jpy = rows.find(r => r.ccy === 'JPY')?.basis, eur = rows.find(r => r.ccy === 'EUR')?.basis;
  const worst = Math.min(...rows.map(r => r.basis).filter(Number.isFinite));
  const state = !Number.isFinite(worst) ? null : worst <= -60 ? 'dollar squeeze' : worst <= -30 ? 'dollars dear' : 'normal';
  return { asOf: pull?.asOf ?? null, rows, state, eur, jpy, label: 'bp; negative = dollars are expensive offshore; front CME FX future with at least 25 days to delivery vs spot, overnight rates held flat' };
}

// ── 5. Term premium ──────────────────────────────────────────────────────────────────────────────────────────────
/** Kim-Wright 10-year term premium (FRED THREEFYTP10, %, daily) beside the 10y yield: how much of the 10y is term premium. */
export function termPremium(tp = [], y10 = []) {
  const l = last(tp), y = asOf(y10, l?.date ?? '');
  return l ? { value: r2(l.value), asOf: l.date, chg20d: ago(tp, 20) != null ? Math.round((l.value - ago(tp, 20)) * 100) : null, chg60d: ago(tp, 60) != null ? Math.round((l.value - ago(tp, 60)) * 100) : null,
    pctile5y: pctile(tp, 1260), y10: y, expectations: y != null ? r2(y - l.value) : null, spark: spark(tp, 120),
    label: 'Kim-Wright 10-year term premium (Fed Board, via FRED): the extra yield for holding a 10-year bond rather than rolling short bills; the rest of the 10y is the expected path of short rates' } : null;
}

// ── 6. The World stress strip ────────────────────────────────────────────────────────────────────────────────────
const LV = { ok: 0, watch: 1, stress: 2 };
/**
 * One line, every input green / amber / red, and an overall reading. inputs: { risk, credit, funding, em, liquidity,
 * basis, cycle, termPremium } each already-built board (or null when unavailable).
 */
export function worldStress(i = {}) {
  const tiles = [];
  const add = (id, label, level, detail) => { if (level) tiles.push({ id, label, level, detail }); };
  if (i.risk?.level) add('risk', 'Risk flags', i.risk.level === 'RISK_OFF' ? 'stress' : i.risk.level === 'CAUTION' ? 'watch' : 'ok', `${i.risk.active ?? 0} of ${i.risk.available ?? 0} flags on`);
  if (i.credit?.state) add('credit', 'Credit', i.credit.state === 'stress' ? 'stress' : i.credit.state === 'widening' ? 'watch' : 'ok', (() => { const h = i.credit.rows.find(r => r.id === 'BAMLH0A0HYM2'); return h ? `HY ${h.oas}bp (${h.chg20d >= 0 ? '+' : ''}${h.chg20d} in 20d)` : ''; })());
  if (i.funding?.items) { const fl = i.funding.flags?.length ?? 0; add('funding', 'Dollar funding', fl >= 2 ? 'stress' : fl === 1 ? 'watch' : 'ok', fl ? `${fl} plumbing flag${fl > 1 ? 's' : ''}` : 'plumbing quiet'); }
  if (i.basis?.state) add('basis', 'Cross-currency basis', i.basis.state === 'dollar squeeze' ? 'stress' : i.basis.state === 'dollars dear' ? 'watch' : 'ok', [i.basis.eur != null ? `EUR ${i.basis.eur}bp` : '', i.basis.jpy != null ? `JPY ${i.basis.jpy}bp` : ''].filter(Boolean).join(', '));
  if (i.em?.stress) add('em', 'EM carry', i.em.stress.level === 'stress' ? 'stress' : i.em.stress.level === 'watch' ? 'watch' : 'ok', `z ${i.em.stress.z}`);
  if (i.liquidity?.state) add('liquidity', 'Fed liquidity', i.liquidity.state === 'draining' ? 'watch' : 'ok', i.liquidity.items?.[0]?.chg4w != null ? `net ${i.liquidity.items[0].chg4w >= 0 ? '+' : ''}${i.liquidity.items[0].chg4w}bn in 4w` : '');
  if (i.termPremium?.chg20d != null) add('tp', 'Term premium', i.termPremium.chg20d >= 25 ? 'watch' : 'ok', `${i.termPremium.value}% (${i.termPremium.chg20d >= 0 ? '+' : ''}${i.termPremium.chg20d}bp in 20d)`);
  if (i.cycle?.summary) { const s = i.cycle.summary, h = s.banks ? s.hiking / s.banks : 0; add('cycle', 'Global rate cycle', h >= 0.4 ? 'watch' : 'ok', `${s.hiking} hiking, ${s.cutting} cutting of ${s.banks}`); }
  const score = tiles.reduce((a, t) => a + LV[t.level], 0), reds = tiles.filter(t => t.level === 'stress').length;
  const overall = !tiles.length ? null : reds >= 2 || score >= tiles.length ? 'stress' : reds === 1 || score >= 2 ? 'watch' : 'calm';
  return { overall, score, tiles, label: 'each input green (ok), amber (watch) or red (stress); overall stress with two reds, watch with one red or two ambers' };
}
