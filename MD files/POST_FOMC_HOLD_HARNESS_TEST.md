# Post-FOMC USD hold — harness test pre-registration

> **Status: PRE-REGISTERED 2026-08-20, design frozen BEFORE the run; result
> appended below same day.** The strategy test that `POST_FOMC_DRIFT_TEST.md`'s
> PASS earned. That doc proved the market behavior (+29.5bp excess, 99.8th
> placebo pctl, period-stable); this one asks whether a tradable spec survives
> costs. Finding → signal requires passing here, and even a pass ships as
> "validated ≠ forward-proven" (the `YieldSpreadBot` precedent: paper first).

## The spec (zero tunable parameters)

Long the USD basket (equal-weight: short eurusd/gbpusd/audusd/nzdusd, long
usdjpy/usdchf/usdcad, 1/7 notional each) at **14:30 ET on every scheduled
FOMC decision day**; exit **five trading days later at 14:00 ET**. Nothing
else — no filter, no sizing rule, no text input (Q13/Q14 killed those).
~8 events/year, 82 events 2016–2026.

## Cost model (frozen)

- **Spread + slippage, per leg, both ends:** round-trip pips —
  eurusd 1.3, gbpusd 1.5, usdjpy 1.4, usdchf 1.7, usdcad 1.7, audusd 1.4,
  nzdusd 1.9 (the honest-harness convention: ~0.8–1.4 pip spreads for majors
  plus 0.5 pip slippage; deliberately not best-case). Converted to bp at each
  event's entry price.
- **Overnight financing: modeled as a SWEEP, not a point estimate** — the
  platform's known data gap (no swap-inclusive returns; `CLAUDE.md`: don't
  fake it). Actual calendar nights held per event (typically 7, Wed→Wed,
  which absorbs the triple-swap convention by counting real nights). The
  deliverable is the **breakeven financing rate** in bp/night on basket
  notional, judged against a plausible-cost yardstick stated now: broker
  markup alone ≈ 0.5–1.0 bp/night; markup plus an adverse rate-differential
  regime ≈ 1.5–2.0 bp/night. Note the sign asymmetry honestly: long-USD
  carry was *positive* against most of the basket for much of 2016–2026, so
  zero-differential is more likely conservative than generous — but unproven
  without swap data, hence the sweep.

## Split and pass bar (frozen)

- **IS 2016–2021 (46 events) / OOS 2022→ (36 events).** Chronological; the
  OOS window contains both a violent USD rally (2022) and a USD decline
  (2023, 2025) — a fair regime mix.
- **PASS requires all of:** (1) OOS net-of-spread mean per event > 0 with
  |t| ≥ 2 (N=36 ≥ 30 house floor); (2) full-sample net annualized Sharpe
  ≥ 0.5 (the platform's stated floor), computed on per-event returns scaled
  by √8 events/yr; (3) breakeven financing ≥ 1.5 bp/night — edge must
  survive the adverse end of the plausible-cost yardstick.
- **FAIL** on any miss. Fail bank: the drift stays a valid *market finding*
  (context for exits/timing around FOMC) that is too small to trade at
  retail CFD costs — recorded, closed.
- Even on PASS: next step is **paper-mode forward tracking**, not live — and
  the swap-rate capture recommended in the 151-proposals doc becomes the
  blocking item for a real financing-inclusive verdict.

---

## Result (run 2026-08-20, code `analysis/fomc_event_study/post_fomc_hold_harness.py`)

**FAIL on the registered bar — but read the failure mode precisely.**

| | N | net mean | t | win |
|---|---|---|---|---|
| Full sample | 81 | +24.7bp | 2.44 | 65% |
| IS 2016–2021 | 47 | +28.3bp | 2.21 | 70% |
| **OOS 2022→** | **34** | **+19.7bp** | **1.11** | 59% |

- Bar (1) **OOS |t| ≥ 2: MISSED** (t = 1.11). Bars (2) and (3) both passed:
  full-sample net annualized Sharpe 0.74 ≥ 0.5; breakeven financing
  **4.06 bp/night** vs the 1.5 bar (even at a punitive 2.0 bp/night the mean
  stays +12.5bp). OOS N came in at 34, not the projected 36 (the Dec-2024
  Christmas window and the data edge) — still above the ≥30 floor, so the
  bar stands as registered.
- **What did NOT kill it:** costs. Spread+slip is 1.6bp against 26.3bp gross,
  and financing headroom is wide. This is not the usual "gross strong, net
  flat" death.
- **What killed it: statistical power.** Per-event vol is ~100bp against a
  ~20bp OOS mean — at that ratio, 34 events cannot clear t=2 (roughly
  100 events would be needed if the OOS mean is the true effect). The
  pre-registration set the bar knowing N; the bar was missed; **FAIL is the
  verdict and it is banked** — no re-narration.

**Disposition (consistent with both frozen decision tables):** the market
finding stands (Q15 — the drift is FOMC-specific vs a decade of placebo);
the tradable spec is **not validated** and must not go live. The honest
accumulation path is time, not tuning: ~8 new events arrive per year. If
wanted, a **pre-registered forward evaluation** (the
`PREREGISTERED_EVALUATIONS.md` pattern — paper-track each post-FOMC window,
frozen spec, no peeking-based changes) can bank forward events until the
combined post-registration record reaches decision size (~30 forward events
≈ late 2029, or earlier only if the effect runs hotter than the OOS mean).
The spec has zero tunable parameters, so there is nothing to iterate — the
only variable is more data.
