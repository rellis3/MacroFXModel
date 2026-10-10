# VF3 shadow S1: time-aware intraday probabilities, prospective evaluation (registered 2026-10-10)

**Approval:** Stage C Rank 1 (owner, 2026-10-10).

**Inherits:** targets, displays and challengers from `forge/VF3_STAGE_C_PREREG.md` P1; record format and integrity rules from `plans/SESSION_AWARE_FORECAST_SPEC.md` v2, with the Stage A corrections.

**Why:** reliable time-aware probabilities are a required input to the level-interaction engine (`plans/LEVEL_ENGINE_ROADMAP.md`).

**Read-only.** No production page, bot, parameter or trade selection reads anything this writes. Nothing changes on the live page.

## What is logged (immutable)

**Instruments:** the 34 research instruments, under their production names (US30 = DOW in the research files).

**Checkpoints:** every London hour 02:00 … 20:00 on weekdays. One write-once R2 object per (date, hour) holds every instrument:
- **Path:** `shadow/ips_v1/<date>/<HH>.json`. Never overwritten: the job checks and refuses if it exists.
- **Outcomes:** written once after 22:10 London to `shadow/ips_v1/<date>/outcomes.json`, recomputed from the same OANDA M1 bars.
- **Never mutated:** prediction objects are never edited.

**Each record carries:**
- `model_version` (SHA-256 of the frozen params file), `code_commit`;
- `created_utc`, `checkpoint_london`, `instrument`;
- inputs as used:
  - London-midnight open and its bar time;
  - running high and low;
  - last M1 bar time;
  - the production export lines (`ladder_flat` O-H/O-L p50/p75/p90, HL p50) and the incumbent `hl_median`, with the forecast's `session_date` and `computed_at`;
  - consumed fractions;
- predictions: Display, Clim, Challenger-fixed for every target defined at that checkpoint.

**T1 next-line events:**
- **Detection:** at each checkpoint, from the M1 bars of the past hour (first touch of an export O-H/O-L p50/p75 line = bar high/low).
- **Timing:** the record is written up to 60 minutes after the touch. Its predictions depend only on the touch hour, the step and the instrument (Display), so nothing after the touch can enter them. `write_delay_min` is logged.

## Models (frozen in `js/intradayProbShadowParams.js`)
- **Display:**
  - T1 = `oos_exceed(next) ÷ oos_exceed(this)` from the production params file as deployed;
  - T2 = the card's `_breakoutProb` with the incumbent `hl_median` (L_A) or the export HL p50 (L_B), and the UTC clock at the checkpoint.
- **Challenger-fixed (logged live):**
  - the P1 tables (T1: London hour of touch × step; T2: hour × consumed decile; m = 30), refit on all history through 2026-08-20 (L_A from 2020-08-21);
  - **plus a fixed level correction** p' = σ(logit p + δ), with δ per endpoint estimated on the last 12 months, 2025-08-21 → 2026-08-20 (maximum likelihood, one parameter).
- **Challenger-rolling (computed offline from the logged inputs and outcomes; formula fixed now):**
  - same tables;
  - δ re-estimated at the start of each calendar month from the shadow's own outcomes over the trailing 60 valid sessions (Challenger-fixed's δ until 20 valid sessions exist).
  - Causal by construction.
- **Clim:** the training rate per step / per line.

## Acceptance (one confirmatory look at 60 valid prospective sessions; interim numbers are labelled and trigger nothing)
**Valid session:** at least 30 of 34 instruments have at least 15 of 19 checkpoint records written on time (≤ h:15), the export lines exist for that date, and outcomes are complete for at least 90% of records.

**Primary endpoints:** T1 pooled, T2-L_B, T2-L_A. Holm over the 3. The challenger arm judged is **Challenger-fixed**; Challenger-rolling is reported beside it.

**Each endpoint must meet all of these:**
1. Brier skill vs Display ≥ 2% with the session-block (5 sessions) bootstrap lower bound > 0 after Holm.
2. Skill vs Clim lower bound > 0.
3. Max decile calibration gap ≤ 3pp (deciles ≥ 300 rows; for T1, quintiles if a decile has < 300 rows).
4. No class with skill interval wholly below 0.

**Coverage:** at least 90% of scheduled records written on time. Below that, the result is **incomplete**, not passed or failed.

**Rejection:** any rule failing at the confirmatory look. A rejected or retuned challenger is a new `model_version` with a new 60-session window.

## Amendment 1 (2026-10-10, before go-live; no shadow record exists yet)
- **Instruments:** five research instruments (AUDCHF, AUDNZD, CADCHF, CHFJPY, GBPNZD) have **no production forecast**, so there are no live export lines to log. The shadow covers the **29** instruments that both lists carry (`IPS_INSTRUMENTS` in `js/intradayProbShadowRoutes.js`).
- **Valid session:** at least **26 of 29** instruments (≈ 90%) with at least 15 of 19 checkpoint records on time. Other rules unchanged.
- **Implementation:**
  - checkpoints are written during h:00–h:15 London by a 5-minute job;
  - R2 writes happen only from the Railway deployment;
  - frozen params `js/intradayProbShadowParams.js`, version `f35c5f68cd16c226…`;
  - fixed level corrections: T1 −0.065, T2-L_B −0.154, T2-L_A −0.150 (logit units).

## Not used
- The forward block (`data/m1_forward/`, sessions 2026-08-21 → the day before go-live) is **not** scored here. It is reserved for the single final confirmation plan (VF3 Stage C prereg, lockbox section).
- HAR-800 is never scored on that window.
