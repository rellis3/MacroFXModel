// mve/bookForwardEngine.js — I/O for the MVE book-layer forward paper tracker.
// Pre-registration: MD files/MVE_BOOK_FORWARD_TRACKER.md. Pure logic lives in
// ./bookForward.js; the book itself comes from the SAME code the audit used
// (bookFactorEngine.prepareBookInputs + bookFactor.windowFactors/neutralBook).
//
// Storage: R2, append-only (every Railway deploy wipes local disk).
//   mve/book-forward/manifest.json  — frozen on the first run, never rewritten
//   mve/book-forward/log.json       — one record per logged close, never edited
// Read-only research: feeds no live signal, bot or order.

import { prepareBookInputs, BOOK_SLEEVE_CONFIG, BOOK_COST_ONE_WAY } from './bookFactorEngine.js';
import { USD_MAJORS, windowFactors, neutralBook, runBookLayer, BOOK_DEFAULTS } from './bookFactor.js';
import { forwardStep, summarizeForward, FORWARD_RULES } from './bookForward.js';

export const FORWARD_KEYS = { manifest: 'mve/book-forward/manifest.json', log: 'mve/book-forward/log.json' };
export const FORWARD_K = 2;               // frozen: the K the audit's noise band chose (MVE_BOOK_FACTOR_AUDIT.md §8)
export const FORWARD_BOOK = 'combined';   // the candidate system: 2Y + 10Y at ½ each, factor-neutral
const RECENT_HISTORY_DAYS = 600;          // daily ticks only need ~window + z-window + max hold of history

const shiftDate = (d, days) => new Date(Date.parse(d + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
const costTable = () => Object.fromEntries(Object.keys(USD_MAJORS).map(p => [p, BOOK_COST_ONE_WAY]));

// Book (and diagnostics) held after the close at aligned index i.
function bookAtClose(inp, i, K, window = BOOK_DEFAULTS.window) {
  const t = i - 1;   // currency-return index whose window ends at close i
  if (t < window - 1) return null;
  const fm = windowFactors(inp.cr.R.slice(t - window + 1, t + 1));
  const raw = inp.pos[FORWARD_BOOK][i] || {};
  return neutralBook(raw, fm, K);
}

// First run only: the frozen reference numbers the kill/review rules compare to,
// from the full-history backtest of exactly this book, K and cost.
async function buildManifest(opts, todayUtc) {
  const inp = await prepareBookInputs({ ...opts, dropFromDate: todayUtc });
  const res = runBookLayer({
    ...inp.cr, books: { [FORWARD_BOOK]: inp.pos[FORWARD_BOOK] }, splitDate: inp.splitDate,
    costOneWay: costTable(), K: FORWARD_K, shadowResidual: false,
  });
  const b = res.books[FORWARD_BOOK];
  let eq = 1, peak = 1, mdd = 0;
  for (const r of b._streams.neutral) { eq *= 1 + r; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); }
  return {
    createdAt: new Date().toISOString(),
    startDate: null,                              // set to the first logged close
    book: FORWARD_BOOK, K: FORWARD_K, window: BOOK_DEFAULTS.window,
    sleeveConfig: { ...BOOK_SLEEVE_CONFIG, ...(opts.sleeveConfig || {}) },
    costOneWay: costTable(), rules: FORWARD_RULES,
    reference: {
      splitDate: res.splitDate, backtestDays: res.days, dataTo: inp.aligned.dates[inp.aligned.dates.length - 1],
      neutralCombined: {
        oosSharpe: b.neutral.net.OOS.sharpe, isSharpe: b.neutral.net.IS.sharpe,
        oosAnnVolPct: b.neutral.gross.OOS.annVolPct, oosMaxDdPct: b.neutral.net.OOS.maxDdPct,
        fullMaxDdPct: +(mdd * 100).toFixed(2),
      },
      rawCombined: { oosSharpe: b.raw.net.OOS.sharpe, oosAnnVolPct: b.raw.gross.OOS.annVolPct },
    },
    doc: 'MD files/MVE_BOOK_FORWARD_TRACKER.md',
  };
}

// One tick. store = { getJSON(key), putJSON(key, obj) }. Idempotent: running it
// twice for the same completed close appends nothing the second time. The
// current (incomplete) UTC day is always dropped.
export async function runForwardTick(store, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  let manifest = await store.getJSON(FORWARD_KEYS.manifest);
  const log = (await store.getJSON(FORWARD_KEYS.log)) || [];
  let createdManifest = false;
  if (!manifest) { manifest = await buildManifest(opts, todayUtc); createdManifest = true; }

  const recentFrom = shiftDate(todayUtc, -RECENT_HISTORY_DAYS);
  const inp = await prepareBookInputs({
    ...opts, dropFromDate: todayUtc,
    sleeveConfig: { ...manifest.sleeveConfig, dateFrom: recentFrom },
  });
  const dates = inp.aligned.dates;
  const i = dates.length - 1;
  const date = dates[i];
  const book = bookAtClose(inp, i, manifest.K, manifest.window);
  if (!book) throw new Error('not enough history for the factor window');
  const closes = Object.fromEntries(Object.keys(USD_MAJORS).map(p => [p, inp.aligned.closes[p][i]]));

  // replay the previous logged day with today's code + data (parity check)
  const prev = log[log.length - 1];
  let replayPrev = null;
  if (prev) {
    const j = dates.indexOf(prev.date);
    const rb = j >= 1 ? bookAtClose(inp, j, manifest.K, manifest.window) : null;
    if (rb) replayPrev = { date: prev.date, neutral: rb.neutral, raw: rb.raw };
  }

  if (!manifest.startDate) manifest.startDate = date;
  const step = forwardStep(log, manifest, { date, closes, raw: book.raw, book, replayPrev, loggedAt: now.toISOString() });
  if (createdManifest) await store.putJSON(FORWARD_KEYS.manifest, manifest);
  const newLog = step.appended ? [...log, step.record] : log;
  if (step.appended) await store.putJSON(FORWARD_KEYS.log, newLog);
  return { appended: step.appended, reason: step.reason || null, date, createdManifest, manifest, summary: summarizeForward(newLog, manifest), recent: newLog.slice(-60) };
}

export async function readForward(store) {
  const manifest = await store.getJSON(FORWARD_KEYS.manifest);
  const log = (await store.getJSON(FORWARD_KEYS.log)) || [];
  if (!manifest) return { ok: true, started: false };
  return { ok: true, started: true, manifest, summary: summarizeForward(log, manifest), recent: log.slice(-60), days: log.length };
}
