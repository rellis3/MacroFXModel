# COG code map

## Root pages

| Page | What | API |
|---|---|---|
| `cog-reverse-engineer.html` | constants + daily-anchor test (London 00:00 / London 23:00 / NY 17:00) | `/api/cog-reverse-engineer` |
| `cog-fade.html` | OOS fade at his reproduced line | `/api/cog-fade/run` |
| `cog-level-poc.html` | paired COG-vs-ours level reversion | `/api/cog-level-poc` |
| `cog-replay.html` | reference-data replay | served by `cog-standalone/` |
| `cog-signal-log.html` | manual log of his four messages, resolved on OANDA M5 with costs | `/api/cog-signals` (+ `/resolve`), KV `cog_signal_log` |
| `cog-v2-engine.html` | persistent state machine | `/api/cog-v2/*` |
| `feed.html` | "The Feed" (2026-10-25): his one-feed promo rebuilt; rates + VIX term from Surface Lab, weekly liquidity table, five-leg cross-asset correlations, sixteen-commodity range map, each with its verdict | `/api/feed` (`js/feedRoutes.js`, maths `js/feedCore.js`, KV `feed_v1`) |

`server.js` also has `/api/cog-threshold/*`, `/api/cog-v3/*` and `/api/cog-rep/shadow` (KV `cog_shadow_log`, panel
in `bot-config.html` on the nqqmr tab). It imports `cog-replication/engine/cogShadow.js` and `oiSignalCheck.js`.

## cog-standalone/

An isolated Express service on Railway (root dir `cog-standalone`, `railway.json`). It serves `cog-replay.html` plus
`/api/vol-forecast/reference-dump`, GET/POST `/api/vol-forecast/reference/:date` and `/api/ohlc-range`, using the
shared Cloudflare KV and OANDA. Env var names: `OANDA_KEY`, `OANDA_ENV`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`,
`CF_KV_NAMESPACE_ID`.

## JS bricks (`js/cog*.js`, about 30 files)

Bands, ReverseEngineer, FadeEngine, LevelPoc, Liquidity/1B/Risk/Direction/Threshold1 gates, State engine and store,
V2/V3, Explainability, TradeJournal, Exit/Execution.

Tests: `cogBands.test.mjs`, `cogFadeEngine.test.mjs`, `cogLevelPoc.test.mjs`, `cogReverseEngineer.test.mjs`,
`cogExport.contract.test.mjs` (run with `node js/<file>`).

## Python

- `scripts/cog_setups/{build,check_rebuild,score}.py` → `analysis/output/cog_setups/`. Takes a reference-dump JSON
  and uses `volatilityExhaustion/vol_exhaustion_lib`. Run from the repo root.
- `scripts/cog_yield_dir/{build,score}.py` → `analysis/output/cog_yield_dir/` (FRED cache in `fred/`).
- `scripts/rate_diff_nq/cog_*.py` (blue-line reconstruction), `scripts/rates_residual/cog_days.py`.
- `cog-replication/test_g1_direction.py` → `G1_RESULTS.md`, `g1_results.json`.

## Other

- `pine/cog_volatility_v3_sessions.pine`
- `levelEngine/*_m1_cog_base_rate.json`
- `archive/COG_oi_guide.html`
- OI archive: `OI Data/NAS100_USD.csv` (1,521 days; DECISIONS 2026-09-24)
- `SignalCopier/` (2026-10-30): copies the **ColezTrades | Private → Signals** Telegram topic. That's his multi-asset
  swing + day-trade signals (market/limit, SL/TP, cancel-at/close-at), a separate feed from the 4-stage NQ alert
  system. `signal_copier.py` is a bot like the others: bot-config.html tab 📡 Signal Copier, KV `signal_copier_*`,
  magic 20261030, paper by default. `outcome.py` scores every signal on M1 bars into `signal_copier_signals`, exported
  as the COG import template. Those outcomes are his signals as a follower gets them (entry at receipt, one spread),
  not his own fills.
