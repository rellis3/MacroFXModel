/**
 * Forecast-Style Fade — which FORECASTER's lines fade best, at which LINE TYPE,
 * fade vs follow. The VuManChu-confirmed trade (which showed real cross-sectional
 * lift) run against bands from many forecasters, side by side.
 *
 * FORECASTERS (each turns σ + constants into the median/75th lines):
 *   • platform  — the current forecaster: Feller constants × per-asset σ (YZ/GARCH/HV)
 *   • cog       — COG's reverse-engineered calc: tighter constants × his HV σ
 *   • yz / garch / hist — Feller constants × a swapped σ estimator (isolates σ)
 *   • har       — Feller × HAR-RV σ (the upgrade)
 * LINE TYPES (all four, incl. the open-close family the earlier tests missed):
 *   • hl50/hl75 — projected HIGH/LOW median & 75th (the range bands)
 *   • oc50/oc75 — projected CLOSE median & 75th (the tighter inner bands)
 * ACTION at each touch (WaveTrend+VWAP read causally on the session's own bars):
 *   • WT turning at the line → FADE (target = day open)
 *   • WT continuing         → FOLLOW to the NEXT line out (continuation)
 *   • neither → skip
 * Exit = the trader's: ~5-pip vol-scaled stop, trail from trailR·R toward target,
 * close EOD. Honest walk, SL-first, OOS, costed. Returns the basis×line matrix.
 *
 * Reuses computeBands/volSigmaSeries (forecastCore), yzVolSeries/garchSigmas
 * (volBacktestEngine), harSigmaSeries (volEstimatorAB), COG_CONST, vumanchuCore,
 * sessionsAt. No new vol math.
 */
import { computeBands, volSigmaSeries } from './forecastCore.js';
import { yzVolSeries, garchSigmas } from './volBacktestEngine.js';
import { harSigmaSeries } from './volEstimatorAB.js';
import { COG_CONST } from './cogReverseEngineer.js';
import { computeWaveTrend, computeVWAP } from './vumanchuCore.js';
import { sessionsAt } from './fillRealismEngine.js';
import { pipSize } from './instrumentRegistry.js';
import { DEFAULT_COST_PCT } from './perLineStrategy.js';

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const r3 = (x, d = 3) => x == null || !isFinite(x) ? null : +x.toFixed(d);
const FELLER = { hl50: 1.572, hl75: 2.049, oc50: 0.6745, oc75: 1.1503 };
const COG_C = { hl50: COG_CONST.BM_P50, hl75: COG_CONST.BM_P75, oc50: COG_CONST.HN_P50, oc75: COG_CONST.HN_P75 };
const BASES = ['platform', 'cog', 'yz', 'garch', 'hist', 'har'];
const LINES = ['hl50', 'hl75', 'oc50', 'oc75'];

// WaveTrend fade-agreement (overbought/turning-down at an upper band; oversold/
// turning-up at a lower). follow-agreement is the mirror (_wtAgree(!isUpper)).
function _wtAgree(v1, v2, isUpper, ob = 53, os = -53) {
  let s; if (v1 <= os) s = 'OVERSOLD'; else if (v1 >= ob) s = 'OVERBOUGHT'; else if (v1 > v2) s = 'BULLISH'; else if (v1 < v2) s = 'BEARISH'; else s = 'NEUTRAL';
  return isUpper ? (s === 'OVERBOUGHT' || s === 'BEARISH') : (s === 'OVERSOLD' || s === 'BULLISH');
}

// The trader's managed exit walked on the session bars from the touch. isBuy = the
// trade direction; target = the level we aim for; stopDist beyond entry; once
// profit ≥ trailR·R, trail `stopDist` behind the best price. % of open, no cost.
function _exit(bars, fromIdx, entry, isBuy, target, openPx, stopDist, trailR) {
  let stopPx = isBuy ? entry - stopDist : entry + stopDist;
  const R = stopDist; let trailing = false, best = entry;
  for (let k = fromIdx + 1; k < bars.length; k++) {
    const b = bars[k];
    const hitStop = isBuy ? b.low <= stopPx : b.high >= stopPx;
    const hitTgt = isBuy ? b.high >= target : b.low <= target;
    if (hitStop) return (isBuy ? stopPx - entry : entry - stopPx) / openPx * 100;   // SL first
    if (hitTgt) return (isBuy ? target - entry : entry - target) / openPx * 100;
    if (isBuy ? b.high > best : b.low < best) best = isBuy ? b.high : b.low;
    const profit = isBuy ? best - entry : entry - best;
    if (!trailing && profit >= trailR * R) trailing = true;
    if (trailing) { const t = isBuy ? best - stopDist : best + stopDist; stopPx = isBuy ? Math.max(entry, t) : Math.min(entry, t); }
  }
  const last = bars.at(-1).close;
  return (isBuy ? last - entry : entry - last) / openPx * 100;
}

// rolling stdev of the last `w` log returns strictly before index i (causal).
function _rollStd(lr, i, w) {
  if (i - 1 < w) return 0;
  let m = 0; for (let k = i - w; k < i; k++) m += lr[k]; m /= w;
  let v = 0; for (let k = i - w; k < i; k++) v += (lr[k] - m) ** 2; return Math.sqrt(v / w);
}

export function forecastStyleFade(intraday, opts = {}) {
  const {
    pair = 'EURUSD', assetClass = 'fx', isFrac = 0.5, boundaryHour = 22, warmup = 40,
    minBars = 30, stopPips = 5, volK = 0.09, trailR = 2.0, histWin = 20,
  } = opts;
  const cost = opts.costPct ?? (DEFAULT_COST_PCT[assetClass] ?? 0.012);
  const pip = pipSize(pair);
  const sess = sessionsAt(intraday, boundaryHour);
  if (sess.length < 160) return { insufficient: true, nSessions: sess.length };
  const d1 = sess.map(s => ({ open: s.open, high: s.high, low: s.low, close: s.close }));
  const n = d1.length;
  const closes = d1.map(d => d.close);
  const lr = []; for (let i = 1; i < n; i++) lr.push(Math.log(closes[i] / closes[i - 1]));
  // σ series (all causal — value for session i uses data < i)
  const platformS = volSigmaSeries(d1, assetClass);
  const yzRaw = yzVolSeries(d1, 30), garchRaw = garchSigmas(d1, 4.76e-6);
  // per-session realized σ for HAR
  const sigRV = sess.map(s => { let v = 0; for (let k = 1; k < s.bars.length; k++) { const x = Math.log(s.bars[k].close / s.bars[k - 1].close); if (isFinite(x)) v += x * x; } return Math.sqrt(v); });
  const harRaw = harSigmaSeries(sigRV, { minTrain: 60 });
  const sigmaFor = (basis, i) => {
    switch (basis) {
      case 'platform': return platformS[i] || 0;
      case 'yz': return yzRaw[i - 1] || 0;
      case 'garch': return garchRaw[i - 1] || 0;
      case 'har': return harRaw[i] || 0;
      default: return _rollStd(lr, i - 1, histWin);   // 'hist' and 'cog' both use rolling HV (lr is offset by 1)
    }
  };
  const bandsFor = (basis, open, sig) => {
    if (basis === 'cog') return { up50: open * (1 + COG_C.hl50 * sig), dn50: open * (1 - COG_C.hl50 * sig), up75: open * (1 + COG_C.hl75 * sig), dn75: open * (1 - COG_C.hl75 * sig), ocU50: open * (1 + COG_C.oc50 * sig), ocD50: open * (1 - COG_C.oc50 * sig), ocU75: open * (1 + COG_C.oc75 * sig), ocD75: open * (1 - COG_C.oc75 * sig) };
    const b = computeBands(open, sig, assetClass);
    return { up50: b.up50, dn50: b.dn50, up75: b.up75, dn75: b.dn75, ocU50: b.ocUp, ocD50: b.ocDn, ocU75: open * (1 + b.oc75), ocD75: open * (1 - b.oc75) };
  };
  // level pairs + the "next line out" for a follow, per line type
  const lineDef = (B) => ({
    hl50: { up: B.up50, dn: B.dn50, nextUp: B.up75, nextDn: B.dn75 },
    hl75: { up: B.up75, dn: B.dn75, nextUp: B.up75 + (B.up75 - B.up50), nextDn: B.dn75 - (B.dn50 - B.dn75) },
    oc50: { up: B.ocU50, dn: B.ocD50, nextUp: B.ocU75, nextDn: B.ocD75 },
    oc75: { up: B.ocU75, dn: B.ocD75, nextUp: B.ocU75 + (B.ocU75 - B.ocU50), nextDn: B.ocD75 - (B.ocD50 - B.ocD75) },
  });

  const blank = () => ({ fade: [], follow: [] });
  const acc = {}; for (const b of BASES) { acc[b] = {}; for (const L of LINES) acc[b][L] = blank(); }
  const split = Math.floor(n * isFrac);

  for (let i = warmup; i < n; i++) {
    const s = sess[i];
    if (!s.bars || s.bars.length < minBars + 10 || !(s.open > 0)) continue;
    if (i < split) continue;                       // OOS only (matrix is a comparison, not a fit)
    const { wt1, wt2 } = computeWaveTrend(s.bars);
    const osc = computeVWAP(s.bars).osc;
    for (const basis of BASES) {
      const sig = sigmaFor(basis, i);
      if (!(sig > 0)) continue;
      const B = bandsFor(basis, s.open, sig);
      const stopDist = Math.max(stopPips * pip, volK * sig * s.open);
      const def = lineDef(B);
      for (const L of LINES) {
        const d = def[L];
        for (const side of ['up', 'dn']) {
          const isUpper = side === 'up';
          const level = isUpper ? d.up : d.dn;
          if (!(level > 0)) continue;
          let ti = -1;
          for (let k = minBars; k < s.bars.length - 1; k++) { if (isUpper ? s.bars[k].high >= level : s.bars[k].low <= level) { ti = k; break; } }
          if (ti < 0) continue;
          const v1 = wt1[ti] ?? 0, v2 = wt2[ti] ?? 0, oL = osc[ti] ?? 0, oP = osc[ti - 1] ?? oL;
          const fadeOK = _wtAgree(v1, v2, isUpper) && (isUpper ? oL < oP : oL > oP);
          const followOK = _wtAgree(v1, v2, !isUpper) && (isUpper ? oL > oP : oL < oP);
          if (fadeOK) {
            const g = _exit(s.bars, ti, level, !isUpper /*fade is opposite*/, s.open, s.open, stopDist, trailR);
            acc[basis][L].fade.push(g - cost);
          } else if (followOK) {
            const target = isUpper ? d.nextUp : d.nextDn;
            const g = _exit(s.bars, ti, level, isUpper /*follow continues*/, target, s.open, stopDist, trailR);
            acc[basis][L].follow.push(g - cost);
          }
        }
      }
    }
  }

  const cell = arr => ({ n: arr.length, exp: r3(_mean(arr), 4), win: arr.length ? r3(arr.filter(x => x > 0).length / arr.length * 100, 1) : null });
  const matrix = {};
  for (const b of BASES) { matrix[b] = {}; for (const L of LINES) matrix[b][L] = { fade: cell(acc[b][L].fade), follow: cell(acc[b][L].follow) }; }
  // best (basis, line, action) by fade expectancy with ≥30 trades
  let best = null;
  for (const b of BASES) for (const L of LINES) for (const act of ['fade', 'follow']) { const c = matrix[b][L][act]; if (c.n >= 30 && (best == null || c.exp > best.exp)) best = { basis: b, line: L, action: act, ...c }; }
  return { pair, assetClass, cost, isFrac, stopPips, trailR, nSessions: n, bases: BASES, lines: LINES, matrix, best };
}
