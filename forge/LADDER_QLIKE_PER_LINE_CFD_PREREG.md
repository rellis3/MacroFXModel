# ladder-qlike-per-line-cfd: each line its own QLIKE-best calc, across the CFDs

**Pre-registered 2026-11-24, before any CFD per-line QLIKE was computed.**

| | |
|---|---|
| ID / ledger ids | `ladder-qlike-per-line-cfd` |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-qlike-per-line-cfd` |
| Source | Owner 2026-11-24: "do the same analysis across the CFD pairs for the CFD export, per-line calc again". Jordan's (a C.OG group member) method: ultra-targeted analysis per line, each line raced across many calcs and keeping the one with the best QLIKE for its purpose. Futures version: `ladder-qlike-per-line` (banked 2026-11-22), Close± added 2026-11-24 |
| Instruments | Every CFD with a ladder-v2 build (`analysis/output/ladder-v2-<sym>/rows_C.parquet`), less the five commodity CFDs that failed the rollout's inventory bar (NATGAS, SOYBEAN, WHEAT, CORN, SUGAR; rollout A2): 40 instruments, i.e. 28 FX pairs, NQ, SPX500, US30, US2000, DE30, UK100, GOLD, SILVER, COPPER, PLATINUM, PALLADIUM, WTI, BRENT |
| Window | Sessions to **2026-08-21** (lockbox untouched); c from 2018, picks from 2019, scored 2020 → 2026-08-21 |
| Seed | `20261124`. B = 2000, 63-session blocks |
| Scripts | `scripts/ladder-qlike-per-line-cfd/` → `analysis/output/ladder-qlike-per-line-cfd/` |

## Lines and field

Lines on the OANDA CFD, London 00:00–22:00 (`ladder.london_sessions`): HL, OH, OL, OC (|close − open|), **Close+**
(close − open on sessions closing above the open), **Close−** (open − close on sessions closing below). Field: every
arm in `ladder.arms_for(sym)` (A0 = the instrument's live estimator, E_* estimators, H8, R5, R15, SHAR, HARCJ, GARCH
family, HAR+GARCH-t blend, and IV arms where the instrument has an IV index), sigmas from the build
(`ladder.walk_forward`, track C).

## Scoring

QLIKE per line exactly as `ladder-qlike-per-line`: h = c·σ², c = mean(x²/σ²) over 2018 … Y−1 on that line's own
sessions; QLIKE = x²/h − ln(x²/h) − 1. Walk-forward per-line pick: lowest mean QLIKE on 2019 … Y−1. **SITE** = the pick
restricted to arms the site can compute (no IV, no H8), because that is what the export would use.

## Hypothesis (one test)

**H1:** the SITE per-line picks beat each instrument's live σ (A0) on summed QLIKE over HL + OH + OL. Δ = Σ QLIKE(SITE)
/ Σ QLIKE(A0) − 1 per instrument, equal-weight mean over the 40, 90% CI from a **date-aligned** 63-session block
bootstrap (the same resampled dates for every instrument, because FX pairs share shocks). All years and each half
(2020–22, 2023–26).
- **VALIDATED:** CI upper < 0 overall and in both halves. **NULL:** CI lower > −0.5%. **UNDERPOWERED:** otherwise.

**Descriptive (no verdict):** per instrument and line the full out-of-sample leaderboard, the picks by year, the
final pick used on the site (best site-computable arm on 2020 → 2026-08, as for the futures), and the hit rates of
its p50/p75/p90 lines; Δ per line and per instrument; OC, Close+ and Close− picks the same way.

## Controls

1. The build's realised HL/OH/OL/OC must be reproduced by `ladder.london_sessions` on the CFD M1 on ≥ 99% of
   sessions (|signed close| = OC as well). Fail → that instrument is dropped and reported.
2. A0 inside the race must equal the build's A0 column (same σ the site uses today).

## What it changes

- **VALIDATED:** the CFD QLIKE per-line export goes on the site as a shadow (each line its own calc), next to the
  current CFD ladder.
- **NULL / UNDERPOWERED:** the export still goes up as a shadow, because the owner's rule is that each line keeps its
  QLIKE-best calc, labelled with this verdict; the live CFD ladder is unchanged either way.

## Amendments
