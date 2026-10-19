# hedging-state-forward — On the full Cboe book, does the dealer-hedging state at the open tell us how the day behaves?

**Pre-registered 2026-10-19, before any outcome was computed (the record starts on the 2026-10-20 London session).**

| | |
|---|---|
| ID / ledger id | `hedging-state-forward-range` (H1), `hedging-state-forward-breaks` (H2) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `hedging-state-forward` |
| Data | Forward only. NQ, SPX500, US2000 (primary), GOLD (secondary). Morning snapshot of `/api/hedging-summary` (Cboe index + ETF book at the prior US close, GLD for gold) and the chosen daily lines (`/api/vol-forecast/persist-ladder/json`); outcome from OANDA 1-minute bars, London session 00:00–22:00. Lockbox not involved: every row is new. |
| Seed | `20261019` |
| Uncertainty | stationary block bootstrap over session dates, mean block 10, 5,000 reps |
| Scripts / outputs | server job `hedgingForward` (server.js) → R2 `forward/hedging_state/<date>.json`; `/api/hedging-forward`; scoring script `scripts/hedging-state-forward/` at the judge date → `analysis/output/hedging-state-forward/` |
| Harness | own server job (the inputs exist only live; nothing can be backfilled) |

## 1. Claim

When dealers' hedging speeds moves up at the open (price on the "speeds" side of the re-priced book's switch point),
the day's range is larger relative to the chosen forecast lines, and a first break of a p75 line more often carries to
p90, than on days when hedging calms moves.

## 2. Why this is not already settled

- `gex-range` (validated): CME NQ gamma sign → next-day range vs a Brownian baseline. `one-range-forecast` (null):
  that sign adds nothing beyond the chosen lines. `gamma-regime-trades` (null): fade/follow by that sign lost after
  costs. All three used the **CME futures-options book, about 5% of Nasdaq dealer gamma** (2026-10-16: QQQ ≈ 3× NDX ≈
  17× CME NQ). This record uses the full index + ETF book, which has no history anywhere we can get for free. That is
  the different question.
- `zero-gamma-distance` (underpowered): the near/far split. Not tested here.

## 3. Definitions (frozen)

- **Snapshot** at the first job tick at or after 07:00 London on a weekday: the summary (switch point, its direction,
  regime at the quote, push up/down per 1%) and the chosen lines for the day (hl, oh, ol at p50/p75/p90, % of open).
- **State at the open (primary):** the London session open price (first 1-minute bar at/after 00:00 London) against
  the switch point: `speeds` or `calms` as `js/hedgingScenario.js` defines the sides; with no switch point within ±5%,
  the regime at the quote. Using the open, not 07:00, keeps the morning's price action out of the label.
- **Range outcome:** y = log(session high-low % of open ÷ chosen hl p50).
- **Break outcome:** the first touch of open × (1 ± p75) in the session; `follow` if price then reaches that side's
  p90 before returning to its p50, `revert` if p50 first, `neither` by 22:00. Same-minute = revert.
- A session with no bars (holiday) or no snapshot is skipped and counted.

## 4. Hypotheses

- **H1 (primary, THE GATE):** mean y(speeds) − mean y(calms), pooled NQ + SPX500 + US2000, ≥ **+0.05** with the 95%
  interval above 0, and positive in at least 2 of the 3 markets.
- **H2:** P(follow | speeds) − P(follow | calms) among touched sessions, pooled, ≥ **+10 pp** with the interval above 0.
- **THE MIRROR:** the same statistics with the state label circularly shifted by 20 sessions within each market must
  sit inside ±half the real effect; if the shifted label scores as well, the verdict is NULL whatever H1 shows.
- GOLD: reported with the same rules, judged separately, not pooled.

## 5. Power and the judge date

No look before the judge date except counts (sessions logged, share per state). **Judge when each primary market has
≥ 250 scored sessions and ≥ 60 in each state** (about October 2027). With ~250 sessions per market and the
day-to-day s.d. of y ≈ 0.45 (forecast_history, US indices), the pooled minimum detectable difference at 80% power is
about 0.06, so the +0.05 gate is near the edge of what the record can show; a miss at the judge date with the
interval spanning the gate is banked UNDERPOWERED and the record runs a second year.

## 6. Multiplicity

Two scored questions (H1, H2) on one primary market set; no variants. GOLD is secondary and reported only.

## 7. What it does not test

Direction; levels as support/resistance; any entry rule (that was `gamma-regime-trades`); the 07:00 state (logged,
descriptive only).

## 8. What each verdict changes

- VALIDATED (H1 and/or H2) → the state becomes a tested context line on the OI page and a candidate input for the
  range forecast (its own one-forecast variant) and for a regime-conditional rule (its own prereg).
- NULL → the full-book hedging state is description only; the page says so.
- UNDERPOWERED → keep logging; re-judge after another 250 sessions.

## Amendments

### A1 — 2026-10-19 — PRE-RESULTS
The record starts with the 2026-10-19 session, not 2026-10-20: the job deployed mid-session and took that day's
snapshot at 13:39 London. The primary label uses the 00:00 open and the prior-close Cboe book, so it is unaffected;
that day's `stateAt0700` field was really taken at 13:39 (descriptive only). No outcome had been computed.

### A2 — 2026-10-19 — PRE-RESULTS
Each morning the job also stores a trade plan (`js/hedgingPlan.js`: follow breaks of the chosen p75 lines when the
state at the open is `speeds`, fade them when `calms`; stops at p50/p90, targets at p90/p50, entries 08:00–20:00
London, one trade a day) and paper-scores it each night in R after 0.01% cost. The running paper record is shown
live on the OI page because the owner wants to watch the plan as it trades. It is descriptive and is NOT part of
the H1/H2 verdict; H1/H2 remain counts-only until the judge date. Prior: the same playbook on the CME book was
`gamma-regime-trades` (null, −0.03 R). No outcome had been computed.
