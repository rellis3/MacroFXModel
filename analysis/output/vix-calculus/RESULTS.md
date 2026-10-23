# vix-calculus — results

Prereg: `forge/VIX_CALCULUS_PREREG.md`.

- Registered `00d976f7`, 2026-10-23, before any outcome.
- Amendments:
  - A1, PRE-RESULTS: E power, `9e1e2bbd`.
  - A2: note on run order.
  - A3, PRE-RESULTS: D power, `bb81bab9`.
  - A4, POST-HOC: robustness, demote-only.
  - A5, POST-HOC: D reproduction failure, descriptive.
- Seed 20261023, 200 shifted-signal placebos for B, C and E; 2,000 session-clustered bootstrap draws for D.
- Page: `vix-calculus.html`. Files: `results_A.json`, `results_BC.json`, `results_D.json`, `results_E.json`,
  `robustness.json`, `power_D.json`, `power_E.json`, `summary.json`.

| Part | Question | Verdict | Ledger id |
|---|---|---|---|
| A | Is the priced-in move IV·√Δt right? (Jordan's card) | **CONTEXT** | `vix-brownian-scaling` |
| B | Integrals: Nasdaq VRP, VIX VRP, accumulated unexplained fear | **UNDERPOWERED** (0 of 24 pass) | `vix-integral-gaps` |
| C | d²R/dt², and dR/dt of the implied ratio VVIX/VXN | **VALIDATED, research only** (1 of 16) | `vix-second-derivative` |
| D | Garin's "VIX reacts hard → ES leans up", 2021–2026 out of sample | **UNDERPOWERED** (not reproduced; 0 of 4 pass) | `garin-vix-intraday-oos` |
| E | The VIX give-back on tradable VX futures (Garin's point) | **VALIDATED, research only** (2 of 2) | `vix-ratio-vx-futures` |

## A — Brownian scaling (CONTEXT)

**Realised ÷ priced absolute move,** with the √(2/π) Brownian factor (block-bootstrap 95% CI):

| h (sessions) | Nasdaq / VXN·√Δt | VIX / VVIX·√Δt |
|---|---|---|
| 1 | 0.84 [0.82, 0.87] | 1.14 [1.10, 1.18] |
| 5 | 0.85 [0.82, 0.88] | 1.04 [1.00, 1.09] |
| 10 | 0.84 [0.80, 0.88] | 0.94 [0.89, 1.00] |
| 20 | 0.85 [0.80, 0.91] | 0.84 [0.78, 0.91] |

**Variance ratios** (Brownian = 1):

- Nasdaq 0.85 / 0.78 / 0.75 at 5 / 10 / 20 sessions.
- VIX 0.80 / 0.64 / 0.50.

**Registered expectations:**

| | Expectation | Outcome |
|---|---|---|
| (a) | κ_N < 1 everywhere | **held**: realised moves are about 16% smaller than VXN prices (VXN about 19% above realised) at every horizon |
| (b) | VR_N(20) in [0.8, 1.2] | **failed**: 0.75 [0.65, 0.90]. Nasdaq variance grows a little slower than √Δt over a month |
| (c) | VIX mean-reverts | **held**: κ_V falls from 1.14 to 0.84 and VR_V(20) = 0.50. VVIX·√Δt underprices one-day VIX moves and overprices 20-day ones |
| (d) | Jordan's R ≈ \|ρ\| × the slope | **failed as stated** |

On (d): realised |slope| ÷ (VVIX/VXN) has a median of **1.08** (IQR 0.80–1.38), not 0.6–0.8. The card leaves out the
correlation (median |ρ| 0.78), but VVIX underpricing daily VIX moves (×1.14) and VXN overpricing daily Nasdaq moves
(×0.84) offset it. The fit swings with the correlation, from 0.59 in the loosest fifth of days to 1.46 in the tightest.
Use the realised slope, not VVIX/VXN, for the actual "VIX % per 1% Nasdaq".

## B — integrals (UNDERPOWERED, 0 of 24)

Nothing passes Holm-24.

- The only |t| > 2 cells read the VIX or range, not direction:
  - Nasdaq VRP top decile → VIX −0.26 SD (t −2.46);
  - VIX VRP bottom decile → range below implied (−0.29 SD, t −2.06);
  - accumulated unexplained fear top decile → range above implied (+0.37 SD, t 2.10).
- None clears the correction or holds in all three periods. None is NULL, because the intervals are wider than
  ±0.2 SD.
- The accumulated-fear integral adds nothing beyond the banked `vvix-ratio-range` flags it was controlled for.

## C — second derivatives (1 of 16: VALIDATED, research only)

**d²R/dt²** (the change in C.OG's dR/dt): 0 of 8 pass, and 3 cells are NULL. As expected, a second difference of a
noisy 20-session slope is mostly noise.

**dR/dt of the implied ratio, top decile → Nasdaq over the next 20 sessions:**

- Effect: +0.232 SD ≈ **+1.2%**, t 3.04.
- Discover / validate / test: +0.30 / +0.22 / +0.21.
- Placebo p95 1.99; passes Holm-16.
- Raw: 413 flagged days, next 20 sessions **+2.53%, higher 76% of the time**, against +1.34% and 66% on all days.
- It means the option market has just started pricing the VIX's own swings far more richly than the Nasdaq's: VVIX up
  relative to VXN over 5 sessions.

**Flags, as the prereg requires:** it **fails the family-wide Holm-46 view** (p 0.0024 against 0.0011).

**Robustness** (A4, post-hoc, demote-only; none reversed the sign):

| Check | Effect | t |
|---|---|---|
| + Nasdaq 5d and 10d return | +0.224 SD | 2.92 |
| + VIX 5d and 20d change | +0.201 SD | 2.64 |
| + C.OG's dR/dt flags | +0.232 SD | 3.04 |
| + banked ratio flags | +0.219 SD | 2.86 |
| + implied-ratio percentile | +0.230 SD | 2.98 |
| **all of the above** | **+0.193 SD (≈ +1.0%)** | **2.42** |
| leave one year out | — | 2.23 … 2.98 (weakest without 2020) |
| drop the 10 largest flagged moves | +0.18 SD | 2.61 |

- It overlaps C.OG's dR/dt bottom-decile flag on only 8% of days, so it is a separate reading.
- The VVIX leg drives it: t 3.31 with VVIX's own 5-day change controlled, 2.35 with VXN's.
- **Verdict:** VALIDATED as registered, kept **research only**. It fails Holm-46 and weakens to t 2.4 with every
  control, so part of it is VIX mean reversion.

## D — Garin's intraday rule out of sample (UNDERPOWERED; not reproduced)

**Not reproduced from his description, and not seen out of sample.**

- **Rebuild:** OANDA S&P 500 and Nasdaq-100 CFDs, IB 5-minute VIX, hourly readings 11:00–16:00 ET, ratio since 10:00,
  thirds cut on 2016–2020, outcome to 16:55 in units of the previous 60 sessions' normal move.
- **Readings:** 2,618 days. 2.1% of readings were skipped because the index had moved less than
  0.01% since 10:00.

| Hard − Barely (normal moves) | Garin 2016–20 | Our rebuild 2016–20 | 2021–26 [95% CI] | One-sided p | Years positive |
|---|---|---|---|---|---|
| ES-down | +0.120 | -0.067 | -0.065 [-0.264, +0.137] | 0.72 | 3/6 |
| ES-up | +0.098 | -0.015 | -0.062 [-0.184, +0.057] | 0.84 | 2/6 |
| NQ-down | -0.007 | +0.001 | -0.055 [-0.273, +0.138] | 0.70 | 2/6 |
| NQ-up | -0.015 | -0.065 | -0.054 [-0.186, +0.079] | 0.79 | 2/6 |

**The reproduction check failed** (Amendment A5). On his own years our rebuild finds the hard-reaction third doing
slightly *worse* than the barely-reacting third on ES, where he found it doing better. Other plausible readings of his
method, on 2016–2020 only:

| Reading | ES-down | ES-up |
|---|---|---|
| as registered (signed, thirds per index) | -0.067 | -0.015 |
| thirds per index x hour | -0.063 | -0.010 |
| thirds per index x day type | -0.040 | -0.000 |
| thirds per index x hour x day type | -0.022 | -0.006 |
| unsigned |VIX%|/|index%|, thirds per index x day type | -0.045 | -0.027 |
| signed, thirds per index x day type, outcome in raw % | -0.012 | -0.012 |
| Garin (his table) | +0.120 | +0.098 |

None gives his positive ES lean, so the difference lies in data or code, not in the years tested. In 2021–2026 all
four cells are negative (−0.05 to −0.07) and none passes. By the registered rule this is **UNDERPOWERED**: the design
detects about 0.15–0.2 normal moves (A3) and the intervals are too wide for NULL. The plain statement is that we can't
reproduce the lean from the description, and it doesn't appear after 2020. **Next:** Garin's code or data, to find the
difference.

## E — the VIX give-back on VX futures (VALIDATED, research only)

The contract is the nearest VX with ≥ 35 days to expiry at the next close, held 20 sessions and never rolled. There are
3,314 sessions from 2013-05 to 2026-08-21.

| Flag (top decile) | Future, beyond the VIX state | t | Periods 2013–16 / 17–20 / 21–26 | Placebo p95 | Spot VIX, same dates |
|---|---|---|---|---|---|
| R_a: VVIX vs Nasdaq | −0.267 SD ≈ **−4.5%** | −2.44 | −0.08 / −0.37 / −0.32 | 2.05 | −8.1% (t −2.94) |
| R_b: VIX vs Nasdaq | −0.307 SD ≈ **−5.2%** | −2.90 | −0.15 / −0.45 / −0.30 | 2.02 | −7.9% (t −3.16) |

- Both pass Holm-2, are negative in all three periods, and beat the placebo.
- **Garin's point, measured:** a futures holder captured about **60%** of the spot give-back.
- Raw: the future averaged −8.1% after a flag, against −4.8% on all days (the usual contango slide).

**Robustness** (A4):

- Leave-one-year-out t: R_a −1.76 … −2.97, R_b −2.17 … −3.12.
- Without Feb–Mar 2018 and Feb–Apr 2020: −2.13 and −2.64.
- With VIX's 20-day change: −2.36 and −2.73.

**Descriptive rule** (not tested): short one VX on a flag for 20 sessions, no overlap, 0.10 points round trip.

- 52 trades, mean **+5.5%** of entry, median +7.0%, 77% winners, best +22.4%, **worst −54.5%**.
- Shorting VX on every day returns +2.6% per 20 sessions anyway, so the flag roughly doubles it, but the tail risk is
  large.

**Verdict:** VALIDATED, research only (|t| < 3). The next step is a costed, sized short-VX prereg with a stop and a
forward record.

## What this changes

- **Atlas, Fear versus the Nasdaq block:** C.OG's dR/dt (already shown) is joined by the implied-ratio dR/dt reading,
  research only, with its past-year flags, plus a link to `vix-calculus.html`.
- **Jordan's card is corrected on the page** (part A): use the realised slope; VVIX/VXN fits only on average.
- **Candidates for their own preregs:**
  - a costed short-VX rule (E), with sizing and a stop;
  - a forward record of the implied-ratio flag (C2);
  - Garin's code or data for part D, to find why our rebuild of his method gives the opposite sign on his own years.
