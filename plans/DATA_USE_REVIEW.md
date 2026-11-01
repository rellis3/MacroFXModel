# Data use review: which feeds the Today page, Atlas and the newsletters actually use

Written 2026-11-01. Method: every `app.get/post('/api/...')` route in `server.js` (707 routes, 292 route families) was matched against every `*.html` page and `js/*.js` file that names it. A family counts as *used by the core* when `today.html`, `atlas.html`, `js/atlasPosition.js` or `js/newsletter*.js` names it. That is a string match: it shows a feed is loaded, not that its numbers shape a sentence in the issue.

## Counts

| Group | Route families |
|---|---|
| Named by today / atlas / newsletter code | 92 |
| Named only by a standalone page (research, backtest, bot, or a data page) | 153 |
| Named by no page at all (internal, jobs, bot endpoints) | 47 |

Most of the 153 are research, backtest and bot pages, which is expected. The ones below are **data pages** (not research or bots) that the core does not use. Those are the candidates for the question "we hold it, why is it not in the analysis".

## Data feeds on standalone pages only

| Route family | Page(s) that use it |
|---|---|
| `/api/beta-history` | correlations.html |
| `/api/calendar-events` | forecast-path.html, market-view.html, terminal.html |
| `/api/cboe-chain` | oi-dashboard.html |
| `/api/cboe-contracts` | oi-dashboard-v2.html |
| `/api/cboe-snapshots` | oi-dashboard.html |
| `/api/cot-analysis` | cot-extremes.html |
| `/api/cot-backfill` | cot-extremes.html |
| `/api/flow-chain` | flow-chain.html |
| `/api/fomc-backfill` | fomc-sentiment.html |
| `/api/fx-carry` | system-fx-carry-factor.html, theory-lab/lessons/interest-rate-parity-micro.html |
| `/api/global-liquidity` | global-liquidity.html |
| `/api/hedging-forward` | oi-dashboard-v2.html |
| `/api/hedging-plan` | oi-dashboard-v2.html |
| `/api/hedging-plan-oi` | oi-dashboard-v2.html |
| `/api/hedging-summary` | oi-dashboard-v2.html |
| `/api/liquidity-pulse` | liquidity-pulse.html |
| `/api/macro-conditioner` | macro-conditioner.html |
| `/api/macro-direction` | macro-direction.html |
| `/api/market-sense` | market-sense.html |
| `/api/monitor` | index.html |
| `/api/oi` | oi-dashboard.html |
| `/api/oi-profile` | oi-dashboard-v2.html |
| `/api/oi-reachability` | oi-dashboard-v2.html, oi-dashboard.html |
| `/api/oi-store` | cot-extremes.html, indexv2.html, oi-dashboard-v2.html |
| `/api/oi-tiers` | oi-dashboard-v2.html |
| `/api/ppi` | ppi.html |
| `/api/rate-diff` | volatility-intelligence.html |
| `/api/rates` | rates.html, theory-lab/lessons/fed-corridor-iorb-srf-discount-window-micro.html, theory-lab/lessons/fed-corridor-iorb-srf-discount-window.html |
| `/api/rates-regime` | rates.html |
| `/api/release-layer1` | release-reaction.html, release-why.html |
| `/api/release-layer2` | release-why.html |
| `/api/spread-episodes` | spread-episodes.html |
| `/api/yield-coupling` | yield-coupling.html |
| `/api/yield-coupling-real` | yield-coupling-real.html |

## Notes on reading this

- Loaded is not used. Atlas fetches 58 feeds. Its newsletter input carries a subset; several feeds (the eight central-bank tone histories, the calendar feed, the chain read) feed Atlas's own panels and the newsletter only through derived fields.
- Series-level coverage (which FRED/ECB/etc. series exist and which were ever tested) is `js/dataCatalogue.js` and `js/feedCoverage.js`, not this file. Captures that are running are in `plans/DATA_AND_INTEGRATION_TRACKER.md`.
- Added 2026-11-01 to the core: per-economy growth, inflation, jobs, spending, confidence, trade, real yield and curve (`js/worldEconomies.js`); central-bank, Beige Book, UK Budget and US refunding reads (`js/policyWeek.js`). Both weekly only.
- The state-page engine session's map is `plans/ENGINE_DATA_MAP.md` on branch `claude/repo-deep-review-refocus-xqe77q` (draft PR #1574, not on main when this was written). It uses the same method (643 feeds, 466 that never reach today, state, atlas or index) and adds what exists in the world and is not held. Its `js/stateCountries.js` overlaps `js/worldEconomies.js`; once it merges, the newsletter should read the one engine (`/api/state`) rather than keep two country tables.

## Feeds with no page and no core use (internal or dead)

`/api/ai-backtest`, `/api/beta`, `/api/cboe-intraday`, `/api/cboe-raw`, `/api/claim-watch`, `/api/cog-dow`, `/api/cog-overlay-test`, `/api/cog-v3`, `/api/cot-factor-test`, `/api/data-catalogue`, `/api/data-health`, `/api/digest`, `/api/direction-ledger`, `/api/dyn-anchor-forecast`, `/api/egress-audit`, `/api/factor-blend`, `/api/fib-atlas-bot`, `/api/fib-atlas-bot-v2`, `/api/financing`, `/api/forecast-drift`, `/api/futures-quote`, `/api/hmm1h-v2`, `/api/hmm2h-v2`, `/api/hmm30m-v2`, `/api/hmm5m-train`, `/api/hmm5m-train-params`, `/api/hmm5m-train-status`, `/api/kv-health`, `/api/motif-bot`, `/api/mve-validate-mechanical`, `/api/nav-layout`, `/api/oanda-instruments`, `/api/oi-bots`, `/api/oi-history-raw`, `/api/oi-ripple`, `/api/r2`, `/api/range-calls`, `/api/regime-history-export`, `/api/release-scorecard`, `/api/scratchpad`, `/api/services`, `/api/signal-copier`, `/api/telegram`, `/api/version`, `/api/vol-reversion`, `/api/volatility-v2`, `/api/volatility-v3`
