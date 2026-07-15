/**
 * Pooled VuManChu Fade — the trader's FULL method, validated honestly.
 *
 * The per-instrument VuManChu-confirmed fade showed consistent cross-sectional
 * lift (26/31 positive with WT+VWAP), but on thin samples with a crude exit.
 * This is the proper validation:
 *   • VuManChu read on the 1-MINUTE chart (WaveTrend + VWAP-osc turn), causal
 *   • confirmed fade at the median/75th, entered at the line
 *   • the trader's REAL exit: ~5-pip vol-scaled stop; once +trailR·R, trail toward
 *     the day-open target; close at end of day. Honest 1-min walk, SL-first.
 *   • every confirmed trade across ALL instruments POOLED into one equity curve —
 *     real trade count + real Sharpe, not 31 thin per-instrument reads
 *   • confirmed vs blind, OOS, with ×1/×2/×3 cost sensitivity
 *
 * Returns the OOS trade streams (gross %) so the caller pools across instruments
 * and applies cost. Reuses computeBands/volSigmaSeries + vumanchuCore + sessionsAt.
 */
import { computeBands, volSigmaSeries } from './forecastCore.js';
import { computeWaveTrend, computeVWAP } from './vumanchuCore.js';
import { summarizeTrades } from './metricsCore.js';
import { sessionsAt } from './fillRealismEngine.js';
import { pipSize } from './instrumentRegistry.js';
import { DEFAULT_COST_PCT } from './perLineStrategy.js';
import { harSigmaSeries } from './volEstimatorAB.js';

// Build the σ series that places the bands. 'platform' = the live forecaster
// (YZ/GARCH/HV per class). 'har' = HAR-RV on each session's realised vol — the
// horse race found HAR is far better-calibrated than GARCH/HV for indices & gold,
// so this tests whether better-placed bands lift the fade there. Both are causal:
// value for session i uses data < i. Same length as sess.
export function sigmaSeriesForSessions(sess, d1, assetClass, volSource = 'platform') { return _sigmaSeries(sess, d1, assetClass, volSource); }
function _sigmaSeries(sess, d1, assetClass, volSource) {
  if (volSource !== 'har') return volSigmaSeries(d1, assetClass);
  const sigRV = sess.map(s => {
    let v = 0; for (let k = 1; k < (s.bars?.length || 0); k++) {
      const x = Math.log(s.bars[k].close / s.bars[k - 1].close); if (isFinite(x)) v += x * x;
    }
    return Math.sqrt(v);
  });
  return harSigmaSeries(sigRV, { minTrain: 60 });
}

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const _median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (x, d = 3) => x == null || !isFinite(x) ? null : +x.toFixed(d);

// WaveTrend agreement with a fade at an upper (SELL) / lower (BUY) band — the
// same OB/OS/cross logic as vumanchuCore.waveTrendReading, read at a bar index.
function _wtAgree(v1, v2, isUpper, ob = 53, os = -53) {
  let sig;
  if (v1 <= os) sig = 'OVERSOLD'; else if (v1 >= ob) sig = 'OVERBOUGHT';
  else if (v1 > v2) sig = 'BULLISH'; else if (v1 < v2) sig = 'BEARISH'; else sig = 'NEUTRAL';
  return isUpper ? (sig === 'OVERBOUGHT' || sig === 'BEARISH') : (sig === 'OVERSOLD' || sig === 'BULLISH');
}

// The trader's exit, walked on 1-min bars from the touch: initial stop `stopDist`
// beyond entry; once profit ≥ trailR·R, trail the stop `trailDist` behind the best
// favorable price (aimed at the open target); TP at the open; else close at EOD.
// Conservative: stop checked before it's loosened (trail lags one bar), SL-first.
// Detailed walk — returns { gross, exitIdx, exitPrice, reason }. `_manageExit`
// projects .gross so the backtest is byte-for-byte unchanged; the viewer uses the
// full detail. ONE walk, so the two can never disagree.
function _manageExitDetail(bars, fromIdx, entry, isUpper, openPx, stopDist, trailR, trailDist) {
  let stopPx = isUpper ? entry + stopDist : entry - stopDist;
  const R = stopDist;
  let trailing = false, best = entry;
  const pct = px => (isUpper ? entry - px : px - entry) / openPx * 100;
  for (let k = fromIdx + 1; k < bars.length; k++) {
    const b = bars[k];
    const hitStop = isUpper ? b.high >= stopPx : b.low <= stopPx;
    const hitTgt = isUpper ? b.low <= openPx : b.high >= openPx;
    if (hitStop) return { gross: pct(stopPx), exitIdx: k, exitPrice: stopPx, reason: trailing ? 'trail-stop' : 'stop' };  // SL first
    if (hitTgt) return { gross: pct(openPx), exitIdx: k, exitPrice: openPx, reason: 'target' };
    // update favorable extreme + trail state for the NEXT bar
    if (isUpper ? b.low < best : b.high > best) best = isUpper ? b.low : b.high;
    const profit = isUpper ? entry - best : best - entry;
    if (!trailing && profit >= trailR * R) trailing = true;
    if (trailing) {
      const trailed = isUpper ? best + trailDist : best - trailDist;
      stopPx = isUpper ? Math.min(entry, trailed) : Math.max(entry, trailed);            // ratchet, never worse than BE
    }
  }
  const lastIdx = bars.length - 1, last = bars[lastIdx].close;                            // close before EOD
  return { gross: pct(last), exitIdx: lastIdx, exitPrice: last, reason: 'eod' };
}
function _manageExit(bars, fromIdx, entry, isUpper, openPx, stopDist, trailR, trailDist) {
  return _manageExitDetail(bars, fromIdx, entry, isUpper, openPx, stopDist, trailR, trailDist).gross;
}

// Per-session signal detection — the SINGLE source of truth for the confirmed
// fade, shared by the backtest (pooledFade) and the live forward tracker
// (forwardTrackEngine) so the two can NEVER silently drift. Given one session and
// its σ, returns a record per level touched: { line, up, entry, ti, gross,
// confirmed }. `gross` is the trader's-exit % (no cost); `confirmed` = WT (+VWAP)
// agreed with the fade at the touch bar. Pure — no split/OOS opinion here.
export function detectSessionSignals(s, sigma, opts = {}) {
  const {
    pair = 'EURUSD', assetClass = 'fx', minBars = 35, stopPips = 5, volK = 0.09,
    trailR = 2.0, requireVwap = true,
  } = opts;
  if (!(sigma > 0) || !s.bars || s.bars.length < minBars + 10 || !(s.open > 0)) return [];
  const pip = pipSize(pair);
  const bands = computeBands(s.open, sigma, assetClass);
  const { wt1, wt2 } = computeWaveTrend(s.bars);              // 1-min WaveTrend, causal at each idx
  const osc = requireVwap ? computeVWAP(s.bars).osc : null;
  const stopDist = Math.max(stopPips * pip, volK * sigma * s.open);
  const levels = [
    { level: bands.up50, up: true, name: 'up50' }, { level: bands.dn50, up: false, name: 'dn50' },
    { level: bands.up75, up: true, name: 'up75' }, { level: bands.dn75, up: false, name: 'dn75' },
  ];
  const out = [];
  for (const L of levels) {
    let ti = -1;
    for (let k = minBars; k < s.bars.length - 1; k++) {
      if (L.up ? s.bars[k].high >= L.level : s.bars[k].low <= L.level) { ti = k; break; }
    }
    if (ti < 0) continue;
    const gross = _manageExit(s.bars, ti, L.level, L.up, s.open, stopDist, trailR, stopDist);
    const confirmed = _wtAgree(wt1[ti] ?? 0, wt2[ti] ?? 0, L.up)
      && (!requireVwap || (L.up ? (osc[ti] ?? 0) < (osc[ti - 1] ?? 0) : (osc[ti] ?? 0) > (osc[ti - 1] ?? 0)));
    out.push({ line: L.name, up: L.up, entry: L.level, ti, gross: r3(gross, 5), confirmed });
  }
  return out;
}

// Full per-session inspection for the viewer — the SAME bands, WT/VWAP read and
// managed exit as detectSessionSignals/pooledFade, but returning every detail so a
// human can see whether the engine found the fades correctly. Returns the bands,
// the day-open target, and one row per level: touched?, when, at what price, the
// WT & VWAP reading there, whether it CONFIRMED (fade) or would FOLLOW, the entry,
// the exit (idx/price/reason) and the gross %. Never the last bar for a touch
// (matches the backtest's k < len-1). Pure — pass sigma in.
export function inspectSession(s, sigma, opts = {}) {
  const {
    pair = 'EURUSD', assetClass = 'fx', minBars = 35, stopPips = 5, volK = 0.09,
    trailR = 2.0, requireVwap = true,
  } = opts;
  if (!(sigma > 0) || !s.bars || s.bars.length < minBars + 10 || !(s.open > 0)) return { insufficient: true };
  const pip = pipSize(pair);
  const b = computeBands(s.open, sigma, assetClass);
  const { wt1, wt2 } = computeWaveTrend(s.bars);
  const osc = computeVWAP(s.bars).osc;
  const stopDist = Math.max(stopPips * pip, volK * sigma * s.open);
  const bands = {
    up75: b.up75, up50: b.up50, dn50: b.dn50, dn75: b.dn75,
    ocUp: b.ocUp, ocDn: b.ocDn, open: s.open,
  };
  const levels = [
    { name: 'up75', up: true, level: b.up75 }, { name: 'up50', up: true, level: b.up50 },
    { name: 'dn50', up: false, level: b.dn50 }, { name: 'dn75', up: false, level: b.dn75 },
  ];
  const rows = levels.map(L => {
    let ti = -1;
    for (let k = minBars; k < s.bars.length - 1; k++) {
      if (L.up ? s.bars[k].high >= L.level : s.bars[k].low <= L.level) { ti = k; break; }
    }
    if (ti < 0) return { line: L.name, up: L.up, level: r3(L.level, 6), touched: false };
    const v1 = wt1[ti] ?? 0, v2 = wt2[ti] ?? 0, oL = osc[ti] ?? 0, oP = osc[ti - 1] ?? oL;
    const vwapTurn = L.up ? oL < oP : oL > oP;
    const confirmed = _wtAgree(v1, v2, L.up) && (!requireVwap || vwapTurn);
    const ex = _manageExitDetail(s.bars, ti, L.level, L.up, s.open, stopDist, trailR, stopDist);
    return {
      line: L.name, up: L.up, level: r3(L.level, 6), touched: true,
      touchIdx: ti, touchTime: s.bars[ti].time, touchPrice: r3(s.bars[ti][L.up ? 'high' : 'low'], 6),
      wt1: r3(v1, 2), wt2: r3(v2, 2), wtAgree: _wtAgree(v1, v2, L.up), vwapOsc: r3(oL, 4), vwapTurn,
      confirmed, action: confirmed ? 'FADE' : 'skip',
      entry: r3(L.level, 6), dir: L.up ? 'sell' : 'buy',
      exitIdx: ex.exitIdx, exitTime: s.bars[ex.exitIdx].time, exitPrice: r3(ex.exitPrice, 6), exitReason: ex.reason,
      gross: r3(ex.gross, 4), net: r3(ex.gross - (opts.costPct ?? (DEFAULT_COST_PCT[assetClass] ?? 0.012)), 4),
    };
  });
  return { pair, assetClass, date: s.date, sigma: r3(sigma, 6), stopDist: r3(stopDist, 6), bands, rows };
}

export function pooledFade(bars1, opts = {}) {
  const {
    pair = 'EURUSD', assetClass = 'fx', isFrac = 0.5, boundaryHour = 22, warmup = 40,
    minBars = 35, stopPips = 5, volK = 0.09, trailR = 2.0, requireVwap = true,
  } = opts;
  const cost = opts.costPct ?? (DEFAULT_COST_PCT[assetClass] ?? 0.012);
  const volSource = opts.volSource || 'platform';       // 'platform' (default, unchanged) | 'har'
  const pip = pipSize(pair);
  const sess = sessionsAt(bars1, boundaryHour);
  if (sess.length < 160) return { insufficient: true, nSessions: sess.length };
  const d1 = sess.map(s => ({ open: s.open, high: s.high, low: s.low, close: s.close }));
  const sig = _sigmaSeries(sess, d1, assetClass, volSource);
  const split = Math.floor(sess.length * isFrac);
  const sigOpts = { pair, assetClass, minBars, stopPips, volK, trailR, requireVwap };

  const confirmedOOS = [], blindOOS = [];
  const isConf = [], isBlind = [];   // (unused beyond counts, kept for parity)
  for (let i = warmup; i < sess.length; i++) {
    const sigma = sig[i];
    if (!(sigma > 0)) continue;
    const s = sess[i];
    const seg = i < split ? 'is' : 'oos';
    for (const sg of detectSessionSignals(s, sigma, sigOpts)) {
      const rec = { date: s.date, gross: sg.gross };
      if (seg === 'oos') { blindOOS.push(rec); if (sg.confirmed) confirmedOOS.push(rec); }
      else { isBlind.push(1); if (sg.confirmed) isConf.push(1); }
    }
  }

  const net = (arr, mult) => arr.map(t => t.gross - cost * mult);
  const summ = arr => { const p = net(arr, 1); const s = summarizeTrades(p, arr.map(t => t.date)); return { n: arr.length, win: arr.length ? r3(p.filter(x => x > 0).length / p.length * 100, 1) : null, exp: r3(_mean(p), 4), sharpe: s.sharpe }; };
  return {
    pair, assetClass, cost, pip, stopPips, trailR, requireVwap, volSource,
    nSessions: sess.length, splitDate: sess[split]?.date,
    confirmedOOS, blindOOS,
    perInst: { confirmed: summ(confirmedOOS), blind: summ(blindOOS) },
  };
}

// Pool many instruments' OOS trade streams into ONE equity curve, per cost multiple.
// tradesByInst: { PAIR: { cost, trades:[{date,gross}] } }. Simple returns, no compounding.
export function poolPortfolio(tradesByInst, costMult = 1) {
  const all = [];
  for (const [, v] of Object.entries(tradesByInst)) for (const t of v.trades) all.push({ date: t.date, pnl: t.gross - v.cost * costMult });
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!all.length) return { n: 0 };
  const dates = all.map(t => t.date), pnls = all.map(t => t.pnl);
  const s = summarizeTrades(pnls, dates);
  // equity curve + per-year, and max DD
  let cum = 0, peak = 0, mdd = 0; const curve = [];
  const byYear = {};
  for (const t of all) { cum += t.pnl; if (cum > peak) peak = cum; if (cum - peak < mdd) mdd = cum - peak; curve.push({ date: t.date, cum: r3(cum, 3) }); (byYear[t.date.slice(0, 4)] ||= []).push(t.pnl); }
  const perYear = {};
  for (const [y, a] of Object.entries(byYear)) perYear[y] = { n: a.length, ret: r3(a.reduce((x, v) => x + v, 0), 2), exp: r3(_mean(a), 4) };
  return {
    n: all.length, sharpe: s.sharpe, win: r3(pnls.filter(x => x > 0).length / pnls.length * 100, 1),
    exp: r3(_mean(pnls), 4), totalReturn: r3(cum, 2), maxDD: r3(mdd, 2),
    posYears: Object.values(perYear).filter(y => y.ret > 0).length, totYears: Object.keys(perYear).length,
    curve, perYear,
  };
}
