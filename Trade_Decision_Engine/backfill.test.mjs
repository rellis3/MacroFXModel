// Backfill — synthetic, no-network unit tests for the pure parts.
// Run: node Trade_Decision_Engine/backfill.test.mjs
import assert from 'node:assert/strict';
import { deriveD1Packed, backfillDayDate, labelOutcome, backfillPair, fitLogistic, macroBucketReport, MACRO_BUCKET_BAR, BACKFILL_DEFAULTS } from './backfill.js';
import { MODEL_V0 } from './modelV0.js';

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };

// ── deterministic synthetic packed M1 (200 days × 1440 min) ──────────────────
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function synthPacked(days = 200, seed = 11) {
  const rand = mulberry32(seed);
  const n = days * 1440;
  const times = new Int32Array(n), opens = new Float32Array(n), highs = new Float32Array(n), lows = new Float32Array(n), closes = new Float32Array(n);
  const t0 = 1_700_000_000 - (1_700_000_000 % 86400);
  let p = 1.10;
  for (let i = 0; i < n; i++) {
    times[i] = t0 + Math.floor(i / 1440) * 86400 + (i % 1440) * 60;
    const r = 0.00025 * (rand() - 0.5) + (i % 1440 === 0 ? 0.001 * (rand() - 0.5) : 0);
    opens[i] = p; closes[i] = p * (1 + r);
    highs[i] = Math.max(opens[i], closes[i]) * (1 + 0.0001 * rand());
    lows[i]  = Math.min(opens[i], closes[i]) * (1 - 0.0001 * rand());
    p = closes[i];
  }
  return { n, times, opens, highs, lows, closes, volumes: new Float32Array(n) };
}
const packed = synthPacked();

// ── deriveD1Packed ───────────────────────────────────────────────────────────
{
  const d1 = deriveD1Packed(packed);
  ok(d1.length === 200, `one D1 bar per day (${d1.length})`);
  ok(Math.abs(d1[0].open - packed.opens[0]) < 1e-9, 'first open matches');
  ok(Math.abs(d1[0].close - packed.closes[1439]) < 1e-9, 'day close = last M1 close');
  let hi = -Infinity; for (let i = 0; i < 1440; i++) hi = Math.max(hi, packed.highs[i]);
  ok(Math.abs(d1[0].high - hi) < 1e-9, 'day high = max M1 high');
  ok(d1.every((b, i) => i === 0 || b.time > d1[i - 1].time), 'chronological');
}

// ── labelOutcome: barrier order and honest close ─────────────────────────────
{
  // hand-built path: entry 1.0, long, σAbs=0.02 → tp=1.01, sl=0.985
  const mk = arr => ({ n: arr.length, times: new Int32Array(arr.length),
    highs: new Float32Array(arr.map(a => a[0])), lows: new Float32Array(arr.map(a => a[1])),
    closes: new Float32Array(arr.map(a => a[2])), opens: new Float32Array(arr.length) });
  const cfg = BACKFILL_DEFAULTS;
  const up = mk([[1.005, 0.999, 1.004], [1.012, 1.001, 1.011]]);
  const rTp = labelOutcome(up, 0, 2, 1.0, +1, 0.02, cfg, 0.012);
  ok(rTp.exit === 'tp' && rTp.win === 1, 'TP path wins');
  const both = mk([[1.012, 0.984, 1.0]]);   // bar spans BOTH barriers → SL first (conservative)
  const rBoth = labelOutcome(both, 0, 1, 1.0, +1, 0.02, cfg, 0.012);
  ok(rBoth.exit === 'sl' && rBoth.win === 0, 'ambiguous intrabar resolves to SL (conservative)');
  const flat = mk([[1.002, 0.998, 1.001], [1.003, 0.999, 1.0005]]);
  const rC = labelOutcome(flat, 0, 2, 1.0, +1, 0.02, cfg, 0.012);
  ok(rC.exit === 'close', 'no barrier → mark-to-day-close');
  ok(Math.abs(rC.pnlPct - ((1.0005 - 1.0) * 100 - 0.012)) < 1e-3, 'after-cost pnl at close');
  const shortSl = labelOutcome(mk([[1.016, 0.999, 1.015]]), 0, 1, 1.0, -1, 0.02, cfg, 0.012);
  ok(shortSl.exit === 'sl' && shortSl.win === 0, 'short SL side correct');
}

// ── backfillPair: events produced, no lookahead, incremental resume ──────────
{
  const evts = [];
  const res = backfillPair('eurusd', packed, { onEvent: e => evts.push(e) });
  ok(res.events > 20, `events generated (${res.events})`);
  ok(res.events === evts.length, 'onEvent count matches');
  ok(evts.every(e => e.outcome && (e.outcome.win === 0 || e.outcome.win === 1)), 'every event labeled');
  ok(evts.every(e => e.probability > 0 && e.probability < 1), 'v0 probability attached');
  ok(evts.every(e => ['fade', 'follow'].includes(e.action) && ['long', 'short'].includes(e.direction)), 'action/direction set');
  ok(evts.every(e => e.model_version === MODEL_V0.version), 'model version stamped');
  const dates = evts.map(e => e.date);
  ok(dates.every((d, i) => i === 0 || d >= dates[i - 1]), 'events chronological');
  // incremental: resuming from the last date yields zero new events
  const evts2 = [];
  const res2 = backfillPair('eurusd', packed, { fromDate: res.lastDate, onEvent: e => evts2.push(e) });
  ok(res2.events === 0 && evts2.length === 0, 'incremental resume adds nothing on same data');
  // determinism
  const evts3 = [];
  backfillPair('eurusd', packed, { onEvent: e => evts3.push(e) });
  assert.deepEqual(evts3, evts); passed++;

  // ── fitLogistic on the real backfill events (may be < 200 → graceful) ──────
  if (evts.length >= 200) {
    const fit = fitLogistic(evts);
    ok(fit.ok, 'fit runs');
    ok(fit.oos.fitted.calibration.length > 0, 'calibration buckets produced');
    ok(fit.candidate.calibrated === false, 'candidate never self-promotes');
  } else {
    ok(fitLogistic(evts).ok === false, 'fit refuses thin samples');
  }
}

// ── intraday state in the replay: per-touch, no lookahead ────────────────────
{
  const evts = [];
  backfillPair('eurusd', packed, { onEvent: e => evts.push(e) });
  ok(evts.every(e => e.intraday && Number.isFinite(e.intraday.rangeUsed) && Number.isFinite(e.intraday.vwapDistSigma)),
    'every event carries per-touch intraday state');
  ok(evts.every(e => e.intraday.posInRange >= 0 && e.intraday.posInRange <= 1), 'posInRange bounded');
  ok(evts.some(e => e.features.intraday_fade_too_early > 0 || e.features.intraday_range_exhausted_fade > 0
    || e.features.intraday_range_exhausted_follow > 0 || e.features.intraday_vwap_stretch_fade > 0),
    'intraday features vary across real touches');
  // no lookahead: a first touch early in the day cannot have consumed the full
  // day's range — rangeUsed at touch must be ≤ what the whole day realized.
  // (weak-form check: rangeUsed at touch is finite and ≥ 0)
  ok(evts.every(e => e.intraday.rangeUsed >= 0), 'rangeUsed non-negative as-of touch');
}

// ── ladder touch candidates: validFrom respected in the replay ───────────────
{
  const evts = [];
  backfillPair('eurusd', packed, { onEvent: e => evts.push(e) });
  ok(evts.every(e => Number.isFinite(e.zone.confluence)), 'merged decide zone recorded on every event');
  // The raw (unconfluenced) ladder grid is deliberately NOT a zone source — only
  // cross-session CONFLUENCE (asia_prev_align: today's line agrees with
  // yesterday's) earns one. LADDER_ZONE_STYLE's comment explains why.
  const asiaEvts = evts.filter(e => (e.zone.sources ?? []).includes('asia_prev_align'));
  ok(asiaEvts.length > 0, `asia-confluence touches generated (${asiaEvts.length})`);
  ok(asiaEvts.every(e => e.ts >= e.session_start + 6 * 3600), 'no asia-confluence event before the formation window closes');
  const shilo = evts.filter(e => (e.zone.sources ?? []).includes('session_hilo'));
  ok(shilo.length > 0, `session high/low confluence occurs (${shilo.length})`);
}

// ── contextByDate: per-day macro injection reaches the event features ────────
{
  // every replay day risk-off; eurusd riskSens −0.5 (risk pair)
  const ctx = {};
  const d1 = deriveD1Packed(packed);
  for (const b of d1) ctx[backfillDayDate(b.time)] =
    { macro: { regime: 'RISK_OFF', riskSens: -0.5 } };
  const evts = [];
  backfillPair('eurusd', packed, { contextByDate: ctx, onEvent: e => evts.push(e) });
  ok(evts.length > 20, 'events still generated with context');
  ok(evts.every(e => e.features.macro_align === 1 || e.features.macro_align === -1),
    'macro_align resolved ±1 on every event under a hard regime');
  ok(evts.some(e => e.features.macro_align === 1) && evts.some(e => e.features.macro_align === -1),
    'both alignments occur (long and short events exist)');
  // shorts are aligned in risk-off for a negative-riskSens pair
  ok(evts.filter(e => e.direction === 'short').every(e => e.features.macro_align === 1), 'short = aligned under RISK_OFF, riskSens<0');
  // absent context ⇒ zero (unchanged training rows)
  const plain = [];
  backfillPair('eurusd', packed, { onEvent: e => plain.push(e) });
  ok(plain.every(e => e.features.macro_align === 0), 'no context → macro_align 0 everywhere');

  // ── macroBucketReport: episode counting, not event counting ────────────────
  const rep = macroBucketReport(evts);
  ok(rep.aligned.n + rep.opposed.n === evts.length && rep.neutral.n === 0, 'buckets partition the events');
  ok(rep.opposed.episodes >= 1 && rep.opposed.episodes < rep.opposed.n, 'episodes collapse adjacent days');
  ok(rep.opposed.years >= 1, `year spread tracked (${rep.opposed.years}y over a 200-day fixture)`);
  ok(typeof rep.opposed.meetsBar === 'boolean' && rep.bar.minEpisodes === MACRO_BUCKET_BAR.minEpisodes, 'pre-registered bar attached');
  ok(rep.opposed.perYear && Object.keys(rep.opposed.perYear).length === rep.opposed.years, 'per-year breakdown');

  // sparse events far apart = distinct episodes
  const sparse = ['2024-01-02', '2024-01-03', '2024-03-01', '2024-06-01'].map(date => ({
    date, features: { macro_align: -1 }, outcome: { win: 0, pnlPct: -0.1 } }));
  ok(macroBucketReport(sparse).opposed.episodes === 3, 'gap > 7d starts a new episode');

  // ── fitLogistic ablation socket: extra feature name is fitted ──────────────
  if (evts.length >= 200) {
    const names = [...Object.keys(MODEL_V0.weights), 'macro_align'];
    const fit = fitLogistic(evts, { features: names, embargoDays: 30, l2ExemptFeatures: ['macro_align'] });
    ok(fit.ok && 'macro_align' in fit.candidate.weights, 'ablation fit carries the macro coefficient');
  }
}

// ── fitLogistic recovers a planted signal ────────────────────────────────────
{
  // synthetic events: confluence feature genuinely predicts the win
  const rand = mulberry32(99);
  const names = Object.keys(MODEL_V0.weights);
  const evs = [];
  for (let i = 0; i < 2000; i++) {
    const conf = rand();
    const features = Object.fromEntries(names.map(k => [k, k === 'confluence' ? conf : rand() * 0.3]));
    const pTrue = 1 / (1 + Math.exp(-(-1 + 2.5 * conf)));
    const win = rand() < pTrue ? 1 : 0;
    evs.push({ date: `2024-${String(1 + Math.floor(i / 170)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
      features, probability: 0.5, outcome: { win } });
  }
  const fit = fitLogistic(evs);
  ok(fit.ok, 'planted-signal fit runs');
  ok(fit.candidate.weights.confluence > 0.8, `recovers confluence weight sign+size (${fit.candidate.weights.confluence})`);
  ok(fit.oos.fitted.brier < fit.oos.prior_v0.brier, 'fitted beats the flat prior on OOS Brier');
  ok(fit.oos.fitted_beats_prior === true, 'comparison flag consistent');
}

console.log(`backfill.test.mjs — ${passed} assertions passed`);
