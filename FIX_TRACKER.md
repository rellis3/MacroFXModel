# Fix Tracker — education-review action items

Source: `EDUCATION_SYSTEMS_REVIEW.md` (merged PR #834). Every implementable
suggestion from the review, ticked off as completed. Research items and
things requiring owner decisions are marked as such. Updated by Claude as
batches land; each batch = one set of commits on the review branch.

Legend: `[x]` done · `[ ]` open · `(owner)` needs an owner decision first ·
`(research)` harness work, not a code fix

---

## Batch 1 — acute correctness (small surgical diffs)

- [x] **backtestSystem**: wire the kill switch — `kill.record(pnl_r)` at trade close (loss limits currently inert)
- [x] **Regime V7**: slope window 8 → `_linreg_n(pair)` (40–60) to match the validated backtest
- [x] **Regime V7**: `entry_conf` > `conf_floor` + same quantity both sides (kills spread-burning churn)
- [x] **Regime V7**: sync the 7 dead-code fallback defaults to `DEFAULT_CFG`
- [x] **Volatility bot**: book-variant EOD close at session end (book prices unresolved touches at window close)
- [x] **Volatility bot**: burn bucket-None touches instead of firing them late
- [x] **Volatility bot**: fix `ride_trail_stop` docstring (falsely claims parity with `rangeline.chandelier_stop`); note both bricks in `LEGO_MODULES.md`
- [x] **GoldV2**: σ-forecast range-budget anchor → London midnight (currently UTC midnight, 1h BST drift)
- [x] **GoldV2**: staleness check on the `ai_goldmodel` macro gate (~12h cutoff)
- [x] **Telegram V2**: fix "triple-barrier" label → chandelier-trail (`telegram-v2.html`)

## Batch 2 — ConfluenceBot FX-scale repair

- [x] FX-scale smoke test (synthetic EUR/USD bars; assert pip-scale zones, unique zone IDs) — detector first
- [x] Thread pip/digits through `level_matrix.py` (leg rounding, pad floor, zone/leg ID collisions)
- [x] Fix `exits.py` obstacle-merge tolerance (1.5 price units → pip-scaled)
- [x] Fix `session_engine.py` pivot/VWAP 2-dp rounding
- [x] Fix `trendline_engine.py` dedup tolerance
- [x] Guard the paper→live flip (require `--live` AND KV `paper_mode:false`)

## Batch 3 — QMR live/backtest alignment

- [x] Align overnight window (21:00 vs 20:00) and min-bars (4 vs 3) between engine and live monitor
- [x] Align gate-bar selection (backtest reads one hour later data than live at both gates)
- [x] DST-aware gate times + correct ET labels
- [x] Default round-trip cost + stop slippage inside `_computeNqQmr` (headline stats after-cost)
- [x] Validation status stamped on entry alerts ("OOS … after-cost over N trades" / "UNVALIDATED")
- [x] System-4 chop filter: `sessionBars` includes the entry bar (`h <= entryHour`) — one hour of lookahead in the S4 filter path (found during Batch 3; same class as the gate-bar fix)
- [x] (owner DECIDED 2026-07-12) SPX/DOW/DAX clones: KEEP alerting, stamped UNVALIDATED, judged by the live forward record (below). Localized sessions/news calendars deferred unless the forward record earns them
- [x] QMR forward-validation tracker (owner request): entry alert snapshots entry price; EOD resolves the day with the engine's exact walk (shared function, after-cost) into the audit log; page renders the per-instrument forward record — ALL FOUR indices
- [ ] (owner) Re-derive live defaults from walk-forward retrain instead of full-sample grid

## Batch 4 — costs in every paper path (the big one)

- [x] Fix PaperBroker (`pylego/broker/paper.py`): price feed wiring, money-unit P&L via pip value, balance updates
- [x] GoldV2 + Gold V1: paper fills at bid/ask, round-trip spread in journal PnL
- [x] Regime V7: charge 1.2bp round-trip in paper audit; paper balance moves so RiskGuard rehearses
- [x] ConfluenceBot: spread + stop slippage + swap on overnight holds in paper P&L
- [x] Vol + range-line bots: per-trade realized entry-slip logging (fill − modeled level, book units)
- [x] macrofx1 `bot/backtest.py`: per-pair spread + slippage; OOS-only reporting

- [x] Range-line bot paper mode: ladders need a session BAR feed (quote feed fixes prices/trailing only — found during Batch 4)

## Batch 5 — sizing & risk integrity

- [x] macrofx1: live pip values (MT5 tick value → quote-computed → static+warn) — ONE helper `bot/utils/pip_values.py`, imported by `sl_tp_engine.py` + `hedge_bot.py` (their `_PIP_VALUES` dicts deleted)
- [x] backtestSystem: live tick-value sizing in `risk.py` (same shared helper; `main.py` passes the live price)
- [x] Vol + range-line bots: wire `pylego.risk_guard.RiskGuard` (ddlimit 3% / monthlydd 5% defaults in both configs; blocks NEW entries only; balance fed per tick; block logged once per state change via `risk_guard.log_block_transition`)
- [x] Vol + range-line bots: size off the spread-adjusted EXPECTED fill (`pylego.costs.expected_fill` — a market order can't be sized after it fills); ride/chandelier `entry`/`peak` seeded from the REALIZED fill
- [x] Range-line bot: per-class spread caps — `_max_spread` extracted to `pylego.costs.max_spread`, imported by both bots; range default `max_spread_pips` 1e9 → per-class caps
- [x] macrofx1: force-unlock keeps `day_start_bal` (no DD-baseline reset; same fix in `pylego.risk_guard.force_unlock`)
- [x] macrofx1: cap `vol_low_mult` at 1.0 default (explicit >1.0 config honoured with an owner-opt-in warning)
- [x] macrofx1: portfolio-level USD-exposure cap (`max_usd_exposure_pct`, default 2.0%; `bot/utils/exposure.py` netting — long EURUSD + short USDJPY are additive short-USD; never blocks a reducer)
- [x] ConfluenceBot: currency-exposure netting in `global_can_open` (`max_currency_risk_pct`, default 1.5%; label caps kept)

## Batch 6 — signal hygiene & guards

- [x] backtestSystem: `flipOnSL` default → False (explicit `true` honoured with an owner-opt-in startup warning — no validation evidence)
- [x] backtestSystem: confirm count one-vote-per-family — `FEATURE_FAMILY` map in `engine.py`: trend (MACD/HTF-EMA/ADX/TWAP-slope/Ichimoku), divergence (RSI), structure (OB/FVG/wick/CHoCH-BOS), other (range-pos/weekly-pivot/Hurst); gate uses `family_confirm_count`, weighted conviction + per-feature journal unchanged (`test_direction.py`)
- [x] ConfluenceBot: collapse correlated score credits — ONE prior-session-structure credit (daily open / prev-day H/L / session H/L / pivot, max-once) + ONE volume-profile credit (POC/HVN/VAH/VAL max-once; age-weighted nPOC stays separate); gold regression capture unmoved (it pins structural fields only — scores were never in the capture)
- [x] macrofx1: exclude direction-inheriting modules (`vol_gate`, `regime_confidence`) from `min_agree` (they inherit direction from macro_regime/ctx — counting them double-counts one opinion; score/size multipliers unchanged)
- [x] macrofx1: COT filter per DF-01 — extremes-contrarian rewrite (uses worker `specPct` percentile vs ~3y history + `specZ` fallback; >90th/<10th = crowded → veto same-direction entries, contrarian bump otherwise; >10-day report staleness → NEUTRAL with warning; never votes toward `min_agree`). NOTE: snapshot carries only current-week OI, so the OI-normalisation step of DF-01 cannot be computed bot-side — documented in the module, not faked
- [x] macrofx1: DST-correct London session hours (`config_helpers.py` — Europe/London + America/New_York via zoneinfo, manual last-Sunday / nth-Sunday fallback rules mirroring `volatility_bot.engine`)
- [x] Range-line bot: startup DST sanity check (`check_plan_boundary_dst` — plan `boundaryHour` vs current London-midnight UTC hour on load + every plan refresh; LOUD warning only, never auto-shifts the frozen policy)
- [x] Gold + V7: event blackout — V7 gates entries on KV `event_windows_v1` (pylego.events, same source as the vol bot) with `fomc_window_hours` FOMC-calendar fallback for USD pairs when the feed is stale; GoldV2 blocks new arms/entries within ±`event_blackout_min` (default 30) of high-impact USD events, fail-open with once-per-state warning. **Gold V1 deliberately skipped** — frozen incumbent mid-A/B vs V2; do not touch its entry path until the A/B resolves
- [x] Gold/Confluence: robust-scale MF/VWAP oscillators — window-max→100 replaced by median|v|→30 (MAD about zero; survives the constant one-sided fuel-veto window where de-meaned std/MAD die, and one news bar no longer compresses the rest below threshold); scale factor chosen so all existing smoke fixtures classify identically; both module copies kept byte-identical
- [x] Gold V1: optimiser dry-run by default (`--apply` required to write KV); config push gated on ≥30 closed trades + chronological 60/40 IS/OOS split (combo chosen on IS, must be ≥0 mean R OOS); looser-than-default combos additionally need ≥30 OOS trades; grid tie-breaks now prefer the TIGHTER combo (`test_optimiser.py`)
- [ ] (owner) Range-line bot: flip defaults to the OOS-best book (`confluence_min: 2`, held-position model), or run gate-off as an explicit A/B — which?

## Batch 7 — alerting honesty (Telegram V2)

- [x] Suppress ledger per-grade conclusions below n=30 (`entryLedgerV2.ledgerStats` flags `insufficient` + `minConclusionN`; `telegram-v2.html` renders "insufficient sample (n=X)" per grade and labels the aggregate with its n — raw numbers stay in the payload, suppression is display-layer only)
- [x] Absolute expectancy floor on alerting (`alertV2Core.selectAlerts`: `minExpectancyCostMult` default 1.0 × the pair's `PAIR_COST_PCT` round-trip cost — the same after-cost basis the policy charged, resolved via the instrument registry; fails closed on missing expectancy; grades stay relative for display, an ALERT must clear its own cost in absolute terms)
- [x] Significance gate in `buildPolicy` (`tStat` param: chosen side's mean/SE over per-touch after-cost PnLs must clear it; default 0 = exact prior behaviour for backtest/analyser callers; `levelsV2Learn.learnAndFreeze` alone defaults 1.5 — a deliberately mild noise filter, NOT HLZ |t|>3 discovery-grade; skips get `reason:'notSignificant'`; the frozen live policy only changes on the next refit)
- [x] Chance-baseline on the OOS card (`levelsV2Learn.chanceBaseline`, attached to the frozen artifact: C cells tested, gate, pNull ≈ P(Z>tStat) one-sided — a LOWER bound given the fade/follow best-of-two pick — expected false-positive count; `telegram-v2.html renderPolicy` renders the one-liner whenever the policy summary carries it)
- [ ] (server-owner) Pass `frozen.chanceBaseline` through `/api/levels-v2/entries`'s policy summary + the learn `done` status — the page already renders it defensively; the route currently whitelists only builtAt/nCells/coverage/instruments/bands
- [ ] (server-owner) Accept `minExpectancyCostMult` in the `POST /api/levels-v2/alert-config` whitelist — until then the 1.0 default applies via `selectAlerts`' cfg merge and can't be tuned from the page (deliberately no page input: a saved value the server strips would silently revert)

## Evidence & evaluation (docs/scripts, not bot code)

- [x] Grade backtestSystem's existing ~200-trade KV journal (QM L1.7 metrics table, by conviction/feature family)
- [x] V7 paper-record scoreboard per cfg_hash (expectancy after costs, PF, max consecutive losses, DD; ≥30-OOS bar)
- [x] Pre-register fleet evaluations (ConfluenceBot 17 instruments, GoldV2-vs-V1, vol/range A/Bs): pass bar + chance baseline written before the record accrues
- [x] MT5 `catch_up` bar-window check vs OANDA extremes for a UTC+3 broker day (vol bot)

## Research candidates (harness first, never live-first — all pre-registered)

- [ ] (research) Range-budget-consumed as a policy-cell condition in the per-line analyser
- [ ] (research) Vol-regime (ATR-percentile) conditioning of fades; high-vol risk reduction for Gold/Confluence
- [ ] (research) COT six-step recipe through the harness for FX pairs
- [ ] (research) CME OI walls/max-pain into GoldV2 obstacle map + zone scoring
- [ ] (research) Verify "beats GARCH/Parkinson/Harvey" via OOS QLIKE on `vol-forecast-bench.html`
