# Vol line × Asia fib extension confluence: does price react more where they coincide? (registered 2026-10-13, before any outcome is computed)

**Owner's idea (2026-10-13):** when a daily volatility line (O→H / O→L p50, p75, p90) falls within a few pips of an Asia-range fib extension (for example the −2 or 3 range multiple), the stacked levels should produce a predictable reaction, and possibly a trade there. OI walls would be a third layer, but there is no OI history, so they are forward-only (see the end of this document).

## Prior art (checked before registering)
- **Stacking other levels on the vol lines: no effect on fade vs continue.**
  - `forge/LIVE_RANGE_CONFLUENCE_BOOK_PREREG.md` (2026-10-07): prior day/week levels, volume profile, VWAP, momentum, WaveTrend and a meta-label. Lift in 9 of 204 tests at the static lines (chance is about 10). Its Phase 2 (Fibonacci, FVG, round numbers) **was not run**.
  - ConfluenceBot zones (swing fib + S/R + pivots + vol levels): null on 83k trades (deskEvidence `zone-engine`).
- **The Asia fib rungs on their own** are studied per touch in `js/asiaFibAtlasEngine.js`. That engine never asks whether a rung coincides with a forecast line.
- **Reach is geometry** (`forge/LEVEL_P2_PREREG.md`): the family of a level does not change the chance of reaching it. This test is about the **reaction** after the touch, which reach does not answer.
- **Not tested before:** a vol line coinciding with an Asia-range extension rung. This is the open question.

## Data (`.claude/skills/data-rules`)
- **Sessions:** London sessions from `forge.iep_build.sessions` (M1, open = first bar after 00:00 London). Weekdays, London dates ≤ 2026-08-20; the forward block is not read.
- **Lines:** the export ladder rebuilt point-in-time, `analysis/output/forecast_history/<SYM>.csv` `pit_oh_*` / `pit_ol_*` (% of the open, p50/p75/p90).
  - σ unit = `pit_sig_daily` % × open.
  - Rows before 2020-08 are burn-in (widths fitted in-sample). They are used in the discovery block only, as Phase 2 did.
- **Asia range:**
  - 00:00–06:00 London, body high/low of 5-minute candles (`sessionRanges.buildAsiaSessions` convention).
  - Grid = `fibProjection.FIB_LEVELS`, **extension rungs only** (multiples < 0 or > 1, as in the Atlas).
- **Instruments:** the 34 with M1 and a forecast history (`forge.iep_build.JOBS`).

## Units and events
**One row = one vol line (6 per day) that:**
- was untouched from 00:00 to 06:00;
- is first touched between 06:00 and 21:59 London (M1 high ≥ line above the open, low ≤ line below it).

**Confluence:** the distance from the line to the nearest extension rung (on the same side of the Asia range as the line), in σ.
- Primary tolerance **0.05σ**. Secondaries 0.03σ and 0.10σ.
- Reported for context: the **chance rate** of confluence (the grid is dense, about one rung per 0.5 × Asia range).

## Outcomes (from the line price, after the touch)
**Race (primary):**
- **Fade** = price moves b back from the line before it moves b through it, b = **0.25σ** (secondaries 0.15σ and 0.50σ), checked on M1 up to 22:00.
- On the touch bar:
  - if it already reached line + b beyond, the race is **through**;
  - if it reached both barriers, it is **ambiguous** and excluded (rate reported).
- Unresolved by 22:00: excluded from the race and reported.

**Trade (secondary):**
- Fade at the line, stop b beyond, target b back (1R), time exit at the 22:00 close.
- Cost = 2× the repo spread table, on the 21 instruments that have one (`vmcResearch/ext/feasibility.py`, `scripts/line_touch_wide/scan2.py`).
- Continuation is reported as the mirror image of the fade.

## Comparisons
- **A. Confluent vs non-confluent lines.** Fade share difference, with a logistic adjustment for rung (p50/p75/p90), side, touch hour band (06–10, 10–14, 14–18, 18–22) and class.
- **B. Placebo.**
  - Shift the Asia grid by a random phase: low' = low + u × range, u ~ U(0, 1), the same for all of a day's lines.
  - Recompute confluence at the same tolerance, 100 draws.
  - The real confluent-minus-non-confluent difference must exceed the placebo 95th percentile.

## Blocks
- **Discovery:** sessions < 2022-01-01.
- **Holdout:** 2022-01-01 → 2026-08-20. Read once, after the discovery numbers are written into this file's record.

## Pass rule (primary: fade share, b = 0.25σ, tolerance 0.05σ, pooled over rungs)
1. **Holdout difference:** confluent − non-confluent has a 5-date-block bootstrap 95% interval excluding 0 (two-sided: more continuation at confluence also counts, as a different finding).
2. **Placebo:** the holdout difference beats the placebo 95th percentile in the same direction.
3. **Discovery agrees:** the difference has the same sign.
4. **Not one instrument:** at least 60% of instruments with ≥ 30 confluent holdout events share the sign.

**Trade secondary:** the mean net R of the confluent trade (in the passing direction) has a holdout interval lower bound > 0.

**Breakdowns (reported, not tested):** rung, side, hour band, class, fib multiple (near ±1–2 vs far), and the 0.03 / 0.10 tolerances.

## OI layer (forward only)
**If the price confluence passes:** a live log records, each session, which confluent lines also sit within the tolerance of a call wall, put wall or gamma strike (oi_store), and scores the reaction prospectively.
**If it fails:** OI alone cannot be tested on history; the OI wall placebo of 2026-09-23 already found walls no better than their neighbours.

## Discovery record (2026-10-13, written before the holdout was read)
`analysis/output/vol_asia_fib/disc.json`: 34 instruments, sessions before 2022.
- **Confluence is common by construction:** at 0.05σ, **54.5%** of touched lines sit on an extension rung (placebo grid 49.4%); at 0.10σ, 86%. The Asia grid's spacing (about 0.2σ) makes coincidence the normal case.
- **Primary (0.05σ, b = 0.25σ):**
  - fade share 49.5% at confluent lines vs 49.9% at the rest, diff **−0.4pp** [−1.2, +0.4];
  - inside the placebo band [−1.0, +0.2];
  - 14 of 34 instruments with the same sign.
- **Every tolerance × barrier cell is within ±0.9pp** with an interval spanning 0.
- **Trade (fade, 1R at 0.25σ, 21 instruments with cost):** gross −0.02R, net −0.19R. Continuation is net −0.14R.
