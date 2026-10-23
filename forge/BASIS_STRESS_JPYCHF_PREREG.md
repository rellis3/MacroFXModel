# basis-stress-jpychf — Do C.OG's cross-currency basis rules hold on the yen and Swiss franc, where dollar-funding stress is largest?

**Pre-registered 2026-10-23, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `basis-stress-jpy-usd`, `basis-stress-jpy-fxvol`, `basis-stress-chf-usd`, `basis-stress-chf-fxvol`, `basis-yearend-jpy`, `basis-yearend-chf` (six scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `basis-stress-jpychf` |
| Data | Feature store `xccy_basis_{jpy,chf}_{dchg,realised}` (phase-2 build 2026-10-23, `analysis/output/xccy-basis/README.md`; CHF 2022-04-20 → 05-31 excluded as a feed fault) and `px_d1_*` for the 7 USD pairs. 2016-01 → 2026-08-19, before the lockbox. |
| Seed | `20261023` |
| Uncertainty | R1: block bootstrap over days, block 10, B = 2000. R2: bootstrap over contracts, B = 2000. |
| Scripts / outputs | `scripts/basis-stress-jpychf/` → `analysis/output/basis-stress-jpychf/` |
| Harness | Own script; the same code path as `scripts/basis-stress-rules/run.py` with the pair swapped. |

## 1. The claim (required)

C.OG (Currency Markets & Global Flows): "Basis moving 20-30bps in a day signals funding stress emerging" and "Basis typically widens at quarter-end due to bank balance sheet management".

On EUR/GBP (`basis-stress-usd`, `basis-stress-fxvol`, both null; `basis-yearend-premium`, validated) the stress rule failed and the year-end premium held. The yen and the franc are where dollar-funding stress is classically largest: JPY reached −246bp in March 2020 in this build, and Japanese banks are among the biggest dollar borrowers via swaps (BIS). So the rule gets its fairest chance here. This is a new question (new pairs), not a re-run.

## 2. Why it is not already settled (required)

The EUR/GBP results do not transfer automatically. The JPY basis is structurally wider and more volatile (2022 median −72bp, against −27bp for EUR), driven by Japanese institutions' dollar demand. CHF is a safe-haven currency with its own dynamics. No ledger entry uses the JPY or CHF basis.

## 3. Definitions, fixed in advance (required)

Identical to `forge/BASIS_STRESS_RULES_PREREG.md` §3, per pair:
- **R1.** W_t = −(the pair's fixed-leg daily basis change), + = widening. Outcomes over the next 5 OANDA closes:
  - `usd`: the 7-pair USD basket return, + = USD stronger.
  - `fxvol`: mean FX volatility beyond the 20-day persistence fit.
  - Statistic: Pearson r. **Expected positive.**
  - Controls: shift placebo of at least 20 days; halves split at 2021-04-01.
- **R2.** For each contract, D = mean realised basis on days whose window spans the preceding quarter-end, minus no-span days. The statistic is mean D over **March** contracts (span 31 December) minus mean D over the other contracts. **Expected negative.** Bootstrap over contracts.
- **Descriptive (not scored):**
  - the JPY **fiscal year-end**: June contracts (which span 31 March, the Japanese fiscal year-end) against September/December contracts;
  - the literal ≥ 20bp days;
  - pair-specific outcomes (USDJPY or USDCHF alone).

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a, c | jpy/chf `usd`: does a widening come before USD strength? | **Small positive or none.** EUR/GBP showed none. |
| b, d | jpy/chf `fxvol`: does a widening come before busier FX? | **Small positive or none.** |
| e | `yearend-jpy`: a year-end premium? | **Yes, negative**, larger than EUR/GBP's −14bp. |
| f | `yearend-chf`: a year-end premium? | **Yes, negative.** |
| — | **THE GATE.** R1: Holm CI excludes 0 with a positive sign; positive in both halves; above the placebo. R2: Holm CI excludes 0 with a negative sign; negative in both halves of the contracts (2016–2020 vs 2021–2026). Holm is across all six cells. | |

## 5. Power (required)

- **R1:** about 1,830 days (CHF about 1,790). MDE r at Holm α 0.05/6 ≈ (2.64 + 0.84)/√1830 ≈ **0.081**. Bar 0.10. **POWERED.**
- **R2:** about 10 year-end contracts against about 31 others per pair. The EUR/GBP version detected −14bp with CI ±10bp. The JPY and CHF bases are noisier, so the CI will be wider. Bar −10bp. If the CI includes the bar, the verdict is UNDERPOWERED.

Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−bar, +bar); UNDERPOWERED otherwise.

## 6. Multiplicity (required)

Six scored cells, Holm at α 0.05. Everything in the §3 descriptive list carries no pass weight.

## 7. What this does NOT test (required)

- Trading rules, costs, intraday timing.
- Whether the basis **level** predicts anything over months.
- AUD, CAD (not built).

## 8. What each verdict changes (required)

- **R1 VALIDATED (either pair)** → ledger entry. A live JPY/CHF basis feed becomes worth building (it needs a CME settlement source on Railway), plus a Desk Watch trigger. No sizing until |t| ≥ 3.
- **R2 VALIDATED** → ledger entry. The year-end funding premium is noted for that pair on the funding page.
- **NULL / UNDERPOWERED** → ledger entries. C.OG's stress rule is then recorded as not leading on any of the four majors' bases tested.
