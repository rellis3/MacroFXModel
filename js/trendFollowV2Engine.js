// trendFollowV2Engine.js — trend-following v2: FORECAST-σ position sizing.
//
// The experiment (Moreira-Muir 2017, "Volatility-Managed Portfolios"): sizing by
// a *forecast* of vol should beat sizing by trailing realized vol, because vol is
// highly predictable and better forecasts shed variance without shedding return.
// We already own the forecaster — `volSigmaSeries` (fx→Yang-Zhang, index→GARCH,
// commodity→HV20), the SAME math as the live vol forecaster. v1's trend engine
// sizes off a trailing 63d stdev. This engine changes ONLY that: the signal, the
// portfolio construction, the costs and the vol targets are all v1's own code,
// reached through the `volSeries` parameter of the one `backtestMarket` primitive
// (Lego rule: parameterise, don't fork).
//
// Pre-registered A/B criteria (stated before the first run, so a null can't be
// re-narrated): v2 "wins" only if its IS-selected config beats v1's on OOS
// Sharpe AND the improvement survives 5bp costs (2.5× default). Anything else
// ⇒ "trailing vol is good enough — keep v1". Both outcomes are reported.
//
// Pure & no-lookahead: markets are passed in as OHLC bars; no fetching here.

import { volSigmaSeries } from './forecastCore.js';
import { backtestBasket, robustness, isOosSplit, DEFAULTS } from './trendFollowEngine.js';
import { sharpeStdError, minTrackRecordLength } from './metricsCore.js';

const DAY = 252;

// Annualised forecast-vol series aligned to bars, causal by construction:
// out[i] uses data ≤ i only (it is volSigmaSeries[i+1], which by contract
// predicts bar i+1 from data < i+1). Same information set as v1's trailing
// rollingVol[i], so the A/B isolates the estimator, not the timing.
// Warmup / degenerate values (YZ needs ~30 bars; the fx branch backfills 1e-6)
// are mapped to NaN so the engine sits flat instead of taking max leverage on
// a garbage σ. σ floor: 5e-4 daily ≈ 0.8% annualised — far below any real market.
export function forecastVolSeries(bars, assetClass) {
  const s = volSigmaSeries(bars, assetClass);
  const n = bars.length;
  const out = new Array(n).fill(NaN);
  for (let i = 0; i + 1 < n; i++) {
    const sig = s[i + 1];
    out[i] = Number.isFinite(sig) && sig > 5e-4 ? sig * Math.sqrt(DAY) : NaN;
  }
  if (n >= 2) out[n - 1] = out[n - 2];   // final position earns no return in-backtest
  return out;
}

// One variant run = basket backtest + the honest reads (robustness, IS/OOS).
function runVariant(markets, c) {
  const bt = backtestBasket(markets, c);
  if (!bt.ok) return bt;
  try { bt.robustness = robustness(markets, c); } catch (e) { bt.robustness = { ok: false, error: e.message }; }
  try { bt.isOos = isOosSplit(markets, c); } catch (e) { bt.isOos = { ok: false, error: e.message }; }
  // Sharpe honesty on the headline number: error bar + years-to-confirm.
  const se = sharpeStdError(bt.portfolio.sharpe, bt.bars, DAY);
  const mtrl = minTrackRecordLength(bt.portfolio.sharpe, { periodsPerYear: DAY });
  bt.portfolio.sharpeSE = +se.toFixed(2);
  bt.portfolio.minTrackYears = Number.isFinite(mtrl) ? +mtrl.toFixed(1) : null;
  return bt;
}

function costSharpeAt(bt, bp) {
  return bt?.robustness?.ok ? (bt.robustness.costSensitivity.find(x => x.costBp === bp)?.sharpe ?? null) : null;
}

// The pre-registered comparison. Reads OOS Sharpe of each variant's IS-selected
// config (the honest number) and the 5bp cost row (does the gain survive
// realistic-worse costs?).
export function compareAB(incumbent, v2) {
  const iOos = incumbent?.isOos?.ok ? incumbent.isOos.isSelected.oosSharpe : null;
  const vOos = v2?.isOos?.ok ? v2.isOos.isSelected.oosSharpe : null;
  const i5 = costSharpeAt(incumbent, 5), v5 = costSharpeAt(v2, 5);
  const oosGain = iOos != null && vOos != null ? +(vOos - iOos).toFixed(2) : null;
  const beatsOos = oosGain != null && oosGain > 0;
  const survivesCosts = i5 != null && v5 != null ? v5 > i5 : null;
  let verdict, read;
  if (oosGain == null) {
    verdict = 'inconclusive';
    read = 'IS/OOS split unavailable for one variant — no comparison possible.';
  } else if (beatsOos && survivesCosts) {
    verdict = 'v2_wins';
    read = `Forecast-σ sizing beats trailing vol on the pre-registered criteria: OOS Sharpe ${iOos} → ${vOos} (gain ${oosGain}) and the gain survives 5bp costs (${i5} → ${v5}). Next step is forward-testing, not more building — the OOS window is one split, not proof.`;
  } else if (beatsOos) {
    verdict = 'v2_fragile';
    read = `OOS Sharpe improves (${iOos} → ${vOos}) but the gain does NOT survive 5bp costs (${i5} → ${v5}) — the forecaster trades its accuracy away in turnover. Keep v1.`;
  } else {
    verdict = 'no_improvement';
    read = `Forecast-σ sizing does not beat trailing vol OOS (${iOos} → ${vOos}). This is the honest base rate: a 63d trailing stdev is already a decent vol forecast at a daily horizon, and GARCH/YZ's extra accuracy didn't convert into portfolio Sharpe here. Keep v1; nothing to deploy.`;
  }
  return {
    verdict, read, oos: { incumbent: iOos, v2: vOos, gain: oosGain },
    fullSample: { incumbent: incumbent?.portfolio?.sharpe ?? null, v2: v2?.portfolio?.sharpe ?? null },
    at5bp: { incumbent: i5, v2: v5 },
    criteria: 'pre-registered: v2 wins iff OOS Sharpe (IS-selected config) improves AND the improvement survives 5bp costs',
  };
}

// markets: [{ symbol, bars: [{open,high,low,close}], assetClass: 'fx'|'index'|'commodity' }]
export function runTrendAB(markets, cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  const closesOf = m => m.bars.map(b => b.close);
  const base = markets.map(m => ({ symbol: m.symbol, closes: closesOf(m) }));
  const fcst = markets.map(m => ({ symbol: m.symbol, closes: closesOf(m), volSeries: forecastVolSeries(m.bars, m.assetClass) }));
  const incumbent = runVariant(base, c);
  const forecastSized = runVariant(fcst, c);
  if (!incumbent.ok || !forecastSized.ok) {
    return { ok: false, error: incumbent.error || forecastSized.error, incumbent, forecastSized };
  }
  return { ok: true, config: c, incumbent, forecastSized, comparison: compareAB(incumbent, forecastSized) };
}
