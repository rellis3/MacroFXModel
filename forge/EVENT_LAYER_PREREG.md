# EVENT-LAYER: do release size and yesterday's surprise improve the IV-adjusted daily lines?

*Pre-registered 2026-10-05, before any result was computed. The remaining "data we had but never
aligned" gap from the Forecaster Portfolio comparison: the Evidence Book has validated that each
release type moves each pair by a characteristic size (`event-impact-map`) and that the size of a
data surprise widens the release session and the session after (`surprise-size`). The live lines
use only a coarse event tag (FOMC / NFP / CPI / high / holiday / none). Lesson 03 §03: scheduled
jumps should be allowed for in advance. Research only.*

## The question

On top of the **IV-adjusted** daily forecast (live since 2026-10-05: σ blended toward implied vol),
does adding:
- (a) the release-type size of the day's scheduled Major releases, and
- (b) the size of yesterday's surprise (known before the open)

improve the daily H-L lines out of sample?

Implied vol already prices a known calendar partly, so this tests the **increment**, not the
existence of event effects.

## Data and scope (inventory checked before writing)

- **Calendar:** `calendar_events.csv`, Major releases only (5,189), **USD, EUR and GBP only**
  (the file holds no JPY / AUD / CAD / CHF releases), 2014 → 2026-07-02. Times are UTC. A release
  belongs to the London session (00:00–22:00) it falls in.
- **Instruments and implied vol:** as in COMBINED-RANGE.
  - Indices (NQ, SPX, DOW, US2000, DE30, UK100), with VIX/VXN.
  - FX + gold (EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, GOLD), with CME CVOL.
  - `london22` sessions, production σ estimators.
- **Relevant currencies:** an instrument hears a release if it is in its currency set, and USD
  always counts. DE30 = EUR + USD; UK100 = GBP + USD; US indices and gold = USD.

## Features (all known before the session opens)

- **`ev_size`** = the largest **release-type effect** among the day's relevant Major releases.
  - Release type = the event title, lower-cased, with parenthesised text and digits removed.
  - Its effect is fitted **on train only**: the mean of the release day's log(H-L ÷ σ_A)
    residual over relevant instrument-days, where σ_A is arm A's σ. It is shrunk toward 0 as
    sum ÷ (n + 20), and a type with < 10 train events counts as 0.
  - 0 on days with no relevant Major release.
- **`surp_prev`** = the largest |z| among YESTERDAY's relevant Major releases with a consensus.
  - z = (actual − consensus) ÷ (1.4826 × the median absolute deviation of actual − consensus
    for that release type, train only). It is capped at 5 and is 0 when there is none.

## Arms (ridge as in COMBINED-RANGE: λ = 1, standardised, centred per instrument, pooled per class)

- **A, IV-adjusted only.** Feature `iv_sig`, i.e. the live form.
- **B, IV + events.** `iv_sig`, `ev_size`, `surp_prev`.

Widths are refit on each arm's σ. **Split:** by date per class, first 60% train, last 40% test
(the window ends 2026-07-02 with the calendar).

## Pass rule (per class)

**Primary.** Test H-L p50 + p75 pinball, B ÷ A per instrument. PASS if **both** hold:
1. the median ratio is **< 0.99** (this is an increment);
2. B beats A on **≥ 60%** of the class.

**Secondary.**
- p75 exceedance on test days in the top decile of `ev_size`, and on days with `surp_prev` ≥ 2,
  A vs B. B should be closer to 25%.
- The signs of `ev_size` and `surp_prev` should both be + (bigger releases / surprises → wider).

**Decision.**
- PASS for a class: add the event terms to the IV-adjusted export for that class, refitted on
  live-type inputs. Live, the release list comes from the server's calendar feed, and the
  per-type effects are the train-fitted table, frozen.
- FAIL: record it. The coarse event tag stays, and the finding is that implied vol already
  carries the calendar.

Script: `forge/run_event_layer.py`. Output: `analysis/output/event_layer/RESULTS.md`.

---

## Results (2026-10-05, run after the pre-registration commit 2d478d77)

Full tables: `analysis/output/event_layer/RESULTS.md`.

| | FX + gold (7) | indices (6) |
|---|---|---|
| test pinball (IV + events) ÷ (IV only), median | **0.970** | 1.002 |
| B better on | **7/7** | 2/6 |
| p75 exceedance, top-decile release days, A → B | **45.5% → 28.9%** | 31.6% → 23.2% |
| p75 exceedance, no release and no surprise, A → B | 18.4% → 21.0% | 22.2% → 22.8% |
| sign of `surp_prev` (expected +) | **−** (−0.015) | − (−0.006) |
| **verdict** | **PASS** | **FAIL** |

**Reading.**
- **FX + gold.** On big release days (payrolls, CPI, claimant count, ISM services, Fed press
  conferences) the IV-adjusted lines run badly tight: p75 is passed 45% of the time against
  25%. The train-fitted release-type size fixes most of it. Implied vol (30-day) spreads a
  single release over a month, so it does not carry the day.
- **Indices.** VIX already prices the calendar, so there is no increment, although the
  biggest-release days are still slightly better calibrated.
- **Yesterday's surprise does not widen today** on either class. The secondary sign check
  fails; the PASS rests on `ev_size`.
- **Caveats.**
  - The calendar has USD, EUR and GBP releases only. JPY / AUD / CAD / CHF releases are
    untested.
  - One release type ("President Trump statement on coronavirus", 2020) carries a large effect
    and is a one-period artefact. It will not recur in a live feed.

**Decision per the pre-registration:** add the event term to the IV-adjusted export for FX + gold.

**Implementation blocker, before it can go live.** The live calendar feed names releases
differently from `calendar_events.csv` (memory: Event Book vs calendar vocabularies, 0/10
joined by name). The fitted release-type table needs an explicit name map to the live feed, so
the live build waits on that map.
