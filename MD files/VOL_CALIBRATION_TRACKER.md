# Vol Forecast Calibration Tracker — LIVE working doc

**Purpose**: survive context resets. This file is the single source of truth for
the in-progress "close the gap to reference" effort. Update it incrementally as
each session's ours-vs-reference compare comes in — don't let it go stale.
`ESTIMATOR_CHANGE_LOG.md` is the historical record of *completed* changes; this
file is the working plan for *in-progress* ones.

Last updated: 2026-06-25 (Track 1 checkpoint #4 — raw gap flipped sign, see below).

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

- index/NQ GARCH persistence: **raw gap crossed zero (2026-06-25)** — the
  4-session trajectory is now +59.0% (Jun-22) → +18.1% (Jun-23) → +9.7%
  (Jun-24) → **−4.9%** (Jun-25). The monotonic shrink continued right through
  zero into a slight underestimate — this is the first negative raw Δ in the
  whole tracking window. One session isn't enough to call this "overshoot"
  vs noise (same 2+ session bar as before applies to confirming the sign),
  but it means the raw gap is clearly NOT stabilizing yet — it's still moving
  fast (14.6pp swing in one day). **The hl/oc over-correction problem just got
  much worse as a direct consequence**: stacking the existing
  over-/under-correction factors on top of a now-negative raw gap pushes
  corrected HL/OC Δ to **−21% to −26%** (Jun-25), vs −7.7%/−9.4% on Jun-24 —
  roughly 2.5x worse in one session. **Still not refitting** — refitting off
  a single sign-flip session would be exactly the whiplash this rule exists to
  prevent, and if Jun-26 reverts toward positive again, the table would have
  to flip a third time. Watch for whether the negative sign holds for a 2nd
  session; if so, that's the actual trigger to refit hl/oc, not "raw Δ near
  9.7%" (that target is now moot — the gap blew through it).

---

## The problem: index/NQ vol overestimate trajectory

| Date   | Event                  | Ours vol | Ref vol | Δ      | Note |
|--------|------------------------|---------:|--------:|-------:|------|
| Jun-17 | first post-revert      | 26.56%   | 21.71%  | +22.3% | GARCH α=0.06/β=0.91 just reinstated after EWMA(0.90) rejected |
| Jun-18 | Fed Chair speech day   | —        | —       | +3.5%  | shock day itself was fine; correction factors fit from Jun-17 data |
| Jun-19 | post-shock decay       | —        | —       | +33.7% | worst gap yet (pre-fix) — prior day's shock hadn't decayed, ref had nearly fully reverted |
| Jun-22 | Track 1 checkpoint #1  | 24.97%   | 15.70%  | +59.0% | **post-fix (β=0.87), and it's worse** — see diagnosis below |
| Jun-23 | Track 1 checkpoint #2  | 25.01%   | 21.17%  | +18.1% | **sharp reversal** — biggest single-day improvement yet; HL/OC corrected now run −3% to −6% (slight underestimate) |
| Jun-24 | Track 1 checkpoint #3  | 26.57%   | 24.21%  | +9.7%  | **trend confirmed** — 3rd straight improvement; HL/OC corrected now −7.7% to −9.4% (over-correction worsening as raw gap shrinks) |
| Jun-25 | Track 1 checkpoint #4  | 26.40%   | 27.76%  | −4.9%  | **sign flip** — raw gap went negative for the first time; HL/OC corrected now −21% to −26% (over-correction sharply worse, see diagnosis) |

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

**Updated diagnosis (2026-06-22)**: the Track 1 β cut (23d → 9.5d half-life)
should have *helped* if the problem were purely "old shocks decay too slowly."
Instead Δ got worse. Two non-exclusive explanations:
1. **α is the real lever, not β.** α=0.06 weights *every single day's* fresh
   realized return into sigma2, regardless of β. If NQ had another large
   close-to-close move on Jun-19 (Friday) — plausible, this has been a
   continuously news-heavy week since the Jun-18 Fed Chair speech — then a
   lower β does nothing to stop that fresh shock from pushing sigma2 up; it
   only affects how fast *already-absorbed* shocks fade. The reference's vol
   dropping to 15.70% (its lowest level in this whole tracking window) while
   ours rose to 24.97% suggests the reference barely reacts to single-day
   moves at all — more consistent with a low-α problem than a high-β one.
2. **Compounding, not independent, weekly shocks.** This has been one
   continuous volatile week (Fed Chair speech Jun-18 → still-elevated Jun-19 →
   apparently another move into Jun-22) rather than isolated single-day
   events. A persistence fix only pays off once shocks stop arriving; we
   haven't had a clean "post-shock, no new shock" session yet to test it.
**Action**: do NOT cut β further or touch α off this single point (whiplash
risk). Need the raw daily NQ return series to confirm hypothesis 1 directly —
next time this is revisited, pull the actual close-to-close returns for
Jun-18/19/22 and check whether Jun-19's bar itself was a large mover.

**Updated diagnosis (2026-06-23)**: checkpoint #2 supports hypothesis 1 above —
ours' raw value barely moved (24.97% → 25.01%, +0.04pp) while ref jumped
15.70% → 21.17% (+5.47pp, +34.8% on its own). Reference itself swung hard
session-to-session, undercutting the "reference has ~1-day flat memory"
framing from Jun-19 — it's not memoryless, it's reacting to *different*
information than close-to-close OHLC (intraday realized moves, options
markets, whatever it actually ingests) on a *similar* timescale to ours, just
with a smaller/faster-decaying response to single-day shocks. This is more
evidence for "α too high" than "β too high" — our series stayed elevated
because it's still digesting Monday's shock at roughly the same weight
regardless of beta, while ref's big Tuesday-specific move shows it does react
to fresh information, just not in a way that compounds for weeks like ours.
**Still not touching α** — want to see whether ours starts converging on its
own over the next 1-2 sessions as Monday's shock keeps decaying out of the
9.5-day-half-life window now that no new shock has hit.

**Updated diagnosis (2026-06-24)**: checkpoint #3 confirms the convergence —
raw Δ +59.0% → +18.1% → +9.7%, a clean monotonic trend now 3 sessions long.
This crosses the "2+ consecutive sessions same direction" bar set after
checkpoint #1's whipsaw, so it's no longer reasonable to call this noise.
Reading: the news-heavy week's shocks have stopped compounding, and the
interim β=0.87 decay is doing exactly what it was designed to do once given
the chance — both the α-hypothesis and the compounding-shocks hypothesis from
Jun-22 predicted this once a "no new shock" session arrived. **The flip
side**: as the raw gap has shrunk, the static index hl/oc correction factors
(0.81/0.78/0.85/0.90, sized against the old ~+22% Jun-17 gap) are now clearly
over-correcting — corrected HL/OC Δ has gone −3%/−6% (Jun-23) → −7.7%/−9.4%
(Jun-24), worse each day, in the opposite direction from the original
problem. This is the expected symptom of the no-whiplash rule working
correctly: the correction factors were never wrong in themselves, they were
fit against a decay rate that's now changed. **Still not refitting them** —
raw Δ is still moving (18.1%→9.7%, not flat), and refitting against a moving
target would just whiplash the correction factors next. Action for next
session: if raw Δ lands within a narrow band (roughly ±3-4pp) of 9.7% again,
treat the raw gap as stabilized and refit hl/oc corrections from the
stabilized level.

**Updated diagnosis (2026-06-25)**: checkpoint #4 broke through the band the
previous diagnosis was watching for — raw Δ didn't land near +9.7%, it kept
moving and crossed zero to −4.9%. Two readings, not mutually exclusive:
1. **Still just convergence, now overshooting slightly.** A
   59→18→9.7→−4.9 sequence looks like exponential decay toward some
   equilibrium near (or slightly below) zero, consistent with β=0.87 finally
   catching up on a calm stretch with no fresh shocks. If so, the next
   session should land somewhere in the small-negative-to-zero range, not
   keep falling — a continued slide deeper negative would argue β=0.87 is now
   *too low* (decaying old context too fast) rather than the original
   problem of being too high.
2. **Reference itself is just noisy session-to-session**, as already shown
   Jun-22→23 (ref jumped 15.70%→21.17% on its own). Ref went 24.21%→27.76%
   this time while ours barely moved (26.57%→26.40%) — same pattern as
   Jun-23, ref doing most of the moving, not ours. This keeps pointing at
   reference reacting to information on a faster timescale than close-to-
   close OHLC captures, not at our β being wrong per se.
**Action**: do not touch `garch_beta_interim` off a single sign-flip. Next
session is the real test: if Δ stays negative (confirms overshoot/noise-level
equilibrium near zero) or swings back positive (confirms pure session-to-
session noise, ref-driven), either way that's the 2nd data point needed
before deciding whether to refit hl/oc.

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

**Checkpoint result (2026-06-22)**: Δ rose to +59.0% — worse than pre-fix.
See "Updated diagnosis" above. Leading theory is α (not β) is the dominant
error source given a continuously news-heavy week. **Not reverting or
re-tuning yet** — one data point during an unusually shock-heavy week isn't
enough to distinguish "the fix is wrong" from "the fix can't work until
shocks stop arriving." Need a calmer week to isolate the effect cleanly.

**Checkpoint result (2026-06-23)**: Δ dropped to +18.1% — sharp reversal,
biggest single-day improvement in the whole window. Ours barely moved
(24.97%→25.01%) while ref jumped (15.70%→21.17%), closing most of the gap
from ref's side, not ours. This is consistent with the α-not-β hypothesis
(see updated diagnosis), but it's still only 2 post-fix data points pointing
in opposite directions — genuinely unclear yet whether Track 1 is "working."
HL/OC corrected outputs flipped from over- to under-estimating (−3% to −6%),
which is the first concrete signal that `ASSET_PARAMS.index` hl/oc factors
may need a refit once the raw-vol gap stabilizes — but not yet, could easily
flip back.

**Checkpoint result (2026-06-24)**: Δ dropped again to +9.7% — third straight
improvement, and the trend is now monotonic across 3 sessions
(+59.0%→+18.1%→+9.7%). **Calling Track 1 "working"** as of this checkpoint —
the interim β=0.87 cut is doing its job now that the news-heavy week's fresh
shocks have stopped compounding. Not reverting/re-tuning `garch_beta_interim`
further; the open question shifts from "is the fix working" to "when does
the raw gap stabilize enough to refit the downstream hl/oc corrections,"
since those have kept over-correcting as a direct consequence (HL/OC
corrected now −7.7%/−9.4%, worse than Jun-23's −3%/−6%).

**Checkpoint result (2026-06-25)**: Δ crossed zero to −4.9% — first negative
raw gap in the tracking window, continuing the same monotonic shrink
(+59.0%→+18.1%→+9.7%→−4.9%) one step further than expected. Ours barely
moved (26.57%→26.40%) while ref jumped (24.21%→27.76%), the same
ref-does-the-moving pattern as Jun-23. Not touching `garch_beta_interim` off
one sign-flip session — need to see whether Jun-26 holds negative (overshoot
settling near a new equilibrium) or swings back positive (pure ref-side
noise) before drawing any conclusion. HL/OC corrected outputs got
significantly worse as a side effect: −21% to −26%, vs −7.7%/−9.4% on
Jun-24 — the over-correction problem is compounding fast and is now the
more urgent of the two open threads.

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
| Jun-17 | NQ        | 26.56%   | 21.71%  | +22.3% | No         | first post-revert GARCH compare, β=0.91 |
| Jun-18 | NQ        | —        | —       | +3.5%  | **Yes** (Fed Chair speech) | shock day itself, exclude from correction-factor fits |
| Jun-19 | NQ        | —        | —       | +33.7% | No         | post-shock decay, worst gap pre-fix, motivated Track 1 fix |
| Jun-22 | NQ        | 24.97%   | 15.70%  | +59.0% | No (but news-heavy week) | **post-fix (β=0.87)** — worse, not better; see updated diagnosis above |
| Jun-23 | NQ        | 25.01%   | 21.17%  | +18.1% | No         | **sharp reversal** — ref moved, ours didn't; best NQ checkpoint since Jun-18 |
| Jun-24 | NQ        | 26.57%   | 24.21%  | +9.7%  | No         | **trend confirmed**, 3rd straight improvement; HL/OC corrected now −7.7%/−9.4% (over-correction, see diagnosis) |
| Jun-25 | NQ        | 26.40%   | 27.76%  | −4.9%  | No         | **sign flip**, first negative raw Δ; HL/OC corrected now −21%/−26% (over-correction much worse, see diagnosis) |

*(Fill in raw ours/ref % for Jun-18/19 NQ rows next time those numbers are
on hand — only Δ was recorded in those sessions' analysis. Note: a Jun-23
"ours" paste was briefly seen mislabeled as Monday's session with NQ=25.20% —
that was stale Monday data re-pasted alongside a Tuesday reference; discarded,
not logged, since the dates didn't match.)*

GOLD/EURUSD gap history (commodity/fx — separate asset classes, separate
estimators, not part of the GARCH persistence problem, but tracked here so
all reference compares live in one place):

| Date   | Instrument | Ours vol | Ref vol | Δ vol | Δ HL med | Δ HL 75p | Δ OC med | Δ OC 75p | Notes |
|--------|-----------|---------:|--------:|------:|---------:|---------:|---------:|---------:|-------|
| Jun-15 | GOLD      | —        | —       | −6%   | —        | —        | —        | —        | HV20, acceptable |
| Jun-17 | EURUSD    | —        | —       | small (~±5%) | —  | —        | —        | —        | YZ correction factors refined this day |
| Jun-18 | GOLD      | —        | —       | —     | —        | —        | —        | —        | Fed Chair speech day; news multiplier didn't fire (open bug, see above) |
| Jun-19 | GOLD/EURUSD | —      | —       | —     | —        | —        | —        | —        | not yet logged in detail — fill in if revisited |
| Jun-22 | GOLD      | 29.03%   | 27.14%  | +7.0% | −3.3%    | +1.2%    | **+15.5%** | +2.4%  | HL/OC75 fine; OC median stands out — watch for recurrence on next calm day before touching `oc_50_corr` |
| Jun-22 | EURUSD    | 5.38%    | 5.73%   | −6.1% | +1.9%    | +6.2%    | +4.2%    | +5.0%    | all within normal noise band, fx calibration still holding up |
| Jun-23 | GOLD      | 28.70%   | 27.76%  | +3.4% | −4.3%    | −3.0%    | −1.5%    | −4.0%    | OC median spike from Jun-22 did NOT recur — confirms it was noise, `oc_50_corr` left alone correctly |
| Jun-23 | EURUSD    | 5.34%    | 5.92%   | −9.8% | −3.5%    | −1.4%    | −3.8%    | −4.5%    | vol gap a bit wider than usual but HL/OC (the actual displayed metrics) all within ~4.5%, still solid |
| Jun-24 | GOLD      | 29.02%   | 27.75%  | +4.6% | −7.6%    | −3.5%    | −2.9%    | −4.8%    | wider than Jun-23 but still within normal noise band, no action |
| Jun-24 | EURUSD    | 5.33%    | 6.01%   | −11.3% | −5.2%   | −2.9%    | −3.8%    | −6.7%    | vol gap widening slightly session over session (−6.1%→−9.8%→−11.3%), worth a glance next session but HL/OC still single-digit, not actionable yet |
| Jun-25 | GOLD      | 30.05%   | 29.24%  | +2.8% | −9.8%    | −4.7%    | −5.4%    | −4.3%    | HL med drifting more negative each session (−4.3%→−7.6%→−9.8%) — still single-digit-to-low-teens, watch but not actionable yet |
| Jun-25 | EURUSD    | 5.39%    | 5.84%   | −7.7% | −1.8%    | 0.0%     | −3.8%    | −2.3%    | gap narrowed back from Jun-24's −11.3%, bouncing in the same noise band as Jun-22/23 — no action |

---

## Open items (don't lose these)

1. **`[NEWS-EVENTS]` log line** — deployed, never yet seen a real output.
   Ask the user to paste the Railway log line from the next `runVolForecast()`
   run (scheduled or manual `/api/vol-forecast/refresh`) to finally determine
   why the Fed Chair speech didn't trigger the news multiplier.
2. **Track 1 raw gap crossed zero (2026-06-25)** — 4-session trajectory
   +59.0% Jun-22 → +18.1% Jun-23 → +9.7% Jun-24 → **−4.9% Jun-25**, a clean
   monotonic shrink that's now overshot into negative territory. Need the
   Jun-26 checkpoint to know whether this is (a) settling near a small
   negative/zero equilibrium, (b) genuine overshoot meaning β=0.87 is now too
   low, or (c) pure ref-side session noise (ref has done most of the moving
   on both Jun-23 and Jun-25). Not touching `garch_beta_interim`/
   `garch_omega_interim` off one sign-flip session. Still want to pull NQ's
   actual daily close-to-close returns at some point to directly confirm the
   α-not-β hypothesis, but it's secondary to resolving the sign-flip question
   first.
3. **Track 2 grid search** — not started, blocked on accumulating enough clean
   data points (table above). Revisit once 5+ non-event NQ rows exist (5
   currently: Jun-17, 22, 23, 24, 25 — Jun-18/19 lack raw %). Given item 2, the
   grid search should sweep α as well as β, not just β.
4. **index ASSET_PARAMS hl/oc correction factors refit — increasingly
   urgent.** (0.81/0.78/0.85/0.90, calibrated Jun-17 from a single
   contaminated-by-persistence day.) As Track 1's raw gap has shrunk and now
   flipped negative, these static factors have gone from over-correcting to
   badly over-correcting: corrected HL/OC Δ has moved −3%/−6% (Jun-23) →
   −7.7%/−9.4% (Jun-24) → **−21%/−26%** (Jun-25). **Trigger to refit**: once
   the raw Δ's sign and rough magnitude hold steady for 2 consecutive
   sessions (not just "near +9.7%" — that target is moot now), refit hl/oc
   corrections from the stabilized level. Given how far off the displayed
   HL/OC numbers now are (−21% to −26% is no longer a minor noise-band issue),
   if Jun-26 confirms the negative sign is holding, that should be treated as
   the trigger even without a third confirming session — the cost of a wrong
   display now likely exceeds the whiplash risk of refitting one session
   early.
5. SPX500/DE30/UK100/US30/US2000 (other `index`-class instruments) have no
   reference data yet — all calibration so far is NQ-only. Watch for
   divergence once reference data for these appears.
6. Backtest engines (`js/volBacktestEngine.js`, `weeklyVolBacktestEngine.js`,
   `volBacktestM1Engine.js`) still run old EWMA/RS-era ASSET_PARAMS, untouched
   by any of this — separate, lower-priority cleanup.
7. **GOLD OC median ran +15.5% hot on Jun-22** while HL med/75p and OC 75p were
   all within ±3% — single day, do not touch `oc_50_corr` (currently 1.09) yet,
   but watch the next 1-2 calm GOLD sessions for a repeat before dismissing as
   noise.

---

## How to update this file each session

When a new ours/reference paste comes in:
1. Add a row to the data accumulation table (mark event days).
2. If a code change is made, add it under the relevant Track with date + reasoning.
3. Update "Current state of the world" at the top if status changed.
4. Update "Last updated" date.
Keep entries terse — this is a working log, not prose. Move anything fully
resolved into `ESTIMATOR_CHANGE_LOG.md` and trim it from here.
