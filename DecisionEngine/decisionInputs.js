// decisionInputs.js — reads from S.* and normalises to DecisionInputs shape.
// Called once per render cycle in render.js; result passed to decisionUI.js.

import { S } from '../js/state.js';
import { computeRegimeConfidence } from '../js/regime-confidence.js';
import { computeRegimeTransition } from '../js/arma.js';
import { computeArimaContext } from '../js/arima-price.js';
import { filterTradingDays } from '../js/utils.js';

// ── Session phase ──────────────────────────────────────────────────────────────

function deriveSessionPhase() {
  const nowLondon = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const lHour = nowLondon.getHours() + nowLondon.getMinutes() / 60;
  // Full active window 08:00–21:00 (13h). Split into thirds.
  const elapsed = Math.max(0, lHour - 8) / 13;
  if (elapsed < 0.33) return 'EARLY';
  if (elapsed < 0.66) return 'MID';
  return 'LATE';
}

// ── Regime ─────────────────────────────────────────────────────────────────────

function deriveRegime(sym) {
  // Prefer hmm5mRegimes (4-state: BULL/BEAR/RANGE/CHOP) with probability breakdown
  const h5m = S.hmm5mRegimes?.[sym];
  if (h5m && h5m.pBull != null) {
    const maxProb = Math.max(h5m.pBull, h5m.pBear, h5m.pRange ?? 0, h5m.pChop ?? 0);
    if (maxProb < 45) return 'TRANSITION'; // no clear majority
    if (h5m.pBull === maxProb) return 'BULL';
    if (h5m.pBear === maxProb) return 'BEAR';
    return 'RANGE'; // pRange or pChop dominant → range-like
  }
  // Fallback to hmmRegimes
  const hmm = S.hmmRegimes?.[sym];
  if (hmm) {
    if (hmm.regime === 'RANGE') return 'RANGE';
    if (hmm.trendDir === 'bull') return 'BULL';
    if (hmm.trendDir === 'bear') return 'BEAR';
  }
  return 'TRANSITION';
}

// ── Vol state ──────────────────────────────────────────────────────────────────

function deriveVolState(volRegime) {
  if (!volRegime) return 'NORMAL';
  const { regime, percentile, garch, volImpulsePct } = volRegime;
  const cluster = garch?.cluster ?? 'STABLE';
  const impulse = Math.abs(volImpulsePct ?? 0);

  if (percentile >= 90 && impulse > 30) return 'EXTREME';
  if (regime === 'HIGH' || cluster === 'EXPANDING') return 'EXPANSION';
  if (regime === 'LOW'  || cluster === 'CONTRACTING') return 'COMPRESSION';
  return 'NORMAL';
}

// ── Range utilisation ─────────────────────────────────────────────────────────

function deriveRangeUtil(volRegime, otcForecast, quote) {
  if (!volRegime || !quote) return 0.5;

  const usedRange = volRegime.usedRange ?? 0;

  // Prefer otcForecast hl_median (% of price) if available
  if (otcForecast?.hl_median && quote.price > 0) {
    const forecastRange = quote.price * (otcForecast.hl_median / 100);
    if (forecastRange > 0) return usedRange / forecastRange;
  }

  // Fallback: GARCH daily cap (ci68Range in price units)
  const dailyCap = volRegime.dailyCap ?? volRegime.atr ?? 0;
  if (dailyCap > 0) return usedRange / dailyCap;

  return (volRegime.usedPct ?? 50) / 100;
}

// ── Confidence ────────────────────────────────────────────────────────────────

function deriveConfidence(sym, volRegime) {
  const hmmData  = S.hmmRegimes?.[sym] ?? null;
  const garch    = volRegime?.garch ?? null;

  let armaResult = null;
  let arimaStab  = null;
  try {
    const bars = filterTradingDays(S.ohlcData?.[sym]?.values);
    if (bars && bars.length >= 30) {
      const chronBars = [...bars].reverse();
      const trs = [];
      for (let i = 1; i < chronBars.length; i++) {
        const h = parseFloat(chronBars[i].high), l = parseFloat(chronBars[i].low), pc = parseFloat(chronBars[i-1].close);
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      }
      armaResult = computeRegimeTransition(trs.reverse());
    }
    const arimaCtx = computeArimaContext(S.ohlcData?.[sym]?.values, sym);
    arimaStab = arimaCtx?.residualStability ?? null;
  } catch (_) { /* silent — confidence degrades gracefully */ }

  const rc = computeRegimeConfidence(hmmData, garch, armaResult, null, arimaStab);
  return rc?.sizingMult ?? 0.5;
}

// ── COT percentile ────────────────────────────────────────────────────────────

function deriveCotPercentile(sym) {
  const cot = S.cotData?.[sym];
  if (!cot || cot.netSpeculative == null || !cot.history?.length) return null;

  const net  = cot.netSpeculative;
  const hist = cot.history.map(h => h.netSpeculative ?? h.net ?? 0).filter(v => !isNaN(v));
  if (hist.length < 10) return null;

  const sorted = [...hist].sort((a, b) => a - b);
  const rank   = sorted.findIndex(v => v >= net);
  return rank < 0 ? 1 : rank / sorted.length;
}

// ── Event risk ────────────────────────────────────────────────────────────────

function deriveEventRisk() {
  const ev = S.eventRisk;
  if (!ev) return null;
  const topEvent = ev.inNext4h?.[0] || ev.events?.[0];
  const label    = topEvent ? (topEvent.event || topEvent.description || '') : '';
  return { level: ev.level ?? 'none', label };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Collect and normalise all inputs for the decision engine from current S.* state.
 * @param {object} volRegime   — result of calculateVolRegime()
 * @param {object} otcForecast — result of calculateOTCForecast()
 * @param {object} quote       — current quote with .price
 * @returns {import('./decisionEngine.js').DecisionInputs}
 */
export function collectDecisionInputs(volRegime, otcForecast, quote) {
  const sym = S.currentPair?.symbol;
  if (!sym) return null;

  return {
    regime:        deriveRegime(sym),
    volState:      deriveVolState(volRegime),
    rangeUtil:     deriveRangeUtil(volRegime, otcForecast, quote),
    sessionPhase:  deriveSessionPhase(),
    confidence:    deriveConfidence(sym, volRegime),
    eventRisk:     deriveEventRisk(),
    cotPercentile: deriveCotPercentile(sym),
  };
}
