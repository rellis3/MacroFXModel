// mve/bookForwardEngine.js — I/O for the MVE book-layer forward paper tracker.
// Pre-registration: MD files/MVE_BOOK_FORWARD_TRACKER.md. Pure logic lives in
// ./bookForward.js; the book itself comes from the SAME code the system backtest
// uses (bookFactorEngine.prepareBookInputs + bookSystem.systemBookAt): the 2Y+10Y
// sleeves hedged off K=2 PCs + basket + net USD, sized to a 10% vol target —
// tracked next to the unhedged sleeves at the same sizing.
//
// Storage: R2, append-only (every Railway deploy wipes local disk).
//   mve/book-forward/manifest.json  — frozen on the first run, never rewritten
//   mve/book-forward/log.json       — one record per logged close, never edited
// Read-only research: feeds no live signal, bot or order.

import { prepareBookInputs, BOOK_SLEEVE_CONFIG, BOOK_COST_ONE_WAY } from './bookFactorEngine.js';

import { USD_MAJORS } from './bookFactor.js';
import { systemBookAt, runBookSystem, systemMetrics, SYSTEM_DEFAULTS } from './bookSystem.js';
import { forwardStep, summarizeForward, FORWARD_RULES } from './bookForward.js';

export const FORWARD_KEYS = { manifest: 'mve/book-forward/manifest.json', log: 'mve/book-forward/log.json' };
export const FORWARD_SYSTEM = { ...SYSTEM_DEFAULTS, hedgeMode: 'pcs+usd' };   // frozen: MVE_BOOK_SYSTEM_BACKTEST.md's primary
const RECENT_HISTORY_DAYS = 600;          // daily ticks only need ~window + z-window + max hold of history

const shiftDate = (d, days) => new Date(Date.parse(d + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
const costTable = () => Object.fromEntries(Object.keys(USD_MAJORS).map(p => [p, BOOK_COST_ONE_WAY]));

// Books held after the close at aligned index i: the primary (hedged) system and
// the unhedged sleeves at the same sizing.
function booksAtClose(inp, i, sys) {
  const t = i - 1;   // currency-return index whose window ends at close i
  if (t < sys.window - 1) return null;
  const win = inp.cr.R.slice(t - sys.window + 1, t + 1);
  const closeDate = inp.aligned.dates[i];
  const primary = systemBookAt({ win, trades: inp.trades, closeDate, o: sys });
  const raw = systemBookAt({ win, trades: inp.trades, closeDate, o: { ...sys, hedge: false } });
  return {
    neutral: primary.book, raw: raw.book,
    diag: { neutral: primary.book, exposurePre: primary.exposurePre, exposurePost: primary.exposurePost, factorVarShare: null, usdShare: primary.usdShare, leverage: primary.g * primary.s },
  };
}

// First run only: the frozen reference numbers the kill/review rules compare to,
// from the full-history system backtest of exactly this book, sizing and cost.
async function buildManifest(opts, todayUtc) {
  const inp = await prepareBookInputs({ ...opts, dropFromDate: todayUtc });
  const base = { dates: inp.cr.dates, R: inp.cr.R, pairRet: inp.cr.pairRet, closeDates: inp.aligned.dates, trades: inp.trades };
  const prim = runBookSystem({ ...base, opts: FORWARD_SYSTEM });
  const raw = runBookSystem({ ...base, opts: { ...FORWARD_SYSTEM, hedge: false } });
  const split = inp.splitDate;
  const k = Math.max(0, prim.dates.findIndex(d => d >= split));
  const m = (res, lo, hi) => systemMetrics(res.net.slice(lo, hi), res.dates.slice(lo, hi));
  const pf = m(prim, 0), pi = m(prim, 0, k), po = m(prim, k), ro = m(raw, k);
  return {
    createdAt: new Date().toISOString(),
    startDate: null,                              // set to the first logged close
    book: 'system-primary (2Y+10Y, hedged PCs+basket+USD, 10% vol target)', system: FORWARD_SYSTEM, K: FORWARD_SYSTEM.K, window: FORWARD_SYSTEM.window,
    sleeveConfig: { ...BOOK_SLEEVE_CONFIG, ...(opts.sleeveConfig || {}) },
    costOneWay: costTable(), rules: FORWARD_RULES,
    reference: {
      splitDate: split, backtestDays: prim.dates.length, dataTo: inp.aligned.dates[inp.aligned.dates.length - 1],
      neutralCombined: { oosSharpe: po.sharpe, isSharpe: pi.sharpe, fullSharpe: pf.sharpe, oosAnnVolPct: po.annVolPct, oosMaxDdPct: po.maxDdPct, fullMaxDdPct: pf.maxDdPct, fullCagrPct: pf.cagrPct },
      rawCombined: { oosSharpe: ro.sharpe, oosAnnVolPct: ro.annVolPct },
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
  const sys = manifest.system || FORWARD_SYSTEM;
  const books = booksAtClose(inp, i, sys);
  if (!books) throw new Error('not enough history for the factor window');
  const closes = Object.fromEntries(Object.keys(USD_MAJORS).map(p => [p, inp.aligned.closes[p][i]]));

  // replay the previous logged day with today's code + data (parity check)
  const prev = log[log.length - 1];
  let replayPrev = null;
  if (prev) {
    const j = dates.indexOf(prev.date);
    const rb = j >= 1 ? booksAtClose(inp, j, sys) : null;
    if (rb) replayPrev = { date: prev.date, neutral: rb.neutral, raw: rb.raw };
  }

  if (!manifest.startDate) manifest.startDate = date;
  const step = forwardStep(log, manifest, { date, closes, raw: books.raw, book: books.diag, replayPrev, loggedAt: now.toISOString() });
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
