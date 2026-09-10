/**
 * botRegistry — the one list of live/paper bots, their KV status key, label and
 * colour. Loaded as a CLASSIC script (not a module) because its first consumer,
 * `bot-config.html`, keeps its logic in a plain inline <script> that runs before
 * any deferred module would — so a module export could not reach it.
 *
 * Single source of truth on purpose. This list previously existed only as
 * `_POS_BOTS` inside bot-config.html, and three other places already have to be
 * kept in step with it by hand: `STATUS_KEYS` in `_worker.js` (/api/kv/set),
 * `BOT_KEYS` in `/api/trade-history`, and the tab bar. A bot missing from any of
 * them still LOOKS fine — it just silently loses its closed trades. Adding a
 * fourth hand-maintained copy for `bot-audit.html` was the alternative to this
 * file; see MD files/LIVE_BACKTEST_ALIGNMENT.md T7.
 *
 * `paper: true` means the bot does not place real orders — its P&L is simulated
 * and must never be mixed into a real-money total without saying so.
 */
window.POS_BOTS = [
  { key: 'bot_status',            label: 'MacroFX V1', color: '#60a5fa', bg: '#172554', bd: '#1e40af', paper: false },
  { key: 'regime_bot_status',     label: 'Regime V1',  color: '#34d399', bg: '#0d2b22', bd: '#1a4a38', paper: false },
  { key: 'gold_bot_status',       label: 'Gold',       color: '#fbbf24', bg: '#292100', bd: '#78610a', paper: false },
  { key: 'gold_v2_status',        label: 'Gold V2',    color: '#ff9f43', bg: '#2a1a00', bd: '#92540a', paper: false },
  { key: 'confluence_bot_status', label: 'Confluence', color: '#c084fc', bg: '#1e1633', bd: '#6d28d9', paper: false },
  { key: 'regime_bot_v2_status',  label: 'Regime V2',  color: '#a78bfa', bg: '#1e1b4b', bd: '#4338ca', paper: false },
  { key: 'backtestsystem_status', label: 'Backtest',   color: '#9ba3bf', bg: "#1a1f2e",     bd: "#2b3245", paper: false },
  { key: 'dyn_anchor_status',     label: 'DynAnchor',  color: '#f59e0b', bg: '#292100',  bd: '#78610a', paper: false },
  { key: 'hedge_bot_status',           label: 'HedgeBot',  color: '#06b6d4', bg: '#0a2030',  bd: '#0e7490', paper: false },
  { key: 'position_hedge_bot_status',  label: 'PosHedge',  color: '#34d399', bg: '#0d2b22',  bd: '#1a4a38', paper: false },
  { key: 'nq_qmr_status',             label: 'NQ-QMR',    color: '#f59e0b', bg: '#1a1200',  bd: '#b45309', paper: false },
  { key: 'spx_qmr_status',            label: 'SPX-QMR',   color: '#f59e0b', bg: '#1a1200',  bd: '#b45309', paper: false },
  { key: 'dow_qmr_status',            label: 'DOW-QMR',   color: '#f59e0b', bg: '#1a1200',  bd: '#b45309', paper: false },
  { key: 'dax_qmr_status',            label: 'DAX-QMR',   color: '#f59e0b', bg: '#1a1200',  bd: '#b45309', paper: false },
  { key: 'regime_bot_v7_status',      label: 'Regime V7', color: '#14b8a6', bg: '#042f2e',  bd: '#0f766e', paper: false },
  { key: 'macro_equity_bot_status',   label: 'MacroEquity', color: '#818cf8', bg: '#1e1b4b', bd: '#4338ca', paper: false },
  { key: 'volatility_bot_status',     label: 'Volatility',  color: '#e0a93b', bg: '#292100', bd: '#78610a', paper: true },
  { key: 'volatility_bot_v2_status',  label: 'Vote Atlas',  color: '#38bdf8', bg: '#062233', bd: '#0369a1', paper: true },
  { key: 'volatility_ride_status',    label: 'Vol-Ride',    color: '#f0b64b', bg: '#2c2400', bd: '#8a6d0c', paper: true },
  { key: 'range_line_bot_status',     label: 'Range-Line',  color: '#4fd1c5', bg: '#06302b', bd: '#0f766e', paper: true },
  { key: 'oi_bot_status',             label: 'OI Gamma',    color: '#4dd0e1', bg: '#06282e', bd: '#0e7490', paper: true },
  { key: 'yield_spread_status',          label: 'YieldSpread',    color: '#f472b6', bg: '#2a0a1c', bd: '#9d1f5f', paper: true },
  { key: 'fib_atlas_bot_status',         label: 'Fib Atlas',      color: '#a78bfa', bg: '#1e1633', bd: '#6d28d9', paper: true },
];
