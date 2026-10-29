# Milestone 3 — Does the existing forecast tell us what price does next?

Run 2026-10-29 on the milestone-2 archive (GOLD, NQ, EURUSD). The forecast, widths and archive are unchanged, and no
indicator was added. Primary evidence: the out-of-sample era (point-in-time parameters, 2020-08-21 → 2026-08-20,
~1,450 days per instrument). The in-sample era (2016 → 2020-08-20) is shown as exploratory. Full tables: `TABLES.md`.
Numbers: `results.json`, `direction.json`, `robust.json`. Scripts: `scripts/day-reconstruction/m3_*.py`,
`phantom_touches.mjs`.

## 1. Executive summary

**The forecast levels say how far and how often, not which way.**

- The levels are well scaled. After a first touch, the chances of reaching the next rung, revisiting the open, or
  closing back inside are stable and consistent across all three instruments.
- **Price behaves the same at the forecast's levels as at a line of similar distance that isn't the forecast's.**
  Across 378 tested level × outcome cells, 24 differ from that baseline at p < 0.05, where about 19 would by chance.
  One survives a correction for multiple testing, and that one reverses sign in the earlier era.
- **There is no directional edge at any level.** After a touch, price reaches +0.5σ first about as often as −0.5σ
  first, for fixed and projected levels, at p50, p75 and p90, on all three instruments.
- **None of the four hypothesised behaviours (continuation, reversion, exhaustion, range expansion) is a
  forecast-based edge.** Two behaviours are inconclusive (§6). Only one, NQ continuation, has gross movement above
  its spread, and it shows up equally at lines that aren't the forecast's.

## 2. Level behaviour (out of sample, ranges across GOLD / NQ / EURUSD)

One first touch per level per day, about 140–850 touches per cell.
- "+0.5σ / −0.5σ first" is a race from the level price to ±0.5 of the day's σ scale; the remainder end the session
  unresolved.
- σ = open × σ_used, the forecast's own daily scale.

| Level | Next rung reached | Back through previous level | Revisits open | Closes back inside | +0.5σ first / −0.5σ first | Median further travel / pull-back (σ) |
|---|---|---|---|---|---|---|
| OH / OL p50 | 50–51% | 37–49% (= open) | 37–49% | 43–53% | 39–44% / 38–42% | 0.46–0.52 / 0.43–0.53 |
| OH / OL p75 | 37–43% | 39–50% (p50) | 13–20% | 40–52% | 32–46% / 34–44% | 0.37–0.54 / 0.26–0.49 |
| OH / OL p90 | 30–44% (one more step) | 28–35% (p75) | 3–7% | 39–57% | 31–44% / 22–35% | 0.33–0.45 / 0.22–0.38 |
| Close Up / Down p50–p90 | within ±2pp of OH/OL at the same rung | | | | | |
| Projected H / L p50 | 38–49% | 21–29% (= open) | 21–29% | 42–54% | 31–41% / 33–41% | 0.35–0.45 / 0.29–0.48 |
| Projected H / L p75 | 29–43% | 32–50% | 10–15% | 43–54% | 29–43% / 27–40% | 0.33–0.46 / 0.22–0.45 |
| Projected H / L p90 | 28–48% | 29–42% | 4–20% | 41–56% | 36–47% / 26–39% (n 56–90) | 0.34–0.56 / 0.31–0.51 |

- **Continuation** (next rung): from p50 the next rung is reached about half the time, from p75 about 40%. That's
  what the forecast's own distribution implies, and what lines at those distances do.
- **Reversion** (back to the previous level or the open): common from p50, and rare from p90 (open revisited 3–7%) because
  the open is far away and the day is late. Same at phantom lines.
- **Exhaustion** at p90: closes back inside on 39–57% of days, falls back through p75 on 28–35%. Neither differs from
  the baseline.
- **Range expansion** beyond p90 (one more rung step): 30–44%, not different from the baseline.
- **Timing:** when the next rung is reached, the median wait is 2–3 h from p50 and 1.5–2 h from p75. The median
  adverse move before a +0.5σ target is reached is 0.11–0.16σ.

## 3. Comparative findings

- **Fixed vs projected:**
  - Projected H/L are first touched about 1.5 h later in the day (median 14:45–16:16 London vs 12:56–14:53). Less of
    the session is left, so more races end unresolved (27–29% vs ~21%) and the open is revisited less (21–29% vs
    37–49% at p50).
  - On direction, both families are symmetric and neither beats the baseline.
  - Touching Projected High is **not** equivalent to touching Open High: different time, different range already
    used. But neither event says which way price goes next.
- **OH/OL vs Close Up/Down:** nearly identical, because their prices are within a few hundredths of a percent of
  each other.
- **p50 vs p75 vs p90:**
  - Moving outward lowers the chance of reaching the next rung (≈50% → ≈40% → ≈35%) and of revisiting the open
    (≈40% → ≈16% → ≈5%).
  - It does **not** create direction. Gross R of a 1:1 race stays within about ±0.05 at every rung, apart from NQ
    (below) and a few small p90 cells (n ≈ 160) whose intervals span zero.
  - The single nominally significant p90 cell (NQ OH/OL p90, +0.12R at ±0.5σ) is no different from its baseline
    (+0.04, interval spans 0).
- **Across instruments:** GOLD and EURUSD show no direction anywhere. NQ shows a mild continuation tilt everywhere
  (§6).

## 4. Conditional findings

| Condition | Effect on the absolute probabilities | Effect beyond the baseline / on direction |
|---|---|---|
| Time of touch | Large. Race resolved to +0.5σ first: ~48% before 07:00 London → ~18% after 17:00 (time runs out). Open revisit 52% → 4% | none: phantom lines move identically. Direction stays symmetric |
| Range consumed before the touch (<0.5, 0.5–1, ≥1 × HL p50) | Large. Open revisit ~49% → ~30% → ~11% | none |
| Opposite p50 already reached | Projected levels: open revisit 35–42% vs 9–12% (the range is already wide on both sides) | none beyond the baseline (up to +6pp for GOLD Projected, interval spans 0) |
| σ regime, previous day's range, event day / no event | small | none |

Direction by condition: 11 of 157 cells have an interval excluding zero, against ~8 expected by chance. Ten are the
NQ continuation tilt, and none differ from the baseline; one is EURUSD after 17:00 (n 277). **The path decides how
much time and room is left. It does not decide direction, at these levels or at any line.**

## 5. Statistical reliability

- **Unit:** one first touch per level per day. Intervals use a day-clustered bootstrap (2,000 draws; all of a day's
  touches resampled together).
- **Baseline:** the same rules on **phantom ladders**, where the day's own rungs are scaled ×0.70, ×0.85, ×1.15 and
  ×1.30 on the same days and the same minute path. Three disclosures:
  - The pre-specified baseline (B1, mean of ×0.85 and ×1.15) put real levels 1–3pp *below* it on next / previous /
    open, almost everywhere.
  - That's a geometry artefact: the chance of reaching a distance is curved, so averaging a nearer and a farther
    line overstates the middle.
  - The corrected baseline (B2, quadratic through all four, read at ×1.0) was added **after** seeing this. With it, the
    pattern disappears (e.g. GOLD OH p50 next rung: real 49.7% vs B1 50.8% vs B2 49.6%). Both are in `results.json`.
- **Multiple testing:**
  - 378 level × outcome cells: 24 at p < 0.05 vs 18.9 expected; 1 survives Benjamini–Hochberg q < 0.10. That's
    GOLD Close Down p75 reversal: +7.0pp, but −4.8pp in 2016–2020 and negative in every year 2016–2020.
  - 157 conditional cells: 11 vs ~8 expected.
- **Out-of-sample consistency:** the race direction for each family is stable in sign between eras only for NQ
  continuation. GOLD and EURUSD hover around zero in both.
- **Untagged days** (event calendar ends 2025-04-07; ~355 days per instrument): dropping them moves rates by at most
  4–8pp in small cells and leaves the count of nominally significant cells similar (GOLD 15 → 13, NQ 6 → 12, EURUSD
  4 → 3). No conclusion changes.
- **Same-minute ordering:**
  - 2–4% of ±0.25σ continuations are reached inside the touch minute. These count as continuation, since price must
    cross the level before going beyond it.
  - A strict bound that counts them as losses shifts every gross R by −0.04 to −0.07. Both are in `robust.json`.
- **Other archive limits** (`ARCHIVE.md`): NQ lines about 2% inside the published ones, float32 ties (6 touches),
  mid prices.

## 6. Trading implications

**Costs.** The real spread at the touch minute, in R of a 1:1 trade:

| | ±0.25σ | ±0.5σ |
|---|---|---|
| GOLD | 0.08 | 0.04 |
| NQ | 0.02 | 0.01 |
| EURUSD | 0.13 | 0.07 |

This assumes no commission (OANDA is spread-only); a stop-entry adds slippage on top.

| Behaviour | Verdict | Evidence (out of sample) |
|---|---|---|
| Fade / revert at any fixed or projected level, any rung | **Unpromising** | gross R of the reversion side ≈ 0 to −0.07 on all three; nothing beyond the baseline |
| Exhaustion at p90 (fade the outer level) | **Unpromising** | gross R of the fade at ±0.5σ: GOLD −0.05, EURUSD −0.01, NQ −0.12 (continuation wins there); no baseline difference |
| Range expansion beyond p90 | **Unpromising** | one more step reached 30–44%, equal to baseline; direction ≈ 0 |
| Continuation at levels, GOLD and EURUSD | **Unpromising** | gross R mostly within ±0.05 (small p90 cells up to ±0.13, n ≈ 160) with intervals spanning 0, at or below the spread |
| **NQ continuation after a touch (any family)** | **Inconclusive, the only candidate** | gross +0.05 to +0.07R at ±0.25σ, +0.03 to +0.04R at ±0.5σ, in both eras (in-sample +0.04 to +0.09R); strict bound +0.02 to +0.03R pooled (+0.06 on up-touches); spread 0.01–0.02R. **Equal at phantom lines (vs baseline ≈ 0)**, so it's NQ intraday momentum measured on the forecast's scale, not a property of the levels; years mixed (flat or negative in 2019, 2022 and 2025 for up-touches and 2021 and 2026 for down-touches) |
| GOLD downside p75 reversal | **Inconclusive, not a candidate** | +6.8pp more reversals than baseline out of sample, −4.8pp in 2016–2020; the reversion trade's gross R +0.04 [−0.06, +0.13] |

**What the forecast is good for, on this evidence:** a calibrated ruler for how far a day is likely to travel,
how much of that has been used, and how much time a move has left. Those are inputs to target placement, stop
distance and expectations. The levels themselves are not entry signals.

## 7. One recommended next action

**A pre-registered, costed execution test of the one surviving behaviour: NQ continuation.**
- **Entry:** a stop at the first touch of a fixed OH/OL level.
- **Exit:** 1:1 at ±0.25σ, or the session close.
- **Fills:** on real NAS100 bid/ask with slippage, out-of-sample era only.
- **Judged against:** the identical rule at phantom lines and at random times of day.

If it fails, the forecast levels are closed as entry triggers, and the forecast's research role becomes
target/stop/time sizing. If it passes, the result is NQ intraday momentum scaled by the forecast, and should be
described that way.
