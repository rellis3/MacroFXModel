/**
 * The post-mortem desk (plans/DESK_ANALYST_PIPELINE.md §9ad): what went wrong with a backtested system and what might
 * bring it back, measured before any agent reads it, and measured honestly.
 *
 * Every number here is on the system's standard trades (js/systemExports.js). The diagnostics:
 *   decay        the result by year and first half against second half: did it stop working, or never work?
 *   exits        from MAE and MFE (in R): losers that were ≥1R in profit first (exits give back), winners that came
 *                within 0.2R of the stop (stop too tight), and a what-if grid of fixed stop/target pairs. The grid is
 *                conservative: when a trade's MAE and MFE both reach the levels, the stop is assumed to come first.
 *   slices       every one-variable filter the trades allow: instrument, direction, entry hour (London), weekday,
 *                month, holding time, each tag, and terciles of any numeric feature on the trades
 *   honest test  filters are CHOSEN on the first half of the trades (by time) and SCORED on the second half only.
 *                Each slice's second-half p (one-sided Welch test of the slice against the rest of the second half)
 *                goes through Benjamini-Hochberg across every slice tried,
 *                and the filtered system (drop the slices that lost in the first half) is scored on the second
 *                half against the unfiltered second half
 *   equity curve a causal filter: trade only while the last k trades' mean R is above zero (k = 10, 20, 50)
 * The agents (desk/roles/postmortem_panel.md, then the validation desk) read this, never the raw trades, so their
 * ideas start from measured facts and say which are in-sample.
 *
 * Pure. Tested in js/systemReview.test.mjs.
 */
import { london } from './systemExports.js';

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const r3 = x => (Number.isFinite(x) ? +x.toFixed(3) : null);
const fin = Number.isFinite;
// one-sided p for mean > 0 (normal approximation of the t; fine for n >= 20)
const pUp = a => { if (a.length < 5) return 1; const s = sd(a); if (!(s > 0)) return mean(a) > 0 ? 0 : 1; const z = mean(a) / (s / Math.sqrt(a.length)); return 0.5 * erfc(z / Math.SQRT2); };
function erfc(x) { const t = 1 / (1 + 0.5 * Math.abs(x)), y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : 2 - y; }
// one-sided p that mean(a) > mean(b) (Welch z)
const pDiff = (a, b) => { if (a.length < 5 || b.length < 5) return 1; const v = sd(a) ** 2 / a.length + sd(b) ** 2 / b.length; if (!(v > 0)) return mean(a) > mean(b) ? 0 : 1; return 0.5 * erfc((mean(a) - mean(b)) / Math.sqrt(v) / Math.SQRT2); };
const stat = rs => ({ n: rs.length, meanR: r3(mean(rs)), hit: rs.length ? r3(rs.filter(x => x > 0).length / rs.length) : null, totalR: r3(rs.reduce((a, b) => a + b, 0)) });

/** Benjamini-Hochberg: which of the p-values pass at q. */
export function bh(ps, q = 0.1) {
  const idx = ps.map((p, i) => [p, i]).filter(([p]) => fin(p)).sort((a, b) => a[0] - b[0]), m = idx.length, pass = new Array(ps.length).fill(false);
  let k = -1; idx.forEach(([p], i) => { if (p <= ((i + 1) / m) * q) k = i; });
  for (let i = 0; i <= k; i++) pass[idx[i][1]] = true;
  return pass;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const holdBucket = ms => { const h = ms / 3600e3; return h < 1 ? '<1h' : h < 4 ? '1-4h' : h < 24 ? '4-24h' : h < 120 ? '1-5d' : '>5d'; };
const hourBucket = h => (h < 7 ? '00-07' : h < 12 ? '07-12' : h < 16 ? '12-16' : h < 21 ? '16-21' : '21-24');

/** The slice keys for one trade: { dimension: value }. Numeric features are bucketed into terciles by `cuts`. */
function keysOf(t, cuts) {
  const [d, tm] = london(t.entryMs), dt = new Date(`${d}T12:00:00Z`), out = { instrument: t.instrument, direction: t.direction, hour: hourBucket(+tm.slice(0, 2)), weekday: DOW[dt.getUTCDay()], month: d.slice(5, 7), hold: holdBucket(t.exitMs - t.entryMs) };
  for (const g of t.tags ?? []) out[`tag:${g}`] = 'yes';
  for (const [k, c] of Object.entries(cuts)) { const v = t.features?.[k]; if (fin(v)) out[`feature:${k}`] = v <= c[0] ? 'low' : v <= c[1] ? 'mid' : 'high'; }
  return out;
}
const tercileCuts = (trades) => {
  const cuts = {}, keys = new Set(trades.flatMap(t => Object.keys(t.features ?? {})));
  for (const k of keys) { const v = trades.map(t => t.features?.[k]).filter(fin).sort((a, b) => a - b); if (v.length >= 60 && v[0] !== v.at(-1)) cuts[k] = [v[Math.floor(v.length / 3)], v[Math.floor(2 * v.length / 3)]]; }
  return cuts;
};

/** What-if fixed stop/target from MAE/MFE (R). Conservative: if both levels are reached, the stop counts. */
export function exitGrid(trades, { stops = [0.5, 0.75, 1], targets = [0.5, 1, 1.5, 2, 3] } = {}) {
  const t = trades.filter(x => fin(x.maeR) && fin(x.mfeR));
  if (t.length < 30) return { ok: false, error: 'needs MAE and MFE on >= 30 trades' };
  const rows = [];
  for (const s of stops) for (const g of targets) {
    const rs = t.map(x => (x.maeR <= -s ? -s : x.mfeR >= g ? g : x.R));
    rows.push({ stop: s, target: g, ...stat(rs) });
  }
  const base = stat(t.map(x => x.R)), best = rows.reduce((a, b) => (b.meanR > a.meanR ? b : a));
  return { ok: true, n: t.length, base, rows, best, caution: 'in-sample and conservative when both levels were reached; MAE/MFE do not say which came first' };
}

/** The full diagnostic for a system. trades: standard trades (sorted by exit). */
export function reviewSystem(trades, { minSlice = 30, q = 0.1 } = {}) {
  const tr = (trades ?? []).filter(t => fin(t.R));
  if (tr.length < 60) return { ok: false, error: `needs >= 60 trades with R, got ${tr.length}` };
  const R = tr.map(t => t.R), half = Math.floor(tr.length / 2), A = tr.slice(0, half), B = tr.slice(half);
  const years = {}; for (const t of tr) (years[london(t.exitMs)[0].slice(0, 4)] ??= []).push(t.R);
  const decay = { first: stat(A.map(t => t.R)), second: stat(B.map(t => t.R)), split: london(B[0].exitMs)[0], byYear: Object.fromEntries(Object.entries(years).sort().map(([y, v]) => [y, stat(v)])) };
  decay.trend = decay.first.meanR > 0 && decay.second.meanR <= 0 ? 'stopped working' : decay.first.meanR <= 0 && decay.second.meanR <= 0 ? 'never worked' : decay.first.meanR <= 0 && decay.second.meanR > 0 ? 'started working' : 'held up';
  const withEx = tr.filter(t => fin(t.maeR) && fin(t.mfeR)), losers = withEx.filter(t => t.R < 0), winners = withEx.filter(t => t.R > 0);
  const exits = withEx.length >= 30 ? {
    losersThatWereUp1R: r3(losers.filter(t => t.mfeR >= 1).length / Math.max(1, losers.length)),
    losersThatWereUpHalfR: r3(losers.filter(t => t.mfeR >= 0.5).length / Math.max(1, losers.length)),
    winnersNearStop: r3(winners.filter(t => t.maeR <= -0.8).length / Math.max(1, winners.length)),
    medianMfeOfLosers: r3([...losers.map(t => t.mfeR)].sort((a, b) => a - b)[losers.length >> 1]),
    medianMaeOfWinners: r3([...winners.map(t => t.maeR)].sort((a, b) => a - b)[winners.length >> 1]),
    grid: exitGrid(tr),
  } : { note: 'no MAE/MFE on the trades: exit diagnostics not possible' };
  // slices: chosen on A, scored on B
  const cuts = tercileCuts(A), kA = A.map(t => keysOf(t, cuts)), kB = B.map(t => keysOf(t, cuts)), groups = new Map();
  const put = (ks, t, side) => { for (const [d, v] of Object.entries(ks)) { const id = `${d}=${v}`; const g = groups.get(id) ?? { dim: d, value: v, A: [], B: [] }; g[side].push(t.R); groups.set(id, g); } };
  A.forEach((t, i) => put(kA[i], t, 'A')); B.forEach((t, i) => put(kB[i], t, 'B'));
  const baseA = mean(A.map(t => t.R)), baseB = mean(B.map(t => t.R));
  const Bk = B.map((t, i) => [t.R, kB[i]]);
  const slices = [...groups.values()].filter(g => g.A.length >= minSlice && g.B.length >= Math.max(10, minSlice / 3)).map(g => {
    const rest = Bk.filter(([, k]) => k[g.dim] !== g.value).map(([r]) => r);
    return { slice: `${g.dim} = ${g.value}`, dim: g.dim, value: g.value, first: stat(g.A), second: stat(g.B),
      liftFirst: r3(mean(g.A) - baseA), liftSecond: r3(mean(g.B) - baseB), pSecond: pDiff(g.B, rest), pSecondLoss: pDiff(rest, g.B) };
  });
  const keepPass = bh(slices.map(s => (s.liftFirst > 0 ? s.pSecond : NaN)), q), dropPass = bh(slices.map(s => (s.liftFirst < 0 ? s.pSecondLoss : NaN)), q);
  slices.forEach((s, i) => { s.held = s.liftFirst > 0 ? (s.liftSecond > 0 ? 'held' : 'failed') : (s.liftSecond < 0 ? 'held' : 'failed'); s.survivesFdr = s.liftFirst > 0 ? keepPass[i] : dropPass[i]; s.pSecond = r3(s.pSecond); s.pSecondLoss = r3(s.pSecondLoss); });
  slices.sort((a, b) => Math.abs(b.liftFirst) - Math.abs(a.liftFirst));
  // the filtered system: drop every slice that lost in the first half (lift < -0.1R and negative mean), score on B
  const drop = slices.filter(s => s.first.meanR < 0 && s.liftFirst < -0.1).map(s => [s.dim, s.value]);
  const keepB = B.filter((t, i) => !drop.some(([d, v]) => kB[i][d] === v));
  const filtered = { dropped: drop.map(([d, v]) => `${d} = ${v}`), secondUnfiltered: stat(B.map(t => t.R)), secondFiltered: stat(keepB.map(t => t.R)), keptShare: r3(keepB.length / B.length) };
  // causal equity-curve filter
  const equityCurve = [10, 20, 50].filter(k => tr.length > 3 * k).map(k => { const on = []; for (let i = k; i < tr.length; i++) if (mean(R.slice(i - k, i)) > 0) on.push(R[i]); return { lookback: k, ...stat(on), share: r3(on.length / (tr.length - k)), baseline: stat(R.slice(k)) }; });
  const tried = slices.length * 2;
  return {
    ok: true, trades: tr.length, overall: stat(R), decay, exits, slices: slices.slice(0, 40), slicesTried: tried,
    survivors: slices.filter(s => s.held === 'held' && s.survivesFdr).map(s => ({ slice: s.slice, direction: s.liftFirst > 0 ? 'keep' : 'drop', liftFirst: s.liftFirst, liftSecond: s.liftSecond, nSecond: s.second.n })),
    filtered, equityCurve,
    caution: `${tried} filters were tried; at the 10% level about ${Math.round(tried * 0.1)} could look good by chance in one half. Only filters chosen on the first half and holding in the second half, after Benjamini-Hochberg, are listed as survivors; even those need a fresh holdout or a forward test before trading.`,
  };
}

/** The diagnostic as compact prompt text for the agents. */
export function reviewText(id, meta, rv) {
  if (!rv?.ok) return `${id}: ${rv?.error ?? 'no review'}`;
  const L = [`System ${id}${meta?.model ? ` (${meta.model})` : ''}: ${rv.trades} trades, mean ${rv.overall.meanR}R, hit ${rv.overall.hit}, total ${rv.overall.totalR}R.`,
    `Decay: first half ${rv.decay.first.meanR}R (n ${rv.decay.first.n}), second half ${rv.decay.second.meanR}R (n ${rv.decay.second.n}) from ${rv.decay.split}: ${rv.decay.trend}. By year: ${Object.entries(rv.decay.byYear).map(([y, s]) => `${y} ${s.meanR}R/${s.n}`).join(', ')}.`];
  const e = rv.exits; if (e.grid?.ok) L.push(`Exits: ${Math.round(e.losersThatWereUp1R * 100)}% of losers were 1R up first (${Math.round(e.losersThatWereUpHalfR * 100)}% were 0.5R up); ${Math.round(e.winnersNearStop * 100)}% of winners came within 0.2R of the stop. Best fixed stop/target in-sample: stop ${e.grid.best.stop}R target ${e.grid.best.target}R gives ${e.grid.best.meanR}R vs ${e.grid.base.meanR}R as traded (${e.grid.caution}).`); else L.push(`Exits: ${e.note ?? e.grid?.error}`);
  L.push(`Slices (chosen on the first half, scored on the second; ${rv.slicesTried} tried): ${rv.slices.slice(0, 14).map(s => `${s.slice}: ${s.liftFirst > 0 ? '+' : ''}${s.liftFirst}R then ${s.liftSecond > 0 ? '+' : ''}${s.liftSecond}R (${s.held}${s.survivesFdr ? ', survives FDR' : ''}; n ${s.first.n}/${s.second.n})`).join('; ')}.`);
  L.push(`Survivors after FDR: ${rv.survivors.length ? rv.survivors.map(s => `${s.direction} ${s.slice}`).join('; ') : 'none'}. Filtered system on the second half: ${rv.filtered.secondFiltered.meanR}R over ${rv.filtered.secondFiltered.n} trades vs ${rv.filtered.secondUnfiltered.meanR}R unfiltered (dropped: ${rv.filtered.dropped.join(', ') || 'nothing'}).`);
  L.push(`Equity-curve filter: ${rv.equityCurve.map(x => `last ${x.lookback} > 0: ${x.meanR}R on ${Math.round(x.share * 100)}% of trades vs ${x.baseline.meanR}R`).join('; ') || 'too few trades'}.`);
  L.push(rv.caution);
  return L.join('\n');
}

/** A lens's post-mortem reply; revival ideas are validated in the research pod's proposal shape. validateProposals is passed in to keep this module free of the pod. */
export function validatePostmortem(obj, lens, validateProposals) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const verdict = ['dead', 'revivable', 'needs-data', 'working'].includes(obj.verdict) ? obj.verdict : null;
  const wrong = (Array.isArray(obj.whatWentWrong) ? obj.whatWentWrong : []).slice(0, 4).map(w => ({ issue: String(w?.issue ?? '').trim().slice(0, 400), evidence: String(w?.evidence ?? '').trim().slice(0, 400) })).filter(w => w.issue);
  if (!verdict || !wrong.length) return { ok: false, errors: ['verdict and at least one whatWentWrong item are required'] };
  const rv = Array.isArray(obj.revival) && obj.revival.length ? validateProposals({ proposals: obj.revival }, lens) : { ok: true, value: { proposals: [] } };
  return { ok: true, value: { verdict, headline: String(obj.headline ?? '').trim().slice(0, 300), whatWentWrong: wrong, revival: rv.ok ? rv.value.proposals : [], dropped: rv.ok ? 0 : obj.revival.length,
    questionsForOwner: (Array.isArray(obj.questionsForOwner) ? obj.questionsForOwner : []).map(q => String(q).trim().slice(0, 300)).filter(Boolean).slice(0, 3) } };
}
