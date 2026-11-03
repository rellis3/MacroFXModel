/**
 * Phase 10: attribution by layer (plans/DESK_ANALYST_PIPELINE.md §9o). Which stage earned or lost the day?
 *
 * The desk works top down, so each layer can be scored as a book of its own on the same day's moves (08:00 to 21:00
 * London, in u, clipped at 3, exactly as js/deskScore.js scores a card):
 *   global    the global ruling alone: risk-on longs the risk assets, risk-off shorts them, mixed stands aside;
 *   currency  the currency ranking alone: a pair takes the sign of base bias minus quote bias; USD-priced markets
 *             take minus the dollar's bias; an index is left to the global layer;
 *   desks     the asset desks' ratings, before the risk desk and the Head;
 *   head      the Head's book, unweighted;
 *   sized     the Head's book weighted by size after the cap (the scored day score, S).
 * Each layer's score is the mean of direction x move over the markets it takes a side on. What each layer added is
 * its score minus the layer it was built on: desks minus currency, head minus desks, sized minus head.
 *
 * Descriptive only (prereg amendment A4): none of this is a scored cell. Pure. Tested in js/deskAttribution.test.mjs.
 */
import { scoreCard, windowFor, cardDir } from './deskScore.js';
import { DESK_UNIVERSE, instrumentLegs } from './deskPack.js';

const RISK = ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100', 'BTCUSD', 'COPPER', 'WTI', 'BRENT', 'AUDJPY', 'NZDJPY', 'AUDUSD', 'NZDUSD'];
const INDICES = new Set(DESK_UNIVERSE.indices);
const FX = new Set([...DESK_UNIVERSE.fx_majors, ...DESK_UNIVERSE.fx_crosses]);
const r3 = x => (Number.isFinite(x) ? +x.toFixed(3) : null);
const sgn = x => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** Every market's move in u over the window (a long card's score), from the book's levels. */
export function dayMovesU(cards, barsByInst, date) {
  const win = windowFor(date), out = {};
  for (const [n, c] of Object.entries(cards ?? {})) { const s = scoreCard({ rating: 'LONG', levels: c.levels }, barsByInst?.[n], win); if (s && !s.missing) out[n] = s.R; }
  return out;
}

/** The layers' own directions for each market. */
export function layerViews(run) {
  const tone = run?.debate?.global?.view?.tone ?? run?.head?.book?.global?.tone ?? 'mixed';
  const t = /on/.test(tone) && !/off/.test(tone) ? 1 : /off/.test(tone) ? -1 : 0;
  const bias = Object.fromEntries(Object.entries(run?.debate?.currency?.view?.currencies ?? run?.head?.book?.currencies ?? {}).map(([k, v]) => [k, Number(v?.bias) || 0]));
  const cards = run?.head?.book?.instruments ?? {}, desks = {};
  for (const a of Object.values(run?.debate?.assets ?? {})) for (const [n, c] of Object.entries(a?.view?.instruments ?? {})) desks[n] = cardDir(c.rating);
  const views = { global: {}, currency: {}, desks, head: {} };
  for (const n of Object.keys(cards)) {
    views.global[n] = RISK.includes(n) ? t : 0;
    if (FX.has(n)) { const [b, q] = instrumentLegs(n); views.currency[n] = sgn((bias[b] ?? 0) - (bias[q] ?? 0)); }
    else views.currency[n] = INDICES.has(n) ? 0 : sgn(-(bias.USD ?? 0));
    views.head[n] = cardDir(cards[n].rating);
  }
  return views;
}

const bookScore = (view, moves) => { const xs = Object.entries(view).filter(([n, d]) => d && moves[n] != null).map(([n, d]) => Math.max(-3, Math.min(3, d * moves[n]))); return { n: xs.length, score: xs.length ? r3(xs.reduce((s, x) => s + x, 0) / xs.length) : null }; };

/** The day's attribution. S is the scored, size-weighted day score from js/deskScore.js. */
export function attribution(run, barsByInst, date, S = null) {
  const moves = dayMovesU(run?.head?.book?.instruments, barsByInst, date), v = layerViews(run);
  const layers = { global: bookScore(v.global, moves), currency: bookScore(v.currency, moves), desks: bookScore(v.desks, moves), head: bookScore(v.head, moves), sized: { n: null, score: r3(S) } };
  const d = (a, b) => (layers[a].score != null && layers[b].score != null ? r3(layers[a].score - layers[b].score) : null);
  // where the Head changed the desks' view, and how those changes did
  const changed = Object.keys(v.head).filter(n => v.desks[n] != null && v.head[n] !== v.desks[n] && moves[n] != null);
  return {
    label: 'descriptive, not a scored cell (prereg amendment A4)',
    layers,
    added: { desksOverCurrency: d('desks', 'currency'), headOverDesks: d('head', 'desks'), sizingOverHead: d('sized', 'head') },
    headChanges: { n: changed.length, net: changed.length ? r3(changed.reduce((s, n) => s + (v.head[n] - v.desks[n]) * moves[n], 0) / changed.length) : null },
  };
}

/** Running averages of each layer and each step over the scored days (rows from the score index). */
export function attributionRecord(rows) {
  const xs = rows.filter(r => r.eligible && r.attribution).map(r => r.attribution);
  const mean = f => { const v = xs.map(f).filter(Number.isFinite); return v.length ? { days: v.length, mean: r3(v.reduce((s, x) => s + x, 0) / v.length), positive: v.filter(x => x > 0).length } : null; };
  return {
    days: xs.length,
    layers: Object.fromEntries(['global', 'currency', 'desks', 'head', 'sized'].map(k => [k, mean(a => a.layers?.[k]?.score)])),
    added: Object.fromEntries(['desksOverCurrency', 'headOverDesks', 'sizingOverHead'].map(k => [k, mean(a => a.added?.[k])])),
  };
}
