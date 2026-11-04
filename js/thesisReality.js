/**
 * Morning thesis against evening reality (owner-approved build item 5, 2026-11-04; plan §9am, prereg amendment A14).
 *
 * After the evening desk score, the morning book is laid claim by claim against what happened. Nothing here judges
 * the desk (that is the pre-registered day score, js/deskScore.js); this is DESCRIPTION, kept per day so the desk and
 * the evidence clerk can read how the morning's claims fared. The morning run is only read, never rewritten.
 *
 * WHAT HAPPENED uses the desk score's own window and unit: 08:00 to 21:00 London, each market's move in u (its own
 * forecast p50 distance), clipped at 3 (js/deskAttribution.js dayMovesU). A currency's move is the signed mean over
 * its FX pairs and RISK the mean of the attribution's risk basket (js/analystScorecard.js realisedFromMoves). A move
 * within ±0.05 u is a push (neither right nor wrong), as in the analyst scorecard.
 *
 * THE CLAIMS
 *   regime       the Global Manager's tone (risk-on +1, risk-off −1, mixed: no call) against RISK.
 *   currencies   the Currency Manager's ranking against the realised currency moves: the morning's strongest is
 *                right when it finished in the realised top half, the weakest when it finished in the bottom half;
 *                each bias against the sign of its move; and the Spearman rank correlation of the two orders.
 *   cards        every sized directional card: direction right or wrong, R (direction × move, u, clipped at 3, the
 *                score's own number where the score has it), size × R, whether the stated invalidation level traded
 *                inside the window and whether the p50 and p75 lines on the card's side did, and which came first.
 *                The invalidation is free text; its level is the number nearest the open on the card's adverse side
 *                (null when none parses, shown as "–", never guessed).
 *   range        the day's vol forecast (London-day high-to-low p50 / p75, % of the London-midnight open) against
 *                the realised London-day range built the same way (js/volCheck.js): a calibrated p50 is exceeded on
 *                about half the days, the p75 on about a quarter.
 *   events       the tier-1 releases the economist named, with the actual where the calendar has one (optional).
 * Pure: bars, moves and forecasts are passed in. Tested in js/thesisReality.test.mjs.
 */
import { realisedFromMoves, PUSH } from './analystScorecard.js';
import { DESK_CCYS } from './deskPack.js';
import { RISK } from './deskAttribution.js';
import { grade } from './scoreDisplay.js';

export const TR_VERSION = 1;
export const LABEL = 'description, not a scored cell (prereg amendment A14)';
const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
const r3 = x => (Number.isFinite(x) ? +x.toFixed(3) : null);
const r4 = x => (Number.isFinite(x) ? +x.toFixed(4) : null);
const clip = x => Math.max(-3, Math.min(3, x));
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const verdictOf = (dir, move) => (!dir ? 'no call' : !Number.isFinite(move) ? 'no data' : Math.abs(move) < PUSH ? 'push' : Math.sign(move) === dir ? 'right' : 'wrong');

/** The tone as a direction: risk-on +1, risk-off −1, anything else 0. */
export const toneDir = t => { const s = String(t ?? '').toLowerCase(); return /off/.test(s) ? -1 : /on/.test(s) ? 1 : 0; };

/**
 * The price level a free-text invalidation names, on the card's adverse side of the open: the number nearest the
 * open below it for a long, above it for a short, within ±15% of the open. null when nothing fits.
 */
export function invalidationLevel(text, open, dir) {
  if (!text || !(open > 0) || !dir) return null;
  const nums = (String(text).replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(v => v > open * 0.85 && v < open * 1.15);
  const adverse = nums.filter(v => (dir > 0 ? v <= open : v >= open));   // a level at the open counts (any move against the card)
  if (!adverse.length) return null;
  return adverse.sort((a, b) => Math.abs(a - open) - Math.abs(b - open))[0];
}

/**
 * One card's path inside the window from M1 bars ({ time: sec, high, low, open, close }): entry, exit, high, low and
 * the first time (ms) each level traded: the invalidation and the p50 / p75 lines on the card's side.
 */
export function cardPath(card, bars, { entryMs, exitMs }) {
  const dir = DIR[card?.rating] ?? 0, L = card?.levels;
  const w = (bars ?? []).filter(b => b.time * 1000 >= entryMs && b.time * 1000 < exitMs);
  if (!dir || !w.length) return null;
  const inv = invalidationLevel(card.plan?.invalidation ?? card.invalidation, L?.open, dir);
  const side = dir > 0 ? L?.up : L?.down, lv = { invalid: inv, p50: Number.isFinite(side?.p50) ? side.p50 : null, p75: Number.isFinite(side?.p75) ? side.p75 : null };
  const hit = { invalid: null, p50: null, p75: null };
  for (const b of w) {
    const t = b.time * 1000;
    if (lv.invalid != null && hit.invalid == null && (dir > 0 ? b.low <= lv.invalid : b.high >= lv.invalid)) hit.invalid = t;
    for (const k of ['p50', 'p75']) if (lv[k] != null && hit[k] == null && (dir > 0 ? b.high >= lv[k] : b.low <= lv[k])) hit[k] = t;
  }
  return { entry: w[0].open, exit: w.at(-1).close, high: Math.max(...w.map(b => b.high)), low: Math.min(...w.map(b => b.low)), levels: lv, touched: hit };
}

/** Spearman rank correlation of two orders over the keys both contain (null under three). */
export function rankCorr(a, b) {
  const keys = a.filter(k => b.includes(k)); const n = keys.length; if (n < 3) return null;
  const ra = Object.fromEntries(keys.map((k, i) => [k, i])), rb = Object.fromEntries(b.filter(k => keys.includes(k)).map((k, i) => [k, i]));
  const d2 = keys.reduce((s, k) => s + (ra[k] - rb[k]) ** 2, 0);
  return r3(1 - (6 * d2) / (n * (n * n - 1)));
}

/** The realised London-day range against the day's vol forecast. vol: { INST: { p50, p75, hl } } (% of the open). */
export function rangeCheck(vol) {
  const rows = Object.entries(vol ?? {}).filter(([, v]) => Number.isFinite(v?.p50) && Number.isFinite(v?.p75) && Number.isFinite(v?.hl) && v.p50 > 0)
    .map(([inst, v]) => ({ inst, p50: v.p50, p75: v.p75, hl: v.hl, over50: v.hl > v.p50, over75: v.hl > v.p75, ratio: r3(v.hl / v.p50) }));
  const n = rows.length, share = k => (n ? r3(rows.filter(r => r[k]).length / n) : null), ratios = rows.map(r => r.ratio).sort((a, b) => a - b);
  return { n, over50: share('over50'), over75: share('over75'), medianRatio: n ? ratios[n >> 1] : null, targets: { over50: 0.5, over75: 0.25 }, rows: rows.sort((a, b) => b.ratio - a.ratio) };
}

/**
 * The day. run: the stored desk run (read only). moves: { INST: move in u } over the window. score: the evening desk
 * score row with its cards (optional; its R is used where present). paths: { INST: cardPath(...) }. vol: as
 * rangeCheck. events: [{ event, country, at, estimate, actual }] (optional).
 */
export function thesisReality({ run, moves = {}, score = null, paths = {}, vol = null, events = null }) {
  const book = run?.head?.book ?? {}, realised = realisedFromMoves(moves ?? {});
  // regime
  const gv = run?.debate?.global?.view ?? book.global ?? {}, td = toneDir(gv.tone), risk = realised.RISK;
  const regime = { tone: gv.tone ?? null, conviction: gv.conviction ?? null, dir: td, realised: r4(risk), basket: RISK.filter(n => moves?.[n] != null).length, verdict: verdictOf(td, risk) };
  // currencies
  const cv = run?.debate?.currency?.view ?? null;
  const bsrc = cv?.currencies ?? book.currencies ?? {}, num = v => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const biases = Object.fromEntries(DESK_CCYS.map(c => [c, num(bsrc[c]?.bias)]));   // a missing bias stays null, never 0
  const ranking = (cv?.ranking ?? []).filter(c => DESK_CCYS.includes(c));
  const real = Object.fromEntries(DESK_CCYS.filter(c => Number.isFinite(realised[c])).map(c => [c, r4(realised[c])]));
  const realisedRanking = Object.keys(real).sort((a, b) => real[b] - real[a]);
  const half = Math.ceil(realisedRanking.length / 2);
  const end = (ccy, top) => { if (!ccy) return null; const rr = realisedRanking.indexOf(ccy); return { ccy, realised: real[ccy] ?? null, realisedRank: rr < 0 ? null : rr + 1, of: realisedRanking.length,
    verdict: rr < 0 ? 'no data' : (top ? rr < half : rr >= realisedRanking.length - half) ? 'right' : 'wrong' }; };
  const currencies = {
    ranking, realisedRanking, realised: real, biases,
    strongest: end(ranking[0], true), weakest: end(ranking.at(-1), false), rankCorr: rankCorr(ranking, realisedRanking),
    perCcy: DESK_CCYS.map(c => ({ ccy: c, bias: biases[c], realised: real[c] ?? null, verdict: biases[c] == null ? 'no data' : verdictOf(Math.sign(biases[c]), real[c]) })),
  };
  // cards
  const cards = [];
  for (const [n, c] of Object.entries(book.instruments ?? {})) {
    const dir = DIR[c.rating] ?? 0; if (!dir || !(c.size > 0)) continue;
    const sc = score?.cards?.[n], mv = Number.isFinite(moves?.[n]) ? moves[n] : null;
    const R = Number.isFinite(sc?.R) ? sc.R : mv != null ? r4(clip(dir * mv)) : null;
    const p = paths?.[n] ?? null, t = p?.touched ?? {};
    const first = [['invalidation', t.invalid], ['p50', t.p50]].filter(([, ms]) => ms != null).sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
    cards.push({ inst: n, rating: c.rating, conviction: c.conviction ?? null, grade: grade(c), size: c.size, dir,
      move: mv != null ? r4(mv) : null, R, sizeR: R == null ? null : r4(c.size * R), verdict: R == null ? 'no data' : Math.abs(R) < PUSH ? 'push' : R > 0 ? 'right' : 'wrong',
      invalidation: { text: c.plan?.invalidation ?? c.invalidation ?? null, level: p?.levels?.invalid ?? null, touched: p ? t.invalid != null : null, at: t.invalid ?? null },
      p50: { level: p?.levels?.p50 ?? null, reached: p ? t.p50 != null : null, at: t.p50 ?? null },
      p75: { level: p?.levels?.p75 ?? null, reached: p ? t.p75 != null : null, at: t.p75 ?? null },
      first });
  }
  cards.sort((a, b) => b.size - a.size);
  const dec = cards.filter(c => c.verdict === 'right' || c.verdict === 'wrong'), withR = cards.filter(c => c.R != null);
  const byGrade = {};
  for (const c of cards) { const g = c.grade ?? '–'; const b = (byGrade[g] ??= { n: 0, right: 0, wrong: 0, push: 0 }); b.n++; if (c.verdict === 'right') b.right++; else if (c.verdict === 'wrong') b.wrong++; else if (c.verdict === 'push') b.push++; }
  const pathed = cards.filter(c => c.invalidation.touched != null);
  const cardSummary = { n: cards.length, right: dec.filter(c => c.verdict === 'right').length, wrong: dec.filter(c => c.verdict === 'wrong').length,
    push: cards.filter(c => c.verdict === 'push').length, noData: cards.filter(c => c.verdict === 'no data').length,
    hitRate: dec.length ? r3(dec.filter(c => c.verdict === 'right').length / dec.length) : null,
    sizeWeightedR: withR.length ? r4(withR.reduce((s, c) => s + c.size * c.R, 0) / withR.reduce((s, c) => s + c.size, 0)) : null, byGrade,
    withPath: pathed.length, invalidLevels: pathed.filter(c => c.invalidation.level != null).length,
    invalidTouched: pathed.filter(c => c.invalidation.touched).length, p50Reached: pathed.filter(c => c.p50.reached).length, p75Reached: pathed.filter(c => c.p75.reached).length };
  // events (optional)
  const ev = Array.isArray(events) ? events.map(e => ({ event: e.event ?? null, country: e.country ?? null, at: e.at ?? null, estimate: e.estimate ?? null, actual: e.actual ?? null,
    surprise: e.actual != null && e.estimate != null && Number.isFinite(parseFloat(e.actual)) && Number.isFinite(parseFloat(e.estimate)) ? Math.sign(parseFloat(e.actual) - parseFloat(e.estimate)) : null })) : null;
  return {
    version: TR_VERSION, label: LABEL, date: run?.date ?? null, bookAt: run?.finishedAt ?? null, counts: score ? !!score.eligible : null, dayScore: score?.S ?? null,
    window: '08:00-21:00 London, moves in u (the card\'s own p50 distance), clipped at 3',
    morning: { headline: book.headline ?? null, risks: (book.risks ?? []).slice(0, 6) },
    regime, currencies, cards, cardSummary, range: vol ? rangeCheck(vol) : null, events: ev,
  };
}

/** The compact row the running tally keeps for every day. */
export function compactDay(d) {
  return { date: d.date, counts: d.counts, dayScore: d.dayScore, regime: d.regime?.verdict ?? null, strongest: d.currencies?.strongest?.verdict ?? null, weakest: d.currencies?.weakest?.verdict ?? null,
    rankCorr: d.currencies?.rankCorr ?? null, ccyRight: d.currencies?.perCcy?.filter(c => c.verdict === 'right').length ?? 0, ccyWrong: d.currencies?.perCcy?.filter(c => c.verdict === 'wrong').length ?? 0,
    cards: d.cardSummary ? { n: d.cardSummary.n, right: d.cardSummary.right, wrong: d.cardSummary.wrong, byGrade: d.cardSummary.byGrade, withPath: d.cardSummary.withPath, invalidTouched: d.cardSummary.invalidTouched, p50Reached: d.cardSummary.p50Reached, p75Reached: d.cardSummary.p75Reached } : null,
    range: d.range ? { n: d.range.n, over50: d.range.over50, over75: d.range.over75 } : null };
}

/** Insert or replace a day's compact row, oldest first, capped. */
export function upsertDay(days, row, keep = 800) { return [...(days ?? []).filter(x => x.date !== row.date), row].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep); }

/** The running tally over the compact rows: how often each kind of claim came off. */
export function tally(days) {
  const xs = (days ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const count = k => { const v = xs.map(d => d[k]).filter(x => x === 'right' || x === 'wrong'); return { n: v.length, right: v.filter(x => x === 'right').length, share: v.length ? r3(v.filter(x => x === 'right').length / v.length) : null }; };
  const rc = xs.map(d => d.rankCorr).filter(Number.isFinite);
  const byGrade = {};
  for (const d of xs) for (const [g, b] of Object.entries(d.cards?.byGrade ?? {})) { const t = (byGrade[g] ??= { n: 0, right: 0, wrong: 0 }); t.n += b.n; t.right += b.right; t.wrong += b.wrong; }
  for (const t of Object.values(byGrade)) t.hitRate = t.right + t.wrong ? r3(t.right / (t.right + t.wrong)) : null;
  const sum = k => xs.reduce((s, d) => s + (d.cards?.[k] ?? 0), 0), wp = sum('withPath');
  const rg = xs.filter(d => d.range?.n);
  const rn = rg.reduce((s, d) => s + d.range.n, 0), rw = k => (rn ? r3(rg.reduce((s, d) => s + d.range[k] * d.range.n, 0) / rn) : null);
  const cr = sum('right'), cw = sum('wrong'), ccr = xs.reduce((s, d) => s + (d.ccyRight ?? 0), 0), ccw = xs.reduce((s, d) => s + (d.ccyWrong ?? 0), 0);
  return {
    label: LABEL, days: xs.length, from: xs[0]?.date ?? null, to: xs.at(-1)?.date ?? null,
    regime: count('regime'), strongest: count('strongest'), weakest: count('weakest'),
    rankCorr: { n: rc.length, mean: rc.length ? r3(mean(rc)) : null },
    biases: { right: ccr, wrong: ccw, share: ccr + ccw ? r3(ccr / (ccr + ccw)) : null },
    cards: { n: sum('n'), right: cr, wrong: cw, hitRate: cr + cw ? r3(cr / (cr + cw)) : null, byGrade,
      withPath: wp, invalidTouched: wp ? r3(sum('invalidTouched') / wp) : null, p50Reached: wp ? r3(sum('p50Reached') / wp) : null, p75Reached: wp ? r3(sum('p75Reached') / wp) : null },
    range: { days: rg.length, markets: rn, over50: rw('over50'), over75: rw('over75'), targets: { over50: 0.5, over75: 0.25 } },
  };
}

/** What the evidence clerk reads (Desk Pack feed thesis-reality): the latest day, small, and the tally. */
export function briefFeed(day, t) {
  if (!day) return { ok: false, error: 'no morning has been laid against its evening yet' };
  return {
    ok: true, asOf: day.date, label: LABEL, note: 'The latest scored morning, claim by claim, against 08:00-21:00 London. Description of the desk\'s own record: never an impact, and a single day is an anecdote.',
    latest: {
      date: day.date, counts: day.counts, dayScore: day.dayScore,
      regime: day.regime, strongest: day.currencies?.strongest, weakest: day.currencies?.weakest, rankCorr: day.currencies?.rankCorr,
      cards: day.cardSummary, worst: (day.cards ?? []).filter(c => c.sizeR != null).sort((a, b) => a.sizeR - b.sizeR).slice(0, 3).map(c => ({ inst: c.inst, rating: c.rating, grade: c.grade, R: c.R, invalidTouched: c.invalidation.touched })),
      best: (day.cards ?? []).filter(c => c.sizeR != null).sort((a, b) => b.sizeR - a.sizeR).slice(0, 3).map(c => ({ inst: c.inst, rating: c.rating, grade: c.grade, R: c.R, p50Reached: c.p50.reached })),
      range: day.range ? { n: day.range.n, over50: day.range.over50, over75: day.range.over75, medianRatio: day.range.medianRatio } : null,
    },
    tally: t,
  };
}
