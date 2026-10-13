# Research protocol for cog tests

The house approach is "built ≠ works ≠ has edge". Every claim of edge goes through pre-registration, a true IS/OOS
split, real costs, and comparison with the incumbent.

## Pre-registration template

Copy the structure of `cog-replication/G1_PREREG.md`, `forge/COG_SETUPS_PREREG.md` or
`forge/COG_SPREAD_DIRECTION_PREREG.md`. Sections, in order:

1. Header: "Written <date>, before any outcome was computed. Committed before the run." The results file later cites
   that commit hash.
2. Why.
3. Exact signal reconstruction.
4. Publication lags. FRED/Treasury defaults used so far: WALCL 8d, TGA 2d, RRP 1d, HY OAS 1d.
5. Data traps. Examples: RRPONTSYD is in billions while WALCL/TGA are in millions; DTS TGA field and account-name
   quirks.
6. Targets.
7. Power: count *independent* episodes, not days.
8. Numeric verdict rule, fixed in advance. G1 used SUPPORTED ≥ 55% with p < 0.05 and ≥ 20 episodes; NULL 48–52%;
   INCONCLUSIVE otherwise.
9. Chronological 60/40 IS/OOS split, opened once.
10. Secondaries, labelled as not deciding.
11. A stated prior.
12. An outcome → consequence table.
13. A stopping rule (at most one logged variant).

Commit the prereg **before** running anything.

## Significance

- Stationary or month-block bootstrap (60-day mean block, B = 2000, seed 20261007).
- Holm correction across the primary tests.
- Both halves positive.
- A placebo and a time-shift control.

## Results files

Open with the prereg link and commit, then a **Verdict** heading, then tables. Every test is also added to the Evidence
Book (`js/deskEvidence.js`) and to `references/verdicts.md` in this skill.

Report nulls plainly. A null is a red takeaway, never softened. Deviations from the prereg are logged openly in the
results file.

## Hard-won backtest rules (`cog-replication/README.md`)

1. Stops must be live from the fill minute. `filter(b => b.t > entryBar.t)` is right for choosing a fill and wrong for
   walking an exit.
2. A validator that inherits the assumption it is testing is not a validator.
3. Trust paired within-engine comparisons over absolute Sharpes.
4. Check concentration before believing any full-sample edge.
5. Measure costs, never assume them (measured: NAS100 0.937bp, XAU 1.521bp).
6. Never fill on a bar before the signal time; signal-log resolution fills at the next M5 bar open.
7. Lego Principle #5: true IS/OOS, real costs, OOS ≥ 30 trades, beat the incumbent on OOS.

## Forward-log scoring (`cog-replication/FORWARD_LOG.md`)

- Track "Agree with COG?" and "Who was RIGHT?" separately; agreement is not the goal.
- Pre-registered bar: agreement real if ≥ 70% at n ≥ 30, null if ≤ 60%.
- Runs test against the expected runs `2·nL·nS/n + 1`.
- Log COG's rows as they land. Never reconstruct them afterwards.

## Decisions

Decisions go in `cog-replication/DECISIONS.md`, newest first, in the form `## YYYY-MM-DD — <headline>` then
**Decided / Why / Reverses if**.
