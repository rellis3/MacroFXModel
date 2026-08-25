/**
 * VWAP Fixed-Sigma Band Atlas — per-touch REFERENCE engine for integer σ bands
 * (±1σ…±7σ) around the session VWAP, where 1σ is FIXED at session open.
 *
 * ── THE UNIT (one row =) ─────────────────────────────────────────────────────
 * One fresh touch (previous close inside → this bar's extreme reaches the band)
 * of one integer σ band of the session-anchored VWAP, where 1σ was frozen at
 * session open as the median of the prior `historySessions` sessions' RMS
 * deviation from their own running VWAP; the outcome is whether price then
 * reaches the NEXT band out or falls BACK to the previous band in (a symmetric
 * 1σ race on moving barriers), recorded alongside MFE/MAE toward/against VWAP
 * over a fixed forward window.
 *
 * ── WHAT THIS IS, AND ISN'T ─────────────────────────────────────────────────
 * A QUANT REFERENCE BOOK (REFERENCE_ENGINE_PLAYBOOK.md), not a signal search:
 * no after-cost gate, no tradeability filter. NOTE the prior art it must not be
 * confused with: `js/vwapReversionEngine.js` + VWAP_REVERSION_FINDINGS.md
 * tested TRADING the ±2σ band built from the session's OWN developing
 * volume-weighted σ (bands widen as the day gets wild) — null, 0/26 pairs.
 * This engine asks a different, descriptive question with a different σ:
 * the band unit is HISTORICAL (yesterday's sessions' RMS), so today's
 * volatility does NOT widen today's bands — a 3σ tag here means "3× a NORMAL
 * session's stretch", not "3× today's stretch". VWAP itself still moves.
 *
 * ── COMPOSES, COPIES NOTHING ────────────────────────────────────────────────
 *   `computeSessionVwap` (vwapReversionEngine) — THE session tick-VWAP formula
 *   `createHtfContext`/`createConfluenceFeatures` (confluenceFeatures) —
 *       WaveTrend M1 + MTF stack, 1h ADX, 4h EMA trend, approach speed/ER,
 *       volume climax, candle reject, round number — the same causal feature
 *       pack Level Atlas was built on
 *   `pipSize` (instrumentRegistry)
 *
 * ── NO-LOOKAHEAD CONTRACT ───────────────────────────────────────────────────
 *   • fixedSigma for session i = median over sessions i-N…i-1 ONLY (a session's
 *     own RMS is pushed to history strictly AFTER that session's walk).
 *   • Every band level a bar is tested against uses the VWAP as of the PRIOR
 *     bar's close (lag-one) — the Pine `barstate.isconfirmed` convention.
 *   • A fresh touch additionally requires the PREVIOUS close inside the band
 *     as it stood one bar earlier still (lag-two), mirroring the reference
 *     Pine study's `close[1] < level[2] and high >= level[1]`.
 *   • volRegime / prevSessionVol / gap read prior sessions only.
 *   • Feature-pack reads are causal by construction (confluenceFeatures.js).
 *   • MFE/MAE begins on the bar AFTER the touch bar (touch bar excluded from
 *     its own excursion, as in the reference Pine study).
 *   Tested by perturb-the-future in vwapFixedSigmaEngine.test.mjs — rows dated
 *   before a future-only perturbation must be byte-identical.
 *
 * ── KNOWN, DELIBERATE DEFINITIONS (pinned, not hidden) ──────────────────────
 *   • Session = UTC calendar day (Pine `timeframe.change("D")` on a UTC chart).
 *   • σ unit passed to the feature pack is fixedSigma/open — SMALLER than the
 *     daily forecast σ those buckets were calibrated on, so approachVel skews
 *     "fast" here; the buckets are still internally consistent and the OOS
 *     gate, not the labels, decides what holds.
 *   • `vwapSide`/`confluence` from the pack are dropped: the level IS a VWAP
 *     band (tautological) and structural confluence is out of scope here.
 *   • Race tie inside one M1 bar (both barriers hit): 'out' wins — same
 *     convention as levelAtlasEngine's forward scan; at 1σ spacing on M1 this
 *     is vanishingly rare on gold.
 *
 * Pure: no network, no clock, no randomness. Input = packed M1
 * { n, times, opens, highs, lows, closes, volumes }.
 */

import { computeSessionVwap } from './vwapReversionEngine.js';
import { createHtfContext, createConfluenceFeatures } from './confluenceFeatures.js';
import { pipSize } from './instrumentRegistry.js';

const DAY = 86400;

export const BANDS = [1, 2, 3, 4, 5, 6, 7];
export const SIDES = ['up', 'dn'];

// Same 3-way session labels the rest of the repo uses (levelAtlasEngine).
function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}
const isoDay = e => new Date(e * 1000).toISOString().slice(0, 10);
const dowOf = e => new Date(e * 1000).getUTCDay();

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── Shared day-grouping: packed M1 → UTC-day sessions with volume ───────────
// (barUtils.extractBars deliberately drops volume; the VWAP needs it.)
// Exported so downstream engines (vwapImpulseEntryV1Engine) group days the
// EXACT same way — a drifted day boundary would silently desync their bands.
export function groupUtcDays(packed, minBarsPerDay = DEFAULT_CFG?.minBarsPerDay ?? 200) {
  const { n, times, opens, highs, lows, closes, volumes } = packed;
  const days = [];
  let cur = null;
  for (let i = 0; i < n; i++) {
    const dStart = times[i] - (times[i] % DAY);
    if (!cur || cur.dayStart !== dStart) { cur = { dayStart: dStart, bars: [] }; days.push(cur); }
    cur.bars.push({ time: times[i], open: opens[i], high: highs[i], low: lows[i],
                    close: closes[i], volume: volumes ? volumes[i] : 1 });
  }
  return days.filter(d => d.bars.length >= minBarsPerDay);
}

/**
 * The fixed σ each session would trade with, per date — THE band unit, exported
 * so any trade-level engine uses the identical number the atlas recorded (an
 * equivalence test in vwapFixedSigmaEngine.test.mjs pins them together).
 *
 *   computeFixedSigmaByDate(packed, cfg?) -> Map('YYYY-MM-DD' -> fixedSigma)
 *
 * Same no-lookahead contract as the walk: a session's own RMS is banked
 * strictly AFTER that session; dates without enough history are absent.
 */
export function computeFixedSigmaByDate(packed, opts = {}) {
  const cfg = { ...DEFAULT_CFG, ...opts };
  const out = new Map();
  const rmsAll = [];
  for (const { bars } of groupUtcDays(packed, cfg.minBarsPerDay)) {
    const date = isoDay(bars[0].time);
    const { vwap } = computeSessionVwap(bars);
    if (rmsAll.length >= cfg.minHistory) {
      const histWin = rmsAll.slice(-cfg.historySessions);
      const fs = cfg.useMedian ? median(histWin) : histWin.reduce((s, v) => s + v, 0) / histWin.length;
      if (fs != null && fs > 0) out.set(date, fs);
    }
    const rms = sessionRmsFromVwap(bars, vwap);
    if (rms != null && rms > 0) rmsAll.push(rms);
  }
  return out;
}

// One session's RMS deviation of hlc3 from its own RUNNING VWAP — the exact
// per-session statistic the reference Pine study banks
// (sqrt(mean((src - sessionVWAP)^2)), src read against the developing VWAP).
export function sessionRmsFromVwap(bars, vwap) {
  let sumSq = 0, n = 0;
  for (let k = 0; k < bars.length; k++) {
    const tp = (bars[k].high + bars[k].low + bars[k].close) / 3;
    const d = tp - vwap[k];
    sumSq += d * d; n++;
  }
  return n > 1 ? Math.sqrt(sumSq / n) : null;
}

export const DEFAULT_CFG = {
  historySessions: 20,   // sessions in the fixed-σ median (the Pine default)
  useMedian: true,       // median (robust) vs mean of the historical RMS list
  minHistory: 10,        // don't emit touches until this many prior RMS values exist
  regimeLookback: 60,    // longer trailing window for the volRegime read
  measureBars: 60,       // MFE/MAE forward window in M1 bars (= 60 min; the
                         // reference study's 20 bars on a 3-min chart)
  bands: BANDS,
  minBarsPerDay: 200,    // skip thin/holiday sessions entirely (touches AND rms)
};

/**
 * Walk one instrument's packed M1 and emit one record per fresh band touch.
 *
 *   fixedSigmaWalk(packed, { instrument, assetClass, ...DEFAULT_CFG overrides })
 *     -> { touches: [...], coverage: { from, to, daysWalked, daysSkippedWarmup } }
 */
export function fixedSigmaWalk(packed, opts = {}) {
  const cfg = { ...DEFAULT_CFG, ...opts };
  const { instrument = 'GOLD', assetClass = 'commodity' } = cfg;
  const sym = String(instrument).toUpperCase();
  let pip = 1; try { pip = pipSize(instrument) || 1; } catch { /* raw price units */ }

  // Shared UTC-day grouping (bars carry volume — the VWAP needs it).
  const full = groupUtcDays(packed, cfg.minBarsPerDay);

  // Feature pack: HTF context once over the FULL packed history (a 4h
  // WaveTrend needs weeks of warm-up), per-day M1 WaveTrend below.
  const htf = createHtfContext(packed, cfg.htfCfg ?? {});
  const tf = createConfluenceFeatures({ htf });

  const rmsAll = [];        // every completed session's RMS, in walk order
  const touches = [];
  let prevDayClose = null;
  let daysWalked = 0, daysSkippedWarmup = 0;
  let firstDate = null, lastDate = null;

  for (let di = 0; di < full.length; di++) {
    const { bars } = full[di];
    const date = isoDay(bars[0].time);
    const open = bars[0].open;
    const { vwap } = computeSessionVwap(bars);

    // Fixed σ for TODAY: strictly-prior sessions' RMS only.
    const histWin = rmsAll.slice(-cfg.historySessions);
    const fs = rmsAll.length >= cfg.minHistory
      ? (cfg.useMedian ? median(histWin) : histWin.reduce((s, v) => s + v, 0) / histWin.length)
      : null;

    if (fs != null && fs > 0) {
      daysWalked++;
      if (!firstDate) firstDate = date;
      lastDate = date;

      // Day-level context (all causal — prior sessions only).
      const regimeHist = rmsAll.slice(-cfg.regimeLookback);
      const regMed = regimeHist.length >= 20 ? median(regimeHist) : null;
      const volRegime = regMed > 0
        ? (fs / regMed < 0.85 ? '1·quiet' : fs / regMed > 1.25 ? '3·heavy' : '2·normal') : null;
      const prevRms = rmsAll[rmsAll.length - 1];
      const prevSessionVol = prevRms > 0
        ? (prevRms / fs < 0.8 ? '1·calm-prev' : prevRms / fs > 1.3 ? '3·wild-prev' : '2·normal-prev') : null;
      const gapSig = (prevDayClose != null && fs > 0) ? (open - prevDayClose) / fs : null;
      const gapBucket = gapSig == null ? null
        : Math.abs(gapSig) < 0.25 ? 'flat' : gapSig > 0 ? 'gap-up' : 'gap-down';
      const dow = dowOf(bars[0].time);
      const sigmaFrac = fs / open;   // σ unit for the feature pack (see header)

      const wt1 = tf.wtSeries(bars);

      // Per-(side,band) day state. maxBand/first-touch maps reflect bars
      // strictly BEFORE the bar being processed (merged at end of each bar).
      const ordinals = { up: new Array(8).fill(0), dn: new Array(8).fill(0) };
      const maxBand = { up: 0, dn: 0 };
      let runHi = bars[0].high, runLo = bars[0].low;

      for (let j = 2; j < bars.length; j++) {
        if (bars[j].high > runHi) runHi = bars[j].high;
        if (bars[j].low < runLo) runLo = bars[j].low;
        const newTouches = [];

        for (const side of SIDES) {
          const isUp = side === 'up';
          const sgn = isUp ? 1 : -1;
          for (const k of cfg.bands) {
            const L1 = vwap[j - 1] + sgn * k * fs;   // level as of prior close
            const L2 = vwap[j - 2] + sgn * k * fs;   // level as it stood one bar earlier
            const fresh = isUp
              ? (bars[j - 1].close < L2 && bars[j].high >= L1)
              : (bars[j - 1].close > L2 && bars[j].low <= L1);
            if (!fresh) continue;

            ordinals[side][k]++;
            const ordinal = ordinals[side][k];
            const entry = L1;

            // ── Outcome: symmetric 1σ race on MOVING barriers + fair-value/
            // re-entry tracking, one forward pass to session end. ────────────
            let outcome = 'neither', resolveTime = null;
            let vwapTime = null, reentryTime = null;
            let mfe = 0, mae = 0, windowClose = null, windowBars = 0;
            const winEnd = j + cfg.measureBars;
            for (let m = j; m < bars.length; m++) {
              const vRef = vwap[m - 1];
              const outer = vRef + sgn * (k + 1) * fs;
              const inner = vRef + sgn * (k - 1) * fs;
              const fwd = isUp ? bars[m].high : bars[m].low;
              const bwd = isUp ? bars[m].low : bars[m].high;
              if (outcome === 'neither') {
                if (isUp ? fwd >= outer : fwd <= outer) { outcome = 'out'; resolveTime = bars[m].time; }
                else if (isUp ? bwd <= inner : bwd >= inner) { outcome = 'back'; resolveTime = bars[m].time; }
              }
              if (vwapTime == null && (isUp ? bars[m].low <= vRef : bars[m].high >= vRef)) vwapTime = bars[m].time;
              if (reentryTime == null && m > j
                  && (isUp ? bars[m].close < vRef + sgn * k * fs : bars[m].close > vRef + sgn * k * fs)) {
                reentryTime = bars[m].time;
              }
              if (m > j && m <= winEnd) {   // MFE/MAE window: bar AFTER touch onward
                const fav = isUp ? (entry - bars[m].low) : (bars[m].high - entry);
                const adv = isUp ? (bars[m].high - entry) : (entry - bars[m].low);
                if (fav > mfe) mfe = fav;
                if (adv > mae) mae = adv;
                windowClose = bars[m].close; windowBars = m - j;
              }
              if (outcome !== 'neither' && vwapTime != null && reentryTime != null && m > winEnd) break;
            }

            // Context at the touch (feature pack + day/bar-local reads).
            const feats = tf.compute({ bars, touchIdx: j, open, sigma: sigmaFrac,
                                       side, wt1, level: entry, pip, confLevels: null });
            const t = bars[j].time;
            const hourUtc = new Date(t * 1000).getUTCHours();
            const minsIntoSession = (t - bars[0].time) / 60;
            const sessionFrac = minsIntoSession / 1440;
            const totalTravel = runHi - runLo;
            const dirTravel = isUp ? (runHi - open) : (open - runLo);
            const churnRatio = totalTravel > 0 ? Math.min(1, Math.max(0, dirTravel / totalTravel)) : null;
            const driftSig = (vwap[j - 1] - open) / fs * sgn;   // + = VWAP drifted toward the touch side
            const otherMax = maxBand[isUp ? 'dn' : 'up'];
            const sameMax = maxBand[side];
            const ladderStep = k - sameMax;

            touches.push({
              instrument: sym, assetClass, date, side, band: k, ordinal,
              hourUtc, session: sessionOf(hourUtc), dow, dowSession: `${dow}|${sessionOf(hourUtc)}`,
              minsIntoSession: +minsIntoSession.toFixed(0),
              sessionPos: sessionFrac < 0.33 ? '1·early' : sessionFrac < 0.67 ? '2·mid' : '3·late',
              overlapWindow: hourUtc >= 12 && hourUtc < 16,
              level: +entry.toFixed(6), vwapAtTouch: +vwap[j - 1].toFixed(6),
              fixedSigma: +fs.toFixed(6), sigmaPct: +(sigmaFrac * 100).toFixed(4),
              volRegime, prevSessionVol, gapBucket,
              gapSig: gapSig != null ? +gapSig.toFixed(3) : null,
              vwapDrift: Math.abs(driftSig) < 0.5 ? '2·flat' : driftSig > 0 ? '3·with' : '1·against',
              vwapDriftSig: +driftSig.toFixed(3),
              churn: churnRatio == null ? null
                : churnRatio >= 0.80 ? '3·driven' : churnRatio >= 0.55 ? '2·mixed' : '1·churned',
              churnRatio: churnRatio != null ? +churnRatio.toFixed(3) : null,
              otherSideMaxBand: otherMax === 0 ? '0·none' : otherMax >= 3 ? '3+·deep' : String(otherMax),
              ladderStep: ladderStep <= 0 ? '1·retest' : ladderStep === 1 ? '2·step' : '3·jump',
              approachVel: feats.approachVel?.bucket ?? null,
              approachER: feats.approachER?.bucket ?? null,
              wtState: feats.wtState?.bucket ?? null,
              wtMtf: feats.wtMtf?.bucket ?? null,
              wtSlow: feats.wtSlow?.bucket ?? null,
              momAdx: feats.momAdx?.bucket ?? null,
              htfTrend: feats.htfTrend?.bucket ?? null,
              volClimax: feats.volClimax?.bucket ?? null,
              candleReject: feats.candleReject?.bucket ?? null,
              roundNum: feats.roundNum?.bucket ?? null,
              outcome,
              minsToResolve: resolveTime != null ? +((resolveTime - t) / 60).toFixed(0) : null,
              reachedVwap: vwapTime != null,
              minsToVwap: vwapTime != null ? +((vwapTime - t) / 60).toFixed(0) : null,
              reentered: reentryTime != null,
              minsToReentry: reentryTime != null ? +((reentryTime - t) / 60).toFixed(0) : null,
              // MFE/MAE oriented to the fade (upper touch = hypothetical short
              // toward VWAP; lower = long) — σ units are the honest scale here.
              mfeSigma: +(mfe / fs).toFixed(3), maeSigma: +(mae / fs).toFixed(3),
              mfePrice: +mfe.toFixed(5), maePrice: +mae.toFixed(5),
              windowDriftSigma: windowClose != null ? +(((entry - windowClose) * sgn) / fs).toFixed(3) : null,
              windowBars,
            });
            newTouches.push({ side, k, time: t });
          }
        }
        for (const nt of newTouches) if (nt.k > maxBand[nt.side]) maxBand[nt.side] = nt.k;
      }
    } else {
      daysSkippedWarmup++;
    }

    // Bank THIS session's RMS strictly after its walk — never before.
    const rms = sessionRmsFromVwap(bars, vwap);
    if (rms != null && rms > 0) rmsAll.push(rms);
    prevDayClose = bars[bars.length - 1].close;
  }

  return {
    touches,
    coverage: { instrument: sym, from: firstDate, to: lastDate,
                daysWalked, daysSkippedWarmup, sessionsTotal: full.length },
  };
}
