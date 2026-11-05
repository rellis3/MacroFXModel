# global-read-untested-direction — do the Global Read's five never-tested reads call the next move?

**Pre-registered 2026-11-05, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `global-read-untested-direction` (the study), with one ledger id per scored cell: `gr-hmm-trend-direction`, `gr-us-yields-direction`, `gr-dollar-tape-direction`, `gr-risk-tone-direction`, `gr-today-tape-direction` |
| Branch | `ccr-4824155b-3im5ze` |
| Register row | `plans/RESEARCH_REGISTER.md` → `global-read-untested-direction` |
| Data | OANDA mid via `/api/ohlc-range`: daily bars on the **London-midnight** boundary (`dailyAlignment=0`, Europe/London) and H1 bars for the intraday cell; FRED `DGS10`, `DTWEXBGS`, `BAMLH0A0HYM2`. Seven pairs: EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF (the Global Read's `GR_PAIRS`). **Window 2016-01-04 → 2026-08-21** (stops at the lockbox) |
| Seed | `20261105` |
| Uncertainty | date-block bootstrap: dates resampled in 21-session blocks, all seven pairs together (they share the dollar), B = 2000 |
| Scripts / outputs | `scripts/global-read-untested-direction/` → `analysis/output/global-read-untested-direction/` |
| Harness | own script: the inputs are rebuilt with the live code (`hmm.js` `fitHMM`, the formulas in `js/globalReadInputs.js`) |

## 1. The claim

The Global Read (`js/globalReadCore.js`) shows five direction reads at weight 0, labelled "never tested (weight 0 until tested; open question)". The owner asked on 2026-11-05 for all five to be tested. Each read claims to say which way a pair goes next:

1. **HMM trend direction** (`hmm-trend`): `fitHMM` on the last 200 daily log returns. In a TREND regime with |t| ≥ 1 on the last 10 returns, the read is +1 (BULL) or −1 (BEAR); otherwise 0.
2. **US 10Y yield trend** (`us-yields`): `usdSide · clip(Δ20 DGS10 in bp / 25)`. US yields up means the dollar side up.
3. **Dollar trend (20d)** (`dollar-tape`): `usdSide · clip(Δ20% DTWEXBGS / 2)`. The broad dollar's 20-day move continues.
4. **Credit / risk tone** (`risk-tone`): `RISK_BETA[pair] · clip(−Δ20 HY OAS in bp / 50)`. Tighter credit means risk-on, so the commodity currencies go up and the havens go down.
5. **Today so far** (`today-tape`): `clip(open→now / (0.6745 σ))`. The session's move so far continues.

## 2. Why it is not already settled

- `trend-following-fx` (NULL) tested 12-month trend over months. Reads 1 and 3 are 10- and 20-day reads of the next day, a different horizon.
- The yield → asset coupling null is same-bar only; it never asked whether a 20-day yield move leads the next day.
- `credit-stress` failed out of sample as a range gate; its direction was never asked.
- The jump-momentum null concerned single bars after jumps, not the session's running move.

None of the five has a banked test as a day-ahead direction read, and none is a re-run of a null.

## 3. Definitions, fixed in advance

- **Days:** weekday London-midnight daily bars present for the pair, 2016-01-04 → 2026-08-21.
- **Knowable when:** reads 1–4 use only information at or before the close of day t; the outcome is day t+1's close-to-close log return.
  - FRED series are lagged to what had been published by then: `DGS10` and `BAMLH0A0HYM2`, the latest observation dated ≤ t−1 business day; `DTWEXBGS` (H.10, published weekly), the latest observation dated ≤ t−7 calendar days.
  - Δ20 = that value minus the value 20 observations earlier. "Δ20%" = 100 · Δ20 / (the earlier value).
  - `usdSide` = +1 when USD is the base (USDJPY, USDCAD, USDCHF), −1 otherwise. `RISK_BETA` = {AUD 1, NZD 1, CAD −1 (USDCAD), JPY 1 (USDJPY), CHF 1 (USDCHF), EUR 0.5, GBP 0.5}, exactly as `js/globalReadInputs.js`.
- **The intraday read (5):**
  - On London day d, the session opens at 00:00 London. At the **13:00 London** checkpoint (the scored one), s = clip((close at 13:00 − open) / open / (0.6745 σ)), where σ is the standard deviation of the previous 20 daily returns.
  - The outcome is the log return from 13:00 to **21:00 London** on the same day.
  - The 10:00 and 16:00 checkpoints are descriptive.
  - H1 bars are mapped to London time with DST, and a day missing either checkpoint is dropped.
- **Statistic per cell:** the mean over the seven pairs of each pair's Pearson correlation IC = corr(s_t, outcome). Days with s = 0 are included, because a 0 is the read saying nothing. The sign convention is that a positive IC means the read is right.
- **Control (time shift, descriptive):** the same s against the return two days later (reads 1–4); it should be near zero.
- **Halves:** 2016-01-04 → 2021-04-30 and 2021-05-03 → 2026-08-21.

## 4. Hypotheses, expectation first

| # | Cell | Pre-registered expectation |
|---|---|---|
| H1 | HMM trend → next day | **Null.** Short-horizon FX trend has been null here |
| H2 | US 10Y 20d → next day | **Null** (the coupling is same-bar) |
| H3 | Dollar 20d → next day | **Null or a small positive IC** (FX time-series momentum is weak at 1 day) |
| H4 | Credit tone → next day | **Null** |
| H5 | Today so far (13:00) → rest of day | **Null or slightly negative** (intraday FX mean-reverts a little) |
| — | **THE GATE, per cell:** Holm-adjusted p < 0.05 across the 5 cells **and** IC ≥ +0.05 **and** both halves positive | |
| — | **THE MIRROR** is built in: every s is signed, so the bear side is tested with the bull side | |

## 5. Power

The control sample is USDCHF: 2,772 weekday London-day bars in the window. The seven pairs are correlated (cross-instrument ρ ≈ 0.47, `plans/SEARCH_BREADTH.md`), so n_eff ≈ 2,772 × 7 / (1 + 6 × 0.47) ≈ 5,080.

| Cell | n_eff | MDE (IC, 80% power, worst Holm α 0.01, two-sided) | Pass bar | Verdict |
|---|---|---|---|---|
| H1–H4 | ≈ 5,080 | 0.048 | IC ≥ 0.05 | POWERED |
| H5 (one intraday checkpoint a day) | ≈ 5,080 | 0.048 | IC ≥ 0.05 | POWERED |

An IC of 0.05 a day is the smallest effect worth a weight here. Global Read weights scale with IC, and anything smaller is lost in spread and noise.

## 6. Multiplicity

- **Scored cells:** the five above. Holm at α = 0.05; p-values come from the bootstrap (two-sided).
- **Per-pair cells** (35) and the 10:00 / 16:00 checkpoints are disaggregation: Benjamini-Hochberg at q = 0.10, reported with their chance baseline, and never a result on their own.

## 7. What this does NOT test

- **Tradability after costs:** an IC is not a strategy.
- **Gold and the indices:** these reads also feed gold, NQ and US2000 as story reads, but that is a different question.
- **The live NY-close clock:** the live HMM fits 17:00 New York bars; this test uses London-midnight bars. The definition is otherwise identical.
- **Combinations of the reads:** each read is tested alone.

## 8. What each verdict changes (in `js/globalReadCore.js` REGISTRY)

- **VALIDATED with |t| ≥ 3:** tier `validated`, `ic` = the measured pooled IC. It gets weight in the tested arm.
- **VALIDATED with 2 ≤ |t| < 3:** tier `descriptive` (quarter weight), research-only until a forward test or |t| ≥ 3.
- **NULL:** tier `null`; the row reads "tested null (weight 0)" with this ledger id.
- **UNDERPOWERED:** stays `untested`, and its evidence note names this test and why it couldn't decide.

Every cell is banked whatever its verdict.

## Amendments

*(none)*

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/global-read-untested-direction/RESULTS.md`. Nothing above this line changes after the run.*
