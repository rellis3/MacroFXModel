# vol-layer-rule-a-confirm: do the Vol-Layer stage 3 risk overlays improve Rule A's own book?

**Pre-registered 2026-11-15. No outcome in the confirm window (2023-01-01 → 2026-08-20) has been computed for any overlay.** Rule A's own baseline in that window has been seen before (the 2020-26 backtest, +0.162R net of 2× spread). Only the overlay differences are unseen.

| | |
|---|---|
| ID / ledger id | `vol-layer-rule-a-confirm-s1`, `-s2`, `-s3`, `-z1`, `-k1` (five scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-layer-rule-a-confirm` |
| Data | **Rule A signals:** `backtest-data/line-backtest/<SYM>.json.gz`, trades "A". These are the chosen v3 lines and the registered rule from `scripts/backtest/build_line_backtest.py`, used as they are. **Instruments (11):** EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF, USDJPY, GOLD, NQ, SPX500, US30, US2000. **Fills:** M1 bid/ask from `data/m1_bidask`. **Score window:** 2023-01-01 → 2026-08-20; the lockbox (2026-08-21 onward) is untouched. **Discovery (build and power only):** 2020-08-24 → 2022-12-30. **Vol-clock profile:** discovery sessions 2016-10-24 → 2022-12-30 only. |
| Seed | `20261115` |
| Uncertainty | Stationary date-block bootstrap over book weekdays, block 20, B = 2000 (`line_reaction.Boot`) |
| Scripts / outputs | `scripts/vol-layer-rule-a-confirm/run.py` → `analysis/output/vol-layer-rule-a-confirm/{discovery,confirm}/` |
| Harness | Own script. The overlays need a bid/ask path re-run of each trade, which the harnesses don't do. |

## 1. The claim
Stage 3 of the Vol-Layer research (vol-layer-system.html, 2016-22 random entries) found four risk-side effects that hold across instruments and years:
- the spread adds about 2pp to stop touches;
- the stop touch rate follows the vol clock for time left;
- σ sizing moves tail days into quiet sessions, and a level floor looked like it helped;
- the FX book is mostly one dollar bet.

Each implies an overlay. **The claim:** on the one system that already passed (Rule A), each overlay improves the daily book's risk-adjusted return, or for the dollar cap its worst days, on unseen 2023-26 data with real bid/ask fills.

## 2. Why it is not already settled
- **Stage 3 used random entries with 0.5–2σ stops held to 22:00 or longer.** Rule A uses a 0.2σ stop behind the line (about 0.27σ of risk), enters 00:00–10:00, is out by 22:00, and stops out about 72% of the time by design (a break trade with a 5R runner). Whether effects measured on wide stops carry over to Rule A's narrow ones is the open question.
- **Nearest banked entries:**
  - `rule-a-portfolio`: the cluster budget was UNDERPOWERED, +0.28 Sharpe [−0.05, +0.68]. K1 is a different rule: a live intraday cap on open same-direction USD exposure, not a fixed budget.
  - `rule-a-book-forward`: the forward record, untouched by this study.
  - `vol-layer` stage 3 panels: descriptive, not banked.
- **Discovery look (2020-08-24 → 2022-12-30, 922 trades, 612 book days), stated before scoring:**
  - The bid/ask re-run matches the registered mid grid on 922 of 922 trades (gross +0.350R both).
  - Baseline B0: net +0.215R, Sharpe 1.23.
  - Change in Sharpe for each overlay against B0:

    | Cell | ΔSharpe | 95% CI |
    |---|---|---|
    | S1 | −0.09 | [−0.35, +0.18] |
    | S2 | +0.04 | [−0.19, +0.25] |
    | S3 | −0.06 | [−0.29, +0.17] |
    | Z1 | +0.01 | [−0.08, +0.10] |
    | K1 | −0.30 | [−0.57, −0.06] |

  - K1's CVaR5 improves, but no more than a random skip of the same trades (p 0.55).
  - **Expectation: no overlay passes.** The confirm is run anyway because it was approved as the stage 4 test, and a banked null is what closes the layer-to-Rule A question.

## 3. Definitions, fixed in advance
**Rule A (unchanged).** Rich-day flag; first 1-minute close ≥ 0.05σ through an O→H / O→L p50 / p75 chosen line between 00:00 and 10:00 London; enter at the next bar's open. One trade per line per day.

**Fills and exits.**
- Buys fill at the offer, sells at the bid.
- Stop hits are checked on the bid low for longs and the ask high for shorts. A stop that gaps fills at the bar's open; on the entry bar it fills at the stop.
- Target = 5 × the arm's own risk, where risk = entry fill to stop.
- Stop wins ties.
- Otherwise exit at the last bar before 22:00, at the bid for longs and the offer for shorts.
- **Net R** = side × (exit fill − entry fill) ÷ risk. One real spread is paid; no extra cost table.

**Arms** (u = σ × London open ÷ 100, σ = the chosen σ for the day):

| Arm | Stop | Base | Neighbours (plateau) | +1 lag |
|---|---|---|---|---|
| B0 | line − side·0.2u | — | — | — |
| S1 spread-aware | line − side·(0.2u + a·spread at entry) | a = 1 | a = 0.5, 1.5 | spread from the previous session, same minute or the latest before it |
| S2 vol clock | line − side·0.2u·(Vrem(entry)/Vrem(00:00))^p | p = 0.5 | p = 0.25, 0.75 | n/a: the profile is static and built from discovery only |
| S3 | S1 + S2 at base | — | — | — |
| Z1 level floor | line − side·0.2·open·max(σ, Q_q)/100, where Q_q = q-quantile of σ over the previous 252 sessions (min 126) | q = 0.2 | q = 0.1, 0.3 | Q through t−2 |
| K1 dollar cap | B0 trades; skip a trade if same-direction open USD exposure would exceed c | c = 2 | c = 1, 3 | n/a: no time-indexed input |

**USD exposure** (+1 = long USD):
- EURUSD, GBPUSD, AUDUSD and GOLD long = −1.
- USDCAD, USDCHF and USDJPY long = +1.
- Indices = 0.
- A trade is open from its entry minute to its B0 exit minute.

**Daily book.** The sum of net R over all weekdays on which any Rule A instrument has a London session in the window (0 if no trade). Sharpe = mean ÷ SD × √252. CVaR5 = the mean of the worst 5% of days.

## 4. Hypotheses

| Cell | Question | Primary statistic |
|---|---|---|
| S1 | Does the spread-aware stop raise the book Sharpe? | ΔSharpe vs B0, block bootstrap |
| S2 | Does the vol-clock stop raise it? | ΔSharpe vs B0 |
| S3 | Do both together raise it? | ΔSharpe vs B0 |
| Z1 | Does the σ level floor raise it? | ΔSharpe vs B0 |
| K1 | Does the dollar cap make the worst days less bad than skipping the same number of trades at random? | p = share of 500 random same-count-per-day skips with CVaR5 ≥ K1's |

**THE GATE (VALIDATED)**, all of the following:
- Holm-adjusted p < 0.05 across the five cells;
- the effect is in the helpful direction;
- **plateau:** both neighbours have the same sign and at least half the base size;
- **+1 lag**, where applicable: same sign and at least half the size;
- the same sign in at least 3 of the 4 calendar years 2023–2026.

For K1, ΔSharpe must also not be below −SESOI.

**THE MIRROR:** each arm beside B0 on the same trades (paired ΔR per trade is reported), and for K1, the random skip of the same count.

**Other verdicts:**
- **NULL:** the 95% CI of ΔSharpe lies below +SESOI = 0.15 Sharpe (for K1: p_random ≥ 0.05 and the ΔCVaR5 CI includes 0), or the effect is significantly harmful.
- **UNDERPOWERED:** the CI includes both 0 and +0.15.
- **CONTEXT:** passes on p but fails the plateau, lag or year checks.

## 5. Power
Discovery bootstrap SEs of ΔSharpe on 612 days:
- S1 0.135, S2 0.108, S3 0.117, Z1 0.045.

The confirm window has about 930 book days, so the SEs scale by about 0.81:
- S1 0.11, S2 0.09, S3 0.095, Z1 0.036.

MDE at 80% power, two-sided 5%:
- S1 ≈ 0.31, S2 ≈ 0.25, S3 ≈ 0.27, Z1 ≈ 0.10 Sharpe.

So **Z1 is powered** to rule out an effect of 0.15. **S1, S2 and S3 are not**: an outcome inside ±0.3 will read as UNDERPOWERED, and only a large gain or a clear harm can be called. K1 is judged against its random-skip distribution, which needs no SESOI.

## 6. Multiplicity
- Five scored cells, Holm at α = 0.05.
- Neighbour settings, lag variants, per-year splits, stop rates and paired ΔR are descriptive.

## 7. What this does NOT test
- Rule A's entry or its edge: the baseline has been seen.
- The weekend allowance: Rule A is flat by 22:00.
- The error-scaled stop: demoted in stage 3.
- 1/σ² or RV20 sizing: Rule A's R is set by its stop, so sizing equals the stop rule.
- Live fills or slippage beyond the M1 bid/ask.
- The forward record.

## 8. What each verdict changes
- **Any VALIDATED:** that overlay is proposed for the Rule A paper arm as a new arm, side by side with the old one; never an edit to the live arm.
- **NULL or UNDERPOWERED on all cells:** the stage 3 risk layers are recorded as not transferring to a narrow-stop break system. They stay as the recipe for wider-stop systems (stops of 0.5σ or more held to 22:00 or longer), which is where stage 3 measured them. The next stage 4 needs a base system of that kind.
- **K1 harmful:** don't cap Rule A by the dollar; its same-day USD trades carry its winners.

## Amendments

### A1 — 2026-11-15 — POST-HOC (results seen)
**What the K1 rules said.** K1's NULL clause needed the ΔCVaR5 interval to include 0. No rule that skips trades can meet that clause, because fewer trades always make the worst days shallower: here +0.90 [+0.51, +1.37].

**Result against the registered benchmark.** That benchmark is a random skip of the same count on the same days, and K1 is not distinguishable from it:
- CVaR5 −3.71R against −3.74R, p 0.19.
- K1 does not reach VALIDATED.

**Change.** K1 is banked as UNDERPOWERED, not NULL. This only describes the result; it does not promote it.
