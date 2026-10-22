# basis-stress-rules — Do C.OG's cross-currency basis rules hold: does a sharp one-day basis widening come before dollar strength and busier FX, and does the basis widen into year-end more than into other quarter-ends?

**Pre-registered 2026-10-22, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `basis-stress-usd`, `basis-stress-fxvol`, `basis-yearend-premium` (three scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `basis-stress-rules` |
| Data | Feature store: `xccy_basis_{eur,gbp}_dchg` and `_realised` (built 2026-10-22, `analysis/output/xccy-basis/README.md`; per-contract detail in `basis_daily.csv`), `px_d1_*` for the 7 USD pairs (OANDA daily closes). 2016-01 → 2026-08-19 (data end; before the lockbox). |
| Seed | `20261022` |
| Uncertainty | R1 cells: block bootstrap over days, block 10, B = 2000. R2: bootstrap over contracts, B = 2000. |
| Scripts / outputs | `scripts/basis-stress-rules/` → `analysis/output/basis-stress-rules/` |
| Harness | Own script. |

## 1. The claim (required)

C.OG, Education Bank, Currency Markets & Global Flows, verbatim:
> "Watch for sharp moves: Basis moving 20-30bps in a day signals funding stress emerging."
> "Quarter-end effects: Basis typically widens at quarter-end due to bank balance sheet management — don't overreact to predictable seasonal moves."
> Cross-asset table: "Dollar funding stress | Cross-currency basis widening rapidly | Global liquidity tightening; credit stress possible."

R1 reads "signals funding stress emerging" as a forward claim: after the basis widens, the dollar strengthens (funding demand) and FX gets busier. R2 tests the seasonal claim in the only way the futures-implied series can separate it from tenor effects (§3).

## 2. Why it is not already settled (required)

The basis series did not exist in the repo before 2026-10-22, and no Evidence Book entry uses it. The nearest entries: `quarter-end-funding-usd` (the spot dollar into quarter-ends, which is a different variable), `fx-dollar-funding-exposure` (BIS borrowing shares) and `funding-stress` (US repo).

## 3. Definitions, fixed in advance (required)

**R1 (stress signal).**
- **Signal.** `W_t` = −(the mean of the EUR and GBP fixed-leg daily changes `xccy_basis_*_dchg` on day t, using whichever exist). **+ = the basis widened** (dollars got dearer offshore). It is known at 19:15 UTC on day t.
- **Outcome `usd`.** The 7-pair USD basket log return × 100 (each pair signed so + = USD stronger), from the day-t OANDA close (21:00 UTC) to 5 trading days later.
- **Outcome `fxvol`.** The mean over the 7 pairs of [ln(mean |daily return| over t+1..t+5) − the persistence fit on ln(mean |daily return| over t−19..t)]. The persistence fit is OLS per pair over the full sample. This is FX volatility beyond what recent volatility predicts.
- **Statistic.** The Pearson correlation of W_t with each outcome over all days with both. **Expected positive** for both.
- **The course's literal rule** (W_t ≥ 20bp in either pair) is reported as event means. It is descriptive only, because there are few such days.
- **Controls.**
  - Placebo: circular shifts of W of at least 20 days.
  - Halves split at 2021-04-01.
  - A same-day check (W_t against the day-t return) is reported to separate "moves together" from "comes first".

**R2 (year-end premium).**
- **The problem.** In each quarterly contract, the window [spot value date, delivery) spans the preceding quarter-end only during roughly its first 2–3 weeks. Those "span" days also have the longest tenor, so span against no-span is confounded with the term structure for **every** contract.
- **The fix.** Compare the year-end contract with the others. For each contract c, D_c = mean realised basis on span days − mean on no-span days (in bp). The statistic is mean D over **March** contracts (span = 31 December) minus mean D over June/September/December contracts (span = 31 March / 30 June / 30 September). EUR and GBP are averaged per contract. **Expected negative**: the year-end turn costs more than an ordinary quarter-end.
- The general "every quarter-end widens" reading is reported descriptively, with the tenor caveat.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `usd`: does a basis widening today come before USD strength over the next 5 days (r > 0)? | **Small positive or none.** The FX market prices funding stress the same day. |
| b | `fxvol`: does it come before busier FX than recent vol predicts (r > 0)? | **Small positive.** |
| c | `yearend`: is the year-end span premium more negative than for other quarter-ends? | **Yes, negative**, about −5 to −15bp. The year-end turn is a well-known dollar squeeze. |
| — | **THE GATE**: R1 cells: Holm CI excludes 0 with a positive sign; positive in both halves; above the shift placebo. R2: Holm CI excludes 0 with a negative sign; negative in both EUR and GBP. | |
| — | **THE MIRROR**: a basis narrowing (W < 0) is the other end of the correlation. | |

## 5. Power (required)

- **R1.** About 1,830 days. W_t is close to independent day to day (the daily change of a series), so overlapping 5-day outcomes inflate the variance very little, and the effective n is close to 1,830. MDE for r at 80% power, Holm α 0.0167: (2.39 + 0.84)/√1830 ≈ **0.075**. Useful bar 0.10. **POWERED.**
- **R2.** About 10 March contracts against about 31 others, per pair. The spread of D across contracts is not known before running, but with 10 year-ends the cell is expected to detect only a large premium. Useful bar −10bp. If the CI includes the bar, the verdict is UNDERPOWERED.

Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−bar, +bar); UNDERPOWERED otherwise.

## 6. Multiplicity (required)

- Scored: `usd`, `fxvol`, `yearend` (Holm at α 0.05).
- Descriptive only: the literal ≥ 20bp event days; EUR and GBP separately; 1-day and 20-day horizons; "VIX low, basis widening" (W_t in the top decile while VIX is below its 1-year median); and the generic span-against-no-span premium with its tenor caveat.

## 7. What this does NOT test (required)

- JPY and CHF basis (phase 2 of the build), which is where the March 2020 stress was largest.
- Intraday timing, costs, or a trading rule.
- Whether the level of the basis predicts anything over months.

## 8. What each verdict changes (required)

- **R1 VALIDATED** → ledger entry. The basis is wired live (it needs a CME settlement feed on Railway). A Desk Watch "basis widening" trigger cites the effect. No sizing until |t| ≥ 3.
- **R2 VALIDATED** → ledger entry. The funding page notes the expected year-end turn premium.
- **NULL / UNDERPOWERED** → ledger entries. The course rules are recorded as descriptions: the basis shows stress on the day, but this does not show it comes first.
