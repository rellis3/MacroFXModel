/**
 * The institutional system catalogue (owner, 2026-11-04) mapped to what this repo has (plans/DESK_ANALYST_PIPELINE.md
 * §9ab). The research pod (js/researchPod.js) reads it so its proposals aim at real gaps, and the Desk Office shows it.
 *
 * status:
 *   have      a working engine, feed or agent exists (where = the main file or endpoint)
 *   partial   pieces exist but not the whole system as named
 *   missing   nothing yet: a candidate for a research proposal
 *   out       not buildable on this setup (MT5 on a retail broker, no co-location or prime broker): listed so it is
 *             not proposed by mistake
 *
 * This is a map, not a verdict: "have" means the code exists, not that it has an edge. The Evidence Book says that.
 */
const H = 'have', P = 'partial', M = 'missing', O = 'out';
const S = (section, rows) => rows.map(([name, status, where, note = '']) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), section, name, status, where, note }));

export const SECTIONS = ['Market analysis and intelligence', 'Quantitative trading', 'Forecasting and prediction', 'Portfolio management', 'Risk management', 'Trade execution', 'Strategy testing and validation'];

export const CATALOGUE = [
  ...S(SECTIONS[0], [
    ['Market Data Management System', H, 'js/harness/features.mjs (point-in-time store), Desk Pack, js/dataFeeds.js'],
    ['Macro Intelligence System', H, 'desk roles macro_economy, economist; FRED feeds'],
    ['Economic Calendar and Event Analysis System', H, 'js/econCalendar.js, js/eventResponseCore.js, event agent (Phase 6)'],
    ['Market Regime Detection System', H, 'js/regimeCore.js, js/macroRegimeFx.js, js/ratesRegime.js, js/creditHmm.js'],
    ['Cross-Asset Analysis System', P, 'desk role global_market, js/yieldCouplingCore.js', 'no single cross-asset lead-lag map'],
    ['Yield Curve Analysis System', H, 'js/yieldCurveEngine.js, js/intlYields.js, role yields_curve'],
    ['Interest Rate Differential System', H, 'js/carryEngine.js, js/yieldSpreadCore.js, js/cbExpectations.js'],
    ['FX Relative Value System', P, 'js/fxFactorSignals.js, js/fxFactorV2.js', 'no fair-value anchor (PPP, BEER)'],
    ['Commodity Intelligence System', P, 'gold bots, WTI in the desk book', 'no inventories, curve or positioning model for energy and metals'],
    ['Equity Market Intelligence System', P, 'js/nasdaqTrendEngine.js, macro_equity bot', 'no breadth, earnings or sector data'],
    ['Credit Market Intelligence System', H, 'js/creditStressEngine.js, js/creditLeadLagEngine.js, role credit_funding'],
    ['Market Sentiment Analysis System', P, 'news analyst (agent 21)', 'no retail positioning feed (Myfxbook)'],
    ['Institutional Positioning System', P, 'COT, role cot_positioning', 'COT only: no flow or survey data'],
    ['COT Analysis System', H, 'js/cot.js, js/cotFactorCore.js, js/cotState.js'],
    ['Open Interest Analysis System', H, 'role options_oi, OI bots'],
    ['Options Flow Analysis System', M, '', 'no trade-by-trade options flow feed'],
    ['Dealer Gamma Exposure System', H, 'js/gexLadder.js, js/fullBookGex.js'],
    ['Market Liquidity Mapping System', H, 'js/liquidityLevels.js, js/globalLiquidityEngine.js, js/netLiquidity.js'],
    ['Volume Profile Analysis System', P, 'volume profile in some engines', 'FX has tick volume only'],
    ['Order Flow Analysis System', M, '', 'no level-2 or futures footprint data'],
  ]),
  ...S(SECTIONS[1], [
    ['Statistical Arbitrage System', P, 'js/ouPairsEngine.js', 'pairs only, no basket stat-arb'],
    ['Mean Reversion Trading System', H, 'js/vwapReversionEngine.js, vol-line fade bots'],
    ['Momentum Trading System', H, 'js/fxFactorSignals.js (time-series momentum)'],
    ['Trend Following System', H, 'js/trendFollowEngine.js, js/trendBasketEngine.js, js/trendFollowEmaEngine.js'],
    ['Pairs Trading System', H, 'js/ouPairsEngine.js'],
    ['Cointegration Trading System', P, 'js/ouPairsEngine.js', 'no Johansen/basket test'],
    ['Factor-Based Trading System', H, 'js/fxFactorSignals.js, js/cotFactorCore.js'],
    ['Multi-Factor Trading System', H, 'js/multiFactorEngine.js, js/fxFactorV2.js'],
    ['Market Neutral Trading System', P, 'cross-sectional FX factors are dollar-neutral', 'no explicit beta-neutral book'],
    ['Relative Value Trading System', P, 'js/yieldSpreadEngine.js', 'no FX fair-value RV'],
    ['Cross-Asset Arbitrage System', M, '', 'needs a lead-lag map first'],
    ['Carry Trading System', H, 'js/carryEngine.js, js/fxVolCarryEngine.js'],
    ['Volatility Arbitrage System', P, 'vol forecasts vs IV (role vol_iv)', 'no options execution on MT5'],
    ['Breakout Trading System', H, 'range-line and vol-line bots'],
    ['Mean Reversion / Momentum Switching System', P, 'regime bots', 'no tested switch rule'],
    ['Systematic Macro Trading System', P, 'js/macroRegimeFx.js, the desk book', 'the desk book is discretionary-by-agents, not a fixed rule'],
    ['Event-Driven Trading System', P, 'js/eventGateCore.js, event agent', 'gates and briefs, no tested event strategy'],
    ['Machine Learning Trading System', P, 'meta-labelling studies (closed)', 'see the Evidence Book before reopening'],
    ['Bayesian Trading System', M, '', ''],
    ['High-Frequency Trading System', O, '', 'needs co-location and direct market access'],
  ]),
  ...S(SECTIONS[2], [
    ['Directional Probability Forecasting System', P, 'desk book ratings', 'no calibrated probability per market'],
    ['Expected Return Forecasting System', M, '', ''],
    ['Daily Range Forecasting System', H, 'vol forecast ladders (41 instruments), day forecaster'],
    ['Intraday Range Forecasting System', H, 'js/coneForwardTrack.js, session ladders'],
    ['Volatility Forecasting System', H, 'vol forecast (41 instruments), js/vixForward.js'],
    ['Trend Persistence Forecasting System', P, 'js/trendQuality.js, day forecaster trend/range call'],
    ['Mean Reversion Probability System', P, 'js/vwapStretchCore.js'],
    ['Regime Transition Forecasting System', P, 'js/creditHmm.js', 'transition probabilities not forecast for FX'],
    ['Yield Movement Forecasting System', M, '', ''],
    ['FX Fair Value Forecasting System', M, '', 'PPP/BEER/rate-diff fair value not built'],
    ['Equity Fair Value Forecasting System', M, '', ''],
    ['Commodity Fair Value Forecasting System', M, '', ''],
    ['Correlation Forecasting System', M, '', 'js/deskRisk.js uses trailing correlation only'],
    ['Liquidity Forecasting System', P, 'spread profile (js/harness/costs.mjs)', 'measured, not forecast'],
    ['Options Expiry Forecasting System', P, 'OI walls and max pain', ''],
    ['Economic Event Impact Forecasting System', H, 'js/eventResponseCore.js, scenario strategist (Phase 15)'],
  ]),
  ...S(SECTIONS[3], [
    ['Portfolio Construction System', P, 'js/portfolioBook.js (study), fleet portfolio (Phase 27)'],
    ['Multi-Asset Allocation System', P, 'js/portfolioBook.js'],
    ['Dynamic Portfolio Weighting System', P, 'js/portfolioBook.js (vol targeting)'],
    ['Risk Parity System', H, 'js/fleetPortfolio.js (equal risk contribution across bots)'],
    ['Portfolio Beta Management System', P, 'js/deskRisk.js factors'],
    ['Factor Exposure Management System', P, 'js/deskRisk.js (USD and risk factors)'],
    ['Correlation Management System', H, 'js/deskRisk.js, js/fleetPortfolio.js'],
    ['Portfolio Hedging System', P, 'hedge bots', 'no study on record'],
    ['Dynamic Rebalancing System', P, 'js/portfolioBook.js'],
    ['Position Sizing System', H, 'risk desk roles, harness vol targeting'],
    ['Kelly Criterion System', H, 'js/fleetPortfolio.js (capped half-Kelly per bot)'],
    ['Capital Allocation System', H, 'js/fleetPortfolio.js'],
    ['Exposure Management System', H, 'desk exposure cap'],
    ['Portfolio Drawdown Control System', P, 'js/fleetPortfolio.js (reports drawdown)', 'no automatic de-risking rule'],
    ['Portfolio Stress Testing System', H, 'js/bookStress.js, js/deskRisk.js scenarios'],
    ['Portfolio Performance Attribution System', H, 'Phase 10 attribution'],
  ]),
  ...S(SECTIONS[4], [
    ['Value at Risk (VaR) System', H, 'js/fleetPortfolio.js (historical VaR)'],
    ['Expected Shortfall (CVaR) System', H, 'js/fleetPortfolio.js'],
    ['Monte Carlo Risk Simulation System', H, 'js/fleetPortfolio.js (bootstrap of days)'],
    ['Historical Stress Testing System', H, 'js/bookStress.js'],
    ['Scenario Analysis System', H, 'js/deskRisk.js, scenario strategist'],
    ['Liquidity Risk System', P, 'spread profile'],
    ['Counterparty Risk System', O, '', 'one retail broker: nothing to model'],
    ['Concentration Risk System', H, 'js/deskRisk.js (effective bets)'],
    ['Leverage Monitoring System', P, 'bot status balance', ''],
    ['Correlation Breakdown Detection System', H, 'js/fleetPortfolio.js (recent vs full correlation)'],
    ['Tail Risk Monitoring System', P, 'js/stressShadowCore.js, ES'],
    ['Maximum Drawdown Control System', P, 'js/fleetPortfolio.js', 'reported, not enforced'],
    ['Volatility-Adjusted Risk System', H, 'harness vol targeting'],
    ['Intraday Risk Monitoring System', P, 'trade watcher (agent 18)'],
    ['Portfolio Exposure Limit System', H, 'desk exposure cap'],
  ]),
  ...S(SECTIONS[5], [
    ['Order Management System (OMS)', O, 'MT5', 'MT5 is the OMS'],
    ['Execution Management System (EMS)', O, 'MT5', ''],
    ['Smart Order Routing System', O, '', 'one broker'],
    ['Algorithmic Execution System', P, 'bot entry logic'],
    ['VWAP Execution System', M, '', 'small size: rarely worth it'],
    ['TWAP Execution System', M, '', ''],
    ['Implementation Shortfall System', P, 'execution analyst (Phase 13): entry vs plan'],
    ['Market Impact Analysis System', O, '', 'size too small to move a market'],
    ['Slippage Monitoring System', H, 'execution analyst (Phase 13)'],
    ['Liquidity Execution System', P, 'spread profile by hour'],
    ['Fill Probability System', M, '', 'limit-order fill rates not logged'],
    ['Execution Quality Analytics System', H, 'execution analyst (Phase 13)'],
    ['Trade Reconciliation System', P, 'bot logs vs MT5 positions'],
    ['Broker Connectivity System', O, 'MT5 bridge', ''],
  ]),
  ...S(SECTIONS[6], [
    ['Historical Backtesting Engine', H, 'js/harness/runStudy.mjs, js/backtest-engine.js'],
    ['Walk-Forward Testing Engine', H, 'js/harness/runStudy.mjs'],
    ['Out-of-Sample Testing Engine', H, 'harness IS/OOS split, lockbox (data-rules)'],
    ['Monte Carlo Strategy Testing Engine', H, 'js/validationDesk.js (bootstrap of trades)'],
    ['Bootstrap Validation Engine', H, 'js/harness/stats.mjs'],
    ['Parameter Sensitivity Testing Engine', H, 'js/validationDesk.js'],
    ['Transaction Cost Analysis Engine', H, 'js/harness/costs.mjs, js/validationDesk.js cost stress'],
    ['Strategy Robustness Testing Engine', H, 'js/validationDesk.js'],
    ['Statistical Significance Testing Engine', H, 'js/harness/stats.mjs'],
    ['Multiple Hypothesis Testing Engine', H, 'js/harness/stats.mjs (BH-FDR, deflated Sharpe), js/validationDesk.js (reality check)'],
    ['Data Leakage Detection System', P, 'data-rules skill, validation desk review (Phase 26)', 'a review, not an automatic detector'],
    ['Look-Ahead Bias Detection System', P, 'point-in-time store, validation desk review'],
    ['Structural Stability Testing Engine', P, 'harness OOS halves, per-year results'],
    ['Regime-Conditional Testing Engine', P, 'studies condition by hand'],
    ['Strategy Performance Monitoring System', H, 'rules keeper (agent 20), js/fleetPortfolio.js drift'],
    ['Live-versus-Backtest Performance Comparison System', H, 'js/motifLiveVsBacktest.js, js/validationDesk.js liveVsBacktest'],
  ]),
];

/** Counts by section and status. */
export function coverage(cat = CATALOGUE) {
  const out = {};
  for (const r of cat) { const s = (out[r.section] ??= { have: 0, partial: 0, missing: 0, out: 0 }); s[r.status]++; }
  return out;
}

/** The catalogue as prompt text: one line per system, status first, gaps and partials with their notes. */
export const catalogueText = (cat = CATALOGUE) => SECTIONS.map(s => `${s}:\n${cat.filter(r => r.section === s).map(r => `- [${r.status}] ${r.name}${r.where ? ` (${r.where})` : ''}${r.note ? `: ${r.note}` : ''}`).join('\n')}`).join('\n\n');
