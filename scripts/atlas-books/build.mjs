#!/usr/bin/env node
// Atlas books: three trade books for the Vote Atlas and Fib Atlas portfolio pages,
// all priced on OANDA bid/ask M1 (owner, 2026-11-27).
//
//   honest  "v2 honest book". Vote Atlas on the v2 (HAR-RV log) ladder; Fib Atlas on its own
//           Asia / Monday ladders (Fib has no v2 ladder). The vote book is built from touches
//           before the real 60/40 split only, and Vote Atlas session-vol inputs whose session
//           had not finished at the touch are blanked. Fade = resting limit at the line,
//           follow = stop entry at the line.
//   gonogo  The atlas-honest-gonogo configuration (forge/ATLAS_HONEST_GONOGO_PREREG.md): v1 ladder,
//           production universes, same book/vote/fills as honest. Built only after the
//           registered --mode score run exists, so these pages never show its numbers first.
//   retest  The honest book's lines and vote, but a FADE enters the owner's way
//           (ForecastBandFade sheet; js/bidAskFill.js priceRetestFadeBidAsk): arm after a 10%
//           overshoot of the stop distance, sell/buy stop at the line, fill on the way back,
//           cancel at 1.2x the stop or at the next line out. Follows keep the stop entry.
//
// Every book: stop = the next line out, target = the line back inside (follow: the reverse),
// flat at the session close, R net of the spread, no commission. Exploratory, not pre-registered
// (register row atlas-books); nothing here is a verdict.
//
//   python scripts/atlas-honest-gonogo/extract.py          (once, needs data/m1_bidask: laptop)
//   node scripts/atlas-books/build.mjs [--books honest,retest,gonogo] [--systems vote,asia,monday]
//                                      [--pairs eurusd,gold] [--upload] [--allow-unscored-gonogo]
//
// Writes analysis/output/atlas-books/<book>/<system>/<pair>-votetrades.json (the same shape the
// portfolio routes already read) and analysis/output/atlas-books/summary.json. --upload copies
// them to R2 under atlas-books/ ONLY (never a production prefix) so Railway serves them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasWalk } from '../../js/levelAtlasEngine.js';
import { asiaFibAtlasWalk } from '../../js/asiaFibAtlasEngine.js';
import { mondayFibAtlasWalk } from '../../js/mondayFibAtlasEngine.js';
import { buildAtlasBook, splitAt } from '../../js/levelAtlasReport.js';
import { buildAsiaFibAtlasBook } from '../../js/asiaFibAtlasReport.js';
import { voteDecision as levelVote, VOTE_TRADES_SCHEMA } from '../../js/levelAtlasVoteReview.js';
import { voteDecision as fibVote } from '../../js/asiaFibAtlasVoteReview.js';
import { priceBracketBidAsk, priceRetestFadeBidAsk } from '../../js/bidAskFill.js';
import { bisect } from '../../js/barUtils.js';
import { assetClassFor } from '../../js/forecastAnalyserStore.js';
import { summarizeTrades } from '../../js/metricsCore.js';
import { LADDER_PARAMS as LADDER_PARAMS_V2 } from '../../js/forecastLadderParamsV2.js';
import { ATLAS_BOOKS, bookKey } from '../../js/atlasBooks.js';
import { loadBin, causalVolFields, SYSTEMS as GONOGO_SYSTEMS, FILE_KEY } from '../atlas-honest-gonogo/run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'analysis', 'output', 'atlas-books');
const GONOGO_RESULTS = path.join(ROOT, 'analysis', 'output', 'atlas-honest-gonogo', 'results.json');
const REARM = 0.3, ARM_FRAC = 0.1, CANCEL_FRAC = 1.2;

// honest / retest universes: every instrument the portfolio pages list. gonogo: the prereg's.
const PAGE_PAIRS = {
  vote: ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf',
    'gbpjpy', 'gbpaud', 'gbpchf', 'audjpy', 'audcad', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'],
  fib: ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'eurjpy', 'eurgbp', 'euraud', 'eurcad', 'eurchf', 'eurnzd',
    'gbpjpy', 'gbpaud', 'gbpcad', 'gbpchf', 'gbpnzd', 'audjpy', 'audnzd', 'audcad', 'audchf', 'cadjpy', 'chfjpy', 'nzdjpy', 'gold',
    'nq', 'spx', 'de30', 'uk100', 'us2000', 'dow'],
};
const universe = (book, sys) => (book === 'gonogo' ? GONOGO_SYSTEMS[sys].pairs : PAGE_PAIRS[sys === 'vote' ? 'vote' : 'fib']);

// ── one instrument, one system: walk once, build the honest book once ────────
// Returns the OOS touches with their vote, shared by every book that uses this ladder.
export function votedTouches(sys, instrument, packed, { ladder = 'v1' } = {}) {
  const assetClass = assetClassFor(instrument);
  const sym = instrument.toUpperCase();
  let touches;
  if (sys === 'vote') {
    const opts = { instrument: sym, assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM };
    if (ladder === 'v2') opts.ladderParams = LADDER_PARAMS_V2;
    touches = atlasWalk(packed, opts).touches;
  } else if (sys === 'asia') touches = asiaFibAtlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [REARM] }).touches;
  else touches = mondayFibAtlasWalk(packed, { instrument: sym, assetClass, rearmFracs: [REARM] }).touches;
  touches = touches.filter(t => t.rearmFrac === REARM);
  if (sys === 'vote') touches = touches.map(causalVolFields);
  if (touches.length < 100) return { touches: [], split: null };
  const { split } = splitAt(touches);
  const isOnly = touches.filter(t => t.date < split);
  const book = sys === 'vote' ? buildAtlasBook(isOnly, { rearmFrac: REARM }) : buildAsiaFibAtlasBook(isOnly, { rearmFrac: REARM });
  if (!book) return { touches: [], split };
  const vote = sys === 'vote' ? levelVote : fibVote;
  const out = [];
  for (const t of touches) {
    if (t.date < split || (sys === 'vote' && t.rung === 'p90')) continue;
    const vd = vote(book, t);
    if (!vd) continue;
    out.push({ t, vd });
  }
  return { touches: out, split };
}

// ── price one voted touch for one book on bid/ask ────────────────────────────
export function priceTouch(sys, t, vd, d, packed, entryMode) {
  const level = sys === 'vote' ? t.level : t.price;
  const up = t.side === 'up' || t.side === 'above';
  const startIdx = bisect(d.times, t.time), endIdx = bisect(d.times, t.sessionCloseTime);
  if (startIdx >= d.times.length || d.times[startIdx] !== t.time || endIdx >= d.times.length) return { skip: 'bars' };
  const decision = vd.decision;
  const targetPips = decision === 'fade' ? t.innerDistPips : t.outerDistPips;
  const stopPips = decision === 'fade' ? t.outerDistPips : t.innerDistPips;
  if (!(targetPips > 0) || !(stopPips > 0)) return { skip: 'geometry' };
  const dir = (decision === 'follow') === up ? 1 : -1;
  const stopDist = stopPips * t.pip, targetDist = targetPips * t.pip;
  let r;
  if (decision === 'fade' && entryMode === 'retest') {
    // The sheet's chase: the next line out is this fade's own stop line, so it cancels there
    // unless 1.2x the stop is nearer (it never is with stop = next line; kept general).
    r = priceRetestFadeBidAsk(d, { startIdx, endIdx, dir, level, stopDist, targetDist, armFrac: ARM_FRAC, cancelDist: Math.min(CANCEL_FRAC * stopDist, stopDist) });
  } else {
    r = priceBracketBidAsk(d, { startIdx, endIdx, dir, entryType: decision === 'fade' ? 'limit' : 'stop', level, stopDist, targetDist });
  }
  if (!r.filled) return { skip: r.cancelled ? 'cancelled' : r.armed === false ? 'notArmed' : 'unfilled' };
  // Excursion on the mid path from fill to exit, in the trade's direction (pips).
  let hi = -Infinity, lo = Infinity;
  for (let k = r.fillIdx; k <= r.exitIdx; k++) { if (packed.highs[k] > hi) hi = packed.highs[k]; if (packed.lows[k] < lo) lo = packed.lows[k]; }
  const mfePips = Math.max(0, (dir === 1 ? hi - r.entryPx : r.entryPx - lo) / t.pip);
  const maePips = Math.max(0, (dir === 1 ? r.entryPx - lo : hi - r.entryPx) / t.pip);
  const denom = level;
  const pnlPct = r.r * stopDist / denom * 100;
  return {
    trade: {
      instrument: t.instrument ?? null, date: t.date, time: d.times[r.fillIdx], touchTime: t.time, resolveTime: d.times[r.exitIdx],
      side: t.side, rung: sys === 'vote' ? t.rung : t.level, session: t.session ?? null,
      entry: level, fillPx: +r.entryPx.toFixed(6), exitPx: +r.exitPx.toFixed(6), exitWhy: r.why, pip: t.pip,
      decision, margin: vd.margin, entryMode: decision === 'fade' ? entryMode : 'stop',
      targetPips, stopPips,
      mfePips: +mfePips.toFixed(1), maePips: +maePips.toFixed(1),
      mfePct: +(mfePips * t.pip / denom * 100).toFixed(4), maePct: +(maePips * t.pip / denom * 100).toFixed(4),
      win: r.r > 0, rMultiple: +r.r.toFixed(4), pnlPct: +pnlPct.toFixed(4), timedOut: r.why === 'close',
      spreadR: +(r.spreadAtFill / stopDist).toFixed(4),
      gapMin: t.gapMin ?? null, clearancePips: t.clearancePips ?? null, asiaConfPips: t.asiaConfPips ?? null,
    },
  };
}

// ── main ─────────────────────────────────────────────────────────────────────
function argList(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1].split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : dflt;
}
const ENTRY = { honest: 'limit', gonogo: 'limit', retest: 'retest' };
const LADDER = { honest: { vote: 'v2' }, retest: { vote: 'v2' }, gonogo: { vote: 'v1' } };

async function main() {
  const books = argList('books', Object.keys(ATLAS_BOOKS));
  const systems = argList('systems', ['vote', 'asia', 'monday']);
  const onlyPairs = argList('pairs', null);
  const upload = process.argv.includes('--upload');
  if (books.includes('gonogo') && !fs.existsSync(GONOGO_RESULTS) && !process.argv.includes('--allow-unscored-gonogo')) {
    console.error('gonogo book skipped: run the registered study first (run.mjs --mode count, amendment A1, then --mode score).');
    console.error('Showing its trades on a page before that would spend its one look. Override: --allow-unscored-gonogo.');
    books.splice(books.indexOf('gonogo'), 1);
  }
  let putJSON = null;
  if (upload) ({ putJSON } = await import('../../js/r2Store.js'));
  const summary = fs.existsSync(path.join(OUT, 'summary.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'summary.json'), 'utf8')) : {};
  const generatedAt = new Date().toISOString();

  for (const sys of systems) {
    const pairs = [...new Set(books.flatMap(b => universe(b, sys)))].filter(p => !onlyPairs || onlyPairs.includes(p));
    for (const pair of pairs) {
      const data = loadBin(FILE_KEY[pair] ?? pair);
      if (!data) { console.error(`${sys} ${pair}: no data/m1_bidask_bin_v file, skipped`); continue; }
      const walked = {};   // ladder -> votedTouches, so honest and retest share one walk
      for (const book of books) {
        if (!universe(book, sys).includes(pair)) continue;
        const ladder = LADDER[book][sys] ?? 'v1';
        walked[ladder] ??= votedTouches(sys, pair, data.packed, { ladder });
        const { touches, split } = walked[ladder];
        const trades = [], skipped = {};
        for (const { t, vd } of touches) {
          const p = priceTouch(sys, { ...t, instrument: t.instrument ?? pair.toUpperCase() }, vd, data.d, data.packed, ENTRY[book]);
          if (p.trade) trades.push(p.trade); else skipped[p.skip] = (skipped[p.skip] ?? 0) + 1;
        }
        trades.sort((a, b) => a.time - b.time);
        const summaryByMargin = {};
        for (const m of [1, 2, 3, 4]) {
          const sub = trades.filter(x => x.margin >= m);
          summaryByMargin[m] = summarizeTrades(sub.map(x => x.pnlPct), sub.map(x => x.date));
        }
        const payload = {
          instrument: pair.toUpperCase(), generatedAt, schema: VOTE_TRADES_SCHEMA, book, system: sys, ladder, fills: 'bidask',
          entry: ENTRY[book], cost: 0, splitDate: split, dataTo: new Date(data.d.times[data.d.times.length - 1] * 1000).toISOString().slice(0, 10),
          voted: touches.length, skipped, trades, summaryByMargin,
        };
        const key = bookKey(book, sys, pair);
        const file = path.join(OUT, key.replace(/^atlas-books\//, ''));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(payload));
        if (putJSON) await putJSON(key, payload);
        const prodMargin = GONOGO_SYSTEMS[sys].margin;
        const atM = trades.filter(x => x.margin >= prodMargin);
        const meanR = atM.length ? atM.reduce((s, x) => s + x.rMultiple, 0) / atM.length : null;
        ((summary[book] ??= {})[sys] ??= {})[pair] = { split, voted: touches.length, filled: trades.length, skipped, nAtProdMargin: atM.length, meanRAtProdMargin: meanR };
        console.log(`${book.padEnd(6)} ${sys.padEnd(6)} ${pair.padEnd(7)} voted ${String(touches.length).padStart(5)}  filled ${String(trades.length).padStart(5)}  m>=${prodMargin}: n ${atM.length}  meanR ${meanR == null ? '-' : meanR.toFixed(3)}  skipped ${JSON.stringify(skipped)}`);
      }
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ ...summary, generatedAt }, null, 1));
  if (putJSON) await putJSON('atlas-books/summary.json', { ...summary, generatedAt });
  console.log(`\nwrote ${OUT}${upload ? ' and R2 atlas-books/' : ' (local only; add --upload so Railway serves it)'}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}
