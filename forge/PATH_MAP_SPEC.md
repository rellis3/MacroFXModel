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
| 1 | as above | 2026-10-06 | run: 190 cells, 6 pass, all "range used > 1.2" → continuation (p50 +7.5pp, p75 +6.0pp vs null) — **suspect, see Amendment 1** |
| 2 | null and race measured from the touch bar's CLOSE (Amendment 1) | 2026-10-06 | run: 190 cells, **0 pass** |

| 3 | placebo baseline + three new conditions (Amendment 2) | 2026-10-06 | run: 314 cells, **0 pass** |

## Amendment 2 (2026-10-06, after variant 2, before variant 3 is run)

The random-walk null b/(a+b) ignores the session-end cut-off (which favours the nearer level among resolved races),
bar-sized steps, volatility clustering and drift; the late-hour cells (+6 to +9pp, failing the rule) look like that.
Variant 3 replaces it as the PRIMARY baseline with a **placebo**: on every session, two fake ladders with every width
multiplied by a factor drawn uniformly from [0.70, 0.90] ∪ [1.10, 1.30] (seeded per instrument-session, so not the real
line), raced by exactly the same code from their own touch-bar close. A cell is a **dynamic** only if its real
continuation share differs from the placebo share for the same cell by more than 2 date-clustered SEs of the
difference, the same way, in both halves. The b/(a+b) null is still reported.

New conditions (one-way, and two-way with hour where cells ≥ 300):
- **approach**: |close at touch − close 30 bars earlier| in σ units; terciles (slow / mid / fast) over all real touches.
- **prior-day level**: the line within 0.15σ of the previous session's high (up lines) or low (down lines): yes / no.
- **IV ÷ σ**: implied vol ÷ √252 ÷ HAR σ, IV = last value strictly before the session (CME 30d ATM for the 6 USD
  majors, GVZ for gold, VXN for NQ, VIX for SPX500/US30/US2000; none for crosses and DE30/UK100); terciles.

## Amendment 1 (2026-10-06, after variant 1's results, before variant 2 is run)

Variant 1's null assumes the race starts exactly at the line, but the race is scored from the bar after the touch, and
the touch bar can close past the line. On days running hotter than their forecast (exactly the "range used > 1.2"
days) a one-minute bar's overshoot is larger in σ units, so the distance to the next line is shorter than the null
assumes and continuation is overstated mechanically. Variant 2 measures a and b from the touch bar's close (the price
at which the race actually starts); everything else unchanged. Variant 1's numbers stay on record above. Only cells
that pass under variant 2 count as dynamics.

## Results (variant 2, 2026-10-06) — `analysis/output/path_map_summary.log`, page `path-map.html`

156,734 first touches, 2,656 sessions, 34 instruments, 2016-05 → 2026-08. 190 cells examined; **0 dynamics.**

| rung | touches | continuation share | random walk from the close | next line by end | back level by end | held | unresolved |
|---|---|---|---|---|---|---|---|
| p50 | 91,666 | 58.2% | 57.3% | 50% | 40% | 31% | 21% |
| p75 | 46,252 | 46.7% | 46.7% | 41% | 45% | 35% | 25% |
| p90 | 18,816 | 51.2% | 51.1% | 38% | 38% | 37% | 33% |

Read:
- **Once the race is measured from where it actually starts, price around the HAR lines races like a random walk** —
  at every rung, in every regime, event bucket, class and range-used bucket. Variant 1's "range used > 1.2"
  continuation (+6 to +7.5pp) was entirely the touch-bar overshoot: it is 0.0pp under variant 2.
- **What does vary is how much day is left.** A p50 touch in 00-07 London is held as the day's extreme 23% of the time;
  in 20-24, 74%. Next-line reach falls from 62% to 12% over the same hours. That is the exhaustion clock
  (EXHAUSTION-SCHEDULE) seen from the lines: touches late in the day are final because the session ends, not because
  price turns. The late-hour cells' positive continuation share (+6 to +9pp, few resolved races) fails the rule and is
  most likely the session-end cut favouring the nearer barrier.
- For layer 5 this says: there is no direction to take at a line from these conditions. What the lines carry is
  **how far price can still travel and how much time it has** — the decision layer should be built on remaining
  travel, not on fade vs continue.

## Results (variant 3, placebo baseline, 2026-10-06)

156,734 real touches + 326,375 placebo touches (same sessions, fake ladders at 0.7–0.9× / 1.1–1.3×), 314 cells.
**0 dynamics.**

| rung | real continuation | placebo continuation | difference | random walk from close |
|---|---|---|---|---|
| p50 | 58.2% | 58.3% | −0.0pp (z −0.1) | 57.3% |
| p75 | 46.7% | 46.4% | +0.3pp (z +0.5) | 46.7% |
| p90 | 51.2% | 51.9% | −0.7pp (z −0.8) | 51.1% |

- The real HAR lines behave exactly like fake lines at other distances: price does not treat them as special, in any
  hour, regime, event bucket, class, range-used, approach-speed, prior-day-level or IV-÷-σ bucket.
- Variant 2's late-hour excess (+6 to +9pp vs the random walk) is gone against the placebo (+2.7pp, z 0.7): it was
  the session-end cut-off, which the placebo shares.
- Largest single cell: p90 on a prior-day high/low +5.6pp (z 2.4, n 1,134), one of 314 — about what chance gives, and
  it does not hold in both halves.
- **Layer 4 conclusion (final for this data):** the lines are a calibrated *distance* forecast; price around them is
  path-neutral. What changes through the day is how much time and travel is left (held-as-extreme 23% → 74%). Layer 5
  is built on remaining travel.
