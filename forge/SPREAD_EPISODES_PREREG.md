# spread-episodes — Do spread-turn episodes exist beyond chance, can they be recognised as they start, and does price follow a confirmed spread turn?

**Pre-registered 2026-10-20, before any outcome was computed.** (Data checks and spread-only event counts were computed
first: `analysis/output/spread-episodes/DATA_CHECKS.md`. They touch no setup outcome.)

| | |
|---|---|
| ID / ledger id | `spread-episodes`; scored questions `spread-episodes-nq` (Case 1) and `spread-episodes-eurusd` (Case 2) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `spread-episodes` |
| Data | **Case 1:** IBKR 1-min MIDPOINT SR3U6 (SOFR Sep26) and IH7 (Euribor Mar27), `analysis/output/stir_1m_deep/`; OANDA NAS100 M1 (`VolRangeForecaster/data/m1/nas100_usd_m1.parquet`). 1-min bars re-stamped at their END, 15-min right-closed closes; 2024-04-15 → 2026-08-20. **Case 2:** FRED DGS2, DGS10 (end of day), DEXUSEU (noon New York), 1999-01-04 → 2026-08-20. Both end before the 2026-08-21 lockbox. |
| Seed | `20261020` |
| Uncertainty | cluster-robust t (Case 1: UTC-day clusters for h ≤ 8 h, ISO-week clusters for 24 h; Case 2: calendar-month clusters); 200 shifted-spread placebos; 2000-draw cluster bootstrap for the price-only comparison |
| Scripts / outputs | `scripts/spread-episodes/` → `analysis/output/spread-episodes/` |
| Harness | own scripts (event design with a causal zig-zag and a shifted-spread placebo; `runStudy.mjs` has no event mode) |

## 1. The claim (required)

The owner (Rich), from his own charts (SOFR Sep26 − Euribor Mar27 under NAS100, 15 min; a normalised US 10Y/2Y line
over EURUSD): the spread and price are not linked all the time but in **distinct stretches**. Within a stretch, price
rises as the spread's slope rises and falls as it falls. "A turn happens, then something confirms it, then price
moves." Sometimes price reverts at a spread turn, sometimes it continues. The two chart examples were picked after the
fact and are not evidence.

## 2. Why it is not already settled (required)

Nearest ledger entries, all on these or closely related series:

- `cog-dynamic-lead`: daily US yields × 34 assets incl. EURUSD (2016–2026) and 17 intraday futures lines incl. IH7 /
  SR3U6. Episode framing with asset-follow confirmation. No cell survived. Placebo equal, coupling state
  anti-persists over 125 days.
- `cog-turn-events`, `cog-trend-state`, `cog-sequence-events`, `cog-pinned-history`, `cog-exact-pair-lead`: C.OG's
  exact pair vs Nasdaq. Same-hour link +0.15..+0.22. Line turns coincide with Nasdaq trend turns (+6.7 pp), but
  forward price after a line turn is ~0. Fixed-k (0.75) zig-zag, one confirmation rule.
- `yield-asset-coupling` (2026-08-23): daily yields → FX/indices, forward null.

What is new here, and why it is not a re-run:

1. **Do episodes exist?** No earlier study tested whether the *same-bar coupling itself* clusters in time beyond
   chance: overdispersion and day-to-day persistence of the daily coupling against a shifted-spread placebo.
   `cog-dynamic-lead`'s persistence test was over 125 days, not day to day.
2. **Turn time and confirm time are recorded separately**, with an adaptive threshold k × trailing σ over 4 k values.
3. A **spread-episode taxonomy** (direction, toward/away from mean, with/against the spread's trend, prior leg
   aligned/diverged from price) × **price outcome** (follow / revert / nothing) at four horizons.
4. **Three controls:** matched random bars, shifted spread, and a price-only model with a stated incremental gain.
5. A **three-way chronological split** with the final period opened once.

The prior record says the expectation is null on the forward question. That is written down here so a null can't
read as a surprise, and a pass has to clear the controls that killed the earlier ones.

**Honest note on "unseen" data.** Every period of Case 1 and most of Case 2 has been used by earlier studies under
other rules. "Final" here means final for these rules only. The only genuinely unseen data is the forward record that
the live monitor (§8) starts on 2026-10-20.

## 3. Definitions, fixed in advance (required)

**Series A (spread / yield):**

- Case 1: `X = (100 − SR3U6) − (100 − IH7)`, in bp, 15-min closes. Fixed contracts throughout (they are 4–30 months
  from expiry over the window).
- Case 2: four variants. `AVG = (DGS2 + DGS10)/2` is primary. Then `DGS2`, `DGS10`, and `SLOPE = DGS10 − DGS2`. The
  owner's TradingView script is not in the repo. Normalisation by an affine map leaves the zig-zag turns unchanged,
  because the threshold scales with the series.

**Series B (price):**

- Case 1: log NAS100 (OANDA), the 15-min close at the same END stamp.
- Case 2: log DEXUSEU.

**Valid bars:**

- Case 1: weekdays, both legs and NAS100 with ≥ 5 one-minute prints in the 15-min bar, and the day passes the
  ≥ 3-distinct-15-min-prices screen on each leg (prior Amendment 1 of `cog-pinned-history`). Horizons count valid
  bars (≈ 92 a day).
- Case 2: rows where all of DGS2, DGS10 and DEXUSEU exist.

**Turn and confirmation (causal adaptive zig-zag):**

- Threshold `θ_t = k × B_t`.
- Case 1: `B_t` is the RMS of 16-bar (4 h) spread changes over the prior 20 sessions, shifted one session.
- Case 2: `B_t` is the RMS of 5-day changes over the prior 250 rows, shifted one row.
- The state machine is the one in `scripts/spread-episodes/common.py:zigzag`. **Turn time** is the bar of the running
  extreme. **Confirmation time** `c` is the first bar where the move away from that extreme reaches `θ_c`.
- `k ∈ {0.5, 0.75, 1.0, 1.5}`.
- Everything below is measured from `c`.

**Knowable when:**

- Case 1: the spread close at `c` and the NAS100 close at `c` share the same end stamp. Entry is the NAS100 close of
  bar `c`. Sensitivity (descriptive): entry at `c+1`.
- Case 2: the yield for day `c` is an end-of-day print and DEXUSEU is a noon print. **Entry is DEXUSEU on row `c+1`**,
  and the outcome runs from `c+1` to `c+1+h`. The data checks show a −0.056 lag-1 correlation that is this
  print-timing overlap, which the d+1 entry removes. The same-day change is reported only as a positive control.

**Expected direction:** `e = s × dir`, where `dir` is the new leg's direction (+1 up, −1 down).

- `s = adaptive`: the sign of the trailing same-bar correlation of changes. Case 1 uses 15-min changes over the prior
  20 sessions; Case 2 uses daily changes over the prior 250 rows. Both use rows before `c`'s session. This follows
  the documented sign flips, e.g. Mar 2026.
- `s = fixed+`: +1, meaning the spread up implies price up. Its mirror (fixed−) is the "revert" column.

**Outcome:** `y_h = e × (P[c+h] − P[c]) / σ_h(c)`, where `σ_h` is the RMS of h-bar price log changes over the same
trailing window as `B`, shifted.

- **follow** if `y ≥ +0.5`, **revert** if `y ≤ −0.5`, **nothing** otherwise.
- Statistic: mean `y` (in σ units), with P(follow), P(revert) and P(nothing) reported.

**Horizons:**

- Case 1: 1 h, 4 h, 8 h, 24 h (4, 16, 32, 96 valid bars).
- Case 2: 1, 3, 5, 10, 20 days.

**Confirmation variants (the sequence):**

- `C0`: zig-zag confirmation only.
- `C1`: C0, and price already moved the expected way between turn and confirm, `e × (P[c] − P[turn]) > 0`.
- `C2`: C0, and the trailing link is strong: `|trailing corr| ≥` its expanding median up to the previous session.

**Episode types at confirmation (9):**

- all;
- up, down;
- toward mean, away from mean: the spread's trailing mean over 20 sessions (Case 1) or 60 rows (Case 2), shifted;
  "toward" means `dir = sign(mean − X[turn])`;
- with spread trend, against spread trend: `dir = sign(X[turn] − X[turn − L])`, where L is 5 sessions (460 valid bars)
  in Case 1 or 60 rows in Case 2;
- prior leg aligned, prior leg diverged: over the previous leg (previous turn → this turn), did price move `s × prev_dir`?

**Conditions (primary spec only; breakdowns asked for in the brief):**

- time of day of `c` (Case 1, UTC): Asia 22–07, London 07–12, NY overlap 12–16, late 16–22;
- price-volatility state: tercile of `σ_h(c)` within its prior 120 sessions or rows;
- price-trend state: `e` with or against `sign(P[c] − P[c − 1 session])` in Case 1, or 20 rows in Case 2;
- scheduled release:
  - Case 1: a High-impact USD/EUR event in `calendar_events.csv` within (c − 1 h, c + 4 h];
  - Case 2: an FOMC, NFP or CPI day within rows (c, c+5];
  - outside calendar coverage (Case 1 after 2026-07-02; Case 2 before 2007-07 from the ff calendar, or 2014+ from
    calendar_events) the tag is unknown and excluded;
- trailing coupling tercile: the prior 5 sessions' same-bar correlation × s, in Case 1, or the prior 60 rows in Case 2;
- year and half-year: descriptive only, not tested.

**Controls:**

- **(a) Matched random bars.** Per event, 10 bars from the same period with the same UTC hour (Case 1) or weekday
  (Case 2) and the same volatility tercile. Only the event's own ±h neighbourhood is excluded, per the 2026-10-16
  lesson. Each control bar's direction is `s × sign(X[b] − X[b − m])`, with `m` the median turn→confirm delay for that
  k: what the spread "says" at an ordinary moment.
- **(b) Shifted spread.** 200 draws. The spread is rolled by a random whole number of sessions or rows, at least 20
  (Case 1) or 60 (Case 2), circular, with the time-of-day slot kept. The whole pipeline is rebuilt (B, s, zig-zag,
  tags) and every cell is recomputed. This gives each cell's placebo distribution, and the **selection-aware count**:
  how many cells pass Discover-BH and Validate on each placebo draw.
- **(c) Price only.**
  - (c1) The same zig-zag on price itself, with price σ: does price follow its own confirmed turn?
  - (c2) At the spread events, an OLS model fitted on Discover predicts the forward σ-return from price-only features:
    the price return over the turn→confirm window, the prior 1 session or 20 rows, and the price zig-zag state at the
    same k. A second model adds the spread direction `s × dir`.
  - The **improvement over (c)** is IC(with spread) − IC(price-only) on Validate and Final, with a cluster bootstrap
    interval.

**Episodes-exist tests (E):**

- **E1 coupling clustering.** Per session (Case 1, ≥ 30 bars) or calendar month (Case 2), compute the Fisher-z of the
  same-bar correlation of changes. Then:
  - overdispersion `OD = var(z) / mean(1/(n−3))`;
  - persistence `AC1 = corr(z_t, z_{t+1})`.
  - Each is compared with the 200 shifted placebos.
- **E2 follow clustering.** Across consecutive confirmed turns (primary spec), take the AC1 of `y`, and
  P(follow | previous followed) − P(follow | previous did not), against the placebos.

**Sample split (chronological, fixed):**

| | Case 1 | Case 2 |
|---|---|---|
| Discover | 2024-04-15 → 2025-05-31 | 1999-01-04 → 2012-12-31 |
| Validate | 2025-06-01 → 2025-12-31 | 2013-01-01 → 2019-12-31 |
| Final (once) | 2026-01-01 → 2026-08-20 | 2020-01-01 → 2026-08-20 |

**De-clustering:** none. Events are kept, and the cluster-robust SE (day/week/month clusters) carries the overlap.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| Q1 | Episodes exist beyond chance: E1 OD and AC1 above the placebo 95th percentile | Case 1: **OD yes** (the link is known to switch on and off), **AC1 small**. Case 2: **OD yes** (sign regimes), AC1 positive at monthly scale |
| Q2 | Recognisable as they start: E1 AC1 above the placebo p95, **and** in Validate the top trailing-coupling tercile or C2 raises mean y by ≥ 0.10σ over all events (one-sided p < 0.05) | **No** for both (prior: anti-persistence) |
| Q3 | Turn → confirm → price follows: primary cell mean y > 0 | **Null** for both (prior: forward ≈ 0) |
| | **Primary cells** | Case 1: k 0.75, adaptive, C0, all, 4 h. Case 2: AVG, k 0.75, adaptive, C0, all, 5 d |
| | **THE GATE (per case)** | Q3 passes when either the primary cell, or a grid cell that passed Discover-BH (q 0.10, two-sided) and Validate (same sign, one-sided p < 0.05, beyond its placebo p95), shows the same sign in Final with one-sided p < 0.05, \|mean y\| ≥ 0.10σ, beats control (a) (difference CI excludes 0) and (b) (beyond p95), and adds over (c) (ΔIC CI excludes 0 on Final). In addition the selection-aware survivor count must exceed the placebo p95. |
| | **THE MIRROR** | `fixed+` covers both signs. With the adaptive sign, a significantly *negative* mean y means price reverts at confirmed turns. It is reported, and passes only by the same gate with the sign stated |

## 5. Power (required)

`y` is σ-normalised, so its SD ≈ 1 by construction. The design effect from overlapping horizons is taken as ≈ 1.5 for
Case 1 at 4 h and ≈ 1.3 for Case 2 at 5 d. MDE = 2.49 × SE (80% power, one-sided 0.05). Pass bar: |mean y| ≥ 0.10σ.
The verdict word uses the **realised** cluster SE from the run (2.49 × SE vs 0.10).

| Cell | n (from DATA_CHECKS) | SE ≈ √(deff/n) | MDE | Pass bar | Verdict by design |
|---|---|---|---|---|---|
| Case 1 primary, Discover | 1458 | 0.032 | 0.080 | 0.10 | POWERED |
| Case 1 primary, Validate | 724 | 0.046 | 0.113 | 0.10 | borderline (UNDERPOWERED if realised SE > 0.040) |
| Case 1 primary, Final | 809 | 0.043 | 0.107 | 0.10 | borderline |
| Case 2 primary, Discover | 397 | 0.057 | 0.142 | 0.10 | UNDERPOWERED for 0.10σ; powered for ≥ 0.15σ |
| Case 2 primary, Validate | 213 | 0.078 | 0.195 | 0.10 | UNDERPOWERED |
| Case 2 primary, Final | 200 | 0.081 | 0.201 | 0.10 | UNDERPOWERED |

So Case 2 can only detect large effects (≥ ≈ 0.2σ per 5 days, ≈ 25 EURUSD pips). Small k (0.5) cells carry about 1.5×
the events. A Case 2 null is recorded as `UNDERPOWERED` unless the realised intervals exclude 0.10σ.

## 6. Multiplicity (required)

| Family | Cells | Correction |
|---|---|---|
| Case 1 grid | 4 k × 2 sign × 3 confirm × 9 type × 4 h = **864** | BH q 0.10 in Discover; Validate conjunctive (sign + p + placebo); selection-aware placebo count |
| Case 2 grid | 4 series × 4 k × 2 × 3 × 9 × 5 h = **4320** | same |
| Case 1 conditions | (4 ToD + 3 vol + 2 trend + 2 release + 3 coupling) × 4 h = **56** | BH q 0.10, candidates only |
| Case 2 conditions | (3 + 2 + 2 + 3) × 5 h = **50** | BH q 0.10, candidates only |
| E tests | 2 per case (OD, AC1) + E2 (2) | placebo p95, conjunctive across Discover and Validate |
| Primary cells | 1 per case | no correction (pre-named) |

That is **5,298 cells** in total. Every cell is written to `cells_case1.csv` / `cells_case2.csv`, including those that
fail. Promotion to anything live needs |t| ≥ 3 on Final, and nothing here sizes a trade.

## 7. What this does NOT test (required)

- Tradability after costs. A passing cell would get its own costed prereg.
- Cause.
- Whether the owner's exact TradingView "normalised" construction behaves differently (its source isn't available).
- Intraday timing for Case 2.
- Other contract months or other pairs.
- Anything after 2026-08-20 except the forward monitor.

## 8. What each verdict changes (required)

- **Pass (per case):** the condition goes on the live monitor as a flagged "confluence" alert with its measured hit
  rate, research-only until |t| ≥ 3 or a forward pass.
- **Q1 real, Q3 null:** `CONTEXT`. The monitor shows the coupling state and the confirmed turns as context only, with
  no "price will follow" claim.
- **Null / underpowered:** recorded. The monitor runs as the **forward record**: every confirmed turn, its tags, and
  the realised outcome at each horizon, judged at ≥ 300 Case 1 events (~5 months) or ≥ 100 Case 2 events (~2 years).
- **Either way:** the live page shows the episode tables and the real-vs-control charts from this run.

## Amendments

### A1 — 2026-10-20 — POST-HOC (results seen: a 2-draw smoke run showed the E1 numbers)

**The problem.** The shifted-spread placebo is the wrong null for E1 on its own. With a *constant* link, a session's
correlation is still higher on sessions where the spread itself moves a lot, and spread volatility clusters. So daily
coupling can "persist" with no change in the link at all.

**The added null (constant-β).** Within each period:

- fit β = Σ dx·dp / Σ dx²;
- form residuals ε = dp − β·dx;
- build a synthetic price change β·dx + ε, with ε rolled by a random whole number of sessions (≥ 20 in Case 1) or
  rows (≥ 60 in Case 2);
- run 200 draws.

This keeps the spread's own volatility clustering and the residual's, and removes any time variation in the link.

**The rule.** Q1 now needs E1 OD and AC1 above the p95 of **both** nulls (shifted spread **and** constant-β), in
Discover and Validate. This can only demote. Nothing else in the design changed: the grid, the gates and the primary
cells are as registered. The smoke run's grid output (0 Discover-BH cells in both cases) was seen, and nothing in the
grid or gates was altered after it.

### A2 — 2026-10-20 — POST-HOC (smoke run seen; implementation fix to match the registered text)

**The bug.** In the Case 1 code, the trailing windows for the adaptive sign (20), the coupling (5), the spread mean
(20) and the volatility-tercile rank (120) were counted in **calendar days**, weekends included. The text above says
**sessions**. That made the windows about 30% shorter than registered. It is not lookahead: every window still ended
at the previous day.

**The fix.** All four windows now count sessions, as registered. The registered rule that the primary mirror (mean
y < 0, i.e. revert) is scored and reported is now implemented as a separate row in `finals`. The 2-draw smoke run used
the calendar-day windows, and its grid output was seen (0 Discover-BH cells in both cases). Case 2 was row-based
throughout and is unaffected. No threshold, cell, gate or period changed.

### A3 — 2026-10-20 — POST-HOC (smoke run seen; implementation fix)

**The bug.** pandas 3 builds the Case 1 bar-time index in microseconds. The release tag compared those times with the
calendar in nanoseconds, so every Case 1 bar was tagged "unknown" and both `release=` condition levels were empty.
The same unit problem broke the timestamps in the chart exports for both cases. Nothing else reads those timestamps.

**The fix.** Times are forced to nanoseconds, and the exports are written in epoch seconds. After the fix, 16.5% of
Case 1 bars are near a release and 5.9% are unknown (after the calendar ends on 2026-07-02). No cell, gate or
threshold changed.

## RESULTS

See `analysis/output/spread-episodes/RESULTS.md`.
