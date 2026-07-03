// Trade Decision Engine — historical BACKFILL + candidate-model fit.
//
// Answers "does the engine work from day one?": replay the M1 parquet history
// (the loadM1ForPair brick) through the SAME snapshot builder and the SAME
// decide() fast loop the live API uses — one code path, so the backfilled
// events and live decisions describe the same game (the bit-identical-port
// lesson). Each zone touch becomes one labeled event:
//
//   { date, pair, zone, action, direction, features, probability(v0),
//     outcome: { win, pnlPct, exit } }
//
// via a conservative triple-barrier on the remaining M1 of the day (SL checked
// first intrabar; unresolved → honest mark-to-day-close; after-cost label).
//
// Incremental by construction: data/backfill_state.json records the last date
// processed per pair; re-running only appends new days. Run it once for the
// full history, then daily (manual button or TDE_BACKFILL_DAILY) to keep the
// event log growing with the market.
//
// fitLogistic() then trains a logistic model on the SAME bounded features
// (time-ordered train/OOS split with an embargo gap) and reports OOS
// calibration buckets + Brier vs the v0 prior. The fit is a CANDIDATE —
// promotion to modelV1.js stays a human decision on the calibration evidence
// (Lego Principle 5: OOS or it didn't happen).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair, M1_DRIVE_IDS } from '../js/volBacktestM1Engine.js';
import { gapFillPacked } from '../js/m1GapFill.js';
import { fetchM1Range } from '../js/volBacktestEngine.js';
import { bisect } from '../js/barUtils.js';
import { DEFAULT_COST_PCT } from '../js/forecastCore.js';
import { assetClass, oandaSymbol } from '../js/instrumentRegistry.js';
import { buildSnapshot } from './featureState.js';
import { decide } from './decisionCore.js';
import { MODEL_V0 } from './modelV0.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR    = process.env.TDE_DATA_DIR ?? path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'backfill_events.jsonl');
const STATE_FILE  = path.join(DATA_DIR, 'backfill_state.json');
const REPORT_FILE = path.join(DATA_DIR, 'backfill_report.json');

// Everything the backfill covers by default: the FX set + gold + the index
// CFDs (Nasdaq/S&P/Dow/Russell/FTSE/DAX). The engine is asset-class-agnostic —
// σ math, band constants, costs and pip size all switch on instrumentRegistry
// (index → GARCH σ, ASSET_PARAMS.index, pip 1.0) — so indices flow through the
// same code path. M1 loads from R2 as `<key>_m1.parquet`; a pair whose parquet
// is absent fails per-pair with a logged error and the run continues, so the
// run log IS the availability report.
export const TDE_BACKFILL_PAIRS = [...Object.keys(M1_DRIVE_IDS), 'gold', 'nq', 'spx', 'dow', 'rut', 'ftse', 'dax'];

export const BACKFILL_DEFAULTS = {
  warmupDays: 120,      // snapshot needs history before the first tradeable day
  snapshotWindow: 320,  // D1 bars per snapshot — mirrors the live fetchD1 count
  tpSigma: 0.5,         // take-profit distance (σ units)
  slSigma: 0.75,        // stop distance (σ units) — SL checked FIRST intrabar
  maxTouchesPerDay: 6,  // most-confluent zones first
  approachBars: 30,     // M1 bars used for approach-speed feature
};

// ── D1 derivation from packed M1 (one typed-array pass, no object churn) ─────
export function deriveD1Packed(packed) {
  const { n, times, opens, highs, lows, closes } = packed;
  const out = [];
  let day = -1, o = 0, h = 0, l = 0, c = 0;
  for (let i = 0; i < n; i++) {
    const d = times[i] - (times[i] % 86400);
    if (d !== day) {
      if (day >= 0) out.push({ time: day, open: o, high: h, low: l, close: c });
      day = d; o = opens[i]; h = highs[i]; l = lows[i]; c = closes[i];
    } else {
      if (highs[i] > h) h = highs[i];
      if (lows[i] < l) l = lows[i];
      c = closes[i];
    }
  }
  if (day >= 0) out.push({ time: day, open: o, high: h, low: l, close: c });
  return out;
}

// ── Triple-barrier outcome on the rest of the day (pure) ─────────────────────
// packed M1, [fromIdx, endIdx): SL first (conservative), then TP, else honest
// mark-to-day-close. Returns { win, pnlPct, exit } — pnlPct is AFTER round-trip
// cost. dirSign: +1 long / −1 short.
export function labelOutcome(packed, fromIdx, endIdx, entry, dirSign, sigmaAbs, cfg, costPct) {
  const tp = entry + dirSign * cfg.tpSigma * sigmaAbs;
  const sl = entry - dirSign * cfg.slSigma * sigmaAbs;
  let exit = 'close', px = null;
  for (let i = fromIdx; i < endIdx; i++) {
    const hi = packed.highs[i], lo = packed.lows[i];
    if (dirSign > 0 ? lo <= sl : hi >= sl) { exit = 'sl'; px = sl; break; }
    if (dirSign > 0 ? hi >= tp : lo <= tp) { exit = 'tp'; px = tp; break; }
  }
  if (px == null) px = packed.closes[Math.max(fromIdx, endIdx - 1)];
  const gross = (dirSign * (px - entry)) / entry * 100;
  const pnlPct = +(gross - costPct).toFixed(4);
  return { win: pnlPct > 0 ? 1 : 0, pnlPct, exit };
}

// ── One pair, walk-forward (pure given a packed series) ──────────────────────
// For each day past warmup: snapshot from D1 < today (same buildSnapshot as
// live), then scan today's M1 for FIRST touches of the top zones and push each
// through the same decide() the API serves. onEvent(evt) receives each event.
//
// contextByDate (optional): { 'YYYY-MM-DD': { macro?, calendar? } } — the
// historical-context injection socket. A macro loader (obs-dated FRED with
// publication lags) supplies per-day { regime, riskSens }; a historical
// calendar can adopt the same shape later (today the replayed calendar is []
// — which is why the fitted news_soon weight is currently meaningless).
// Absent dates ⇒ macro-neutral, empty calendar: pre-context rows are unchanged.
export function backfillPair(pair, packed, { fromDate = null, cfg = {}, contextByDate = null, onEvent } = {}) {
  const C = { ...BACKFILL_DEFAULTS, ...cfg };
  const d1 = deriveD1Packed(packed);
  const costPct = DEFAULT_COST_PCT[safeClass(pair)] ?? DEFAULT_COST_PCT.fx;
  let events = 0, days = 0, lastDate = fromDate;

  for (let i = C.warmupDays; i < d1.length; i++) {
    const dayStart = d1[i].time, dayEnd = dayStart + 86400;
    const date = new Date(dayStart * 1000).toISOString().substring(0, 10);
    if (fromDate && date <= fromDate) continue;

    const s = bisect(packed.times, dayStart), e = bisect(packed.times, dayEnd);
    if (e - s < 60) continue;   // holiday / broken day

    // snapshot from COMPLETED days only (< today) — the live no-lookahead rule.
    // sessionOpen = the day's first M1 open (the same true-open the live path
    // gets from today's M1), not the last-close approximation.
    const dailyBars = d1.slice(Math.max(0, i - C.snapshotWindow), i);
    const dayCtx = contextByDate?.[date] ?? {};
    let snap;
    try {
      snap = buildSnapshot({ pair, dailyBars, calendar: dayCtx.calendar ?? [], macro: dayCtx.macro ?? null,
        sessionOpen: packed.opens[s], nowMs: dayStart * 1000, mode: 'backfill' });
    } catch { continue; }
    const sigmaAbs = snap.sigmaDaily * snap.dayOpen;
    if (!(sigmaAbs > 0)) continue;
    days++; lastDate = date;

    // prefix state over the day's bars → per-touch intraday features with no
    // lookahead: everything indexed at t uses bars [s..t] only
    const dayN = e - s;
    const runHi = new Float64Array(dayN), runLo = new Float64Array(dayN);
    const cumTPV = new Float64Array(dayN), cumVol = new Float64Array(dayN);
    for (let k = 0; k < dayN; k++) {
      const g = s + k, v = packed.volumes?.[g] || 1;
      runHi[k] = k ? Math.max(runHi[k - 1], packed.highs[g]) : packed.highs[g];
      runLo[k] = k ? Math.min(runLo[k - 1], packed.lows[g]) : packed.lows[g];
      cumTPV[k] = (k ? cumTPV[k - 1] : 0) + ((packed.highs[g] + packed.lows[g] + packed.closes[g]) / 3) * v;
      cumVol[k] = (k ? cumVol[k - 1] : 0) + v;
    }
    const hl50Abs = snap.meta.hl50Abs;

    // top zones within reach of the day's likely path
    const zones = snap.zones
      .filter(z => Math.abs(z.price - snap.dayOpen) <= 1.5 * sigmaAbs)
      .sort((a, b) => b.score - a.score)
      .slice(0, C.maxTouchesPerDay);

    for (const z of zones) {
      // first M1 touch of the zone price
      let t = -1;
      for (let k = s; k < e; k++) { if (packed.lows[k] <= z.price && packed.highs[k] >= z.price) { t = k; break; } }
      if (t < 0) continue;

      const back = Math.max(s, t - C.approachBars);
      const approachSigma = Math.abs(packed.closes[t] - packed.closes[back]) / sigmaAbs;
      const touchMs = packed.times[t] * 1000;

      // intraday state AS-OF the touch (prefix arrays — bars [s..t] only),
      // matching the live snapshot.intraday shape via the request override
      const k = t - s;
      const vwap = cumVol[k] > 0 ? cumTPV[k] / cumVol[k] : null;
      const intraday = {
        rangeUsed: hl50Abs > 0 ? +((runHi[k] - runLo[k]) / hl50Abs).toFixed(3) : null,
        posInRange: runHi[k] > runLo[k] ? +((packed.closes[t] - runLo[k]) / (runHi[k] - runLo[k])).toFixed(3) : 0.5,
        vwapDistSigma: vwap != null ? +((packed.closes[t] - vwap) / sigmaAbs).toFixed(3) : 0,
        approachSigma: +approachSigma.toFixed(3),
      };

      // the SAME fast loop the live API serves. One snapshot per day here, so
      // the live 15-min staleness gate is widened to the session length —
      // that gate is about a dead slow loop, not about intraday drift.
      const dec = decide(snap, { pair, price: z.price, approachSigma, intraday },
        { nowMs: touchMs, maxStalenessMs: 26 * 3600_000 });
      if (dec.probability == null) continue;   // gated (shouldn't happen without calendar)

      const dirSign = dec.direction === 'long' ? 1 : -1;
      const outcome = labelOutcome(packed, t + 1, e, z.price, dirSign, sigmaAbs, C, costPct);

      events++;
      onEvent?.({
        source: 'backfill', pair, date, ts: packed.times[t],
        zone: { price: +z.price.toFixed(5), confluence: z.count, score: z.score, sources: z.sources },
        action: dec.action, direction: dec.direction,
        probability: dec.probability, features: dec.features,
        regime: snap.regime, T: +snap.T.toFixed(3), vol_pct: +snap.volPct.toFixed(3),
        approach_sigma: +approachSigma.toFixed(3), intraday,
        outcome, model_version: dec.model_version,
      });
    }
  }
  return { pair, days, events, lastDate };
}

// ── Logistic fit + OOS calibration report (pure) ─────────────────────────────
// Time-ordered split with an embargo gap; gradient descent with L2; reports
// per-decile OOS calibration and Brier for BOTH the fitted model and the v0
// prior. The output is a candidate — calibrated:false until a human promotes it.
//
// Ablation support: `features` selects the feature-name list (default = the v0
// weight keys). An ablation = two calls on the SAME events with and without the
// extra feature (e.g. [...default, 'macro_align']), compared on OOS Brier +
// calibration. Macro-bearing runs should pass embargoDays: 30 (macro episodes
// are weeks-long — see ARCHITECTURE §7c) and pair the fit with
// macroBucketReport + a per-era sign check; a pooled OOS number alone can be
// era memorization. `l2ExemptFeatures` exempts named features from the L2
// penalty — shrinkage on a rare feature biases toward "it fails", so a
// bucket-test-vs-ablation disagreement should be re-run with the macro
// coefficient unpenalized before concluding.
export function fitLogistic(events, { oosFrac = 0.35, embargoDays = 10, epochs = 300, lr = 0.5, l2 = 1e-3,
                                      features = null, l2ExemptFeatures = [] } = {}) {
  const names = features ?? Object.keys(MODEL_V0.weights);
  const l2Mask = names.map(k => (l2ExemptFeatures.includes(k) ? 0 : 1));
  const rows = events
    .filter(ev => ev.features && ev.outcome)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (rows.length < 200) return { ok: false, error: `need ≥200 events to fit, got ${rows.length}` };

  const X = rows.map(ev => names.map(k => ev.features[k] ?? 0));
  const y = rows.map(ev => ev.outcome.win);

  const splitIdx = Math.floor(rows.length * (1 - oosFrac));
  const splitDate = rows[splitIdx].date;
  const embargoEnd = addDays(splitDate, embargoDays);
  const trainEnd = splitIdx;
  let oosStart = splitIdx;
  while (oosStart < rows.length && rows[oosStart].date < embargoEnd) oosStart++;

  // gradient descent
  let w = new Array(names.length).fill(0), b = 0;
  const sig = z => 1 / (1 + Math.exp(-z));
  for (let ep = 0; ep < epochs; ep++) {
    const gw = new Array(names.length).fill(0); let gb = 0;
    for (let r = 0; r < trainEnd; r++) {
      const p = sig(b + dot(w, X[r]));
      const err = p - y[r];
      for (let j = 0; j < names.length; j++) gw[j] += err * X[r][j];
      gb += err;
    }
    for (let j = 0; j < names.length; j++) w[j] = w[j] - lr * (gw[j] / trainEnd + l2 * l2Mask[j] * w[j]);
    b -= lr * (gb / trainEnd);
  }

  // OOS evaluation: fitted vs v0 prior, calibration deciles + Brier
  const evalModel = (probFn) => {
    const buckets = Array.from({ length: 10 }, () => ({ n: 0, pSum: 0, wins: 0 }));
    let brier = 0, n = 0;
    for (let r = oosStart; r < rows.length; r++) {
      const p = probFn(r);
      const bk = buckets[Math.min(9, Math.floor(p * 10))];
      bk.n++; bk.pSum += p; bk.wins += y[r];
      brier += (p - y[r]) ** 2; n++;
    }
    return {
      n, brier: n ? +(brier / n).toFixed(4) : null,
      calibration: buckets.map((bk, i) => ({
        bucket: `${i * 10}–${i * 10 + 10}%`, n: bk.n,
        predicted: bk.n ? +(bk.pSum / bk.n).toFixed(3) : null,
        realized: bk.n ? +(bk.wins / bk.n).toFixed(3) : null,
        reliable: bk.n >= 30,
      })).filter(bk => bk.n > 0),
    };
  };
  const fitted = evalModel(r => sig(b + dot(w, X[r])));
  const prior  = evalModel(r => rows[r].probability);

  // calibration verdict: reliable buckets (n≥30) within ±10pts predicted↔realized
  const rel = fitted.calibration.filter(bk => bk.reliable);
  const wellCalibrated = rel.length >= 2 && rel.every(bk => Math.abs(bk.predicted - bk.realized) <= 0.10);

  return {
    ok: true,
    events: rows.length, train_n: trainEnd, oos_n: rows.length - oosStart,
    split_date: splitDate, embargo_days: embargoDays,
    base_rate: +(y.reduce((a, x) => a + x, 0) / y.length).toFixed(3),
    oos: { fitted, prior_v0: prior, fitted_beats_prior: fitted.brier != null && prior.brier != null && fitted.brier < prior.brier },
    candidate: {
      version: `v1-candidate-${new Date().toISOString().substring(0, 10)}`,
      calibrated: false,               // promotion is a human decision on this evidence
      well_calibrated_oos: wellCalibrated,
      intercept: +b.toFixed(4),
      weights: Object.fromEntries(names.map((k, j) => [k, +w[j].toFixed(4)])),
      goThreshold: MODEL_V0.goThreshold, sizeCurve: MODEL_V0.sizeCurve,
    },
  };
}

// ── Macro bucket test (pure) — the PRIMARY macro evidence ────────────────────
// Buckets labeled events by the sign of features.macro_align and reports, per
// bucket: n, win rate, after-cost expectancy, per-year breakdown, and the
// EPISODE count — a maximal run of same-bucket events with ≤maxGapDays between
// consecutive dates. Events inside one macro episode are not independent: 800
// OPPOSED events inside March 2020 are ONE observation. The pre-registered bar
// for "macro is real" (frozen here, before any results): OPPOSED underperforms
// with n ≥ 30 AND ≥ 8 distinct episodes spread over ≥ 3 calendar years.
export const MACRO_BUCKET_BAR = { minEvents: 30, minEpisodes: 8, minYears: 3 };

export function macroBucketReport(events, { maxGapDays = 7 } = {}) {
  const rows = (events ?? [])
    .filter(ev => ev.features && ev.outcome && ev.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const mk = () => ({ n: 0, wins: 0, pnlSum: 0, episodes: 0, _lastDate: null, years: new Set(), perYear: {} });
  const buckets = { aligned: mk(), neutral: mk(), opposed: mk() };
  for (const ev of rows) {
    const a = ev.features.macro_align ?? 0;
    const b = buckets[a > 0 ? 'aligned' : a < 0 ? 'opposed' : 'neutral'];
    const year = ev.date.substring(0, 4);
    if (b._lastDate == null || daysBetween(b._lastDate, ev.date) > maxGapDays) b.episodes++;
    b._lastDate = ev.date;
    b.n++; b.wins += ev.outcome.win; b.pnlSum += ev.outcome.pnlPct;
    b.years.add(year);
    (b.perYear[year] ??= { n: 0, wins: 0, pnlSum: 0 });
    b.perYear[year].n++; b.perYear[year].wins += ev.outcome.win; b.perYear[year].pnlSum += ev.outcome.pnlPct;
  }
  const fin = b => ({
    n: b.n, episodes: b.episodes, years: b.years.size,
    winRate: b.n ? +(b.wins / b.n).toFixed(4) : null,
    avgPnlPct: b.n ? +(b.pnlSum / b.n).toFixed(4) : null,
    meetsBar: b.n >= MACRO_BUCKET_BAR.minEvents && b.episodes >= MACRO_BUCKET_BAR.minEpisodes && b.years.size >= MACRO_BUCKET_BAR.minYears,
    perYear: Object.fromEntries(Object.entries(b.perYear).map(([y, s]) =>
      [y, { n: s.n, winRate: +(s.wins / s.n).toFixed(3), avgPnlPct: +(s.pnlSum / s.n).toFixed(4) }])),
  });
  return { bar: MACRO_BUCKET_BAR, aligned: fin(buckets.aligned), neutral: fin(buckets.neutral), opposed: fin(buckets.opposed) };
}

function daysBetween(d1, d2) { return Math.round((Date.parse(d2 + 'T00:00:00Z') - Date.parse(d1 + 'T00:00:00Z')) / 86400_000); }

// ── Orchestration (file-backed, incremental) ─────────────────────────────────
export function readBackfillState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
export function readBackfillReport() {
  try { return JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')); } catch { return null; }
}
export function readEvents() {
  try {
    return fs.readFileSync(EVENTS_FILE, 'utf8').trim().split('\n')
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// Full or incremental run over `pairs` (sequential — one packed series in
// memory at a time). Appends events, advances per-pair state, refits, writes
// the report. onLog(msg) streams progress to the async-job log.
//
// gapFill (default on when OANDA_KEY is set): the stored parquet is the frozen
// history — the DIFFERENCE up to now is fetched live from OANDA M1 via the
// m1GapFill brick, so the nightly top-up does NOT depend on the R2 store having
// been refreshed. A gap-fill failure degrades to the stored history, never aborts.
export async function runBackfill(pairs, { incremental = true, gapFill = true, cfg = {}, contextByDate = null, onLog = () => {} } = {}) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const state = incremental ? readBackfillState() : {};
  if (!incremental) { try { fs.unlinkSync(EVENTS_FILE); } catch {} }

  const perPair = [];
  for (const pair of pairs) {
    try {
      onLog(`${pair}: loading M1…`);
      let packed = await loadM1ForPair(pair);
      if (gapFill && process.env.OANDA_KEY) {
        try {
          packed = await gapFillPacked(packed, oandaSymbol(pair), fetchM1Range,
            { nowSec: Math.floor(Date.now() / 1000), onLog });
        } catch (e) { onLog(`${pair}: gap-fill failed (${e.message ?? e}) — using stored history`); }
      }
      const lines = [];
      const res = backfillPair(pair, packed, {
        fromDate: state[pair]?.lastDate ?? null, cfg, contextByDate,
        onEvent: ev => lines.push(JSON.stringify(ev)),
      });
      if (lines.length) fs.appendFileSync(EVENTS_FILE, lines.join('\n') + '\n');
      state[pair] = { lastDate: res.lastDate, updatedAt: Date.now() };
      perPair.push(res);
      onLog(`${pair}: ${res.events} events over ${res.days} days (through ${res.lastDate ?? 'n/a'})`);
    } catch (e) {
      perPair.push({ pair, error: e.message ?? String(e) });
      onLog(`${pair}: FAILED — ${e.message ?? e}`);
    }
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  const events = readEvents();
  onLog(`fitting candidate model on ${events.length} total events…`);
  const fit = fitLogistic(events);
  const report = {
    generatedAt: Date.now(), incremental,
    totals: { events: events.length, pairs: perPair.length },
    perPair, fit,
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  onLog(`done — ${events.length} events, fit ${fit.ok ? 'ok' : `skipped (${fit.error})`}`);
  return report;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const dot = (w, x) => { let s = 0; for (let j = 0; j < w.length; j++) s += w[j] * x[j]; return s; };
function addDays(dateStr, d) { const t = new Date(dateStr + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().substring(0, 10); }
function safeClass(pair) { try { return assetClass(pair); } catch { return 'fx'; } }
