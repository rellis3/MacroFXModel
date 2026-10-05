# Layer 4 — PATH MAP: how price behaves around the HAR lines (descriptive)

Part of `plans/FORECASTER_SYSTEM_BLUEPRINT.md`. Written 2026-10-06 before the builder exists. This is a **map, not a
trade**: no strategy, no costs, no pass/fail for the system. It states up front what counts as a real dynamic, so the
map cannot be read selectively afterwards (Lesson 2). Frozen; changes only by dated amendment before results.

## What is mapped

Lines: the HAR-800 ladder (layer 3) — σ = `forecastSigma(last 800 NY-close bars, 'har_rv_log')`
(`analysis/output/ladder_candidates/d1/<SYM>_har800.csv`), widths `js/forecastLadderParamsHar800.js`, no event
multiplier; levels = London-midnight open × (1 ± width·σ). Lines OH/OL p50, p75, p90. Data per `plans/DATA_SPEC.md`:
OANDA M1, London sessions, 34 instruments, 2016 → 2026-08-21.

**Event** = the first touch of a line in a session (bar high ≥ an up line / bar low ≤ a down line). From the bar AFTER
the touch bar (no intrabar ordering is assumed) to the session end:

| outcome | definition |
|---|---|
| `race` | which comes first: **cont** = the next line out (p50→p75, p75→p90, p90→p90 + (p90 − p75)); **fade** = the level back in (p50→open, p75→p50, p90→p75); **none** = neither by session end. A bar touching both = **both** (ambiguous, excluded from shares) |
| `next` / `back` | reached the next line / the back level by session end (either order) |
| `held` | the session's final extreme on that side is within 0.25σ beyond the line |
| `mins` | minutes from touch to race resolution |

**Null (what "no dynamic" looks like).** For a driftless random walk started at the line, the chance of reaching
distance *a* (to the next line) before distance *b* (back) is **b / (a + b)**. A share of `cont` among resolved races
above that is continuation; below it is fading. The null is computed per event from its own distances and averaged.

## Conditions (each mapped one at a time, then two-way where the cells stay ≥ 300 events)

| variable | buckets |
|---|---|
| rung | p50 / p75 / p90 |
| London hour of touch | 00–07 Asia · 07–12 London · 12–16 overlap · 16–20 NY · 20–24 late |
| regime | HAR σ ÷ its own trailing 250-session median (causal): quiet < 0.85 · normal · busy > 1.15 |
| event day | tier1 (FOMC/NFP/CPI) · high · none (calendar proxy; unknown after 2026-07-02, excluded from this split) |
| range used | running H−L at the touch ÷ HL p50: < 0.8 · 0.8–1.2 · > 1.2 |
| other side | the opposite p50 already touched (yes/no) |
| class | fx majors · crosses · gold · indices |

## What counts as a real dynamic

A cell is called a **dynamic** only if its continuation share among resolved races differs from (i) the random-walk
null and (ii) the pooled share for its rung, each by more than **2 date-clustered SEs**, **in both halves** of the
sample (2016-01 → 2020-12 and 2021-01 → 2026-08). Everything else is shown, labelled "inside noise". Number of cells
examined is reported with the result (search breadth).

## What it is for

Layer 5 (fade / continue rules) may only be built on dynamics that pass the rule above. Existing pieces this map
absorbs instead of re-testing: the rung chain (`/api/vol-forecast/ladder/path-stats`), the exhaustion clock
(EXHAUSTION-SCHEDULE), the touch races in `scripts/rangebook/`, range-used studies (`volatilityExhaustion/`).

## Variant log

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | as above | 2026-10-06 | registered |
