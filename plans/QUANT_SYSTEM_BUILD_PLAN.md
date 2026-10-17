# Quant system build plan — from "what the page shows" to "what the distribution is, and which sleeve is on"

*Written 2026-10-17. Companion pre-registrations: `forge/HARNESS_REGISTRY_PREREG.md` (step 2),
`forge/FX_FACTOR_STACK_PREREG.md` (step 3), `forge/DISTRIBUTION_FORECAST_PREREG.md` (step 4).
The page proposal this serves: claude.ai artifact "Today, by the Clock" (2026-10-16).*

## 1. Diagnosis, in the ledger's own numbers

`js/deskEvidence.js`, 155 pre-registered claims on 2026-10-17:

| domain | validated | null | context / underpowered |
|---|---|---|---|
| volatility | **20** | 17 | 5 |
| price | 7 | 25 | 7 |
| macro | 4 | 35 | 11 |
| events | 3 | 6 | 3 |
| positioning | 1 | 6 | 0 |
| execution | 1 | 1 | 3 |

53 of the 155 claim something about **direction**; 47 are null or underpowered. Of the six that
validated, four are range results wearing a directional claim (`vix-inversion`, `vol-curve-front`,
`tape-speed-persistence`, `breadth-all-down`). Two are genuinely directional: `yield-spread-sleeve`
(weeks-long, PF 2.19 OOS) and `horizon-reversion` (the 20:00–22:00 UK window).

The live lean ledger (`/api/ledger`, 2026-10-16): 267 calls, same-day hit 53.2% [47.2–59.2] (does
not clear), **next-day 41.6% [35.7–47.5] — the whole interval below a coin flip**, net −0.10 ATR
per call. Five-day 44.0%, net −0.27 ATR.

This is the published result for daily-horizon direction in FX majors and index futures from
public data, rediscovered with rigour. Variance is predictable; the daily mean is not. The
rigour is the asset. The target was the problem.

## 2. What the system will output — the contract

Per instrument, every session, nothing else:

| output | form | graded by |
|---|---|---|
| **distribution** | q10/q25/q50/q75/q90 of today's range and of each remaining hour | CRPS, pinball, PIT, coverage |
| **sleeves on** | which validated edges are live, horizon, live rolling IC / PF | the ledger, monthly |
| **size** | 0 / ½ / 1 per sleeve from a secondary model | realised PnL per size bucket |
| **falsifier** | the level or event that proves the current read wrong | hit / not hit |
| **cost gate** | round-trip spread ÷ forecast range; struck through when uneconomic | — |

Direction appears **only** inside "sleeves on", with its horizon beside it. Nothing on the page
says which way tomorrow goes, because nothing tested here can.

## 3. Where it is built

Three places, each doing the one thing it is suited to. Every pattern below already exists in
this repo; nothing here invents a new deployment shape.

| component | where | why | precedent |
|---|---|---|---|
| Tick capture, order-book recording, OFI bars | **Laptop** (NT8 → `analysis/output/nt8_live/` parquet; nightly summaries to R2) | NT8 and IBKR only run locally; raw ticks are gigabytes a day and Railway bills egress | `oi_recon/`, `fedwatch/`, `nt8_bridge/` |
| Point-in-time feature store | **Laptop** parquet `features/<name>.parquet` with an `asof` column; **repo** holds `plans/FEATURE_MANIFEST.json` (source, cadence, asof rule, first/last) | research needs the history local; the manifest is the contract and must be reviewable | `js/fredActuals.js` vintages, `data-health` |
| Research, backtests, pre-registered studies | **Laptop** (≤ 5 parallel node jobs; 32 GB) · code in **repo** `analysis/`, `js/harness/` | reproducible, versioned; results are only valid if the harness that produced them is committed | `analysis/*.mjs`, `forge/*_PREREG.md` |
| Pre-registrations | **Repo** `forge/` — the commit *is* the registration, before any run | the whole method | 30+ existing |
| Banked results | **Repo** `js/deskEvidence.js` + `POWER` | one ledger, every page and prompt cites it | 155 entries |
| Serving and display | **Railway** reads KV / R2 summaries; today.html and the proposal page render them | the server never computes research and never receives raw ticks | `zq_path_v1`, `mpt_store_v1`, `surface_lab_v1` |
| Live signals (later) | **Laptop** producer → KV key registered in `_worker.js` PERMANENT_KEYS and `kv.js` `_CF_EXACT` | same as every local feed; the 48h TTL trap is documented | `fedwatch/run_zq.bat` |

**Data-feed facts that gate the plan** (verified 2026-10-17):

- NT8 via the Lucid "Simulation" login: historical 1m and tick bars are real; **live is ~10 min
  delayed**; the recorder stamps *arrival* time, not exchange time. Research on history can start
  now. A live intraday signal needs real-time CME data (Lucid upgrade or CME bundle) and the
  recorder changed to exchange timestamps. Historical tick pulls carry price/volume only (aggressor
  by tick rule, ~85–90% accurate in the literature); the live recorder carries bid/ask (observed).
- Point-in-time actuals: 31 US series (FRED vintages), 16 non-US (ONS 3, StatCan 7, Eurostat 6).
  JP, AU, NZ, CH: none. Any macro feature for those four is consensus-vs-printed, not vintage.
- Broker financing (`/api/financing/history`): 22 days, 123 instruments, since 2026-09-20. Forward
  validation only; carry *history* must come from the FRED interbank differentials `/api/fx-carry`
  already uses.
- OANDA D1 is CFD mid: no embedded roll or financing. Carry accrual is added explicitly from the
  rate leg; costs come from the measured spread profile (26 FX + gold, per hour, since 2026-09-17).

## 4. The seven steps

| # | build | deliverable | pre-reg | data gate | effort | done when |
|---|---|---|---|---|---|---|
| 1 | **Point-in-time feature store** | `features/*.parquet` with `asof`; `FEATURE_MANIFEST.json`; a loader that refuses a feature without an asof rule | spec in §5 | none | 1 wk | every series used by steps 3–4 has an asof rule and a first/last date in the manifest |
| 2 | **Unified harness + registry deflation** | `js/harness/runStudy.mjs` (vol-target, measured costs, week-block bootstrap, walk-forward, BH-FDR, DSR, PBO); the 155-entry registry re-scored | `forge/HARNESS_REGISTRY_PREREG.md` | none | 1–2 wk | one entry point every later study calls; the surviving-validated list banked. **DONE 2026-10-17** — `forge/HARNESS_REGISTRY_ADDENDUM_A.md` (harness; the 2Y sleeve's edge was a GS2 lookahead) and `_B.md` (4/36 deflated, BH alone deflated none) |
| 3 | **Cross-sectional FX factor stack, 1–3 months** | carry · momentum · value · yield-spread z · surprise momentum, dollar-neutral, vol-scaled | `forge/FX_FACTOR_STACK_PREREG.md` | step 1 for surprise/value; step 2 harness | 2–3 wk | the registered bars pass or fail, banked either way |
| 4 | **Conditional distribution forecast** | quantile model for today's range and each remaining hour; CRPS/PIT scored daily | `forge/DISTRIBUTION_FORECAST_PREREG.md` | step 2 harness | 1–2 wk | runs as a shadow beside the production vol forecast for 60 sessions |
| 5 | **Meta-labelling** | a secondary model on each validated sleeve → size 0/½/1 | to be registered after 3 and 4 exist (needs a primary) | 3 or 4 passing | 1–2 wk | realised PnL by size bucket is monotone OOS |
| 6 | **Order-flow imbalance, intraday** | OFI bars from NT8 ticks; pre-registered against release hours and the 20:00–22:00 window | to be registered once the feed decision is made | real-time CME feed + exchange timestamps; or history-only research first | depends on feed | — |
| 7 | **Option wings → variance risk premium** | RR/fly surface from CME FX settlements; VRP as a vol-timing input to step 5 | after 4 | wings data | 1 wk | — |

Steps 1 and 2 are infrastructure and block everything. Steps 3 and 4 are independent of each
other and can run in parallel once 1–2 exist. Step 5 needs a passing primary. Step 6 is a data
decision before it is a research task.

## 5. Step 1 spec — the feature store

- One parquet per feature: columns `date` (the observation's reference period), `asof` (the
  earliest UTC instant the value was knowable), `value`, `source`, `vintage_id` where the source
  revises.
- `FEATURE_MANIFEST.json` entry per feature: `{ id, source, cadence, asofRule, firstAsof, lastAsof,
  revises: bool, countries }`. `asofRule` is one of: `release_ts` (calendar-stamped), `vintage`
  (ALFRED/ONS/StatCan/Eurostat), `close+1h` (market data), `report+3d` (COT, published Friday for
  Tuesday — usable from Monday), `fixed_lag:<days>`.
- The loader (`js/harness/features.mjs`) exposes `at(featureId, t)` = the latest value with
  `asof ≤ t`, and **throws** on a feature with no manifest entry. A study that wants a feature the
  manifest lacks has to add it first, with its rule, in a commit.
- Known gaps to record as gaps, not to paper over: JP/AU/NZ/CH macro actuals (no vintages), COT
  before 2006 (TFF start), financing before 2026-09-20, NT8 ticks before ~2016.

## 6. Explicitly not being built

- Any further daily-direction test on price-only, macro-level or positioning features. 47 nulls
  is the answer; the next one is a draw from a distribution already characterised.
- A bot on any of this. Steps 3–5 produce a graded *book*, displayed and scored. Trading it is a
  separate decision with its own pre-registration, after at least 60 sessions of shadow.
- Replacing the production vol forecast, the brief, or any page. Everything runs beside what
  exists (`feedback_side_by_side_no_live_impact`) until it has a record.
- A page that says which way. If step 3 passes, the page says *"long AUD / short CHF in the
  carry-momentum book, 0.6 size, three weeks in"* — a position with a horizon and a live IC, not
  an arrow on a card.

## 7. Honest ceiling

Done fully: a monthly-horizon factor book with a graded edge (the published record for G10 FX
factor stacks is roughly 0.8–1.2 Sharpe gross, lower net, with multi-year drawdowns); a
distribution forecast scored every day; conditional sizing; and an intraday flow signal if the
real-time data is bought. Daily direction stays a coin flip, and the ledger will keep saying so —
which is the feature, not the bug.
