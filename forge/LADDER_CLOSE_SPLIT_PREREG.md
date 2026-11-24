# ladder-close-split: forecast Close+ and Close− as separate lines, each with its own best calc

**Pre-registered 2026-11-24, before any signed-close quantity was computed.**

| | |
|---|---|
| ID / ledger ids | `ladder-close-split` |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-close-split` |
| Source | Owner 2026-11-24: "the open close isn't fixed — the open-low % is and should be different from the open-high; if each line was forecast individually and tested individually for best calc this would've been found". Jordan's (a C.OG group member) output gives HL, Close+ and Close−, with Close+ ≠ Close− (e.g. gold p50 1.83 vs 1.58). Our OC line is one symmetric |OC| number |
| Instruments | Futures NQ, GC, 6E, 6J (NT8; 6J inverted), as `ladder-wide-race` |
| Window | scored 2020 → **2026-08-21**; c and multipliers from 2016/2018, picks from 2019 |
| Seed | `20261124`. B = 2000, 63-session blocks |
| Scripts | `scripts/ladder-close-split/` → `analysis/output/ladder-close-split/` |

## Lines

Signed OC = (close − open)/open, London 00:00–22:00, from the same M1 as the build. **Close+** = OC on sessions
that close above the open; **Close−** = |OC| on sessions that close below. Neither line forecasts direction: both
are drawn every day, and each is scored on the days the session closes on its side.

## Arms

- **SPLIT:** for each side separately, every σ model in the old field plus the `ladder-wide-race` new arms (except
  the per-line direct models, which were fitted to HL/OH/OL), scored by QLIKE on that side's sessions with c fitted
  on that side; walk-forward pick per side (lowest mean QLIKE on 2019 … Y−1). Levels p50/p75/p90 = σ_pick × the
  empirical quantile of (side OC / σ_pick) on that side's sessions in years before Y (so up and down get their own
  multipliers).
- **SPLIT-OLD (descriptive):** the same with the old field only (separates the split from the wider field).
- **CURRENT:** today's symmetric OC line: walk-forward QLIKE pick on |OC| from the old field, its ladder levels
  (`<arm>_oc_<τ>`), applied to both sides.

## Hypothesis

Primary metric, the owner's: absolute error of the p50 line vs the actual close, in % of the open, on each session
against the line for its side. Δ = Σ error(SPLIT) / Σ error(CURRENT) − 1, equal-weight mean over the 4 instruments,
90% block-bootstrap CI, all years and each half.

- **VALIDATED:** CI upper < 0 overall and in both halves. **NULL:** CI lower > −0.5%. **UNDERPOWERED:** otherwise.
- Reported with CIs: Δ per side and per instrument; QLIKE per side (each with its own fitted c); hit rates of
  p50/p75/p90 on each side vs 50/25/10; the picked model per side per year; the multipliers per side (asymmetry).

## Controls

1. |signed OC| must equal the build's `oc` on ≥ 99% of sessions within 1e-6. Fail → stop.
2. Up + down sessions + flat (OC = 0) must account for every session.

## What it changes

- **VALIDATED:** the export gets separate Close+ / Close− lines with their own models, and the chart indicator draws
  them (shadow first).
- **Otherwise:** keep one OC line; report the asymmetry for reference.

## Amendments

- **A1, 2026-11-24, PRE-RESULTS** (no result computed; the first run was stopped after NQ's controls). Parked when the
  owner set OC aside, then reopened by the owner the same day: Close+ = where price closes on days that close above
  the 00:00 open, Close− = where it closes on days below, each line measured on its own days only. Design unchanged.
