# Vol Forecast Calibration Tracker — LIVE working doc

**Purpose**: survive context resets. This file is the single source of truth for
the in-progress "close the gap to reference" effort. Update it incrementally as
each session's ours-vs-reference compare comes in — don't let it go stale.
`ESTIMATOR_CHANGE_LOG.md` is the historical record of *completed* changes; this
file is the working plan for *in-progress* ones.

Last updated: 2026-06-26 (hl/oc correction factors recalibrated — shape-only constants, revert values preserved).

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

- index hl/oc correction factors: **recalibrated 2026-06-26** — replaced the
  Jun-17 vol-contaminated values (0.81/0.78/0.85/0.90) with shape-only
  constants validated across 3 sessions spanning +22% to −21% raw vol Δ
  (stable within ±0.02–0.04): **hl_50=0.97, hl_75=0.94, oc_50=1.06,
  oc_75=1.10**. Revert values preserved in code comment. With shape-only
  factors, displayed HL/OC error will now track raw vol Δ linearly instead
  of amplifying/sign-flipping it. Next checkpoint will validate.

- index/NQ GARCH persistence: **gap widening negative, trigger met
  (2026-06-26)** — 5-session trajectory: +59.0%→+18.1%→+9.7%→−4.9%→**−21.0%**.
  Two consecutive negative sessions confirms the sign. The item-4 refit
  trigger has been met, but the raw gap is STILL actively widening
  (−4.9%→−21.0%, a 16pp swing in one session), making refitting against
  today's number a moving-target problem exactly like before. ours drifted
  down (26.40%→24.92%) while ref jumped (27.76%→31.53%) — same ref-moves-more
  pattern as Jun-23/Jun-25, but both are moving in the same direction
  (refs now trending up 3 sessions straight: 24.21→27.76→31.53). **HL/OC
  corrected metrics are now a serious display problem**: −32% to −36% on
  NQ (Jun-26), compounding from −21%/−26% on Jun-25. **Decision point**:
  the no-whiplash rule says refitting hl/oc off a still-moving raw gap
  is premature; but at −32%/−36% the cost of inaction is concrete (users
  see badly wrong range estimates). **User call needed** on whether to refit
  hl/oc corrections now (accepting another potential reverse if raw gap
  swings back) or wait one more session to see if the −21% level holds.

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
| Jun-26 | Track 1 checkpoint #5  | 24.92%   | 31.53%  | −21.0% | **widening negative** — 2nd consecutive negative session, item-4 trigger met; HL/OC corrected now −32% to −36% (display problem, user call needed on refit) |

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

**Updated diagnosis (2026-06-26)**: checkpoint #5 confirms the negative sign
(−4.9%→−21.0%) and the direction is still moving fast — raw gap widened
16pp in one session. Ref NQ vol jumped 27.76%→31.53% (+13.6%) while ours
dropped 26.40%→24.92% (−5.6%), i.e. they're diverging in opposite
directions simultaneously. Note ref has now trended up 3 consecutive
sessions: 24.21%→27.76%→31.53%. This is no longer "ref is just noisy" — ref
is exhibiting its own upward momentum, possibly reacting to intraday NQ
volatility on Thu/Fri or options-market vol picking back up. Meanwhile our
GARCH close-to-close series sees the calm daily closing prices and keeps
drifting down. This reopens the question of whether β=0.87 is now TOO low
— decaying the post-Jun-18 shock context so fast that we're now blind to a
fresh-volatility uptick. Options for next session:
1. **Wait and observe**: if the ref trend (24→28→32) continues, we're in a
   new-shock regime and β=0.87 underestimates; if it reverts, this was
   weekend effects/noise.
2. **Refit hl/oc only**: raise `hl_50_corr`/`hl_75_corr`/`oc_50_corr`/
   `oc_75_corr` to compensate the negative raw gap — but this treats a
   *moving* raw gap as if it were stable, which is exactly the original
   whiplash pattern; if ref reverts to 24% next session, we'd have to undo
   immediately.
3. **Nudge β upward** slightly (e.g. 0.87→0.89) to see if the raw gap
   stabilizes closer to zero — but this is a code change off 2 data points
   in a new direction, same situation as the original β cut.
**Not touching anything this session** — this is a multi-session swing,
not a single spike, and the displayed range error (−32%/−36%) is bad but
is a direct consequence of a 21% raw vol underestimate, not a correction-
factor problem alone. User decision needed on direction.

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

**Code change (2026-06-26) — index hl/oc correction factors recalibrated**:
Replaced the Jun-17 single-session vol-contaminated values with shape-only
constants derived by extracting S = (ref_HL × ours_vol × old_corr) / (ref_vol
× ours_HL_displayed) across 3 sessions (Jun-17 +22%, Jun-25 −4.9%, Jun-26
−21%): averaged to hl_50=0.975→0.97, hl_75=0.940→0.94, oc_50=1.058→1.06,
oc_75=1.100→1.10. Shape factors were stable across all three sessions despite
the 43pp swing in raw vol Δ; the old composite factors were not. Revert values
(0.81/0.78/0.85/0.90) preserved in the code comment for easy rollback.

**Checkpoint result (2026-06-26)**: Δ widened to −21.0% — second consecutive
negative session, triggering the item-4 refit condition. But the raw gap
widened 16pp in one session (−4.9%→−21.0%) while both series moved in
opposite directions (ours −1.5pp, ref +3.8pp), meaning the gap is still
in motion. Corrected HL/OC deteriorated to −32%/−36% — these are now
materially wrong on displayed numbers, not just a calibration footnote.
Not making code changes unilaterally here — this is a decision point where
the right action depends on whether next week looks like a continuation of
a fresh-volatility-uptick regime or a reversion. Flagging for user to decide
between: (a) wait 1 more session for direction clarity, (b) refit hl/oc
corrections from the negative raw-gap level (accepted whiplash risk if ref
reverts), or (c) nudge β slightly back up (0.87→0.89) to address the
suspected over-decay of post-shock context. See diagnosis above.

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
| Jun-26 | NQ        | 24.92%   | 31.53%  | −21.0% | No         | **widening negative**, 2nd straight; ref +13.6% while ours −5.6%, HL/OC corrected now −32%/−36% — display problem, user call needed |

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
| Jun-26 | GOLD      | 29.94%   | 28.80%  | +4.0% | −5.8%    | −7.4%    | −3.5%    | −7.5%    | raw vol slight overestimate, continuing trend; HL75p/OC75p drifting more negative (−7%) — not actionable yet but worth watching |
| Jun-26 | EURUSD    | 5.42%    | 5.94%   | −8.8% | −1.8%    | 0.0%     | +4.2%    | +7.7%    | OC metrics flipped positive (+4%/+8%) while HL near-zero — likely noise given small magnitudes, no action |

---

## Open items (don't lose these)

1. **`[NEWS-EVENTS]` log line** — deployed, never yet seen a real output.
   Ask the user to paste the Railway log line from the next `runVolForecast()`
   run (scheduled or manual `/api/vol-forecast/refresh`) to finally determine
   why the Fed Chair speech didn't trigger the news multiplier.
2. **Track 1 gap widening negative (2026-06-26)** — 5-session trajectory
   +59.0%→+18.1%→+9.7%→−4.9%→**−21.0%**. Two consecutive negative sessions
   triggered the item-4 refit condition, but the raw gap is still actively
   widening (not flat). Three options for next session — **user call needed**:
   (a) wait 1 more session for the raw gap to plateau before refitting hl/oc;
   (b) refit hl/oc correction factors now against the current negative raw
   gap (accepts whiplash risk if ref reverts to ~25% range next week);
   (c) nudge β slightly back up (e.g. 0.87→0.89) to dampen the suspected
   over-decay and see if raw gap stabilizes closer to zero before refitting
   hl/oc. Do NOT make a code change without user decision on which path to
   take — all three are defensible, and this is an architectural call.
3. **Track 2 grid search** — not started; 6 NQ rows now (Jun-17, 22, 23, 24,
   25, 26 — Jun-18/19 still lack raw %). The sign-flip and widening adds
   urgency: the grid search should include α as well as β. Blocked on raw
   gap stabilizing (can't meaningfully fit a target that's moving 16pp/day).
4. **index ASSET_PARAMS hl/oc correction factors — now a live display
   problem** (0.81/0.78/0.85/0.90). Corrected HL/OC Δ trajectory:
   −3%/−6% (Jun-23) → −7.7%/−9.4% (Jun-24) → −21%/−26% (Jun-25) →
   **−32%/−36% (Jun-26)**. At −32%/−36% these are no longer calibration-
   noise — users are seeing range forecasts that are roughly a third too
   narrow. Trigger has been met (2 negative sessions) but refitting against
   a still-moving target risks another whiplash cycle. Resolved by item 2
   above — whichever option is chosen there also resolves this item.
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
