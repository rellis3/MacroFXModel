# ladder-qlike-per-line-fut: each line its own QLIKE-best calc, across the futures

**Pre-registered 2026-11-24, before any futures per-line QLIKE was computed for the new contracts.**

| | |
|---|---|
| ID / ledger id | `ladder-qlike-per-line-fut` |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-qlike-per-line-fut` |
| Source | Owner 2026-11-24: "roll the process of line choosing and racing for futures … remember each pair and each line may have a different calc for different lines". Jordan's (a C.OG group member) method: each line raced across many calcs, keeping the one with the best QLIKE for that line. Same method as `ladder-qlike-per-line` (4 futures, banked 2026-11-22) and `ladder-qlike-per-line-cfd` (40 CFDs) |
| Instruments | Every NT8 future with a ladder-v2 track-F build: NQ, ES, YM, RTY, FDAX, 6E, 6J, 6B, 6A, 6N, 6C, 6S, GC, SI, HG, PL, CL, BZ, NG, ZC, ZW, ZN, ZB, ZF, ZT (25). NQ, GC and 6E use their full builds in `analysis/output/ladder-per-line/build/`; 6J uses `ladder-v2-usdjpy` (as the existing futures race) |
| Window | Sessions to **2026-08-21** (lockbox untouched); c from 2018, picks from 2019, scored 2020 → 2026-08-21 |
| Seed | `20261124`. B = 2000, 63-session date-aligned blocks |
| Scripts | `scripts/ladder-qlike-per-line-fut/` → `analysis/output/ladder-qlike-per-line-fut/` |

## Lines, field, scoring

Lines on the futures (unadjusted continuous, London 00:00–22:00, inverted contracts 6J/6C/6S flipped to the CFD
orientation): HL, OH, OL, OC, **Close+** (up-close sessions), **Close−** (down-close sessions). Field: every arm in
`ladder.arms_for(sym)`, sigmas from `ladder.walk_forward(…, track "F")`. QLIKE exactly as `ladder-qlike-per-line-cfd`;
per-line walk-forward pick on 2019 … Y−1; **SITE** = picks among site-computable arms (no IV, no H8).

## Hypothesis (one test)

**H1:** SITE per-line picks beat each future's live σ (A0) on summed QLIKE over HL + OH + OL. Δ per contract, equal-weight
mean over the 25, 90% CI date-aligned bootstrap; all years and both halves.
- **VALIDATED:** CI upper < 0 overall and in both halves. **NULL:** CI lower > −0.5%. **UNDERPOWERED:** otherwise.

**Descriptive:** full leaderboard per contract × line, picks by year, final site pick per line (best site arm on 2020 →
2026-08), hit rates of its p50/p75/p90; Δ per line and contract; the four futures already on the site compared with
their existing picks (`js/ladderV2QlikeParams.json`).

## Controls

1. Realised HL/OH/OL in the build reproduce from the futures M1 on ≥ 99% of sessions (signed close |·| = OC too);
   fail → dropped and reported. 2. A0 in the race equals the build's A0.

## What it changes (owner's layer rule: never overwrite the base)

- The **four futures already on the site (NQ, GC, 6E, 6J) keep their existing params untouched**; this study only
  reports how they compare.
- Each **new** contract with an OANDA twin (live σ is computed from the twin, widths from the futures' own moves,
  as the existing futures export) is **added** to the futures QLIKE per-line export, each line its own calc, labelled
  with this verdict. Contracts with no twin feed (ZN, ZB, ZF, ZT, ZC, ZW, NG) stay research-only.

## Amendments

- **A1, 2026-11-24, POST-HOC (results seen): implementation fault fixed, nothing else changed.** As first run, US2000
  (RTY, history from 2017-07) was never scored: 2019 has no fitted scale for any arm, and the walk-forward pick's
  "≤ 2% missing in training" check rejected every arm in every year, so no pick existed and the pooled point estimate
  was NaN. The check now ignores training sessions where no arm has a QLIKE yet (`race.py` `wf_pick`). Every other
  contract's picks are unchanged by this (checked). The study is re-run in full with the same seed; the first run's
  output is kept in `analysis/output/ladder-qlike-per-line-fut/first_run/`.
- **Data note (descriptive only, cannot change the verdict):** CL (WTI) on 2020-04-20/21 traded at or below zero;
  measured as % of an open near zero, one session's QLIKE is ~850 vs a typical ~1.5. The verdict includes it as
  registered; WTI without those two sessions is reported beside it.
