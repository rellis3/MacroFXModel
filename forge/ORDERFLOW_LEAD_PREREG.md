# orderflow-lead — does NQ buy/sell imbalance in a 5-minute bar predict the next 5 and 15 minutes, beyond the move already in that bar?

**Pre-registered 2026-11-01, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `orderflow-lead` |
| Branch | main |
| Register row | `plans/RESEARCH_REGISTER.md` → `orderflow-lead` |
| Data | NQ front-month trade ticks from NT8 (`nt8_bridge/nt8_pull.py`), regular hours 09:30-16:00 America/New_York, from the first date the provider serves ticks (probed: 2025-11-14 serves, 2025-05-15 does not) to **2026-08-21**. Sessions after 2026-08-21 stay sealed (lockbox) |
| Seed | `20261101` |
| Uncertainty | session-block bootstrap, 5-session blocks, B = 2000 |
| Scripts / outputs | `scripts/orderflow-lead/` → `analysis/output/orderflow-lead/` |
| Harness | own script (no per-setup trades, so `study.mjs` / `runStudy` do not apply) |

## 1. The claim

From the owner (2026-11-01): the running buy/sell delta on the NQ order-flow card might act as a lead line that shows where price may go. Order-flow books and vendor videos make the same claim: aggressive buying or selling shows up in flow before it shows up in price. The plan-of-record item is `plans/QUANT_SYSTEM_BUILD_PLAN.md` row 6, "Order-flow imbalance, intraday", registered here now that NT8 history is usable.

## 2. Why it is not already settled

- No Evidence Book entry tests order flow as a predictor. `failed-auction-volume` (forge/FAILED_AUCTION_VOLUME_PREREG.md, D1) uses tick-rule delta only as a descriptive add-on at balance edges.
- `plans/LEVEL_ENGINE_ROADMAP.md` names "real order flow or exchange volume" as the one new information source that would justify reopening level-reaction work, so this is the test it asked for, not a re-run of a null.
- Nearby nulls that do NOT cover it: the Jump-arrow null (`project_jump_momentum_ignition_null`) and VuManChu direction null are price-indicator tests; the IEP research found direction null for opening-auction size.
- Known limit stated up front: the sign comes from the tick rule (price up = buy), which is built from price itself. A same-bar link is mechanical. This test asks only about the FUTURE bars after controlling for the current bar's own return.

## 3. Definitions, fixed in advance

- **Bar:** 5-minute bars from 09:30 New York (DST-aware). Bars whose outcome window would pass 16:00 are dropped.
- **Contract:** front month by calendar, rolled 8 days before the third Friday of Mar/Jun/Sep/Dec. Returns are never computed across a roll.
- **Signed volume:** a trade is a buy if it printed above the previous different price, a sell if below, and an unchanged price keeps the previous sign (the rule used by `scripts/footprint/nt8_footprint.py`; agreed with quote matching on the sign of 10 of 10 minutes on a 10-minute test, so it is a conservative stand-in).
- **Signal D(t):** (buy - sell) / (buy + sell) over the bar. Known at the bar's close, which is when the outcome window starts.
- **Outcome R(t,h):** log return from the bar close to h minutes later, divided by the trailing realised 5-minute sigma (60 bars, known at the close) times sqrt(h/5). h in {5, 15} are scored; 30 is descriptive.
- **Model:** pooled OLS of R(t,h) on D(t), with the same-bar return r(t) and the previous bar's return r(t-1) as controls. Everything standardised so the slope is in standard-deviation units. **The scored quantity is the slope on D(t).**
- **Control / placebo:** the same regression with D taken from a different session at the same time of day, shifted by k = 1..20 sessions. The real slope must sit outside the 2.5 to 97.5 percent range of the 20 placebo slopes. A placebo mean far from zero means the design is biased and voids the run.
- **Time-shift check:** the slope on D(t+1) (future flow) for R(t,h) must NOT beat the placebo; if it does, the link is mechanical, not a lead.
- **De-clustering:** none by dropping; overlapping windows are handled through the design effect and the session-block bootstrap.
- **Sample:** first-half / second-half split by chronological session count, fixed at the midpoint of the available sessions.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Is the slope on D(t) for h = 5 above the bar, with the same sign in both halves? | **Null.** Any short-horizon predictability is expected to be small and mostly the same-bar effect. |
| b | Same for h = 15 | **Null** |
| c | **THE GATE** | Both scored cells pass Holm at alpha 0.05 over 2 cells, |slope| >= 0.05, same sign in both halves, outside the placebo range, and the time-shift check clean. |
| d | **THE MIRROR** | A negative slope (flow that reverses) is reported with the same gate; two-sided test, direction recorded either way. |

Descriptive, no pass weight: h = 30; raw delta (not ratio) z-scored; the 30-minute running delta as the signal. These are counted as variants for best-of-N (3 variants beyond the primary).

## 5. Power

Control-sample bars only: about 190 sessions x 76 usable bars = about 14,400 bars, unit-variance standardised outcome.

| Cell | Planned n | Outcome SD (standardised) | Design effect | **MDE** (80% power, alpha 0.025 two-sided) | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| h = 5 | 14,400 | 1 | 1 | 0.025 | 0.05 | POWERED |
| h = 15 | 14,400 | 1 | 3 (overlap) | 0.044 | 0.05 | POWERED (thin) |
| h = 30 | 14,400 | 1 | 6 | 0.062 | 0.05 | UNDERPOWERED, descriptive only |

If the number of usable sessions comes in 20 percent under plan, h = 15 becomes UNDERPOWERED and is reported as such, not as null.

## 6. Multiplicity

- Scored cells: h = 5 and h = 15, the slope on D(t). Holm at alpha 0.05 over 2. The gate is conjunctive (both cells, both halves), so no further correction.
- The bootstrap gives intervals, not p-values: converted with `pFromCI` (normal approximation) for Holm.
- Disaggregation (by hour of day, by year-month) is reported with BH at q = 0.10 and `chanceBaseline`; a surviving slice is only a candidate for its own prereg.
- Promotion to any live use needs |t| >= 3 on the scored cell, not 2.

## 7. What this does NOT test

- **Tradability.** A slope of 0.05 standard deviations is far below NQ costs; a pass would mean "there is a lead", not "there is a trade".
- **Quote-matched or order-book flow.** Only the tick-rule sign is used; a real lead, if any, is more likely in quote-matched flow. That is a follow-up (`orderflow-lead-quoted`) once the bridge serves bid/ask history.
- **Live use.** Both feeds are about 10 minutes delayed; a lead of minutes could not be used live even if it exists.
- **Other instruments, news windows, or levels.** NQ only; no condition on levels or releases.

## 8. What each verdict changes

- **Pass** -> ledger entry `validated` (research-only); card 05f may show a "flow pressure" read-out, still labelled descriptive; the quote-matched follow-up is registered. No bot reads it.
- **Null** -> ledger entry `null`; card 05f stays a description with no projection line and says so.
- **Underpowered** -> record why (sessions available, h = 15 MDE) and what data would fix it (more history once the provider serves it, or the live recorder's quotes).

## Amendments

(none)
