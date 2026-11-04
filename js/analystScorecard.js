/**
 * The analyst scorecard (owner, build list item 1, 2026-11-04): each of the desk's 11 analysts gets a running hit
 * rate and a calibration score, and the rulings can give more weight to the analysts who have earned it.
 *
 * WHAT AN ANALYST CALLS. Every analyst report (js/deskSchemas.js validateAnalystReport) is a list of points, each
 * with an impact map {KEY: -2..+2}, where KEY is one of the eight currencies, one of the 41 instruments, or RISK
 * (global risk appetite). The analyst's call on a key is the SUM of its points' impacts on that key:
 *   direction   the sign of the sum (a zero sum is no call);
 *   conviction  low / medium / high: |sum| 1 is low, 2 medium, 3+ high, then moved one step by the report's own
 *               stated confidence (high +1, low -1), clamped. A strong net impact in a high-confidence report is a
 *               high-conviction call; a single +1 in a low-confidence report stays low.
 *
 * WHAT HAPPENED. The same window and unit as the desk score (js/deskScore.js, prereg §3): 08:00 to 21:00 London,
 * each market's move in u (its own forecast p50 distance), clipped at 3 (js/deskAttribution.js dayMovesU).
 *   instrument  its own move;
 *   currency    the mean of its FX pairs' moves, signed (+ when it is the base, - when it is the quote);
 *   RISK        the mean move of the risk basket (the same list the attribution's global layer uses).
 * A move within ±0.05 u of zero is a push: neither right nor wrong, and left out of the hit counts.
 *
 * SCORES, per analyst per day.
 *   hit rate     right / (right + wrong), overall and by conviction bucket;
 *   Brier        each call's conviction read as a stated chance of being right (low 0.55, medium 0.60, high 0.70),
 *                scored against the outcome; Brier skill = 1 - Brier / 0.25 (0.25 = the coin flip);
 *   calibration  reliability gap: the call-weighted squared distance between each bucket's hit rate and its stated
 *                chance (0 = perfectly calibrated); and the conviction slope, hit(high) - hit(low): do its
 *                high-conviction calls come off more often?
 *   edge         mean of direction x move (u) over its calls: signed skill against the naive coin flip (0);
 *   skill        edge minus what a shuffle of its own directions across the same keys would earn on average
 *                (mean direction x mean move): signed skill against a naive book with the same net tilt.
 *
 * THE WEIGHT. Days are the unit (one observation per analyst per day, as in the prereg). Each analyst's daily edge
 * is shrunk towards ZERO (a sceptical prior: the repo's direction record says direction rarely survives) by
 * empirical Bayes: a normal prior N(0, tau^2) with tau^2 from the spread of the analysts' means beyond their noise
 * (method of moments over the analysts with MIN_DAYS days or more, floored at TAU_MIN^2 and capped at TAU_MAX^2), and
 * each analyst's own day variance pooled with the desk's, which is itself anchored at SD0 (NU0 pseudo-days each).
 * The weight is 1 + 0.5 tanh(z / 3), z the posterior mean over its posterior SD, so it runs (0.5, 1.5) and a
 * handful of days cannot move it far from 1.0 (two perfect days: about 1.14). 1.0 = the record says nothing yet.
 *
 * Descriptive measurement (prereg amendment A10). It never changes a card. Whether the rulings READ it is a
 * separate switch (service analystScorecardFeedback, default OFF). Pure: no fetch, no clock, no KV.
 * Tested in js/analystScorecard.test.mjs.
 */
import { DESK_SKILLS, DESK_UNIVERSE, DESK_CCYS } from './deskPack.js';
import { dayMovesU, RISK } from './deskAttribution.js';
import { windowFor, londonMs } from './deskScore.js';

export const SCORECARD_VERSION = 1;
export const BUCKETS = ['low', 'medium', 'high'];
export const STATED = { low: 0.55, medium: 0.60, high: 0.70 };   // a call's conviction read as its chance of being right
export const PUSH = 0.05;                                       // |move| below this (u) is a push
export const PRIOR = { TAU_MIN: 0.03, TAU_MAX: 0.30, NU0: 5, SD0: 0.5, BETA: 10, MIN_DAYS: 10 };
const FX = [...DESK_UNIVERSE.fx_majors, ...DESK_UNIVERSE.fx_crosses];
const LAYER = Object.fromEntries(DESK_SKILLS.map(s => [s.id, s.layer]));
const r3 = x => (Number.isFinite(x) ? +x.toFixed(3) : null);
const r4 = x => (Number.isFinite(x) ? +x.toFixed(4) : null);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const clip = x => Math.max(-3, Math.min(3, x));

/** What happened, by key: every instrument's move (u), each currency's signed mean over its FX pairs, and RISK. */
export function realisedFromMoves(moves) {
  const out = { ...moves };
  for (const c of DESK_CCYS) {
    const xs = FX.filter(p => moves[p] != null && (p.slice(0, 3) === c || p.slice(3, 6) === c)).map(p => (p.slice(0, 3) === c ? 1 : -1) * moves[p]);
    if (xs.length) out[c] = r4(mean(xs));
  }
  const risk = RISK.filter(n => moves[n] != null).map(n => moves[n]);
  if (risk.length) out.RISK = r4(mean(risk));
  return out;
}

/** One report's calls: the net impact per key, its direction and its conviction bucket. */
export function analystCalls(report) {
  const net = {};
  for (const p of report?.points ?? []) for (const [k, v] of Object.entries(p?.impact ?? {})) if (Number.isFinite(Number(v))) net[k] = (net[k] ?? 0) + Number(v);
  const shift = report?.confidence === 'high' ? 1 : report?.confidence === 'low' ? -1 : 0;
  return Object.entries(net).filter(([, v]) => v !== 0).map(([key, v]) => {
    const base = Math.abs(v) >= 3 ? 2 : Math.abs(v) === 2 ? 1 : 0;
    return { key, net: v, dir: Math.sign(v), conviction: BUCKETS[Math.max(0, Math.min(2, base + shift))] };
  });
}

const emptyBuckets = () => Object.fromEntries(BUCKETS.map(b => [b, { n: 0, hits: 0 }]));

/** One analyst's day against what happened. Calls on keys with no realised move are listed as unscored. */
export function scoreAnalystDay(report, realised) {
  const calls = analystCalls(report), buckets = emptyBuckets(), detail = [];
  let hits = 0, decided = 0, pushes = 0, brier = 0;
  const signed = [], dirs = [], moves = [];
  for (const c of calls) {
    const r = realised?.[c.key];
    if (!Number.isFinite(r)) { detail.push({ ...c, r: null }); continue; }
    const rc = clip(r);
    signed.push(c.dir * rc); dirs.push(c.dir); moves.push(rc);
    if (Math.abs(r) < PUSH) { pushes++; detail.push({ ...c, r: r4(r), hit: null }); continue; }
    const hit = Math.sign(r) === c.dir ? 1 : 0;
    decided++; hits += hit; buckets[c.conviction].n++; buckets[c.conviction].hits += hit;
    brier += (STATED[c.conviction] - hit) ** 2;
    detail.push({ ...c, r: r4(r), hit });
  }
  const edge = signed.length ? mean(signed) : null;
  const skill = signed.length ? edge - mean(dirs) * mean(moves) : null;
  return { calls: calls.length, scored: signed.length, decided, hits, pushes, buckets, brierSum: r4(brier), edge: r4(edge), skill: r4(skill), detail };
}

/**
 * The analysts' reads were written before the window only if the run finished before 08:00 London on its own date
 * (the prereg's eligibility clock, any mode). A later run is scored and stored but not counted in the scorecard.
 */
export function countsForScorecard(run) {
  if (!run?.date || !run?.finishedAt) return { ok: false, why: 'no run date or finish time' };
  const fin = Date.parse(run.finishedAt), { entryMs } = windowFor(run.date);
  if (!(fin >= londonMs(run.date, 0))) return { ok: false, why: 'finished before its own London date' };
  if (!(fin < entryMs)) return { ok: false, why: 'finished after 08:00 London (the analysts had seen part of the window)' };
  return { ok: true, why: null };
}

/**
 * Score every analyst on a stored run against the day's moves. `moves` is {INSTRUMENT: move in u}; pass it (from a
 * stored day) or pass `barsByInst` and it is computed from the Head book's levels exactly as the attribution does.
 */
export function scoreRunDay(run, { moves = null, barsByInst = null } = {}) {
  const date = run?.date;
  const mv = moves ?? dayMovesU(run?.head?.book?.instruments ?? {}, barsByInst ?? {}, date);
  const realised = realisedFromMoves(mv), c = countsForScorecard(run), analysts = {};
  for (const [id, a] of Object.entries(run?.analysts ?? {})) {
    if (!a?.ok || !a.report) { analysts[id] = { failed: true }; continue; }
    analysts[id] = { layer: a.layer ?? LAYER[id] ?? null, confidence: a.report.confidence ?? null, ...scoreAnalystDay(a.report, realised) };
  }
  return { version: SCORECARD_VERSION, date, runFinishedAt: run?.finishedAt ?? null, mode: run?.mode ?? null, rolesHash: run?.rolesHash ?? null,
    counts: c.ok, why: c.why, markets: Object.keys(mv).length, moves: Object.fromEntries(Object.entries(mv).map(([k, v]) => [k, r4(v)])), realised, analysts };
}

/** A day without its per-call detail and moves: what the running store keeps for every day. */
export function compactDay(day) {
  const analysts = {};
  for (const [id, a] of Object.entries(day?.analysts ?? {})) {
    if (a.failed) { analysts[id] = { failed: true }; continue; }
    const { detail, ...rest } = a;
    analysts[id] = rest;
  }
  return { version: day.version, date: day.date, counts: day.counts, why: day.why, rolesHash: day.rolesHash, markets: day.markets, analysts };
}

/** Insert or replace a compact day; newest last, capped. */
export function upsertDay(days, day, keep = 800) {
  return [...(days ?? []).filter(d => d.date !== day.date), day].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep);
}

const variance = xs => { if (xs.length < 2) return null; const m = mean(xs); return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1); };

/**
 * The running scorecard over compact days (only days that count, and only analysts that reported). Interim and
 * descriptive. `rolling` is the window of the sparkline's rolling mean edge.
 */
export function scorecard(days, { rolling = 10 } = {}) {
  const used = (days ?? []).filter(d => d.counts).sort((a, b) => a.date.localeCompare(b.date));
  const ids = [...new Set([...DESK_SKILLS.map(s => s.id), ...used.flatMap(d => Object.keys(d.analysts ?? {}))])];
  const per = {};
  for (const id of ids) {
    const rows = used.map(d => ({ date: d.date, a: d.analysts?.[id] })).filter(x => x.a && !x.a.failed);
    const buckets = emptyBuckets();
    let hits = 0, decided = 0, calls = 0, brierSum = 0;
    for (const { a } of rows) {
      calls += a.calls ?? 0; hits += a.hits ?? 0; decided += a.decided ?? 0; brierSum += a.brierSum ?? 0;
      for (const b of BUCKETS) { buckets[b].n += a.buckets?.[b]?.n ?? 0; buckets[b].hits += a.buckets?.[b]?.hits ?? 0; }
    }
    const edges = rows.map(x => x.a.edge).filter(Number.isFinite), skills = rows.map(x => x.a.skill).filter(Number.isFinite);
    const rate = (h, n) => (n ? r3(h / n) : null);
    const gap = decided ? BUCKETS.reduce((s, b) => s + (buckets[b].n ? buckets[b].n * (buckets[b].hits / buckets[b].n - STATED[b]) ** 2 : 0), 0) / decided : null;
    const brier = decided ? brierSum / decided : null;
    // the sparkline: rolling mean of the daily edge
    const spark = [];
    for (let i = 0; i < rows.length; i++) { const w = rows.slice(Math.max(0, i - rolling + 1), i + 1).map(x => x.a.edge).filter(Number.isFinite); spark.push({ date: rows[i].date, edge: r4(rows[i].a.edge), rolling: r4(mean(w)) }); }
    per[id] = {
      layer: LAYER[id] ?? rows.at(-1)?.a.layer ?? null,
      days: rows.length, calls, decided, hits,
      hitRate: rate(hits, decided),
      hitRateShrunk: r3((hits + PRIOR.BETA) / (decided + 2 * PRIOR.BETA)),   // Beta(10,10) prior: 50% until the calls pile up
      buckets: Object.fromEntries(BUCKETS.map(b => [b, { n: buckets[b].n, hits: buckets[b].hits, rate: rate(buckets[b].hits, buckets[b].n), stated: STATED[b] }])),
      calibration: {
        brier: r4(brier), brierSkill: brier == null ? null : r4(1 - brier / 0.25), gap: r4(gap),
        slope: buckets.high.n && buckets.low.n ? r3(buckets.high.hits / buckets.high.n - buckets.low.hits / buckets.low.n) : null,
      },
      edge: { mean: r4(mean(edges)), sd: r4(Math.sqrt(variance(edges) ?? NaN)), days: edges.length },
      skill: { mean: r4(mean(skills)), days: skills.length },
      spark,
      _edges: edges,
    };
  }
  // Empirical Bayes on the daily edge, prior N(0, tau^2).
  // The desk's day variance, anchored by NU0 pseudo-days at SD0 so two quiet days cannot make the noise look small.
  const withData = Object.values(per).filter(p => p._edges.length >= 2);
  const dfSum = withData.reduce((s, p) => s + p._edges.length - 1, 0);
  const pooledVar = (PRIOR.NU0 * PRIOR.SD0 ** 2 + withData.reduce((s, p) => s + (p._edges.length - 1) * variance(p._edges), 0)) / (PRIOR.NU0 + dfSum);
  const vOf = p => { const n = p._edges.length, own = n >= 2 ? variance(p._edges) : 0; return (PRIOR.NU0 * pooledVar + Math.max(0, n - 1) * own) / (PRIOR.NU0 + Math.max(0, n - 1)); };
  // tau is estimated only once at least three analysts have MIN_DAYS days; until then it sits at its floor.
  let tau2 = PRIOR.TAU_MIN ** 2;
  const settled = withData.filter(p => p._edges.length >= PRIOR.MIN_DAYS);
  if (settled.length >= 3) {
    const ms = settled.map(p => mean(p._edges)), noise = mean(settled.map(p => vOf(p) / p._edges.length));
    tau2 = Math.min(PRIOR.TAU_MAX ** 2, Math.max(PRIOR.TAU_MIN ** 2, (variance(ms) ?? 0) - noise));
  }
  for (const p of Object.values(per)) {
    const n = p._edges.length, v = vOf(p);
    const postVar = 1 / (1 / tau2 + n / v), post = n ? postVar * (n * mean(p._edges)) / v : 0, z = post / Math.sqrt(postVar);
    p.shrunk = { edge: r4(post), sd: r4(Math.sqrt(postVar)), z: r3(z) };
    p.weight = r3(1 + 0.5 * Math.tanh(z / 3));
    p.status = n < PRIOR.MIN_DAYS ? 'unproven' : z >= 2 ? 'earned' : z <= -2 ? 'lagging' : 'no clear edge';
    delete p._edges;
  }
  return {
    version: SCORECARD_VERSION,
    label: 'interim, descriptive (forge/DESK_ANALYST_PIPELINE_PREREG.md amendment A10); weights are shrunk towards 1.0',
    days: used.length, allDays: (days ?? []).length, from: used[0]?.date ?? null, to: used.at(-1)?.date ?? null,
    prior: { tau: r4(Math.sqrt(tau2)), pooledDaySd: r4(Math.sqrt(pooledVar)), nu0: PRIOR.NU0, betaPrior: PRIOR.BETA, stated: STATED, push: PUSH, minDays: PRIOR.MIN_DAYS },
    analysts: per,
  };
}

const pct = x => (x == null ? 'n/a' : `${Math.round(x * 100)}%`);
const sgn = (x, d = 2) => (x == null ? 'n/a' : `${x > 0 ? '+' : ''}${x.toFixed(d)}`);

/** One analyst's line, for a prompt or a feed. */
export function analystLine(id, p) {
  const b = BUCKETS.slice().reverse().map(k => `${k} ${pct(p.buckets[k].rate)} of ${p.buckets[k].n}`).join(', ');
  return `- ${id} (${p.layer ?? '?'}): ${p.days} day(s), ${p.decided} decided call(s), hit ${pct(p.hitRate)} [${b}], Brier skill ${sgn(p.calibration.brierSkill)}, calibration gap ${p.calibration.gap == null ? 'n/a' : p.calibration.gap.toFixed(3)}, edge ${sgn(p.edge.mean)} u/day, weight ${p.weight.toFixed(2)} (${p.status})`;
}

/** Which analysts each ruling reads. */
export const AUDIENCE = {
  global: ['global', 'evidence'],
  currency: ['global', 'currency', 'evidence'],
  head: ['global', 'currency', 'asset', 'evidence'],
};

/**
 * The section "Analyst track record (scorecard)" for one ruling (global, currency or head), or null when no day
 * has been scored (the section is then left out and the prompt is exactly as before).
 */
export function trackRecordText(card, audience = 'head') {
  if (!card?.days) return null;
  const layers = AUDIENCE[audience] ?? AUDIENCE.head;
  const rows = Object.entries(card.analysts).filter(([, p]) => layers.includes(p.layer) && p.days > 0).sort((a, b) => b[1].weight - a[1].weight);
  if (!rows.length) return null;
  return [
    `Interim and descriptive: ${card.days} scored morning(s), ${card.from} to ${card.to}. A call is the net impact an analyst gave a currency, a market or RISK, scored right or wrong on its move from 08:00 to 21:00 London (moves under ${PUSH} u are pushes). Hit rates are shown by the call's conviction; Brier skill is above 0 when its conviction beats a coin flip; the calibration gap is 0 when its high-conviction calls come off as often as they claim.`,
    `Weight runs from 0.5 to 1.5. It is shrunk towards 1.0: 1.0 means the record does not yet separate the analyst from chance, and a few days cannot move it far.`,
    `How to use it: where the analysts and advocates disagree, lean towards the evidence of analysts above 1.0 and discount those below it, in proportion. Do not drop an analyst for its weight alone, do not treat a weight as a market view, and say in your summary if the track record changed your ruling.`,
    ...rows.map(([id, p]) => analystLine(id, p)),
  ].join('\n');
}

/** The three sections at once, plus what the run records about them. */
export function trackRecordSections(card) {
  const out = { asOf: card?.to ?? null, days: card?.days ?? 0, global: trackRecordText(card, 'global'), currency: trackRecordText(card, 'currency'), head: trackRecordText(card, 'head') };
  return out.global || out.currency || out.head ? out : null;
}
