# Nav review and restructure — 2026-11-15

Owner's request: review which pages are dead, restructure the command strip (`js/commandHub.js`) into Live / Vol (vol, FX,
gold) / Macro / Research / Learn / Null / Retired, and clear out what is known to be unused.

## What was checked, and how (coverage)

- **All 263 top-level `.html` pages were listed by script**, not sampled. For each one: its old tab, last commit date (full
  history, unshallowed), how many other pages/JS files link to it, its `<title>` and opening text, and a count of verdict words.
  Every page appears in exactly one row below; `index.html` (the site root) is the only page with no tab.
- **Verdicts:** most pages compute their numbers live and do not state a verdict in their HTML, so "Null" was decided from
  (a) the page's own label or text saying null / falsified, or (b) a clear match to a banked Evidence Book row
  (`js/deskEvidence.js`), named in the Note column. **Where no verdict could be found, the page went to Research, not Null.**
  So Null is "known failed", not "probably failed".
- **No usage data exists.** The server keeps no page-hit log, and favourites live only in your browser. So Live was chosen from
  recency and what the current desk is built around. **Live is a proposal: move pages in or out with ✏️ Edit Nav.**
- Pages marked **check** in the Note column are my best guess that a newer page has replaced them, without proof. They were
  left in a working tab. Say the word and they move to Retired.

## The new strip

| Tab | Pages | What goes there |
|---|---|---|
| Live | 14 | The pages used every day (was 118 items) |
| Vol · FX · Gold | 31 | Vol forecast tools, options/OI, FX and gold |
| Macro | 39 | Rates, central banks, data releases, regime |
| Bots | 25 | Bot control, audit, performance, journals |
| Research | 78 | Research hub, open studies, underpowered results, backtests with no banked verdict |
| Learn | 8 | Theory Lab, library, COG hub, explainers |
| ∅ Null | 31 | Tested and failed: null, falsified or no edge |
| 🗃 Retired | 38 | Superseded by a newer page or version, moved, or abandoned |

The old Equity, Gold, Systems, FX BT and WIP tabs are folded in. All 28 pages that had no shortcut now have one, and the
`js/commandHub.test.mjs` orphan list is down to `index.html`. Two new tests: the eight tabs in order, and no page in two tabs.

**Your saved layout:** a layout saved with ✏️ Edit Nav before today is ignored once (otherwise the old 118-item Live tab comes
straight back). Your next Edit Nav save is kept as before. Favourites (★) are unaffected.

## Deleted

Eight pages that nothing linked to except old docs and the strip itself (stubs, orphans, a void backtest, an old copy),
plus seven root scratch files with no references: `_controlled_out.log`, `_severity_out.log`, `_indices_pilot.log`,
`_idx_{asia,monday}_{job,retry}.json`, `scratch_capacity_test.mjs`, `_atlas_run_mod.mjs`. Git history keeps all of them.
`tools-preview.mjs` was looked at and kept (a working local-preview tool). Old entries for the deleted pages were removed from
the Site Map (`js/siteApiMap.js`); mentions in older Markdown notes were left as history.

## Not done yet (next steps)

1. **The "check" pages** — your call: `vol-forecast-v2`, `oi-dashboard` (v1), `levels` (Entry Lens), `terminal`, `desk`, `oi-zones`.
2. **`server.js` (about 48,000 lines, 376 API route groups).** It serves routes for pages now in Null/Retired (for example
   `nq-qmr` 9 routes, `zscore-backtest` 7, `mve-book` 7, `global-liquidity` 6, `analogml` 5, `vix-vol-carry-backtest` 4).
   Proposed order: (a) list every route group with the pages that call it, by script; (b) remove only groups called by
   nothing live; (c) move the remaining groups into `routes/<area>.js` files one area at a time, each step with the tests run.
   Not started: it needs its own review because bots on your laptop may call routes that no page does.
3. **The theory/hypothesis catalogue** across library, education, theory-lab and cog (585 files, about 3.6M words). Not
   started in this change. Plan: a script writes the full file list to a checklist first, then batches are worked through and
   ticked with the file they came from, so progress is visible and nothing is claimed that was not read.

## Every page

### Live (14)

| Page | Was in | Last changed | Note |
|---|---|---|---|
| `desk-terminal.html` 🖥 Desk Terminal | live | 2026-11-14 | main desk screen; most active page (updated 2026-11-14) |
| `today.html` ☀️ Daily Brief | live | 2026-11-02 | daily brief; 102 pages link to it |
| `state.html` 🧭 Market State | live | 2026-11-01 | market state engine v3 |
| `atlas.html` 🌐 Desk Atlas (v2 preview) | live | 2026-11-09 | desk atlas |
| `vol-forecast-v3.html` 📐 Vol Forecast v3 | live | 2026-10-27 | current vol forecast (v1 retired, v2 older) |
| `live-range.html` ⏱ Live Range | live | 2026-10-07 | hourly range re-forecast (validated: intraday-range) |
| `daily-plan.html` 🗒 Daily Plan | live | 2026-10-07 | chosen forecast, room left, stop and size |
| `forecaster.html` 📋 Forecaster Sheet | live | 2026-10-07 | forecaster sheet (built layers) |
| `oi-dashboard-v2.html` ◆ OI Lab (v2) | live | 2026-11-11 | OI Lab, updated 2026-11-11 |
| `swing-map.html` 🗺 Swing Map (paths, ranges, option pull) | live | 2026-11-07 | paths, ranges, option pull; updated 2026-11-07 |
| `release-reaction.html` ⏱ Release reaction (live) | live | 2026-10-28 | live release reaction |
| `evidence.html` 📗 Evidence Book | live | 2026-11-13 | Evidence Book |
| `desk-office.html` 🗂 Desk Office (internal analysis) | live | 2026-11-12 | internal analysis |
| `desk-run.html` 🧠 Desk Run (analysts → newsletter) | live | 2026-11-05 | analysts → newsletter |

### Vol · FX · Gold (31)

| Page | Was in | Last changed | Note |
|---|---|---|---|
| `vol-forecast-v2.html` 📐 Vol Forecast v2 (older) | live | 2026-09-28 | still has tabs v3 lacks? superseded by v3 — check |
| `har-shadow.html` 🧪 HAR Shadow Ladder | live | 2026-10-06 | HAR shadow ladder forward test |
| `live-range-shadow.html` ⏱ Live Range Shadow | (no shortcut) | 2026-10-08 | was orphan; read-only shadow of Live Range |
| `ips-shadow.html` 🧪 Intraday Probability Shadow | (no shortcut) | 2026-10-10 | was orphan; registered forward test |
| `forecast-path.html` 📐 Forecast Path (Cone & Replay) | live | 2026-11-06 | cone and replay |
| `expected-moves.html` 📊 Expected Moves (All Pairs) | live | 2026-08-05 | all pairs |
| `forecast-blend.html` 🔀 Forecast Blend (Model vs Analog) | live | 2026-08-03 | model vs analog |
| `jump-diffusion.html` ⚡ Jump vs Diffusion | (no shortcut) | 2026-09-13 | was orphan; context (jump-diffusion) |
| `volatility-intelligence.html` 🧠 Volatility Intelligence | (no shortcut) | 2026-09-13 | was orphan |
| `exhaustion-surface.html` 🧊 Exhaustion Surface | (no shortcut) | 2026-10-03 | was orphan |
| `daily-read.html` 📰 Daily Read | live | 2026-10-03 | lines tagged vs options |
| `surface-lab.html` 🧊 Surface Lab | live | 2026-10-26 |  |
| `vix-calculus.html` ∫ VIX calculus suite | live | 2026-10-26 | VIX suite (several validated rows) |
| `footprint.html` ▦ Volume footprint | live | 2026-11-07 | volume footprint |
| `oi-dashboard.html` ◆ OI Analytics (v1) | live | 2026-10-20 | older than OI Lab v2 — check |
| `oi-level-lab.html` ◆ OI Level Lab | (no shortcut) | 2026-10-29 | was orphan |
| `oi-all-lines.html` ◆ Every OI line (all expiries) | (no shortcut) | 2026-10-30 | was orphan; one-off 2026-10-30 |
| `level-scenarios.html` 🎯 Level Scenarios | live | 2026-10-11 | reach / which-first shadow |
| `path-map.html` 🗺 Path Map | (no shortcut) | 2026-10-06 | was orphan; forecaster layer 4 |
| `position-sizer.html` ⚖️ Position Sizer | live | 2026-09-28 | vol-based sizing |
| `trade-plan.html` 📐 Trade plan (direction + vol shadow) | live | 2026-11-06 | direction × vol shadow |
| `paper-record.html` 📒 Rich-Vol Break Record | live | 2026-10-28 | rule A paper forward test |
| `forecast-line-backtest.html` 🧪 Forecast Line Backtest | live | 2026-10-19 | locked record of rule A |
| `residual-fx8-forward.html` 🔁 FX8 residual book (forward) | live | 2026-11-12 | forward record |
| `yield-shape-regime.html` 📉 Yield-Shape Regime | live | 2026-10-03 | paper forward test |
| `drift.html` 📈 Drift Anatomy | (no shortcut) | 2026-09-15 | was orphan; FX drift vs carry |
| `rate-matrix.html` 🧮 Rate Matrix | vol | 2026-07-06 | FX rate differentials |
| `analytics-desk.html` 🖥️ Analytics Desk | vol | 2026-07-25 | per-instrument questions (Jul) |
| `levels.html` 🎯 Entry Lens (old) | live | 2026-06-25 | last changed 2026-06-25 — check |
| `gold.html` 🥇 Gold Model | gold,live | 2026-10-26 | gold model |
| `gold-zones.html` 🗺 Gold Zones | gold,live | 2026-08-11 | gold zone verifier |

### Macro (39)

| Page | Was in | Last changed | Note |
|---|---|---|---|
| `rates.html` 📉 Rates & Policy | live | 2026-10-15 | rates & policy |
| `rates.html#rr` 🎚 Rates vs Nasdaq | live | 2026-10-15 |  |
| `fed-path.html` 🏦 Fed Path Odds | (no shortcut) | 2026-10-29 | was orphan |
| `yield-curve.html` 📉 Yield Curve | live | 2026-10-29 |  |
| `real-yield.html` 💰 Real Yield | live | 2026-10-28 |  |
| `cog-chart.html` 📈 Rate legs vs price (chart) | live | 2026-11-11 | rate legs vs price |
| `release-why.html` 🧭 Release why (Layer 2) | live | 2026-10-26 |  |
| `fomc-sentiment.html` 🏛 FOMC Sentiment | live | 2026-10-28 |  |
| `ecb-sentiment.html` 🇪🇺 ECB Sentiment | live | 2026-10-28 |  |
| `boe-sentiment.html` 🇬🇧 BoE Sentiment | live | 2026-10-28 |  |
| `boj-sentiment.html` 🇯🇵 BoJ Sentiment | live | 2026-10-28 |  |
| `rbnz-sentiment.html` 🇳🇿 RBNZ Sentiment | live | 2026-11-07 |  |
| `rba-sentiment.html` 🇦🇺 RBA Sentiment | live | 2026-10-28 |  |
| `boc-sentiment.html` 🇨🇦 BoC Sentiment | live | 2026-10-28 |  |
| `snb-sentiment.html` 🇨🇭 SNB Sentiment | live | 2026-10-28 |  |
| `beige-book.html` 📖 Beige Book | live | 2026-10-28 |  |
| `fiscal-events.html` 🏛 Fiscal Events (Budget / Refunding) | live | 2026-10-28 |  |
| `cpi.html` 📈 CPI / Inflation | live | 2026-10-28 |  |
| `ppi.html` 🏭 PPI | live | 2026-10-28 |  |
| `gdp.html` 📊 GDP / Growth | live | 2026-10-28 |  |
| `ism.html` 🏭 Business Activity | live | 2026-10-28 |  |
| `labor-market.html` 💼 Labor Market | live | 2026-10-28 |  |
| `retail-sales.html` 🛒 Retail Sales | live | 2026-10-28 |  |
| `trade-balance.html` ⚖️ Trade Balance | live | 2026-10-28 |  |
| `consumer-confidence.html` 🙂 Consumer Confidence | live | 2026-10-26 |  |
| `macro-scorecard.html` 🏆 Macro Scorecard | live | 2026-10-28 |  |
| `world-economies.html` 🌍 The Economies | (no shortcut) | 2026-11-02 | was orphan |
| `weekmap.html` 🗺 The Week, Scored | live | 2026-09-21 |  |
| `market-view.html` 🌐 Market View | live | 2026-10-26 |  |
| `regime.html` 🧭 Regime | live | 2026-09-20 | growth × inflation |
| `bank-credit.html` 🏦 Bank credit & funding | live | 2026-10-21 |  |
| `feed.html` 📡 The Feed | live | 2026-10-29 |  |
| `chapters.html` 📖 Chapters | live | 2026-10-26 |  |
| `flow-chain.html` ⛓ Capital-Flow Chain | research | 2026-10-24 | description, not a test |
| `cot-extremes.html` 📋 COT Extremes | research | 2026-10-26 | COT positioning (context; crowding tests mostly null) |
| `event-response.html` 📅 Event Response | research | 2026-10-28 |  |
| `market-review.html` 🌐 Weekly Market Review (40 markets) | research | 2026-10-26 | weekly review, 40 markets |
| `terminal.html` 📈 MacroFX Terminal (old) | (no shortcut) | 2026-09-24 | was orphan; 28 pages link to it; Desk Terminal is newer — check |
| `desk.html` 🖥 The Desk (old) | live | 2026-07-24 | last changed 2026-07-24; Desk Terminal is newer — check |

### Bots (25)

| Page | Was in | Last changed | Note |
|---|---|---|---|
| `bot-config.html` 🤖 Bot Config | live | 2026-11-11 |  |
| `bot-config.html#tab-agents` 🕸 Agents & switches | live | 2026-11-11 |  |
| `bot-config.html#tab-backtest` 🖥 BT Monitor | fx bt | 2026-11-11 |  |
| `bot-audit.html` 📉 Bot Audit (live tearsheet) | live | 2026-10-30 |  |
| `performance.html` 📊 Performance | live | 2026-07-02 |  |
| `journal.html` 📒 Journal | live | 2026-05-16 | last changed 2026-05-16 |
| `giveback.html` 💸 Give-Back (exit quality) | live | 2026-08-03 |  |
| `telegram-v2.html` 📡 Telegram v2 | live | 2026-07-12 |  |
| `system-backtest.html` 📊 System Backtest (every system + post-mortem) | live | 2026-11-04 |  |
| `desk-admin.html` 🔑 Desk Terminal access (what the desk login sees) | live | 2026-11-13 |  |
| `brief-config.html` ⚙ Morning Brief config | (no shortcut) | 2026-07-06 | was orphan |
| `cog-v2-engine.html` ⚙ COG v2 | live | 2026-06-26 |  |
| `cog-signal-log.html` 📝 COG Signal Log | live | 2026-07-28 |  |
| `backtest-viewer.html` ▶ BT Viewer | fx bt | 2026-06-18 |  |
| `range-zones.html` 📊 Range Zones | fx bt | 2026-10-24 |  |
| `range-line-strategy.html` 🎯 Range-Line | fx bt | 2026-10-24 |  |
| `oi-zones.html` 🎯 OI Zones | fx bt | 2026-10-13 | OI bot zones (gamma-regime-trades null — check) |
| `pattern-lab.html` 📐 Pattern Lab (live pattern bot) | (no shortcut) | 2026-08-06 | was orphan |
| `vumanchu-state.html` 🎯 VuManChu State & Forward Validation | live | 2026-08-02 |  |
| `vumanchu-chart.html` 〰️ VuManChu Pane → Image | live | 2026-08-03 |  |
| `forward-track.html` 📡 Forward-Track Fade | live | 2026-07-14 |  |
| `decision-lab.html` 🧰 Decision Lab | live | 2026-10-27 |  |
| `backtest-exit-study.html` 🚪 Backtest Exit Study (TP/trail/time) | live | 2026-07-31 |  |
| `backtest-vmc.html` 🌊 Backtest VMC Test (entry quality) | live | 2026-07-31 |  |
| `regime-viewer.html` 🔍 Regime Viewer | research | 2026-06-06 |  |

### Research (78)

| Page | Was in | Last changed | Note |
|---|---|---|---|
| `research.html` 🧭 Research Hub (drop in, questions, rooms, tests, verdicts) | research | 2026-11-12 |  |
| `roe.html` 🔎 Research Opportunities (scanner questions, concept cards) | research | 2026-11-11 |  |
| `research-log.html` 🗂 Research Log (what's been done) | research | 2026-10-27 |  |
| `bias-evidence.html` 🔬 Bias Evidence (why each verdict holds) | research | 2026-11-15 | added on main while this PR was open; kept in Research next to Research Log |
| `evidence.html?filter=watched` 👁 Setup Watch (watched findings) | learn | 2026-11-13 |  |
| `market-sense.html` 🧪 Market-Sense Studies | research | 2026-09-18 |  |
| `vol-layer-system.html` 🧱 Vol-Layer System (research) | systems | 2026-11-12 |  |
| `forecaster-system.html` 🧱 Forecaster System (layer build) | (no shortcut) | 2026-11-01 | was orphan |
| `portfolio-book.html` 📚 Portfolio Book (5 sleeves) | (no shortcut) | 2026-10-25 | was orphan; context |
| `volatilityExhaustion/analysis-book.html` 🌡 Vol-Exhaustion Book | research | — |  |
| `overnight-hold-real-costs.html` 🌙 Overnight Hold (underpowered) | systems | 2026-11-08 | UNDERPOWERED (overnight-hold-nq/gold) |
| `noise-area-momentum.html` 📶 Noise-area momentum (underpowered) | live | 2026-11-13 | UNDERPOWERED |
| `nq-forecast-target.html` 🎯 NQ forecast target (underpowered) | live | 2026-11-02 | UNDERPOWERED (nq-forecast-target-ev) |
| `multi-spread-sleeve.html` 🎯 Multi-Spread Sleeve | research | 2026-09-20 | context |
| `yield-spread.html` 🎯 Yield-Spread | research | 2026-07-16 | context (yield-spread-sleeve) |
| `diversification.html` 🔗 Book Explorer | research | 2026-10-17 |  |
| `forecast-accuracy.html` 🎯 Forecast Accuracy | live | 2026-08-14 |  |
| `forecast-coverage.html` 📏 Band Coverage | vol | 2026-07-25 |  |
| `forecast-range-timeline.html` 📏 Range Timeline (forecast vs realised) | (no shortcut) | 2026-08-14 | was orphan |
| `vol-forecast-research.html` 🔬 Vol Forecast Research | live | 2026-07-07 |  |
| `vol-research-book.html` 📖 Vol Research Book | live | 2026-07-08 |  |
| `estimator-ab.html` ⚖️ Vol Estimator A/B | live | 2026-07-07 |  |
| `vol-horse-race.html` 🏇 Vol Horse Race | live | 2026-07-14 |  |
| `vol-forecast-bench.html` 📐 σ Benchmark | vol | 2026-08-08 |  |
| `sigma-fade-ab.html` 🔬 σ Fade A/B | live | 2026-07-15 |  |
| `cross-pair-research.html` 🧭 Cross-Pair Research | live | 2026-07-10 |  |
| `forecast-analysis.html` 📊 Level Analyser | vol | 2026-08-25 |  |
| `forecast-refresh.html` ⟳ Data Refresh | vol | 2026-06-27 | admin refresh for Level Analyser |
| `honest-forecast-harness.html` 🔬 Honest Harness | vol | 2026-06-27 |  |
| `forecast-book-report.html` 📄 Book Report | vol | 2026-07-05 |  |
| `forecaster-backtest.html` 📈 Forecaster BT | vol | 2026-08-25 |  |
| `vol-backtest.html` 📊 Vol BT | vol | 2026-06-12 |  |
| `vol-backtest-v2.html` 📊 Vol BT v2 | vol | 2026-06-27 |  |
| `weekly-vol-backtest.html` 📅 Weekly Vol BT | vol | 2026-07-06 |  |
| `rank-ic.html` 🎯 Rank-IC | vol | 2026-07-12 |  |
| `book-stress.html` 🌊 Book Stress | vol | 2026-07-26 |  |
| `trend-v2.html` ⚖️ Trend v2 σ-Sizing A/B | research | 2026-07-17 |  |
| `trend-flip-backtest.html` 🔀 Trend-Flip BT | vol | 2026-07-27 |  |
| `regime-backtest.html` ⚡ Regime BT | fx bt | 2026-08-25 |  |
| `analysis.html` 📊 Pattern Lab | research | 2026-10-02 |  |
| `strategy-lab.html` 🥊 Strategy Lab | fx bt | 2026-07-17 |  |
| `range-level-edge.html` 📐 Range-Level Edge | research | 2026-07-07 |  |
| `touches-backtest.html` 🧬 Touches Backtest | research | 2026-08-14 |  |
| `motif-alert-backtest.html` 👀 Motif Alert BT | research | 2026-09-28 |  |
| `motif-combined-backtest.html` 🧬 Motif Combined BT | (no shortcut) | 2026-08-14 | was orphan |
| `level-atlas-vote-backtest.html` 🗳 Level Atlas Vote Backtest | vol | 2026-08-30 |  |
| `level-atlas-vote-portfolio.html` 🧺 Level Atlas Vote Portfolio | vol | 2026-11-01 |  |
| `level-atlas-vote-portfolio-v2.html` 🧺 Level Atlas Vote Portfolio v2 (HAR) | (no shortcut) | 2026-11-01 | was orphan |
| `level-atlas-hl-signal-portfolio.html` ⏱ HL Delayed-Entry Portfolio (suspect) | vol | 2026-09-09 |  |
| `forecast-replay.html` 📊 Forecast Replay | live | 2026-07-20 |  |
| `cog-replay.html` 📊 COG Replay | live | 2026-07-24 |  |
| `forecast-reversion.html` 📈 Forecast Reversion | live | 2026-08-22 |  |
| `fade-viewer.html` 🔍 Fade Viewer | live | 2026-07-15 |  |
| `reversal-study.html` ↩️ Reversal-Point Research | live | 2026-07-10 |  |
| `reversion-proof.html` 🔬 Reversion Proof | live | 2026-07-11 |  |
| `reversal-fade.html` 🎯 Reversal-Fade Test | live | 2026-07-10 |  |
| `cog-fade.html` 🎯 COG-Fade Test | live | 2026-07-11 |  |
| `cog-level-poc.html` 🎯 COG-Level POC | live | 2026-07-10 |  |
| `cog-reverse-engineer.html` 🔍 COG Reverse-Engineer | live | 2026-07-10 |  |
| `forecast-style-fade.html` 🎯 Forecast-Style Fade | live | 2026-07-14 |  |
| `pooled-fade.html` 📈 Pooled Fade | live | 2026-07-14 |  |
| `fill-realism.html` 🔬 Fill-Realism Ladder | live | 2026-07-11 |  |
| `honest-policy.html` 📉 Honest-Policy Portfolio | live | 2026-07-12 |  |
| `exhaustion-forecast.html` ↩️ Exhaustion Forecast | live | 2026-07-11 |  |
| `price-slowdown-lab.html` 🐢 Price Slowdown Lab | live | 2026-07-23 |  |
| `impulse-range-lab.html` 🧭 Impulse Range Lab | (no shortcut) | 2026-08-23 | was orphan |
| `trade-lab.html` 🧪 Trade Lab (impulse/retracement) | (no shortcut) | 2026-08-24 | was orphan |
| `live-validation.html` ✅ Live Validation Harness | (no shortcut) | 2026-08-17 | was orphan |
| `entry-trigger-lab.html` 🎯 Entry Trigger Lab | wip | 2026-08-22 | was WIP |
| `asia-npoc-confluence.html` 🧭 Asia NPOC Confluence | wip | 2026-08-22 | was WIP |
| `asia-range-analysis.html` 📊 Asia Analysis | fx bt | 2026-06-28 |  |
| `asia-range-backtest.html` 📐 Asia Range BT | fx bt | 2026-06-29 |  |
| `range-fib-backtest.html` 📏 Range-Fib BT | fx bt | 2026-06-26 |  |
| `pivot-spike-backtest.html` 📍 Pivot Spike BT | fx bt | 2026-07-01 |  |
| `macro-equity-backtest.html` 📊 Macro Eq BT | equity | 2026-06-22 |  |
| `liquidity-gate-backtest.html` 💧 Liq Gate BT | equity | 2026-06-22 |  |
| `nasdaq-threshold-backtest.html` 🧮 NQ Threshold BT | equity | 2026-06-25 |  |
| `system-gold-macro.html` 📊 P6 Gold Macro | gold | 2026-06-15 |  |

### Learn (8)

| Page | Was in | Last changed | Note |
|---|---|---|---|
| `theory-lab/` 🎓 Theory Lab | learn | — |  |
| `library.html` 📚 Library (papers: search, read, listen) | learn | 2026-11-09 |  |
| `cog/hub.html` 📊 COG Hub | learn | — |  |
| `market-review.html#learn` 🎙 How Traders Think (podcast decodes) | learn | 2026-10-26 |  |
| `primary-signal.html` 🧭 The primary signal (explainer) | live | 2026-11-06 | explainer |
| `drill.html` 🎯 The Drill | live | 2026-09-23 | practice on past sessions |
| `discipline-map.html` 🗺 Discipline Map | wip | 2026-08-08 | was WIP |
| `repo-brick-map.html` 🧩 Repo Brick Map | learn | 2026-07-26 |  |

### ∅ Null (31)

| Page | Was in | Last changed | Note |
|---|---|---|---|
| `band-fade.html` 📏 Band Fade (null) | (no shortcut) | 2026-09-23 | daily-band-fade NULL; was orphan |
| `daily-open-fib.html` 🌙 Daily-open fib (null) | live | 2026-11-02 | page says Backtest: NULL (daily-open-fib-retest) |
| `delta-at-line.html` ▦ Delta at the lines (null) | live | 2026-11-07 | page: F2/F4 NULL, F1/F3 UNDERPOWERED |
| `spread-episodes.html` 🔀 Spread-turn episodes (null) | live | 2026-10-20 | spread-episodes-eurusd / -nq NULL |
| `trend-basket.html` 📈 Trend Basket (null) | vol | 2026-07-21 | trend-following-fx NULL |
| `asia-fib-atlas-live.html` 🌏 Asia Fib Atlas Live (null) | vol | 2026-08-29 | vol-asia-fib-confluence NULL; random-price audit 76–97% win rates |
| `asia-fib-atlas-vote-backtest.html` 🗳 Asia/Monday Fib Vote BT (null) | vol | 2026-09-17 | same |
| `asia-fib-atlas-vote-portfolio.html` 🧺 Asia/Monday Fib Vote Portfolio (null) | vol | 2026-11-01 | same |
| `trade-decision-engine.html` 🎯 Trade Decision (zones null) | live | 2026-08-11 | zone-engine NULL; page says UNCALIBRATED PRIOR |
| `trade-cards.html` 🃏 Trade Cards (zones null) | live | 2026-08-15 | same |
| `upcoming-trades.html` 📋 Upcoming Trades (zones null) | live | 2026-08-14 | same |
| `continuation-fade-ticker.html` 📡 Continuation/Fade (zones null) | live | 2026-08-11 | same |
| `dax-ifo.html` 🇩🇪 DAX IFO (null, toolkit CSVs) | systems | 2026-10-26 | dax-ifo-lookahead NULL |
| `nq-qmr-backtest.html` ⚡ NQ-QMR (falsified) | retired | 2026-07-30 | falsified 2026-07-29 |
| `qmr-tearsheet.html` 📈 QMR Tearsheet (falsified) | live | 2026-07-29 | tearsheet of NQ-QMR |
| `analogml-backtest.html` 🧬 AnalogML BT (null — k-NN retired) | retired | 2026-08-14 |  |
| `credit-stress.html` 🚦 Credit Stress (null gate) | retired | 2026-10-26 |  |
| `econ-trend.html` 🌍 Econ Trend (null) | retired | 2026-07-17 |  |
| `fx-factor-v2.html` 📊 FX Factor Book v2 (underpowered) | retired | 2026-10-26 |  |
| `hurst-bench.html` 🔬 Hurst A/B (dropped) | retired | 2026-07-25 |  |
| `layer2-vol-audit.html` 🔬 Layer 2 Vol Audit (null) | retired | 2026-07-20 |  |
| `macro-direction.html` 🧭 Macro Direction (null) | retired | 2026-07-07 |  |
| `max-copier-backtest.html` 🧺 Max Copier BT (null) | retired | 2026-07-22 |  |
| `poi-reaction-backtest.html` 🎯 POI-Reaction BT (null) | retired | 2026-07-23 |  |
| `range-ext-backtest.html` 📏 Range-Ext BT brain (null) | retired | 2026-07-24 |  |
| `residual-reversion.html` 🔁 Residual Reversion (null) | retired | 2026-09-22 |  |
| `sltp-distribution.html` 🎯 SL/TP Distribution (null) | retired | 2026-07-19 |  |
| `trend-ema-ab.html` 📈 EMA vs Momentum A/B (null) | retired | 2026-07-19 |  |
| `vumanchu-fade.html` 🌊 VuManChu Fade (null) | retired | 2026-07-14 |  |
| `vwap-reversion.html` 📉 VWAP Reversion BT (null) | retired | 2026-07-19 |  |
| `zscore-v2.html` ⚡ Yield Z-Score v2 (null) | retired | 2026-07-06 |  |

### 🗃 Retired (38)

| Page | Was in | Last changed | Note |
|---|---|---|---|
| `correlations.html` ⬡ Corr Lab (→ Desk Terminal) | research | 2026-11-06 | page says: now in Desk Terminal → Correlations |
| `hub.html` ⬡ Risk Hub (old link index) | systems | 2026-11-06 | secondary link index; this strip replaces it |
| `indexv2.html` 📊 Market State v2 (superseded) | retired | 2026-10-24 |  |
| `vol-forecast.html` 📐 Vol Forecast v1 (→ v2) | retired | 2026-09-28 |  |
| `trend.html` 📈 Trend-Following (→ Trend v2) | retired | 2026-07-26 |  |
| `system-fx-carry.html` 📊 P4 JPY Spot Proxy (→ Carry Factor) | retired | 2026-07-17 |  |
| `system-fx-momentum.html` 📊 P5 FX Momentum (→ Trend Basket) | retired | 2026-06-15 |  |
| `backtest.html` 📈 Backtest Engine (legacy) | retired | 2026-07-14 |  |
| `claude-backtest.html` 🔬 Claude BT (→ Strategy Lab) | retired | 2026-08-25 |  |
| `overnight-hold-backtest.html` 🌙 Overnight Hold BT (old costs) | retired | 2026-11-02 |  |
| `fx-vol-carry-backtest.html` 📊 FX Vol Carry BT (unbanked) | retired | 2026-08-22 |  |
| `liquidity-net-regression.html` 🌊 Net Liquidity Regression (unbanked) | retired | 2026-10-26 |  |
| `hedge-backtest.html` Hedge backtest v1 (retired) | (no shortcut) | 2026-11-06 | retirement notice; was orphan |
| `hedge-signals.html` Hedge signals v1 (retired) | (no shortcut) | 2026-11-06 | retirement notice; was orphan |
| `hedge-signals-v2.html` Hedge signals v2 (retired) | (no shortcut) | 2026-11-06 | retirement notice; was orphan |
| `credit-leadlag.html` 🚨 Credit Lead-Lag | retired | 2026-07-05 |  |
| `global-liquidity.html` 🌊 Global Liq | retired | 2026-10-26 |  |
| `gold-backtest.html` 📊 Gold BT | retired | 2026-06-01 |  |
| `gold-lab.html` 🔬 Gold Lab | retired | 2026-05-24 |  |
| `gold-miner-arb.html` ⛏️ Gold/GDX Arb | retired | 2026-07-26 |  |
| `liquidity-backtest.html` 💧 Liq Levels BT | retired | 2026-07-22 |  |
| `liquidity-pulse.html` 💧 Liq Pulse | retired | 2026-10-26 |  |
| `macro-conditioner.html` 🌡️ Macro Conditioner | retired | 2026-07-22 |  |
| `macrofx-decision-backtest.html` 🧠 Decision Engine BT | retired | 2026-07-23 |  |
| `macrofx-zone-backtest.html` 🎯 Decision-Zone BT | retired | 2026-07-23 |  |
| `multi-factor-book.html` 🧱 Multi-Factor Book | retired | 2026-07-21 |  |
| `mve.html` ⚖️ Market Valuation | retired | 2026-09-22 |  |
| `nasdaq-liquidity-continuation.html` 📈 NQ Liq BT | retired | 2026-06-26 |  |
| `nasdaq-macro-lead.html` 🧭 NQ Macro Lead | retired | 2026-09-04 |  |
| `nasdaq-threshold-engine.html` 📡 NQ Gate Live | retired | 2026-06-24 |  |
| `news-exhaustion.html` 🗞️ News-Exhaustion | retired | 2026-07-14 |  |
| `system-credit-equity.html` 📊 P2 Credit-Equity | retired | 2026-06-15 |  |
| `system-fx-carry-factor.html` 💱 FX Carry Factor | retired | 2026-07-17 |  |
| `system-yield-curve.html` 📊 P3 Yield Curve | retired | 2026-06-15 |  |
| `vix-vol-carry-backtest.html` 🌋 VIX Vol-Carry | retired | 2026-06-19 |  |
| `yield-coupling-real.html` 🏦 Real DE–US Yields | retired | 2026-07-05 |  |
| `yield-coupling.html` 🧲 Yield Coupling | retired | 2026-10-26 |  |
| `zscore-backtest.html` ⚡ Yield Z-Score | retired | 2026-06-22 |  |

### Deleted in this change (8)

| Page | Was in | Last changed | Note |
|---|---|---|---|
| `Todayv3.html` 📋 Daily Brief v3 shim (orphan) | retired | 2026-08-18 | orphan shim, nothing links to it |
| `volatility-classifier-standalone.html` 🔬 Vol Classifier standalone (orphan) | retired | 2026-08-01 | orphan, nothing links to it |
| `nq-qmr-backtest.legacy.html` ⚡ NQ-QMR legacy BT (void) | retired | 2026-07-30 | void backtest of a falsified system |
| `results.html` 📄 Hedge v1 Tearsheet (null) | retired | 2026-06-09 | static 12.6k-line tearsheet of null hedge v1 |
| `level-chart-demo.html` 🧱 Level Chart Demo | retired | 2026-06-28 | synthetic-data demo |
| `backtest-monitor.html` 🖥 BT Monitor (moved → Bot Config) | retired | 2026-07-14 | stub: moved into Bot Config |
| `claim-watch.html`  | (no shortcut) | 2026-10-19 | stub: moved into Evidence Book |
| `portfolioBacktest/results.html` 📄 Portfolio results (old copy) | retired | — | old copy |
