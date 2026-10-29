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

(none)
