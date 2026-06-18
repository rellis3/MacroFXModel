# Vol Forecast Calibration Tracker — LIVE working doc

**Purpose**: survive context resets. This file is the single source of truth for
the in-progress "close the gap to reference" effort. Update it incrementally as
each session's ours-vs-reference compare comes in — don't let it go stale.
`ESTIMATOR_CHANGE_LOG.md` is the historical record of *completed* changes; this
file is the working plan for *in-progress* ones.

Last updated: 2026-06-19 (interim GARCH β fix implemented, see below).

---

## Current state of the world

- News multiplier (Fed Chair speech + commodity coverage): code fix shipped
  (PR #379, #382, #384). **Still not confirmed firing on a live Fed Chair event.**
  FINNHUB_KEY is confirmed set in Railway (user confirmed "yeah it exists"), so
  cause is narrowed to either (a) the speech genuinely wasn't on Finnhub's
  scheduled economic calendar, or (b) some other matching bug. `[NEWS-EVENTS]`
  diagnostic log line is deployed (PR #384) — **waiting on the next live
  `runVolForecast()` run's Railway log output** to disambiguate. Nudge the user
  for this log line next time a news-heavy session comes up.

- index/NQ GARCH persistence: confirmed structural (not single-day noise) via
  3-session trajectory below. **Interim fix implemented 2026-06-19** (this
  session): β 0.91→0.87 for the primary index estimator only (legacy shadow
  column untouched). This is explicitly provisional — see "Dual-track plan"
  below for what happens next.

---

## The problem: index/NQ vol overestimate trajectory

| Date   | Event                  | Ours vol | Ref vol | Δ      | Note |
|--------|------------------------|---------:|--------:|-------:|------|
| Jun-17 | first post-revert      | 26.56%   | 21.71%  | +22.3% | GARCH α=0.06/β=0.91 just reinstated after EWMA(0.90) rejected |
| Jun-18 | Fed Chair speech day   | —        | —       | +3.5%  | shock day itself was fine; correction factors fit from Jun-17 data |
| Jun-19 | post-shock decay       | —        | —       | +33.7% | worst gap yet — prior day's shock hadn't decayed in our series, ref had nearly fully reverted |

**Diagnosis**: reference's NQ vol behaves as if it has roughly 1-session effective
memory after a shock. Our GARCH(0.06/0.91) has α+β=0.97 → ~23-day half-life —
shocks linger for weeks in our series while the reference has essentially moved
on by the next day. The Jun-17→18 whiplash (ASSET_PARAMS.index corrections
fit from Jun-17, immediately wrong-signed by Jun-18) was the first symptom;
Jun-19's even-bigger gap confirms it's not noise — it's the decay rate itself.

**Methodological rule (keep enforcing this)**: ASSET_PARAMS hl/oc correction
factors fix a *constant* distribution-shape mismatch (BM/half-normal constants
vs reference's real distribution) — fit ONLY from multi-day averages on calm,
non-event days. They are the WRONG tool for a decay-speed/persistence problem.
Conflating the two causes whiplash (proven twice now). The fix for "vol stays
elevated too long after a shock" has to be an estimator-dynamics change
(alpha/beta/lambda), never a correction-factor refit.

---

## Dual-track plan ("let's do both" — agreed 2026-06-19)

### Track 1 — interim fix (DONE this session, 2026-06-19)
Lower index GARCH β from 0.91 → 0.87 (α unchanged at 0.06), ω rescaled from
4.76e-6 → 1.11e-5 to preserve the same ~20% long-run variance anchor. Half-life
drops from ~23 days to ~9.5 days — meaningfully shorter, but still well above
EWMA(0.90)'s 6.6-day half-life (which was rejected for being too reactive on
the shock day itself, a separate problem from post-shock decay speed). Keeps
the ω floor that EWMA lacked.

Implementation: `js/volForecast.js`
- `garch11VolSeries(bars, omega, alpha=G_ALPHA, beta=G_BETA)` now takes optional
  alpha/beta overrides (defaults preserve old behavior everywhere else).
- `ASSET_PARAMS.index` gained `garch_beta_interim: 0.87` and
  `garch_omega_interim: 1.11e-5`.
- Primary index estimator call uses the interim values; the **legacy shadow
  column still uses the original `garch_omega` + global G_ALPHA/G_BETA**
  (0.06/0.91) on purpose, so the before/after comparison in the legacy_* output
  fields stays meaningful.
- This is explicitly labeled provisional in code comments — not a final
  calibration, just a "less wrong" placeholder while Track 2 accumulates data.

**Next checkpoint**: after the next 1-2 sessions' NQ compare, check whether
Δ has shrunk vs the +22.3%/+33.7% pattern. Record results in the table below.

### Track 2 — wait + grid search (ONGOING, multi-session)
Keep accumulating (ours_vol, ref_vol, instrument, date, event-flag) tuples
below every session. Once there are enough clean (non-event-day) points —
realistically need 5-10+ — run a proper grid search over GARCH α/β (or test
alternative estimator families entirely, e.g. shorter-window realized vol with
a floor) to minimize squared log-error vs reference, instead of eyeballing
single days. Do NOT recalibrate ASSET_PARAMS hl/oc correction factors using
event-contaminated days (Jun-18 Fed Chair speech day is contaminated — exclude
it from any correction-factor fit, though it's fine to use for testing news
multiplier behavior specifically).

**Data accumulation table** (append a row every session; mark event days):

| Date   | Instrument | Ours vol | Ref vol | Δ      | Event day? | Notes |
|--------|-----------|---------:|--------:|-------:|------------|-------|
| Jun-17 | NQ        | 26.56%   | 21.71%  | +22.3% | No         | first post-revert GARCH compare |
| Jun-18 | NQ        | —        | —       | +3.5%  | **Yes** (Fed Chair speech) | shock day itself, exclude from correction-factor fits |
| Jun-19 | NQ        | —        | —       | +33.7% | No         | post-shock decay, worst gap, motivated Track 1 fix |

*(Fill in raw ours/ref % for Jun-18/19 NQ rows next time those numbers are
on hand — only Δ was recorded in this session's analysis.)*

GOLD/EURUSD gap history (commodity/fx — separate asset classes, separate
estimators, not part of the GARCH persistence problem, but tracked here so
all reference compares live in one place):

| Date   | Instrument | Δ vs ref | Notes |
|--------|-----------|---------:|-------|
| Jun-15 | GOLD      | −6%      | HV20, acceptable |
| Jun-17 | EURUSD    | small (~±5%) | YZ correction factors refined this day |
| Jun-18 | GOLD      | — | Fed Chair speech day; news multiplier didn't fire (open bug, see above) |
| Jun-19 | GOLD/EURUSD | — | not yet logged in detail — fill in if revisited |

---

## Open items (don't lose these)

1. **`[NEWS-EVENTS]` log line** — deployed, never yet seen a real output.
   Ask the user to paste the Railway log line from the next `runVolForecast()`
   run (scheduled or manual `/api/vol-forecast/refresh`) to finally determine
   why the Fed Chair speech didn't trigger the news multiplier.
2. **Track 1 checkpoint** — after next 1-2 NQ compares, check if β=0.87 actually
   closed the gap or just changed its sign/magnitude (whiplash risk same as
   ASSET_PARAMS — but lower risk here since β=0.87 is a moderate, reasoned step,
   not a single-day fit).
3. **Track 2 grid search** — not started, blocked on accumulating enough clean
   data points (table above). Revisit once 5+ non-event NQ rows exist.
4. **index ASSET_PARAMS hl/oc correction factors** (0.81/0.78/0.85/0.90,
   calibrated Jun-17 from a single contaminated-by-persistence day) are
   themselves suspect — once Track 1/2 settle on a better-decaying estimator,
   these will likely need to be refit from clean data, since some of what
   they're currently "correcting for" may actually be persistence error, not
   true distribution-shape error.
5. SPX500/DE30/UK100/US30/US2000 (other `index`-class instruments) have no
   reference data yet — all calibration so far is NQ-only. Watch for
   divergence once reference data for these appears.
6. Backtest engines (`js/volBacktestEngine.js`, `weeklyVolBacktestEngine.js`,
   `volBacktestM1Engine.js`) still run old EWMA/RS-era ASSET_PARAMS, untouched
   by any of this — separate, lower-priority cleanup.

---

## How to update this file each session

When a new ours/reference paste comes in:
1. Add a row to the data accumulation table (mark event days).
2. If a code change is made, add it under the relevant Track with date + reasoning.
3. Update "Current state of the world" at the top if status changed.
4. Update "Last updated" date.
Keep entries terse — this is a working log, not prose. Move anything fully
resolved into `ESTIMATOR_CHANGE_LOG.md` and trim it from here.
