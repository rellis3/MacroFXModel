# wall-dte-style — does the right trade at a strong wall (fade or follow) depend on the wall's own expiry, the gamma sign, its strength and the hour?

**Pre-registered 2026-10-27, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `wall-dte-style` (H1-H4 below are the only scored questions; the map in section 5 is context) |
| Branch | main |
| Register row | `plans/RESEARCH_REGISTER.md` → `wall-dte-style` |
| Data | `OI Data/*.csv` per strike, per expiry, per right, T-1 lag (OI(D) is public mid D+1); `Oanda Parquet Files/*_m1.parquet` for the path. 7 FX/gold instruments = one sample; NQ and SPX (Databento, ~1,520 days) = a second, never pooled. Window to 2026-08-21 (lockbox), London sessions 00:00-22:00, weekends out |
| Seed | `20261027` |
| Uncertainty | cluster bootstrap by (instrument, ISO week), 2,000 reps; BH FDR 0.10 over H1-H4 |
| Scripts / outputs | `oi_research_book/scripts/30_wall_dte_style.py` → `data/results/wall_dte_style.json`, `WALL_DTE_STYLE_RESULTS.md` (OI-book layout, slug unchanged) |
| Harness | own script, same code path as `17_wall_placebo.py` / `24_ripple_walls_placebo.py` |

## 1. Claim

The OI-Conf and OI Gamma bots treat every strong wall the same way (fade in one, regime-switch in the other), and the
wall comes from the strongest-DTE bucket. The mechanism says a wall should behave differently depending on:

- **its own expiry**: a near-DTE wall is where the live gamma is, a far-DTE wall is large but inert unless a near
  one stands on it;
- **the gamma sign** of the total book: long gamma damps (fade), short gamma feeds (follow);
- **its strength** relative to the neighbours;
- **the hour**: dealer hedging is not uniform through the day.

The claim: at least one cell of (DTE, gamma sign, strength, hour) has a break (follow) or bounce (fade) rate that
beats placebo levels by a size worth trading. Prior work tested walls pooled over all of these.

## 2. Why this is not already settled (prior art, grep'd 2026-10-27)

- `WALL_PLACEBO` / 17: call and put walls from the primary expiry, pooled: 38.0% vs 38.7% grid placebo. Null.
- `ripple-book` / 24: the largest-gamma strike per side, S4 (<= 45 DTE) only, NQ only: walls react like any strike.
  The <= 3 DTE wall (W_oi) was **not testable: 94 of 783 days**. That is the near-DTE cell this study cares most about.
- `LEVEL_TYPES_PLACEBO_PREREG` (registered, not run): other level types and shelf life, not the DTE x gamma-sign x
  hour interaction, and not the follow side.
- `GEX_LADDER_CONFLUENCE` (UNDERPOWERED, 308 < 400): ladder lines on OI levels.
- `GAMMA_REGIME_TRADES` / `HEDGING_PLAN_OI`: the regime switch as a trade with forecast lines, -0.03R on NQ and
  -0.08R on EURUSD/GBPUSD/AUDUSD after costs. A wall-only, per-DTE, per-hour cut was not done.
- Nothing in the catalogue splits a wall's reaction by **its own** DTE bucket or by the hour of the touch.

## 3. Definitions (frozen)

- **Wall**: for each DTE bucket b in {0-1, 2-7, 8-45, 46+} (the indicator's buckets), the top-2 call-gamma strikes above
  spot and top-2 put-gamma strikes below spot in that bucket, > 0.12 rm apart (same rule as `js/oiProfile.js`).
  Strength = gamma / side max in the bucket. **Strong** = at least 3x the median of the 4 neighbouring strikes
  (C.OG's 3x rule); **moderate** = 1.5-3x; weaker walls are not scored.
- **Stacked** = a strong wall in a higher bucket lies within 0.1 sigma of a strong wall in a lower bucket.
  **Far-only** = a strong wall in bucket 8-45 or 46+ with no strong 0-7 wall within 0.25 sigma.
- **Gamma sign**: sign of total net dealer gamma at spot, all expiries, dealers long calls and short puts (the sign
  the repo's G2 result uses). Neutral band as in `oiZones.js` (|gex| < 0.25 x trailing median): excluded, counted.
- **Event**: the first approach to a wall in a session from its approach side (price on the side it is approaching
  from at the open). One event per wall per session.
- **Race outcome**: after the touch, price reaches 0.25 sigma **beyond** the wall (BREAK, follow wins) or 0.25 sigma
  **back** (BOUNCE, fade wins), whichever first, by 22:00 London. Unresolved events are dropped and their share
  reported per cell (a cell dropping more than 20% is flagged, data-rules item 6).
- **Hour block** of the touch, London: A 00-07, B 07-12, C 12-16:30, D 16:30-22.
- **Placebo**: the listed strikes at +-1 and +-2 increments from each real wall in the same bucket, same day, same code
  path, same race rule, dropped when within 0.1 sigma of any real wall.
- sigma: NY-close daily-bar sigma built from M1 (data-rules item 2).

## 4. Hypotheses (the confirmatory family; each is one scored test, gate and mirror)

For each: statistic = (real-wall break rate) minus (placebo break rate), in pp; **PASS** needs |diff| >= 3 pp, the
bootstrap CI excluding 0, the same sign in both halves of the sample split by date, and the instrument rule (>= 5 of 7
FX/gold, or both NQ and SPX). **THE MIRROR**: the same test on the expected-move edge (an IV ruler, not a positioning
level) must NOT pass; if it passes, the detector is broken.

- **H1 Near-DTE, long gamma → fade.** Strong 0-7 DTE walls, positive gamma: break rate **below** placebo.
- **H2 Far-only, long gamma → follow or nothing.** Strong far-only walls (8+ DTE, no near wall), positive gamma:
  break rate **differs** from placebo (two-sided). This is the "a higher-DTE level that is still strong enough to be on
  the profile" question.
- **H3 Short gamma → follow.** Strong walls, any DTE, negative gamma: break rate **above** placebo.
- **H4 Hour.** Within H1 or H3, whichever passes, the effect differs between hour blocks (interaction, not a separate
  subset search); if neither passes, H4 is not scored.

Gate on H2 specifically: a far-only wall that is not special in a *stacked* contrast (H2 stacked vs far-only,
same day, paired) is reported as descriptive only.

## 5. Context map (not a verdict, no pass/fail)

The full table of break and bounce rates by DTE bucket x gamma sign x strength x hour block x stacked/far-only is
published with n per cell and the placebo beside it. It is **CONTEXT**. A cell that looks good here is a candidate
for a fresh prereg on the forward record, never evidence. 4 x 2 x 2 x 4 x 2 = 128 cells are logged, which is why the
confirmatory family is only H1-H4.

## 6. Power

A cell needs >= 400 independent days to be judged; fewer is `UNDERPOWERED`, not null. **This is expected to bite**:
the NQ Databento archive holds monthlies/quarterlies, so near-DTE exists on roughly 12% of days (94 of 783 ≤3 DTE in
the ripple test). Before scoring, a count-first pass writes the measured n per cell to a `PRE-RESULTS` amendment. If
H1 is below 400 on both samples it is banked `UNDERPOWERED` and the forward record (the OI bots and the hedging-plan
shadow already log the DTE of every wall) is named as the way to power it. The 7-instrument OI Data set may carry
weeklies; the count-first pass says so.

## 7. What this does NOT test

- Whether any cell is **tradeable**: costs, the execution gate (spread / ATR below 0.15) and sizing come in a second
  prereg only for a cell that passes here.
- Direction of the day, vanna/charm flows, and the hedge-flow schedule (`hedge-flow`), and the iv-rich/cheap split
  (own prereg).
- Whether dealers are actually positioned long calls / short puts (assumed).

## 8. What each verdict changes

- H1 passes: OI-Conf and OI Gamma fade only walls in the 0-7 bucket, in long gamma; others are dropped.
- H2 or H3 passes: a follow mode is allowed for that cell only, as a shadow beside the live bots first.
- H4 passes: the passing mode is restricted to the hour block(s) that carry it.
- Nothing passes (or all `UNDERPOWERED`): walls remain a map of positioning and the "fade/follow" labels on the bots
  are not an edge claim; the switch from fade to break is not made on this evidence.

## Amendments

### A1 — 2026-11-11 — PRE-RESULTS (implementation choices where the frozen text is silent)
Written after the levels and touches were built and counted, before any race outcome (break/bounce) was computed.
`scripts/30_wall_dte_style.py` has three phases; `build` and `count` never call the race.

1. **Basis and inverted pairs (data fault DATA_SPEC §5 #12, still open in `01_build_daily_dataset.py`).** Walls are rebuilt
   from the raw chains here, not from 01's parquets. Every strike is moved to the CFD price by the futures-minus-CFD basis
   of the front expiry (3-120 DTE, put-call parity F = K + C - P on 4 near-ATM settlements, against the OANDA M1 close at
   the CME settle minute: FX 14:00 CT, gold 12:30 CT, NQ/SPX 15:00 CT), taken from the last CME date before the session.
   On USD/CAD, USD/CHF, USD/JPY the strike is inverted and the call/put labels are swapped (production `js/oi.js`).
   Measured medians match the 2026-10-24 audit: EUR +25 pips, JPY -66, CHF -37, CAD -10, NQ +45, SPX +11, gold +12.5.
2. **Timing.** OI(D) is public ~16:00 UTC on the next CME date, so London session S uses the latest book D whose next
   CME date is before S (S = D+2 business days in practice). The T-1 row lag in 05/17 used a book not yet public for
   ~2/3 of the day (audit P1); this removes it.
3. **Gamma.** Per contract: OI (forward-filled <= 5 rows, as 01) x Black-Scholes gamma at the session-open futures price,
   flat vol = the NY-close sigma annualised, T = max(DTE, 1)/365; DTE counted from the session date, expired contracts
   dropped. Book sign = sum over all expiries of (+call, -put) x OI x gamma x multiplier x spot (dealers long calls,
   short puts, OANDA labels after the swap). Neutral band: |book| < 0.25 x median |book| of the previous 60 sessions
   (needs 20; the first 20 sessions per instrument are `unknown`, excluded and counted).
4. **Wall candidates** are strikes within +-3 sigma of spot (js/oiProfile.js window). Strength neighbours = the 2 listed
   strikes on each side in that bucket's strike grid (any right with OI), same side's gamma; a neighbour median of 0
   counts as strong. rm = sigma in price (the profile's dayMove).
5. **Placebo increment** = the 17/24 grid step: FX 0.005 native (USD/JPY 0.00005 native), NQ 100. Not in 17/24, fixed
   now: **SPX 25, gold 25** (a comparable fraction of sigma to NQ 100 / FX 50 pips; gold's listing step of 5 is ~0.14
   sigma, too close to the wall to be a control). A placebo must be a strike listed in that day's book (any expiry), on
   the same side of spot as its wall, and > 0.1 sigma from every real wall (top-2 per side per bucket, any strength). It
   inherits the wall's bucket, strength, stacked/far-only, book sign and local sign; its hour block is its own touch's.
6. **Event and race.** Session open = open of the first M1 bar at/after 00:00 London; the touch can be on any bar,
   including the first. Race thresholds +-0.25 sigma from the level. On the touch bar only the break side is read (the
   bar came from the approach side, so a bounce cannot be ordered inside it); a later bar hitting both thresholds is
   ambiguous and counted unresolved.
7. **Duplicates and cells.** Within each hypothesis a level that is a wall in two buckets counts once (dedup by
   instrument, session, side, level), placebos likewise. Stacked = a strong wall in a different bucket within 0.1 sigma
   (both walls tagged). H1 = strong walls in 0-1 or 2-7 with book sign positive; H3 = strong walls, any bucket, book
   sign negative.
8. **Gate mechanics.** Statistic = pooled wall break rate minus pooled placebo break rate over resolved touches
   (ratio of sums), sample by sample (FX/gold; NQ+SPX), never pooled across samples. CI = 95% percentile of 2,000
   (instrument, ISO week) cluster resamples, seed 20261027, one RNG for the whole run. p = bootstrap one-sided (H1 below,
   H3 above), two-sided for H2. Halves = split at the median session date of the resolved wall touches in that test.
   Instrument rule = per-instrument difference has the hypothesised sign (H2: the pooled sign) in >= 5 of 7 FX/gold or
   both NQ and SPX. **"Independent days" = distinct calendar session dates** with a resolved wall touch (the
   conservative reading: same-day touches on 7 correlated instruments are not 7 days). BH q = 0.10 over the six
   (H x sample) tests (plus H4 if scored). Verdict per (H, sample): VALIDATED = every gate + BH + the mirror not passing;
   < 400 days = UNDERPOWERED; otherwise NULL if the CI excludes the 3 pp bar in the hypothesised direction (H2: both
   directions), else UNDERPOWERED.
9. **Mirror ruler.** No IV history exists for gold or SPX in this book, so the expected-move edge is open +- 1 NY-close
   sigma (the profile's own fallback `dayMove`), with grid placebos at +-1/+-2 increments in CFD units, scored on the
   same gamma-sign days as the hypothesis it mirrors (positive for H1/H2, negative for H3).
10. **H4** = Wald chi2(3) for equal wall-minus-placebo differences across the four hour blocks, bootstrap covariance,
    only inside an (H1 or H3, sample) that passed.
11. **Map (section 5)**: 4 buckets x 2 signs x {strong, moderate} x 4 hours x {stacked, not} per sample, n, rates, CI,
    unresolved share (> 20% flagged), BH q = 0.10 over cells with >= 20 resolved wall touches. CONTEXT only.

### A2 — 2026-11-11 — PRE-RESULTS (count-first pass, touches only)
Data actually present: the FX chains are **monthlies only** (12 expiries a year, no weeklies); gold (`OG.OPT`) is
monthlies, 2022-11-08 to 2026-04-21 (88 sessions dropped for a book > 7 days old); **NQ and SPX are quarterlies only**
(4 a year). Sessions scored: 1,543-1,544 per FX pair, 889 gold, 1,539 NQ, 1,508 SPX (2020-09 to 2026-08-21).
Sessions with any 0-7 DTE OI: 423 per FX pair (27%), gold 244, NQ 144 (9%), SPX 138.
Book sign: FX/gold 4,994 pos / 3,799 neg / 1,219 neutral / 140 unknown (gold is positive on 778 of 889); NQ+SPX
1,783 / 749 / 475 / 40.

| Test | Sample | wall touches | placebo touches | distinct days | instrument-days | vs 400 |
|---|---|---|---|---|---|---|
| H1 near-DTE, long gamma | FX/gold | 1,021 | 277 | 496 | 822 | clears (before dropping unresolved) |
| H1 | NQ+SPX | 267 | 228 | **97** | 164 | **UNDERPOWERED by design** |
| H2 far-only, long gamma | FX/gold | 2,528 | 1,251 | 1,188 | 2,153 | clears |
| H2 | NQ+SPX | 1,090 | 1,597 | 686 | 907 | clears |
| H3 short gamma | FX/gold | 2,646 | 838 | 1,210 | 2,140 | clears (gold contributes 15) |
| H3 | NQ+SPX | 812 | 1,254 | 405 | 575 | borderline: may fall below 400 once unresolved touches drop |

FX placebo touches are few relative to walls (the 50-pip step is ~0.8 sigma, so neighbours sit further from spot), so
the placebo side carries most of the FX/gold CI width. Map: of 96 FX/gold cells only 2 reach 400 days (median 86); of
93 NQ+SPX cells none (max 149). The map is CONTEXT as registered. As section 6 says, H1 on NQ+SPX is UNDERPOWERED
whatever the race shows; the forward record (OI bots and the hedging-plan shadow log every wall's DTE, on weekly books)
is the way to power it.

### A3 — 2026-11-11 — PRE-RESULTS (owner's addition, CONTEXT only, not a scored hypothesis)
Each strong wall is also split by the **local** gamma sign at its strike: net dealer gamma (same convention as the book
sign, all expiries) summed over strikes within +-0.25 sigma of the wall, positive or negative. Reported as book sign x
local sign (x all / near 0-7 / far 8+), wall vs placebo break rate with CI and n. Placebos inherit the wall's local
sign. Descriptive only; a separate study will test local gamma properly. It changes no H1-H4 verdict and enters no FDR
family.
