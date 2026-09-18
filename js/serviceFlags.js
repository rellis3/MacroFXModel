// js/serviceFlags.js — the single registry of every background job the Railway
// service runs, and the one place that decides whether each one is switched on.
//
// WHY THIS EXISTS
// The Railway service is one container running `start.sh`: a supervised set of
// Python/Node bots plus `node server.js`, which itself holds ~60 `setInterval`
// schedulers. Every one of those runs 24/7 whether or not anyone is looking at
// the page it feeds or trading the signal it produces — and until now, turning
// one off meant editing server.js and redeploying. Several schedulers had
// already grown their own ad-hoc opt-out var (`VOLATILITY_V2_PLAN_REFRESH`,
// `FIB_ATLAS_PLAN_REFRESH`, `CONE_FWD_AUTO`, `SURPRISE_ALERT_AUTO`,
// `VM_LOG_ENABLED`, `VM_HEARTBEAT`) with no index of what existed. This file is
// that index, and it keeps every one of those legacy names working (`legacyEnv`)
// so nothing set in Railway today changes meaning.
//
// DEFAULTS. Every service shipped defaulting to the state it was already in
// before this registry existed, so the registry's own deploy changed nothing.
// That is still true of every row EXCEPT the five HMM jobs, which the owner
// switched off on 2026-09-16 (see their `on: false` and the note on each). A
// default that is `false` is a deliberate, dated decision — not a tidy-up — and
// each one says what stops working. `SVC_<ID>=1` turns any of them back on from
// the Railway env without a deploy. See `MD files/RAILWAY_SERVICE_FLAGS.md`.
//
// PRECEDENCE (first match wins)
//   1. `SVC_<ID>` / a legacy alias  — per-service, explicit, always wins
//   2. `SERVICES_OFF=a,b,c`         — comma list of ids to disable
//   3. `SERVICES_ON=a,b,c`          — comma list of ids to (re-)enable
//   4. `SERVICE_PROFILE=lean`       — only services marked `lean: true` run
//   5. the service's own `on` default
//
// COST FIELD — HONEST SCOPE. `cost` is a RELATIVE ranking of work per hour
// (ticks/hour × what one tick does: OANDA calls, python spawns, model fits),
// derived by reading the code. No load, CPU or memory measurement backs it, and
// no £/$ figure is attached to it here — the same discipline
// `MD files/INFRASTRUCTURE_COST_ANALYSIS.md` §6 sets out. To get real numbers,
// read `/api/services` after a day of uptime: every gated job records its own
// run count and cumulative wall time there, which is measurement rather than
// another static read.

/** Recognised falsey/truthy env spellings. Anything else = "not set". */
function parseBool(raw) {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (v === '') return null;
  if (['0', 'false', 'off', 'no', 'n'].includes(v)) return false;
  if (['1', 'true', 'on', 'yes', 'y'].includes(v)) return true;
  return null;
}

function parseList(raw) {
  return String(raw ?? '').split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * The registry. One row per switchable background job.
 *
 *   id       stable key — what you put in SERVICES_OFF and what /api/services reports
 *   env      canonical env var (always `SVC_` + the id, upper-snake)
 *   legacyEnv  pre-existing opt-out vars that still work, checked after `env`
 *   where    'server' (a server.js scheduler) | 'start.sh' (a supervised bot process)
 *   label    human name
 *   cadence  how often it fires
 *   cost     'high' | 'med' | 'low' — relative work per hour, see header
 *   lean     does it still run under SERVICE_PROFILE=lean?
 *   on       default when nothing is set (false = the code was already opt-IN)
 *   feeds    who consumes the output — the thing to check before switching it off
 */
export const SERVICES = [
  // ── Live price / level / alert core ──────────────────────────────────────
  { id: 'monitor', where: 'server', label: 'Price monitor + level-proximity alerts',
    cadence: `every MONITOR_MS (3s default)`, cost: 'high', lean: true, on: true,
    feeds: 'Telegram level alerts, /api/monitor/status, the daily 06:05 London level refresh trigger',
    note: 'Early-returns unless alerts are enabled and a Telegram bot is configured, but still wakes 1,200×/hour.' },
  { id: 'levels', where: 'server', label: 'Level engine refresh (v1 + v2 + daily HMM)',
    cadence: 'every REFRESH_LEVELS_MS (30 min default)', cost: 'high', lean: true, on: true,
    feeds: 'levels.html, indexv2, every level-consuming bot via KV, Telegram v2 zones' },
  { id: 'levelsV2Alerts', where: 'server', label: 'Telegram v2 zone-proximity scan',
    cadence: 'every V2_ALERT_MS (90s default)', cost: 'low', lean: true, on: true,
    feeds: 'Telegram v2 alerts only — no-op unless tgOn(levelsV2)' },
  { id: 'volLevelAlerts', where: 'server', label: 'Vol-forecast level-proximity scan',
    cadence: 'every VOL_LEVEL_ALERT_MS (90s default)', cost: 'low', lean: true, on: true,
    feeds: 'Telegram vol-level alerts — no-op unless a dedicated bot is configured' },

  // ── HMM regime family ────────────────────────────────────────────────────
  { id: 'hmm5m', where: 'server', label: '5m HMM regime (v1)',
    cadence: 'every HMM5M_REFRESH_MS (30s default) × every configured pair', cost: 'high', lean: true, on: false,
    feeds: '/api/hmm5m → indexv2 + desk tiles, Telegram regime-change alerts, regime history',
    note: 'OFF since 2026-09-16 (owner). Per tick it was one 500-bar OANDA fetch and one HMM fit PER PAIR — ~2,500 fetch+fit/hour at 26 pairs. '
        + 'While off, two things in the LIVE level alerts stop silently: the polarity-flip direction override (detectPolarityFlip reads state.hmm5mBars, '
        + 'which only this job fills, so a broken-and-retested level keeps its old direction) and the VuManChu M5 reads in the alert text/chart '
        + '(vumanchuM5Bars returns null). Neither errors — they just stop happening.' },
  { id: 'hmm5mV2', where: 'server', label: '5m HMM regime (v2 shadow)',
    cadence: 'every HMM5M_REFRESH_MS (30s default) × every configured pair', cost: 'high', lean: false, on: false,
    feeds: '/api/hmm5m-v2 → RegimeV2/regime_bot_v2.py, RegimeV4, bot/regime_bot.py, indexv2',
    note: 'OFF since 2026-09-16 (owner). Doubled the hmm5m workload. While off, /api/hmm5m-v2 serves `{}` — a 200, not an error — so RegimeV2/regime_bot_v2.py '
        + '(started by start.sh, live money) reads no regime for any pair, fails `regime not in TRADEABLE` and sits in `watching` forever. It does not trade. '
        + 'Same for RegimeV4 / bot/regime_bot.py and anything on the MT5 box. Consider SVC_BOT_REGIME_V2=0 too rather than paying for a process that cannot act.' },
  { id: 'hmm1h', where: 'server', label: '1h HTF HMM (v2)',
    cadence: 'every 5 min × every configured pair', cost: 'med', lean: true, on: false,
    feeds: '/api/hmm1h-v2 → regime_bot_v2.py gate E7, RegimeV4, desk',
    note: 'OFF since 2026-09-16 (owner). This one fails OPEN, not closed: regime_bot_v2.py guards E7 with `if ... && h1_regime`, so an empty feed SKIPS the '
        + '"1h opposed" check rather than blocking the trade — the bot would trade with one less safety gate. Moot while hmm5mV2 is also off (the bot never '
        + 'reaches the gates), but turning hmm5mV2 back on WITHOUT this one restores trading minus E7. Re-enable them together.' },
  { id: 'hmm30m', where: 'server', label: '30m MTF HMM (v2)',
    cadence: 'every 5 min × every configured pair', cost: 'med', lean: false, on: false,
    feeds: '/api/hmm30m-v2 → regime_bot_v7.py primary signal (NOT started by start.sh — MT5-box bot)',
    note: 'OFF since 2026-09-16 (owner). The safest of the five: nothing in this container consumes it. Only matters if regime_bot_v7.py is live on the MT5 box.' },
  { id: 'hmm2h', where: 'server', label: '2h HTF HMM (v2)',
    cadence: 'every 10 min × every configured pair', cost: 'med', lean: false, on: false,
    feeds: '/api/hmm2h-v2 → regime_bot_v7.py 4× confirmation gate (NOT started by start.sh)',
    note: 'OFF since 2026-09-16 (owner). As hmm30m: no consumer inside this container. V7 on the MT5 box is the only thing that would notice.' },
  { id: 'regimeHistory', where: 'server', label: 'Regime-history flush (local KV + R2)',
    cadence: '5 min local, 60 min R2', cost: 'low', lean: true, on: true,
    feeds: 'regime-viewer.html history — pure persistence of what the HMM loops already computed' },

  // ── Macro / econ data pollers ────────────────────────────────────────────
  { id: 'macroContext', where: 'server', label: 'Macro context (VIX, HY spread, curve)',
    cadence: 'every MACRO_REFRESH_MS (6h default)', cost: 'low', lean: true, on: true,
    feeds: 'hmm5m-v2 macro conditioning, /api/macro-context' },
  { id: 'fredDashboard', where: 'server', label: 'FRED dashboard cache',
    cadence: 'every MACRO_REFRESH_MS (6h default)', cost: 'low', lean: true, on: true,
    feeds: '/api/fred — pre-warms KV so page loads never trigger concurrent FRED batches' },
  { id: 'fredHistory', where: 'server', label: 'FRED history cache (21 series × 90 obs)',
    cadence: 'every MACRO_REFRESH_MS (6h default)', cost: 'low', lean: true, on: true,
    feeds: '/api/fredhistory' },
  { id: 'econPollers', where: 'server', label: 'Econ release pollers (14 series)',
    cadence: 'each polls every 10 min', cost: 'med', lean: false, on: true,
    feeds: 'labor-market / cpi / gdp / ism / ppi / retail-sales / trade-balance / real-yield / rate-matrix / yield-curve / consumer-confidence / credit-* pages',
    note: '14 separate timers, 84 wake-ups/hour, for series that print at most once a day. Cheap per tick, but nothing here needs 10-minute latency — the release-poller de-dupes and does nothing 99% of the time.' },
  { id: 'cbSentiment', where: 'server', label: 'Central-bank sentiment engines (FOMC/ECB/BoE/BoJ/Beige Book)',
    cadence: '5 engines, each every 30 min', cost: 'med', lean: false, on: true,
    feeds: 'fomc-sentiment.html, ecb-sentiment.html, boe-sentiment.html, boj-sentiment.html, beige-book.html',
    note: 'A run downloads and parses statement PDFs and calls the Anthropic API — that is an ANT_KEY bill as well as CPU. Releases are calendar-scheduled: the poll is a no-op outside meeting days.' },
  { id: 'serviceStats', where: 'server', label: 'Service-stat flush to R2',
    cadence: 'every SVC_STATS_FLUSH_MS (15 min default) + once on SIGTERM', cost: 'low', lean: true, on: true,
    feeds: '/api/services\'s `today`/`window` totals. This is the meter itself: off ⇒ the per-job numbers go back to resetting on every redeploy, which is what made them useless in the first place.' },
  { id: 'morningBrief', where: 'server', label: 'Auto morning brief',
    cadence: '20 min clock, fires once/day at the configured London hour', cost: 'low', lean: false, on: true,
    feeds: 'The scheduled Telegram morning brief + per-pair briefs (brief-config.html). A run calls the Anthropic API — ANT_KEY spend, not just CPU. No-op until something is enabled in the brief config.' },
  { id: 'eventGate', where: 'server', label: 'Event-blackout windows (ForexFactory/Finnhub)',
    cadence: 'hourly', cost: 'low', lean: true, on: true,
    feeds: 'KV event_windows_v1 — the risk control that keeps the volatility bot off fade limits through NFP/CPI/FOMC. Leave on while any bot trades.' },
  { id: 'financing', where: 'server', label: 'Financing/swap-rate daily snapshot',
    cadence: '6h poll, captures once per day', cost: 'low', lean: false, on: true,
    feeds: 'carry pages / financing history KV' },
  { id: 'creditFlip', where: 'server', label: 'Credit regime-flip alert check',
    cadence: 'every 30 min', cost: 'low', lean: false, on: true,
    feeds: 'Telegram credit-flip alert (self-described "not yet OOS-validated")' },

  // ── Reporting / history recorders ────────────────────────────────────────
  { id: 'bookHistory', where: 'server', label: 'Book-history snapshot recorder',
    cadence: 'every 10 min', cost: 'med', lean: false, on: true,
    feeds: 'multi-factor-book / forecast-book-report history series' },
  { id: 'scorecardHistory', where: 'server', label: 'Macro scorecard history',
    cadence: 'every 2h', cost: 'low', lean: false, on: true, feeds: 'macro-scorecard.html history strip' },
  { id: 'scoreLedger', where: 'server', label: 'Forecast ledger scoring',
    cadence: 'every 6h', cost: 'low', lean: false, on: true, feeds: 'forecast-accuracy / honest-policy ledger' },
  { id: 'tradeLogs', where: 'server', label: 'Paper trade-log accumulators (range-line, OI, confluence, vol-v2)',
    cadence: '4 jobs, each every 10 min', cost: 'low', lean: false, on: true,
    feeds: 'bot-audit.html / performance.html trade history for the paper bots',
    note: 'Off ⇒ those bots keep trading but their closed trades stop being recorded. Losing the record is not recoverable after the fact.' },

  // ── Research / shadow systems ────────────────────────────────────────────
  { id: 'sessionResearchLive', where: 'server', label: 'SessionResearch live refit',
    cadence: 'hourly, 26 python spawns per tick + export', cost: 'high', lean: false, on: true,
    feeds: '/api/session-research/summary → today.html panel',
    note: 'Spawns `python -m SessionResearch.predict_today` once per pair, serially, every hour.' },
  { id: 'sessionResearchFull', where: 'server', label: 'SessionResearch full study (all nulls)',
    cadence: 'daily, 26 × run_study + predict + report', cost: 'high', lean: false, on: true,
    feeds: 'the same today.html panel, plus the per-pair report HTML',
    note: 'The heaviest single scheduled job in the service: each run_study is allowed up to 10 minutes of CPU and there are 26 of them. The 10-year findings underneath do not move day to day — this is the strongest candidate for a weekly (or manual) cadence rather than daily.' },
  { id: 'nasdaqMacroLead', where: 'server', label: 'Nasdaq macro-lead study',
    cadence: 'every 4h (NASDAQ_MACRO_LEAD_INTERVAL_SECONDS)', cost: 'med', lean: false, on: true,
    feeds: 'nasdaq-macro-lead.html — self-described RESEARCH TOOL, NOT A TRADING BOT' },
  { id: 'regimeStudy', where: 'server', label: 'Macro-regime FX study rebuild',
    cadence: 'daily', cost: 'med', lean: false, on: true,
    feeds: '/api/macro-regime-fx — the code itself calls this "a cheap keep-warm rather than a schedule anything depends on"' },
  { id: 'corrHistory', where: 'server', label: 'Correlation history build',
    cadence: 'every 6h, ~3 min per build (5y H4 for all pairs)', cost: 'high', lean: false, on: true,
    feeds: 'correlations.html, hedge signals, beta estimates — hedgeSignals/betaEstimates need this file to exist' },
  { id: 'betaEstimates', where: 'server', label: 'Beta estimation',
    cadence: 'every 2h', cost: 'med', lean: false, on: true,
    feeds: 'diversification / hedge sizing; appends to bot/data/beta_history.jsonl (unrotated — see INFRASTRUCTURE_COST_ANALYSIS §4)' },
  { id: 'hedgeSignals', where: 'server', label: 'Hedge signal scanner (v1)',
    cadence: 'every 15 min', cost: 'med', lean: false, on: true, feeds: 'hedge-signals.html, HedgeBot' },
  { id: 'hedgeSignalsV2', where: 'server', label: 'Hedge signal scanner (v2)',
    cadence: 'hourly', cost: 'med', lean: false, on: true, feeds: 'hedge-signals-v2.html' },
  { id: 'cogShadow', where: 'server', label: 'COG replication shadow run',
    cadence: '3 gates/weekday (60s clock)', cost: 'low', lean: false, on: true,
    feeds: 'Telegram shadow calls — explicitly "Shadow only - no orders placed"' },
  { id: 'mveLog', where: 'server', label: 'Market-valuation-engine logger',
    cadence: 'every VM_LOG_MIN (15 min default)', legacyEnv: ['VM_LOG_ENABLED'], cost: 'med', lean: false, on: true,
    feeds: 'mve.html forward log' },
  { id: 'mveHeartbeat', where: 'server', label: 'MVE daily Telegram heartbeat',
    cadence: '60s clock, fires once/day', legacyEnv: ['VM_HEARTBEAT'], cost: 'low', lean: false, on: true,
    feeds: 'Telegram heartbeat only' },
  { id: 'coneForward', where: 'server', label: 'Analog-cone forward record',
    cadence: 'every 30 min', legacyEnv: ['CONE_FWD_AUTO'], cost: 'low', lean: false, on: true,
    feeds: 'analog cone forward-track stats' },
  { id: 'surpriseStore', where: 'server', label: 'Economic-surprise store refresh',
    cadence: 'hourly', cost: 'low', lean: false, on: true, feeds: 'surprise index pages, TDE macro context' },
  { id: 'surpriseAlerts', where: 'server', label: 'Surprise alert scan',
    cadence: 'every 20 min', legacyEnv: ['SURPRISE_ALERT_AUTO'], cost: 'low', lean: false, on: true,
    feeds: 'Telegram surprise alerts' },

  // ── Paper-bot plan producers ─────────────────────────────────────────────
  { id: 'volatilityV2Plan', where: 'server', label: 'Vote Atlas (volatility v2) plan producer',
    cadence: 'every 45s', legacyEnv: ['VOLATILITY_V2_PLAN_REFRESH'], cost: 'high', lean: false, on: true,
    feeds: 'KV plan read by volatility_bot_v2 — 80 wake-ups/hour against the live ladder cache' },
  { id: 'fibAtlasPlan', where: 'server', label: 'Fib Atlas plan producer',
    cadence: 'every 45s', legacyEnv: ['FIB_ATLAS_PLAN_REFRESH'], cost: 'high', lean: false, on: true,
    feeds: 'KV plan read by fib_atlas_bot' },
  { id: 'atlasSnapshots', where: 'server', label: 'Level/Fib Atlas live-cache R2 snapshots',
    cadence: '3 jobs, each every 6h + a stale-only pass 5 min after boot (was 15 min: ~90 GB/day of egress, 2026-09-17)', cost: 'low', lean: false, on: true,
    feeds: 'Nothing reads these directly — they exist so a Railway restart gap-fills instead of paying a full multi-year parquet cold start. Switching them off makes every redeploy much more expensive, not less.' },
  { id: 'spreadProfile', where: 'server', label: 'Measured spread per pair per UTC hour (motif spread-gate evidence)',
    cadence: 'every 10 min, one OANDA pricing call for 26 pairs', cost: 'low', lean: true, on: true,
    feeds: '/api/spread-profile. The motif strategy has a 20-pip stop, which makes its 2.0p spread gate the biggest lever in its pair universe, and the gate rests on an estimate table -- this is the measurement that table gets replaced with.' },
  { id: 'oiBot', where: 'server', label: 'OI gamma bot support (zones, basis, history, calibration)',
    cadence: '5 jobs: 10 min ×2, 15 min, 30 min, 6h', cost: 'med', lean: false, on: true,
    feeds: 'oi-dashboard.html, oi_bot zones//basis KV' },
  { id: 'rangeLineConfluence', where: 'server', label: 'Range-line daily confluence build',
    cadence: '60s clock, fires once/day at 06:00 London', cost: 'low', lean: false, on: true,
    feeds: 'range_line_bot confluence gate' },
  { id: 'tde', where: 'server', label: 'Trade Decision Engine (tick, shadow book, daily backfill)',
    cadence: 'tick every TDE_REFRESH_MIN (5 min), shadow every 7 min, backfill daily', cost: 'high', lean: false, on: true,
    feeds: 'trade-decision-engine.html, upcoming-trades.html, TDE shadow book' },
  { id: 'yieldSpread', where: 'server', label: 'Yield-spread daily plan',
    cadence: '5 min clock, produces one plan/day', cost: 'low', lean: false, on: true, feeds: 'yield-spread.html, YieldSpreadBot' },
  { id: 'volForecastScheduler', where: 'server', label: 'Vol & range forecast scheduler',
    cadence: 'daily 22:00 UTC (+ stale check on boot)', cost: 'med', lean: true, on: true,
    feeds: 'vol-forecast*.html, the forecast book, the volatility bot plan' },
  { id: 'volatilityPlan', where: 'server', label: 'Volatility bot daily plan',
    cadence: 'daily 00:05 Europe/London', cost: 'med', lean: true, on: true, feeds: 'KV plan read by volatility_bot' },
  { id: 'volDataDaily', where: 'server', label: 'Vol hit-rates / event-impact / session-stats refresh',
    cadence: '5 min clock, fires in the 22:30–22:45 UTC window on weekdays', cost: 'med', lean: false, on: true,
    feeds: 'vol_hit_rates + session_stats KV for the forecast pages' },
  { id: 'qmrMonitors', where: 'server', label: 'Index QMR live monitors (NQ/SPX/DOW/DAX)',
    cadence: '60s clock, gate checks at fixed times', cost: 'low', lean: false, on: true,
    feeds: 'Telegram QMR gate alerts + *_qmr_status KV' },

  // ── Supervised bot processes (start.sh) ──────────────────────────────────
  // Each of these is a whole OS process held up by start.sh's restart_bot
  // supervisor. Turning one off removes the process entirely.
  { id: 'botRegimeV2', where: 'start.sh', label: 'RegimeV2/regime_bot_v2.py',
    cadence: 'continuous', cost: 'high', lean: true, on: true, feeds: 'LIVE bot — regime_bot_v2_status' },
  { id: 'botLevel', where: 'start.sh', label: 'bot/main.py (MacroFX V1)',
    cadence: 'continuous', cost: 'high', lean: true, on: true, feeds: 'LIVE bot — bot_status' },
  { id: 'botGold', where: 'start.sh', label: 'Gold/main.py',
    cadence: 'continuous', cost: 'high', lean: true, on: true, feeds: 'LIVE bot — gold_bot_status' },
  { id: 'botPatternLive', where: 'start.sh', label: 'PatternBot/pattern_live_bot.mjs',
    cadence: 'continuous', cost: 'med', lean: false, on: true, feeds: 'pattern-lab live signals' },
  { id: 'botLevelTouch', where: 'start.sh', label: 'levelEngine/live_watch.py',
    cadence: 'continuous', cost: 'med', lean: false, on: true, feeds: 'level-touch telemetry' },
  { id: 'botAnalogPaper', where: 'start.sh', label: 'AnalogML paper_track loop',
    cadence: 'hourly scan (PAPER_TRACK_INTERVAL_SECONDS)', cost: 'med', lean: false, on: true,
    feeds: 'AnalogML paper track log / analogml panels' },
  { id: 'botAnalogMotif', where: 'start.sh', label: 'AnalogML motif_track loop',
    cadence: 'hourly scan (MOTIF_TRACK_INTERVAL_SECONDS)', cost: 'med', lean: false, on: true,
    feeds: 'Telegram motif alerts + the k-NN log. Its own loop script notes the signal is "no longer surfaced live on the dashboard".' },
  { id: 'botAnalogNearing', where: 'start.sh', label: 'AnalogML motif_nearing_watch',
    cadence: 'continuous', cost: 'med', lean: false, on: true, feeds: 'Telegram "nearing" alerts' },
];

const BY_ID = new Map(SERVICES.map(s => [s.id, s]));

/** `hmm5mV2` → `SVC_HMM5M_V2`. Exported so start.sh and the docs agree with the code. */
export function envNameFor(id) {
  return 'SVC_' + String(id).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
}

for (const s of SERVICES) s.env = envNameFor(s.id);

/**
 * Resolve one service's on/off state.
 * @returns {{enabled: boolean, source: string}} source names what decided it.
 */
export function resolveService(id, env = process.env) {
  const svc = BY_ID.get(id);
  if (!svc) throw new Error(`serviceFlags: unknown service id "${id}" — add it to SERVICES first`);

  const own = parseBool(env[svc.env]);
  if (own !== null) return { enabled: own, source: svc.env };

  for (const legacy of svc.legacyEnv ?? []) {
    const v = parseBool(env[legacy]);
    if (v !== null) return { enabled: v, source: legacy };
  }

  if (parseList(env.SERVICES_OFF).includes(id)) return { enabled: false, source: 'SERVICES_OFF' };
  if (parseList(env.SERVICES_ON).includes(id))  return { enabled: true,  source: 'SERVICES_ON' };

  const profile = String(env.SERVICE_PROFILE ?? '').trim().toLowerCase();
  if (profile === 'lean') return { enabled: svc.on !== false && svc.lean === true, source: 'SERVICE_PROFILE=lean' };

  return { enabled: svc.on !== false, source: 'default' };
}

/** Convenience boolean. */
export function serviceEnabled(id, env = process.env) {
  return resolveService(id, env).enabled;
}

/** Every service with its resolved state — what `/api/services` and the boot log print. */
export function servicesSnapshot(env = process.env) {
  return SERVICES.map(s => {
    const r = resolveService(s.id, env);
    return {
      id: s.id, env: s.env, legacyEnv: s.legacyEnv ?? [], where: s.where, label: s.label,
      cadence: s.cadence, cost: s.cost, lean: s.lean === true, defaultOn: s.on !== false,
      feeds: s.feeds, note: s.note ?? null, enabled: r.enabled, decidedBy: r.source,
    };
  });
}

export function getService(id) { return BY_ID.get(id) ?? null; }
