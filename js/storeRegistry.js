// js/storeRegistry.js — every PERMANENT store (kv.js _CF_EXACT) described once, so the 🗄 Data Map can show when
// each was last written and the build fails if a new store is added without being described.
//
// WHY (owner, 2026-10-20: "all data is meant to go into the health check modal"): the paper record died on
// 12 Oct and nothing said so for four days, because the monitor counted job RUNS and the job's tick swallowed its
// own error. The only reliable health signal for a record is the time it was last WRITTEN. This registry is the
// list of what must be written, and how often.
//
// kind:
//   record   a job writes it on a cadence: stale when its last write is older than cadenceDays (business days).
//   log      append-only history; written when something happens. Shown with its last write, flagged only when
//            far past `cadenceDays` (a loose bound, so a quiet week is not an alarm).
//   state    a bot/engine's working state; rewritten on every tick while it runs.
//   config   user-entered settings: present/absent only, never "stale".
//   secret   credentials / tokens: NEVER read by the health check, only listed.
// market: false = the writer is not market-hours-bound (weekends are not counted against it).
// Pure data. No fetch, no DOM.

const R = (label, cadenceDays = 1, extra = {}) => ({ kind: 'record', label, cadenceDays, ...extra });
const L = (label, cadenceDays = 14, extra = {}) => ({ kind: 'log', label, cadenceDays, ...extra });
const S = (label, cadenceDays = 3, extra = {}) => ({ kind: 'state', label, cadenceDays, ...extra });
const C = label => ({ kind: 'config', label });
const X = label => ({ kind: 'secret', label });

export const STORES = {
  // ── forward records and model outputs ─────────────────────────────────────
  kv_write_times_v1: R('KV write-time ledger (what this map reads)', 1),
  paper_record_v1: R('Rich-vol break paper record', 1),
  global_read_v1: R('Global Read forward record', 1),
  daily_read_v1: R('Daily Read (tags + scored days)', 1),
  forecast_scorecard_v1: R('Forecast scorecard', 1),
  signal_journal_v1: R('Signal journal (forward test)', 1),
  pair_ledger_v1: R('Pair ledger (lean record)', 1),
  chain_read_v1: R('Chain read (AI narrative)', 3, { market: false }),
  eod_review_v1: R('End-of-day written review', 2, { market: false }),
  daily_snapshot_v1: R('Daily snapshot', 1),
  exhaustion_ladder_v1: R('Exhaustion-ladder fit', 8, { market: false }),
  surface_lab_v1: R('Surface Lab', 1),
  desk_watch_v1: R('Desk Watch states + log', 1),
  macro_regime_fx_v1: R('Macro regime → FX', 1, { market: false }),
  macro_scorecard_history_v1: R('Macro scorecard history', 8, { market: false }),
  econ_surprise_v1: R('Economic surprise store', 1),
  cog_legs_live_v1: R('COG rate-legs live', 1),
  cog_line_live_v1: R('COG line live', 1),
  spread_episodes_v1: L('Spread-turn episodes forward record', 5),
  bank_credit_v1: L('BIS bank-credit snapshot + release dates', 5),
  funding_read_v1: L('Funding & leverage daily read record', 5),
  zq_path_v1: R('Fed-funds path (ZQ)', 1),
  mpt_store_v1: R('MPT store', 3, { market: false }),
  spread_profile_v1: R('Spread profile', 3, { market: false }),
  vol_hit_rates: R('Vol-forecast hit rates', 1),
  event_vol_impact: R('Event vol impact', 35, { market: false }),
  session_stats: R('Session stats', 2),
  morning_brief_v1: R('Morning brief', 3, { market: false }),
  morning_brief_intel_v1: R('Market intelligence brief', 3, { market: false }),
  fred_data_v3: R('FRED dashboard snapshot', 1),
  hmm5m_trained_params: R('5-minute HMM trained params', 14, { market: false }),
  hmm5m_macro_context: R('5-minute HMM macro context', 1),
  trade_balance_v1: R('Trade balance engine', 35, { market: false }),
  consumer_confidence_v1: R('Consumer confidence engine', 35, { market: false }),
  nq_qmr_validation: R('NQ QMR validation', 30, { market: false }),
  gold_perf_snapshot: R('Gold performance snapshot', 7, { market: false }),
  gold_optimiser_last: R('Gold optimiser last run', 30, { market: false }),
  gold_ml_params: R('Gold ML params', 30, { market: false }),
  egress_audit: R('Egress audit', 7, { market: false }),
  hedge_alerts_cache: R('Hedge alerts cache', 2, { market: false }),
  // ── options / positioning archives ────────────────────────────────────────
  oi_store: R('OI store (FX + indices)', 1),
  oi_store_cmdty: R('OI store (commodities)', 1),
  oi_store_py: R('OI store (python capture)', 1),
  oi_history: R('OI history (60-day archive)', 1),
  oi_history_raw: R('OI raw archive', 1),
  oi_capture_freshness: R('OI capture freshness', 1),
  oi_expect_log: L('OI expectation log', 3),
  oi_sweep_last: L('OI sweep last', 30, { market: false }),
  range_line_oi: R('Range-line OI levels', 1),
  cboe_snap_v1: R('CBOE snapshot', 3, { market: false }),
  oi_shadow_v1: R('OI shadow', 3),
  oi_hold_calibration: R('OI hold calibration', 14, { market: false }),
  oi_ripple_log: L('OI ripple log', 3),
  cot_data: R('COT positioning', 8, { market: false }),
  cot_series_v2: R('COT series', 8, { market: false }),
  cot_extremes_v3: R('COT extremes', 8, { market: false }),
  cot_factor_history_v1: R('COT factor history', 8, { market: false }),
  oanda_book_history_v1: R('OANDA retail book history', 1),
  oanda_financing_history: R('OANDA financing history', 1),
  gold_etf_flow_history: R('Gold ETF flow history', 1),
  // ── forward-test logs ─────────────────────────────────────────────────────
  fwd_fade_log: L('Fade forward log', 3),
  fwd_fade_meta: R('Fade forward meta', 3),
  cone_fwd_log: L('Cone forward log', 3),
  cone_fwd_meta: R('Cone forward meta', 3),
  level_engine_fwd_log: L('Level engine forward log', 3),
  level_engine_bot_state: S('Level engine state', 3),
  cog_signal_log: L('COG signal log', 14),
  cog_shadow_log: L('COG shadow log', 14),
  hedge_audit_log: L('Hedge audit log', 14),
  nq_qmr_status: S('NQ QMR status', 14),
  nq_qmr_audit: L('NQ QMR audit', 14),
  spx_qmr_status: S('SPX QMR status', 14), dow_qmr_status: S('DOW QMR status', 14), dax_qmr_status: S('DAX QMR status', 14),
  journal_store: L('Trade journal', 60),
  // ── bots: plans, state, logs (event-driven: loose bounds) ─────────────────
  policy_v2: S('Telegram policy v2', 7), ledger_v2: L('Telegram ledger v2', 14), policy_v2_status: S('Telegram policy status', 7),
  regime_bot_v7_audit_log: L('Regime bot v7 audit', 30),
  gold_v2_trades: L('Gold v2 trades', 30),
  confluence_bot_trades: L('Confluence bot trades', 30), confluence_trade_log: L('Confluence trade log', 30),
  volatility_bot_plan: R('Volatility bot plan', 3), volatility_bot_audit_log: L('Volatility bot audit', 14),
  volatility_bot_v2_plan: R('Volatility bot v2 plan', 3), volatility_bot_v2_state: S('Volatility bot v2 state'),
  volatility_bot_v2_trade_log: L('Volatility bot v2 trades', 30), volatility_bot_v2_decision_log: L('Volatility bot v2 decisions', 14),
  volatility_bot_v2_drift_history: L('Volatility bot v2 drift', 14),
  volatility_bot_v3_state: S('Volatility bot v3 state'), volatility_bot_v3_trade_log: L('Volatility bot v3 trades', 30),
  volatility_bot_v3_decision_log: L('Volatility bot v3 decisions', 14),
  yield_spread_plan: R('Yield-spread plan', 3, { market: false }), yield_spread_audit: L('Yield-spread audit', 30),
  range_line_bot_plan: R('Range-line bot plan', 3), range_line_confluence: R('Range-line confluence', 3),
  range_line_bot_audit_log: L('Range-line bot audit', 14), range_line_trade_log: L('Range-line trades', 30),
  oi_bot_zones: R('OI bot zones', 2), oi_bot_trade_log: L('OI bot trades', 14), oi_bot_state: S('OI bot state'),
  oi_vol_bot_zones: R('OI-Vol bot zones', 2), oi_vol_bot_trade_log: L('OI-Vol bot trades', 14), oi_vol_bot_state: S('OI-Vol bot state'),
  oi_conf_bot_trade_log: L('OI-Conf bot trades', 30), oi_conf_bot_state: S('OI-Conf bot state', 30),
  fib_atlas_bot_plan: R('Fib Atlas bot plan', 3), fib_atlas_bot_state: S('Fib Atlas bot state'),
  fib_atlas_bot_trade_log: L('Fib Atlas bot trades', 30), fib_atlas_bot_decision_log: L('Fib Atlas bot decisions', 14),
  fib_atlas_bot_v2_state: S('Fib Atlas v2 state'), fib_atlas_bot_v2_trade_log: L('Fib Atlas v2 trades', 30),
  fib_atlas_bot_v2_decision_log: L('Fib Atlas v2 decisions', 14),
  motif_bot_plan: R('Motif bot plan', 3), motif_bot_state: S('Motif bot state'),
  motif_bot_decision_log: L('Motif bot decisions', 14), motif_bot_spread_stats: R('Motif bot spread stats', 7, { market: false }),
  // ── user-entered configuration (present/absent only) ──────────────────────
  surprise_alert_config: C('Surprise alert config'), oi_auto_target: C('OI auto-target toggle'), cot_urls: C('COT report URLs'),
  cot_url: C('COT report URL'), caps: C('Proximity caps'), daily_watchlist: C('Daily watchlist'),
  regime_bot_config: C('Regime bot config'), regime_bot_v2_config: C('Regime bot v2 config'), regime_bot_v7_config: C('Regime bot v7 config'),
  bot_config: C('Bot config'), backtestsystem_live_config: C('Backtest system config'), gold_bot_config: C('Gold bot config'),
  gold_v2_config: C('Gold v2 config'), confluence_bot_config: C('Confluence bot config'), tg_v2_alert_cfg: C('Telegram v2 alert config'),
  tg_v2_config: C('Telegram v2 config'), tg_vollevel_config: C('Vol-level Telegram config'), vol_level_alert_cfg: C('Vol-level alert config'),
  dyn_anchor_config: C('Dynamic anchor config'), macro_equity_config: C('Macro equity config'), volatility_bot_config: C('Volatility bot config'),
  yield_spread_config: C('Yield-spread config'), range_line_bot_config: C('Range-line bot config'), oi_bot_config: C('OI bot config'),
  oi_vol_bot_config: C('OI-Vol bot config'), oi_conf_bot_config: C('OI-Conf bot config'), volatility_bot_v2_config: C('Volatility v2 config'),
  volatility_bot_v3_config: C('Volatility v3 config'), fib_atlas_bot_config: C('Fib Atlas bot config'), fib_atlas_bot_v2_config: C('Fib Atlas v2 config'),
  motif_bot_config: C('Motif bot config'), nq_qmr_config: C('NQ QMR config'), nav_layout: C('Navigation layout'), scratchpad_notes: C('Scratchpad notes'),
  // ── credentials (never read) ──────────────────────────────────────────────
  tg_config: X('Telegram credentials'), hedge_signal_tg: X('Hedge-signal Telegram credentials'), regime_bot_credentials: X('Regime bot credentials'),
  regime_bot_v2_credentials: X('Regime bot v2 credentials'), regime_bot_v7_credentials: X('Regime bot v7 credentials'),
  bot_credentials: X('Bot credentials'), backtestsystem_credentials: X('Backtest system credentials'), gold_v2_credentials: X('Gold v2 credentials'),
  confluence_bot_credentials: X('Confluence bot credentials'), dyn_anchor_credentials: X('Dynamic anchor credentials'),
  macro_equity_credentials: X('Macro equity credentials'), volatility_bot_credentials: X('Volatility bot credentials'),
  yield_spread_credentials: X('Yield-spread credentials'), range_line_bot_credentials: X('Range-line bot credentials'),
  oi_bot_credentials: X('OI bot credentials'), oi_vol_bot_credentials: X('OI-Vol bot credentials'), oi_conf_bot_credentials: X('OI-Conf bot credentials'),
  volatility_bot_v2_credentials: X('Volatility v2 credentials'), volatility_bot_v3_credentials: X('Volatility v3 credentials'),
  fib_atlas_bot_credentials: X('Fib Atlas bot credentials'), fib_atlas_bot_v2_credentials: X('Fib Atlas v2 credentials'),
  motif_bot_credentials: X('Motif bot credentials'),
};

/**
 * FEED-shaped entries for js/dataFeeds.js, one per readable store (record / log / state) that the registry
 * describes and that does not already have a hand-written feed with a kvStamp.
 */
export function storeFeeds(already = new Set()) {
  return Object.entries(STORES)
    .filter(([key, s]) => ['record', 'log', 'state'].includes(s.kind) && !already.has(key))
    .map(([key, s]) => ({
      id: `store:${key}`, name: s.label, provider: 'KV (permanent)', category: 'records',
      purpose: s.kind === 'record' ? 'A record or model output a job rewrites on a schedule; its last write is the health signal.'
        : s.kind === 'log' ? 'An append-only log written when something happens; shown with its last write.'
        : 'A bot or engine working state, rewritten on every tick while it runs.',
      store: `KV ${key}`, refresh: `${s.kind}, expected within ${s.cadenceDays} day${s.cadenceDays === 1 ? '' : 's'}`,
      kvStamp: { key, cadenceDays: s.cadenceDays, market: s.market !== false },
    }));
}
