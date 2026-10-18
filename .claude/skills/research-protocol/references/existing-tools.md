# Existing tools, and where older studies live

## Which tool for which study

| Tool | Use it for | Notes |
|---|---|---|
| `js/harness/runStudy.mjs` | strategy / P&L studies (vol target, measured costs, DSR, PBO) | fixed rules: 10% vol target, block bootstrap 1,000 draws, seed `0x9e3779b9`, BH-FDR 10%. Output `analysis/output/harness/<id>.json` + `toEvidence()`. Its header says a strategy study that bypasses it isn't eligible for the Evidence Book |
| `analysis/study.mjs` | event / market-sense studies in JS (`new`, `check`, `bank`, `list`) | writes `MD files/<ID>_PREREG.md` + `analysis/<id>_study.mjs`; `bank` refuses if the prereg's first commit is after the result's `ranAt`. **Its bootstrap uses unseeded `Math.random`**: pass a seeded RNG in your study file |
| own Python / JS scripts in `scripts/<slug>/` | intraday, rates, OI and other studies the harnesses don't cover | must follow `stats-defaults.md` by hand |
| `js/preregStats.js` | MDE, power verdict, Holm, BH, `pFromCI`, chance baseline | tested by `node js/preregStats.test.mjs` |
| `scripts/build_trial_ledger.mjs` | regenerates `MD files/TRIAL_LEDGER.md` | scans `forge/`, `MD files/`, `oi_research_book/` for `*PREREG*.md` |
| `research_status.mjs` (this skill) | register + in-flight work on branches + hygiene | read-only; `--out` to write a file |
| `forge.lockbox_check` | the one sanctioned holdout evaluation | `--evaluate`, once, at ≥ 60 sessions |

## Other registers (indexes that point at the Evidence Book)

- `cog-knowledge` `references/verdicts.md` (C.OG work), `cog-replication/DECISIONS.md` (decisions, newest first).
- `MD files/PREREGISTERED_EVALUATIONS.md` (forward evaluations of live bots), `MD files/CROWN_WATCH.md`,
  `MD files/CLAIM_WATCH.md`.
- `plans/DATA_AND_INTEGRATION_TRACKER.md`: the **build** backlog (feeds, builds, owner decisions). The research
  register is the **study** list. A build that needs a test gets a register row that links to the tracker item.
- Worklogs (`plans/RATES_NASDAQ_WORKLOG.md`, `MD files/FORECAST_WORKLOG.md`) are narrative and optional. The register
  row is not optional.

## Where older studies live (before 2026-10-18; don't migrate them)

Preregs: `forge/` (most), `MD files/` (market-sense, study.mjs), `oi_research_book/` (OI/GEX),
`cog-replication/G1_PREREG.md`, and a few plans in `plans/`. Amendments are sometimes in-file, sometimes separate
`*_ADDENDUM_*` / `*_AMENDMENT_*` files. Results are in `analysis/output/<folder>/` (folder names don't always match:
`cog_yield_dir` is COG-SPREAD-DIRECTION; `cog_video_0918/` holds about 12 rates/Nasdaq studies), in the prereg file,
or in `oi_research_book/*_RESULTS.md`. Older studies finish under their old layout; new studies use this skill's.

## Known gaps in the tooling (as of 2026-10-18)

- CI runs `deskEvidence.test.mjs` but not `preregStats.test.mjs`, `analysis/study.test.mjs`, the harness tests, or any
  check that a prereg was committed before its results, that a `doc` exists, or that the trial ledger is current.
  `research_status.mjs` reports the last two by hand.
- `build_trial_ledger.mjs` doesn't scan `cog-replication/`, and matches preregs to entries by file stem, so grouped
  or renamed banking shows as unbanked.
- The Evidence Book has no "stale / needs re-run" field; use a `RE-RUN` register row.
