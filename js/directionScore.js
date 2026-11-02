/**
 * The 1-to-10 evidence score per market (forge/DIRECTION_SCORE_PILOT_PREREG.md), frozen mapping, scored forward by the direction ledger.
 *
 * The score is the tested direction evidence (Global Read's direction arm: inputs with a measured edge only) expressed in units of what one
 * market's history can detect in a day, laid on a 1-to-10 scale whose wide middle (4 to 7) means "no direction". Inputs with weight 0 never
 * move it; they are listed apart as the Context read, tagged "describes, not shown to predict". Nothing here forecasts: with no tested input
 * live the score is 5 and the band says so.
 *
 * Pure. Tested in js/directionScore.test.mjs.
 */
import { BASE_1D } from './directionRead.js';

/** One-day minimum detectable shift in P(up) over B0, per market: analysis/output/direction-bar/tables.md (sparse MDE, hit pp over B0). */
export const MDE_1D = { NQ: 0.063, SPX500: 0.064, GOLD: 0.065, EURUSD: 0.063, GBPUSD: 0.065, USDJPY: 0.063 };
/** Global Read symbol -> direction-ledger instrument key. */
export const LEDGER_KEY = { NQ: 'nq', SPX500: 'es', GOLD: 'gold', EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy' };
export const SCORE_MODEL = 'direction-score';
export const MIN_BAND_N = 30;

const LABEL = { NQ: 'Nasdaq', SPX500: 'S&P 500', GOLD: 'Gold', EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY' };
const num = v => (Number.isFinite(v) ? v : null);
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

/** Prereg 3.5: integer 1 to 10 from u = shift / MDE. u = 0 (nothing tested is live) is 5. */
export function scoreOf(u) {
  if (!Number.isFinite(u) || u === 0) return 5;
  if (u > 0) return u < 0.5 ? 6 : u < 1 ? 7 : u < 2 ? 8 : u < 3 ? 9 : 10;
  return u > -0.5 ? 5 : u > -1 ? 4 : u > -2 ? 3 : u > -3 ? 2 : 1;
}
/** Prereg 3.6. */
export function bandOf(score, u = 0) {
  const band = score <= 3 ? 'Bearish' : score >= 8 ? 'Bullish' : 'No direction';
  const a = Math.abs(u ?? 0);
  return { band, strength: band === 'No direction' ? '' : a >= 2 ? 'Clear' : 'Lean' };
}

/** The inputs read with weight 0 and a non-zero signal, strongest first: the Context read. Never enters the score. */
export function contextRead(card, max = 6) {
  return (card?.direction?.shown ?? [])
    .filter(x => !(num(x.e) !== null && x.e > 0) && num(x.s) !== null && Math.abs(x.s) >= 0.1)
    .sort((a, b) => Math.abs(b.s) - Math.abs(a.s)).slice(0, max)
    .map(x => ({ id: x.id, label: x.label, side: x.s > 0 ? 'up' : 'down', tier: x.tier === 'null' ? 'tested, no edge' : 'never tested' }));
}

/** One market's score from its Global Read card, or null when it has no card or no frozen base rate. */
export function marketScore(sym, card) {
  const mde = MDE_1D[sym], base = BASE_1D[sym];
  if (!card?.direction || !mde || !base) return null;
  const d = card.direction, live = Number.isFinite(d.nLive) ? d.nLive : 0, pUp = num(d.pUp);
  const shift = live > 0 && pUp !== null ? pUp - 0.5 : 0;
  const u = shift / mde, score = scoreOf(u), { band, strength } = bandOf(score, u);
  const weighted = (d.shown ?? []).filter(x => num(x.e) !== null && x.e > 0).map(x => ({ id: x.id, label: x.label, side: x.s > 0 ? 'up' : 'down', tier: x.tier }));
  return {
    sym, label: LABEL[sym] ?? sym, score, band, strength, u: +u.toFixed(3), shift: +shift.toFixed(4), base, pUp: +(Math.min(0.99, Math.max(0.01, base + shift))).toFixed(4),
    live, weighted, context: contextRead(card),
  };
}

/** Add `.score` to each row of directionReads(gr) (the same markets), and the full list as `.scores`. Returns `reads` (null stays null). */
export function withScores(reads, gr, track = null) {
  if (!reads) return reads;
  const scores = [];
  for (const r of reads.rows) { const s = marketScore(r.sym, gr?.cards?.[r.sym]); r.score = s; if (s) scores.push(s); }
  for (const sym of Object.keys(MDE_1D)) if (!reads.rows.some(r => r.sym === sym) && gr?.cards?.[sym]) { const s = marketScore(sym, gr.cards[sym]); if (s) scores.push(s); }
  return { ...reads, scores, track, scoreNote: `${scoreScaleNote()} ${trackLine(track)}` };
}

/**
 * The forward track record from the ledger: rows of model `direction-score` at h = 1, by band, against the mean B0 of the same rows.
 * records = issue records, outcomesList = out/<date>_h1.json files. A band under MIN_BAND_N rows is reported with `small: true`.
 */
export function scoreTrack(records, outcomesList) {
  const outs = new Map((outcomesList ?? []).filter(o => o.h === 1).map(o => [o.issue_date, o]));
  const acc = { Bearish: [], 'No direction': [], Bullish: [] };
  const days = new Set();
  for (const rec of records ?? []) {
    const o = outs.get(rec.issue_date); if (!o) continue;
    const b0ById = new Map(rec.forecasts.filter(f => f.model_id === 'B0' && f.h === 1).map(f => [f.inst, f.p_up]));
    for (const f of rec.forecasts) {
      if (f.model_id !== SCORE_MODEL || f.h !== 1) continue;
      const oc = o.outcomes?.[f.inst], b0 = b0ById.get(f.inst), band = f.inputs?.band;
      if (!oc || b0 == null || !acc[band]) continue;
      acc[band].push({ up: oc.up, b0 }); days.add(rec.issue_date);
    }
  }
  const out = {};
  for (const [band, rows] of Object.entries(acc)) {
    const n = rows.length, up = n ? rows.reduce((s, r) => s + r.up, 0) / n : null, b0 = n ? rows.reduce((s, r) => s + r.b0, 0) / n : null;
    out[band] = { n, up, b0, diff: n ? up - b0 : null, small: n < MIN_BAND_N };
  }
  return { model: SCORE_MODEL, h: 1, days: days.size, bands: out };
}

/** "n too small" until a band has MIN_BAND_N resolved rows; otherwise the share that closed up against the base rate of the same rows. */
export function trackLine(track) {
  if (!track?.bands) return 'Track record: starting, scored against the next close.';
  const f = b => { const x = track.bands[b]; return !x || x.small ? `${b.toLowerCase()} ${x?.n ?? 0} rows, n too small` : `${b.toLowerCase()}: ${pct(x.up)} closed up vs ${pct(x.b0)} base, ${x.n} rows`; };
  return `Track record (next close): ${f('Bullish')}; ${f('Bearish')}; ${f('No direction')}.`;
}

/** One chip for a market: "5 No direction", with the strength word when away from the middle. */
export function scoreChip(s) {
  if (!s) return '';
  return `${s.score} ${s.band === 'No direction' ? 'No direction' : `${s.strength} ${s.band.toLowerCase()}`}`;
}

/** The scale in one sentence: what the numbers mean. Used everywhere a score is printed. */
export function scoreScaleNote() {
  return 'Score: 1 to 3 bearish, 4 to 7 no direction, 8 to 10 bullish; it leaves the middle only when a tested input is live.';
}
/** The caveat Today adds under its panel; the newsletters leave it out to stay short. */
export function scoreCaveat() {
  return 'It describes the evidence, not what the market does next.';
}
