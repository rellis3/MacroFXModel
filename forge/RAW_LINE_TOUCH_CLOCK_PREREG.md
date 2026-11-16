# raw-line-touch-clock — Does touching a raw line say anything about the rest of the day beyond the clock and the range already used, and does the hour of the touch change who wins (fade or follow)?

**Pre-registered 2026-11-16, before any outcome of this design was computed.**

| | |
|---|---|
| ID / ledger ids | `raw-line-touch-clock-range` (H1), `raw-line-touch-clock-hour` (H2) |
| Branch | `ccr-f91bc300-0j35im` |
| Register row | `plans/RESEARCH_REGISTER.md` → `raw-line-touch-clock` |
| Data | 15-minute closes (the research M1 cache is not in the cloud session). **Discovery**: 12 instruments (EURUSD, GBPUSD, AUDUSD, USDJPY, USDCAD, USDCHF, gold, silver, NQ, SPX, DAX, Brent), `analysis/output/rates_residual/m15`, sessions 2019-01-01 → 2026-08-21. **Confirm**: NQ and EURUSD from `analysis/output/rate-surprise-events/m15` (byte-identical to the discovery series where they overlap, checked 2026-11-16), sessions 2010-07-01 → 2018-12-31, never used by `raw-level-revert-continue` or `raw-level-mfe-mae`. Lockbox: nothing after 2026-08-21 |
| Seed | `20261116` |
| Uncertainty | date-clustered bootstrap (sessions resampled, all instruments of a date together), B = 1000, 95% percentile CI |
| Scripts / outputs | `scripts/raw-line-touch-clock/` → `analysis/output/raw-line-touch-clock/` |
| Harness | own Python script, reusing `sessions()`, `cost_frac()` and the line construction of `scripts/raw-level-revert-continue/run.py` unchanged |

## 1. Claim

Two owner questions (2026-11-15/16), after `raw-level-mfe-mae` found that touching a raw line widens the spread of
outcomes in both directions without pointing a way:

- **H1**: when price first touches a raw line, does the rest of the day run wider than at an ordinary moment **with
  the same clock and the same range already used**? That is, is the line itself special, or is it just "the day is
  already busy"?
- **H2**: does the **hour of the touch** change whether fading or following wins, and how far price runs for and
  against the trade (MFE/MAE), by line?

## 2. Why this isn't already settled

- `live-range-clock` (NULL, 2026-10-07): moving lines built from range used × pace forecast the remaining range barely
  better than the clock alone (1–1.5%). `fast-start-rest-of-day` and `intraday-range` (VALIDATED): range used predicts
  the rest of the day. **None of them asks whether reaching a specific historical-percentile line adds anything once
  clock and range used are held.** H1 holds both and isolates the line.
- `line-touch-reach` (VALIDATED): after a Live Range line, the model's own odds of the next line hold. That is
  calibration of a forecast, not "does the line add information".
- `raw-level-revert-continue` / `raw-level-mfe-mae` (exploratory, 2026-11-15): pooled over the day, no direction at
  any line. They did not look at the hour of the touch beyond a 4-bucket split for EXT. H2 does, for every line, with
  an untouched confirmation period. **H2's direction cells are a re-cut of an exploratory null by hour.** That is
  allowed here only because the confirm period is untouched and the gate needs both periods; it is said up front.

## 3. Definitions

- **Session, lines, U**: exactly as `raw-level-mfe-mae`. London date, 00:00–22:00 London, weekdays, ≥ 40 bars.
  Lines are EXT/HL/OC at p50/p75/p90 from the trailing 250 sessions (min 120, sessions < i only), plus PRIOR PDH/PDL
  when the open is inside yesterday's range: 11 line groups. U is the trailing-250 median session HL (% of open).
  Touch = the first 15-minute close at or beyond the line; entry = that close.
- **Range used** at bar j: (max − min of closes 0..j) / (open × U).
- **Remaining range** at bar j: (max − min of closes j..end) / (open × U). The outcome for H1.
- **Clock**: the London hour of bar j (22 hourly cells).
- **H1 matched baseline**: for each instrument, over **all** bars of all scored sessions in that period, the mean of
  log(remaining range + 0.01) in cells of (clock hour × range-used decile). Deciles come from that instrument's own
  bars in the same period. Touch bars are a negligible share of all bars and are left in.
  **Line effect** of a touch = log(RR + 0.01) − its cell's baseline mean. The +0.01 U keeps a flat last bar finite.
- **H2 time blocks**: London hour of the touch in 2-hour blocks: 00–01, 02–03, …, 20–21 (11 blocks).
- **H2 trade**: a 1:1 bracket of 0.20 U stop and 0.20 U target from the touch close. Fade = against the line,
  follow = through it, unresolved at 22:00 = marked to the close and kept. Stops are priced under both fill models of
  `raw-level-mfe-mae`: "kind" fills at the stop, "harsh" at the breaching close. Targets fill at the target. One
  median spread per round trip. Fade and follow are mirror trades with the same bracket.
- **H2 placebo**: the same bracket at the same bar index in 10 random sessions of the same instrument within
  ±60 sessions (same procedure as `raw-level-mfe-mae`).
- **H2 descriptive**: MFE and MAE to the close (fade direction), median and p75, by block × line, real and placebo.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| H1a | Pooled EXT p75 + p90 touches (primary cell): mean line effect, discovery | **Null**: under +5% (exp of mean − 1), most likely 0 to +3%, because range used already carries it |
| H1b | Same, each of the 11 line groups (secondary) | Null everywhere; possibly slightly **negative** at p90 (exhaustion of the day's range already counted) |
| H1 GATE | VALIDATED only if the primary cell's line effect is ≥ +5% with CI lower bound > 0 in **discovery and confirm** (NQ+EURUSD 2010–18), same sign | — |
| H1 MIRROR | Line effect ≤ −5% with CI upper < 0 in both periods = lines mark *less* remaining range than equally busy moments; reported as CONTEXT | — |
| H2a | For any line × block cell, fade (or follow) net 1:1 expectancy minus placebo, discovery | **Null**: no cell passes BH under both fill models |
| H2 GATE | A cell is a **candidate** only if (i) its edge vs placebo passes BH q = 0.10 across the 11 × 11 × 2 discovery cells under **both** fill models, (ii) its **net** expectancy is > 0 under both models, and (iii) in the confirm period its block × line-family cell (NQ+EURUSD pooled) has the same sign with CI excluding 0 under the harsh model. VALIDATED needs all three; (i)+(ii) without (iii) is CONTEXT | — |
| H2 MIRROR | The follow trade is the fade's mirror with the same bracket; both are tested, BH covers both | — |
| H2b | Descriptive: MFE/MAE by hour block | Bigger in London open (07–09) and NY open (13–15) blocks in both directions; MFE − MAE about 0 in every block (CONTEXT only, no gate) |

## 5. Power

- **H1**: discovery primary cell ≈ 17,000 touches (EXT p75 12.0k + p90 5.0k in `raw-level-mfe-mae`). The
  sd of a log-ratio residual is assumed at about 0.6, to be confirmed on non-touch bars before scoring (amendment A1).
  Clustered SE ≈ 0.6/√(≈1,900 dates × ~2 effective) ≈ 0.01, so MDE (80%, two-sided 5%) ≈ 0.03 = 3%, below the 5% bar.
  Confirm: ≈ 2 × 2,000 sessions × ~0.75 touches ≈ 3,000 touches over ~2,000 dates gives SE ≈ 0.015 and MDE ≈ 4.2%,
  just under the 5% bar. If A1's measured sd makes the confirm MDE > 5%, a confirm-period miss is UNDERPOWERED, not
  NULL.
- **H2**: smallest cells are p90 lines in late blocks (~100–300 touches). A 1:1 bracket's win rate has SE ≈ 3–5 pp
  there, so only edges ≥ 0.1 U are detectable. Cells with < 200 discovery touches are reported but excluded from the
  BH family and from any verdict (marked UNDERPOWERED). Confirm cells are pooled by line family (EXT/HL/OC/PRIOR) to
  keep n ≥ 200.

## 6. Multiplicity

H1: one primary cell (no correction), 11 secondary cells with BH q = 0.10. H2: BH q = 0.10 over every eligible
line × block × direction cell, run separately per fill model; a cell must pass in both. Confirm-period checks are
one-to-one with discovery candidates (no further search). Nothing else gets scored. Any added cut is an amendment
tagged POST-HOC and can only describe.

## 7. What this does NOT test

M1 wicks and tight stops (< 0.2 U) are not tested; that needs the laptop M1. Nor are other bracket sizes than 1:1 at
0.2 U, lines built from forecasts, macro or event days, and anything after 2026-08-21.

## 8. What each verdict changes

- H1 NULL: the lines are a range-used gauge and nothing more. Live tools should show range used against the clock and
  drop any "line touched = more to come" message.
- H1 VALIDATED: a line touch is a range input beyond the clock. Next is a prereg to add it to the hourly remaining-range
  table.
- H1 MIRROR: the lines mark partial exhaustion. Size targets down after a touch.
- H2 NULL: there is no time of day at which fading or following a raw line pays. Direction has to come from outside
  the lines.
- H2 candidate (CONTEXT) or VALIDATED: an M1 re-run with bid/ask on the laptop, then a forward record before any live
  use.

## Amendments

### A1 — 2026-11-16 — PRE-RESULTS
Power measured on ordinary bars only (`--stage power`: one random bar per session, residual of log remaining range
against its own clock-hour × range-used-decile cell; `analysis/output/raw-line-touch-clock/power.json`). No touch
outcome had been computed.
- Discovery: bar sd 0.525; sd of a date's mean (12 instruments) 0.297 over 1,982 dates → clustered SE ≈ 0.007,
  MDE (80%, 5% two-sided) ≈ **1.9%**. Below the 5% bar; powered.
- Confirm (NQ + EURUSD 2010-07 → 2018-12): bar sd 0.539; date-mean sd 0.420 over 2,204 dates → SE ≈ 0.009,
  MDE ≈ **2.6%**. Below the 5% bar; powered, so a confirm miss is NULL, not UNDERPOWERED.
- Both overstate power a little for the primary cell, because a p90 touch implies a p75 touch the same day. Even at
  half the effective dates the MDEs (2.7% / 3.7%) stay under 5%.
- Costs before 2016 (confirm period) use the earliest year in the OANDA spread archive (2016). No spread history
  exists before that. Costs affect only H2 net cells.
- Implementation note: the H1 baseline is per instrument and per period, built from all bars of that period's scored
  sessions (as §3 says).

## RESULTS

Run 2026-11-16, scored once (`analysis/output/raw-line-touch-clock/RESULTS.md`).

- **H1 `raw-line-touch-clock-range`: NULL.** Primary EXT p75+p90: discovery −0.2% [−2.3, +1.8] (17,043 touches),
  confirm +1.3% [−1.6, +4.2] (3,043). Gate +5% in both: missed. Every secondary cell is inside ±5%. p50 lines are
  +2 to +3% and yesterday's low +3 to +4% in both periods; p90 lines are −4 to −5% and yesterday's high −2 to −4%.
  The mirror (≤ −5% in both) was not met either.
- **H2 `raw-line-touch-clock-hour`: NULL.** 220 eligible cells. BH passes: kind 4, harsh 22, both 3. Net positive
  under both models: 0. No candidate, so the confirm check was not triggered. With kind fills, fade and follow are
  mirror images within ±0.011 U in every block.
- H2b (descriptive): MFE and MAE are equal in every block. They shrink from 0.62 U (00–01) to 0.05 U (20–21), and the
  share of unresolved brackets rises from under 1% to 72%.

