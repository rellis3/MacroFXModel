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
function _manageExit(bars, fromIdx, entry, isUpper, openPx, stopDist, trailR, trailDist) {
  let stopPx = isUpper ? entry + stopDist : entry - stopDist;
  const R = stopDist;
  let trailing = false, best = entry;
  for (let k = fromIdx + 1; k < bars.length; k++) {
    const b = bars[k];
    const hitStop = isUpper ? b.high >= stopPx : b.low <= stopPx;
    const hitTgt = isUpper ? b.low <= openPx : b.high >= openPx;
    if (hitStop) return (isUpper ? entry - stopPx : stopPx - entry) / openPx * 100;      // SL first
    if (hitTgt) return (isUpper ? entry - openPx : openPx - entry) / openPx * 100;
    // update favorable extreme + trail state for the NEXT bar
    if (isUpper ? b.low < best : b.high > best) best = isUpper ? b.low : b.high;
    const profit = isUpper ? entry - best : best - entry;
    if (!trailing && profit >= trailR * R) trailing = true;
    if (trailing) {
      const trailed = isUpper ? best + trailDist : best - trailDist;
      stopPx = isUpper ? Math.min(entry, trailed) : Math.max(entry, trailed);            // ratchet, never worse than BE
    }
  }
  const last = bars.at(-1).close;                                                         // close before EOD
  return (isUpper ? entry - last : last - entry) / openPx * 100;
}

export function pooledFade(bars1, opts = {}) {
  const {
    pair = 'EURUSD', assetClass = 'fx', isFrac = 0.5, boundaryHour = 22, warmup = 40,
    minBars = 35, stopPips = 5, volK = 0.09, trailR = 2.0, requireVwap = true,
  } = opts;
  const cost = opts.costPct ?? (DEFAULT_COST_PCT[assetClass] ?? 0.012);
  const pip = pipSize(pair);
  const sess = sessionsAt(bars1, boundaryHour);
  if (sess.length < 160) return { insufficient: true, nSessions: sess.length };
  const d1 = sess.map(s => ({ open: s.open, high: s.high, low: s.low, close: s.close }));
  const sig = volSigmaSeries(d1, assetClass);
  const split = Math.floor(sess.length * isFrac);

  const confirmedOOS = [], blindOOS = [];
  const isConf = [], isBlind = [];   // (unused beyond counts, kept for parity)
  for (let i = warmup; i < sess.length; i++) {
    const sigma = sig[i];
    if (!(sigma > 0)) continue;
    const s = sess[i];
    if (!s.bars || s.bars.length < minBars + 10 || !(s.open > 0)) continue;
    const bands = computeBands(s.open, sigma, assetClass);
    const { wt1, wt2 } = computeWaveTrend(s.bars);            // 1-min WaveTrend, causal at each idx
    const osc = requireVwap ? computeVWAP(s.bars).osc : null;
    const seg = i < split ? 'is' : 'oos';
    const stopDist = Math.max(stopPips * pip, volK * sigma * s.open);
    const levels = [
      { level: bands.up50, up: true }, { level: bands.dn50, up: false },
      { level: bands.up75, up: true }, { level: bands.dn75, up: false },
    ];
    for (const L of levels) {
      let ti = -1;
      for (let k = minBars; k < s.bars.length - 1; k++) {
        if (L.up ? s.bars[k].high >= L.level : s.bars[k].low <= L.level) { ti = k; break; }
      }
      if (ti < 0) continue;
      const gross = _manageExit(s.bars, ti, L.level, L.up, s.open, stopDist, trailR, stopDist);
      const confirmed = _wtAgree(wt1[ti] ?? 0, wt2[ti] ?? 0, L.up)
        && (!requireVwap || (L.up ? (osc[ti] ?? 0) < (osc[ti - 1] ?? 0) : (osc[ti] ?? 0) > (osc[ti - 1] ?? 0)));
      const rec = { date: s.date, gross: r3(gross, 5) };
      if (seg === 'oos') { blindOOS.push(rec); if (confirmed) confirmedOOS.push(rec); }
      else { isBlind.push(1); if (confirmed) isConf.push(1); }
    }
  }

  const net = (arr, mult) => arr.map(t => t.gross - cost * mult);
  const summ = arr => { const p = net(arr, 1); const s = summarizeTrades(p, arr.map(t => t.date)); return { n: arr.length, win: arr.length ? r3(p.filter(x => x > 0).length / p.length * 100, 1) : null, exp: r3(_mean(p), 4), sharpe: s.sharpe }; };
  return {
    pair, assetClass, cost, pip, stopPips, trailR, requireVwap,
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
