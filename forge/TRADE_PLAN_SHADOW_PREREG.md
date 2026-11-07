# trade-plan-shadow — does joining the tested direction score (which way) to the vol forecast (stop, target, size) make a London-session plan that beats a coin flip?

**Pre-registered 2026-11-06, before any plan row or outcome was computed.**

| | |
|---|---|
| ID / ledger id | `trade-plan-shadow` (one scored instrument; verdict now: none, forward record, CONTEXT until judged) |
| Branch | worktree `agent-a4d79f225d5404cf5`, pushed to `main` |
| Register row | `plans/RESEARCH_REGISTER.md` -> `trade-plan-shadow` |
| Data | none read from history. Forward only: one row per market per London session from the first session after deploy. Inputs: the direction score (`js/directionScore.js` `marketScore`, as written by the direction ledger or the pre-open Global Read), the live daily ladder (`vol_forecast_<date>` -> `ladder_flat`, `ladder.sigma_used_pct`), the stress-shadow factor (`/api/stress-shadow`, `forge/FORECAST_MISS_SCAN_PREREG.md` A1). Outcomes: OANDA M1 mid bars of the session |
| Seed | `20261106` (coin-flip baseline side and every bootstrap) |
| Uncertainty | date-clustered bootstrap (resample London sessions, all rows of a session together), B = 2000, 95% percentile interval |
| Scripts / outputs | `js/tradePlanCore.js` (pure rule + scoring), `js/tradePlanRoutes.js` (forward job + API), `trade-plan.html`; record in R2 `forward/trade_plan/<date>.json` (plan) and `forward/trade_plan/out/<date>.json` (outcome) |
| Harness | own forward job (no history exists to run a harness on) |

## 1. The claim

C.OG's framing (owner approved 2026-11-06): direction and volatility are separate layers. The direction layer says
whether there is a trade and which way; the vol layer says where the stop and target go and how big the position is.
The repo's evidence says the direction layer is almost always silent (no direction cell has forward evidence;
`project_direction_bar`) and the vol forecast is a good size ruler but not a direction tool
(`nq-forecast-target-ev`, `day-recon-path-book`). This record joins the two exactly as specified below and asks, going
forward, whether the joined plan earns more than the same plan with the side chosen by a coin flip.

## 2. Why it is not already settled

- `direction-score-pilot` scores the 1-to-10 score against the next close (P(up)), not a stop/target plan.
- `nq-forecast-target-ev` (UNDERPOWERED/REJECT), `v3-p50-follow-pre2020` (NULL), `nq-line-touch-hold-to-close`
  (exploratory, no edge) all used the lines for direction or entry. Here the lines are never used for direction:
  direction comes only from the score, and the lines only set stop, target and size. That is a different question.
  It is not a re-run of a null: none of those tests had an independent direction input.
- `stress-filter-hold` / `forecast-miss-scan` validated that the stress conditions widen the realised range; here the
  stress-shadow lines are used only to place the stop, as the forecast-error feedback loop.

## 3. Definitions, fixed in advance

- **Markets.** NQ (OANDA NAS100_USD), SPX500 (SPX500_USD), GOLD (XAU_USD), EURUSD, GBPUSD, USDJPY. Reported separately
  and pooled.
- **Session.** London weekday D; entry window opens at 00:00 Europe/London (calendar, BST-aware).
- **Direction (primary layer).** The 1-to-10 direction score as of the last 17:00 New York close before 00:00 London on
  D. Source, in order: (1) the direction ledger record for that close (`forward/direction_ledger/<close>.json`,
  model `direction-score`, h = 1) if it was issued at or before 00:00 London on D; else (2) the server's own pre-open
  snapshot of `marketScore(sym, GlobalRead.cards[sym])`, taken between 22:15 and 23:59 London on the evening before D
  (after every NY close), from a Global Read built within 3 h; else (3) none -> NO TRADE with reason "no direction
  score before the London open". The source is written on the row. Score 8-10 -> LONG; 1-3 -> SHORT; 4-7 -> NO TRADE.
  NO TRADE on most days is expected and correct.
- **Entry.** O = open of the first OANDA M1 mid bar at or after 00:00 London on D.
- **Lines.** The live daily ladder for D (`vol_forecast_<D>.instruments[sym].ladder_flat`, % of open).
  σ = `ladder.sigma_used_pct` (the σ the lines were built from, % of open, daily). If `/api/stress-shadow` gives a
  factor f for the market for session D, the stop uses the stress-shadow lines (live x f); otherwise the live lines
  (f = 1, recorded as "live"). Gold has no stress-shadow class, so gold always uses live lines.
- **Stop.** Beyond the opposite-side p90 line by 0.35σ: LONG stop = O x (1 - (f x ol_p90 + 0.35σ)/100); SHORT stop =
  O x (1 + (f x oh_p90 + 0.35σ)/100). Basis: `nq-lines-as-exhaustion` (exploratory) found price overshoots a line by a
  median 0.3-0.5σ.
- **Target.** Same-side live p75 line: LONG target = O x (1 + oh_p75/100); SHORT target = O x (1 - ol_p75/100).
- **Size.** 1R = stop distance; units = risk budget / stop distance. Results in R, never money.
- **Exit.** First touch of target or stop on M1 high/low from the entry bar on; if both fall in the same bar, the stop
  is taken (conservative). Otherwise the close of the last M1 bar that opens before 21:55 London.
- **Outcome.** Gross R = side x (exit - O) / stop distance. Cost R = round-trip cost (`js/perLineStrategy.js`
  `costForPair`, % of price) x O / stop distance. **Net R = gross R - cost R** (primary).
- **Both sides on every row.** The long and short plans are both computed and scored on every row (shown on NO TRADE
  days as "if you had a view"); the decision R is the side the score picked.
- **Baselines, scored on the same rows.** B0: LONG for NQ, SPX500, GOLD (the buy-and-hold drift); FX rows have no B0
  arm. Coin flip: side = LONG if hash(`20261106|D|sym`) is even, else SHORT (FNV-1a 32-bit), fixed per row.
- **Write-once.** The plan file for D is written once after 00:00 London and never overwritten; the outcome file once
  the session has ended. A session the job missed stays a gap. No back-filling of plans.
- **De-clustering.** None; the bootstrap resamples whole sessions (all markets on a day move together on USD days).

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Trade rows (score 8-10 or 1-3): mean net R > 0 | **Null** expected (no direction cell has forward evidence) |
| b | **THE GATE** — trade rows: mean net R > 0 with the 95% interval above 0, AND the paired mean (decision net R - coin-flip net R) on the same rows with its interval above 0 | Not expected to pass |
| c | Index/gold trade rows: paired mean vs B0 (LONG) | descriptive |
| d | **THE MIRROR** — the opposite side of each trade row (the plan reversed) | reported; should be the negative of (a) less cost |
| e | NO TRADE rows: mean net R of the long plan and of the short plan | descriptive: tells whether the vol-layer plan alone has drift |

## 5. Power

R per trade is bounded at about -1 - cost below and +R:R above, where R:R = oh_p75 / (ol_p90 + 0.35) in σ units:
0.50-0.55 for these six markets (widths from `js/forecastLadderParams.js`). For a driftless path that gives a target
hit share of roughly 0.6-0.66 and an R standard deviation of about 0.7 (no outcome data used).

| Cell | Planned n | Outcome SD (analytic) | Design effect | **MDE** (80% power, α 0.05 two-sided; `mdeMeanDiff`) | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| (b) mean net R, trade rows | 100 | 0.6-0.8 | 1.0-1.5 | 0.17-0.27 R | > 0 (interval) | POWERED only for a large effect |
| (b) paired vs coin flip | 100 | about 1.0 (difference of two near-independent R) | 1.0-1.5 | 0.28-0.34 R | > 0 (interval) | UNDERPOWERED for any realistic edge |

In direction terms: at K = 100 events the one-day sparse MDE is 13.6-13.9 hit-rate points over B0 per market
(`analysis/output/direction-bar/tables.md`, "MDE by multiplicity level"). A score whose edge is smaller than that
cannot be told from luck here. **This record can only detect a large effect; it is a forward CONTEXT record, not a
test that a realistic edge could pass.** It is run because the owner asked for the joined plan to be visible and kept
honestly, not because it is expected to validate.

**Judging point.** At 100 trade rows (non-NO-TRADE) or 2027-11-06, whichever is later. Because the score leaves the
middle rarely, 100 trade rows may take years; if fewer than 100 trade rows exist on 2028-11-06 the record is judged
then as `UNDERPOWERED`.

## 6. Multiplicity

One scored cell: the gate (b), a conjunctive two-part condition, no further correction. Per-market and per-band
slices are disaggregation cells: BH at q = 0.10, candidates only. Promotion to any real position needs |t| >= 3 and is
out of scope.

## 7. What this does NOT test

- Not a trading signal and never an input to a bot or alert. No orders.
- Not whether the direction score predicts the next close (`direction-score-pilot` does that).
- Not whether the vol lines are calibrated (`forecast-miss-scan`, the stress and drawdown shadows do that).
- The vol state vector shown on the page (`js/volStateVector.js`: σ now, σ change proxy, σ vs long run, HMM active
  probability, forecast error, jump intensity) is descriptive only and does not enter this rule.
- Execution: mid prices, no slippage beyond the cost model, no financing.

## 8. What each verdict changes

- **VALIDATED** (gate passes at the judging point) -> ledger entry; the page may say "the joined plan beat a coin flip
  forward"; nothing trades until a separate prereg clears |t| >= 3.
- **NULL** (interval of the paired difference inside ±MDE, centred near 0) -> ledger entry; the page says the direction
  score adds nothing to the vol plan.
- **UNDERPOWERED** -> ledger entry; closed as untestable at this frequency unless a direction cell with forward evidence
  goes live.
- Until judged: **CONTEXT**. The page shows the running record with n and intervals, and says it is not judged.

## Amendments

(none)

## RESULTS — not run (forward record from the first session after deploy)
