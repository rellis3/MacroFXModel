# Gold — VWAP Fixed-Sigma Band Atlas (Findings)

**Question.** Put integer σ bands (±1σ…±7σ) around the session VWAP on gold,
where **1σ is FIXED at session open** from the prior 20 sessions' RMS deviation
from their own running VWAP (the "VWAP moves, sigma is frozen" construction of
the owner's reference Pine study, with integer bands replacing the 0.5 steps).
What actually happens at and after a band touch, and which context — session,
VuManChu/WaveTrend, trend state, approach character — changes it?

This is a **reference book** built to `REFERENCE_ENGINE_PLAYBOOK.md`, not a
signal search: no after-cost gate, descriptive outcomes, the OOS-holding gate
(`annotateHolds`, shared with Level Atlas) deciding what counts as a finding.

**Prior art it must not be confused with:** `VWAP_REVERSION_FINDINGS.md`
tested *trading* the ±2σ band built from the session's OWN developing σ
(bands widen as the day gets wild) — null, 0/26 pairs. Here the σ is
historical, so a wild day stretches *through* the bands instead of inflating
them — a genuinely different geometry — and the question is descriptive.

**Pre-registered expectations (before running):** touch frequency falling with
k; the out/back race near coin-flip or mildly reversion-leaning; no standalone
fade edge expected (the 0/26 null above sets the prior); context dims might
hold, session structure the most likely.

---

## The unit (one row =)

One fresh touch (previous close inside → this bar's extreme reaches the band,
the Pine close-inside re-arm) of one integer σ band of the UTC-day session
VWAP, with 1σ frozen at session open as the median of the prior 20 sessions'
RMS deviation from their own running VWAP; outcome = does price reach the
**next band out** before falling **one band back** (a symmetric 1σ race on
moving barriers), plus fade-oriented MFE/MAE over the next 60 minutes,
did-it-tag-VWAP, and re-entry.

**Data:** local OANDA gold M1 parquet, 2016-01-18 → 2026-08-20, 2,734 sessions
walked (10 warm-up skipped). First-touch book (ordinal 1 only), OOS split at
2022-03-21 (60/40). Engine: `js/vwapFixedSigmaEngine.js` (causality-tested:
perturb-the-future, fixed-σ-not-widened, session isolation). Runner:
`scripts/run_gold_vwap_sigma.mjs`. Controls:
`scripts/run_gold_vwap_sigma_controls.mjs`.

---

## 1. How often each band is even reached (the ladder itself)

% of sessions whose price tags each band at least once:

| band | +σ (up) | −σ (down) |
|---|---|---|
| 1σ | 82.7% | 81.3% |
| 2σ | 47.8% | 49.0% |
| 3σ | 23.7% | 24.6% |
| 4σ | 11.4% | 12.4% |
| 5σ | 5.9% | 6.7% |
| 6σ | 3.0% | 3.9% |
| 7σ | 1.4% | 2.1% |

Nearly perfectly symmetric up/down, and each extra σ roughly **halves** the tag
rate — a fat, geometric ladder, nothing like a Gaussian fall-off (a normal
distribution would make 4σ+ tags vanishingly rare, not a monthly event). ±5σ
to ±7σ exist but are rare: n = 38–182 first touches over a decade — read those
cells' numbers as small-sample.

## 2. The base race — and the tautology the control caught

Per band, first touches: continuation (`out` = next band before one band back)
vs reversion (`back`), IS/OOS; fade-oriented MFE/MAE (σ units, 60-min window);
% that go on to tag VWAP itself; median minutes to resolve.

| band | n IS/OOS | out% IS/OOS | back% IS/OOS | MFE σ (IS) | MAE σ (IS) | VWAP hit% (IS) | med resolve (IS) |
|---|---|---|---|---|---|---|---|
| +1σ | 1333/927 | 31.6/30.7 | 65.2/66.0 | 0.64 | 0.76 | 84 | 89m |
| +2σ | 779/527 | 30.0/31.9 | 64.6/61.1 | 0.91 | 1.01 | 57 | 33m |
| +3σ | 390/257 | 29.5/30.0 | 65.6/62.3 | 1.08 | 1.20 | 40 | 21m |
| +4σ | 184/129 | 33.7/35.7 | 62.0/56.6 | 1.31 | 1.45 | 34 | 11m |
| +5σ | 92/68 | 28.3/41.2 | 69.6/51.5 | 1.47 | 1.67 | 28 | 8m |
| +6σ | 47/34 | 29.8/26.5 | 68.1/70.6 | 1.43 | 1.93 | 23 | 3m |
| +7σ | 23/15 | 43.5/53.3 | 56.5/46.7 | 1.69 | 2.86 | 30 | 1m |
| −1σ | 1327/897 | 33.2/31.8 | 65.0/65.2 | 0.69 | 0.76 | 87 | 70m |
| −2σ | 824/516 | 31.9/29.1 | 63.6/65.1 | 1.05 | 1.04 | 63 | 21m |
| −3σ | 416/256 | 32.9/33.2 | 63.5/64.1 | 1.18 | 1.25 | 39 | 11m |
| −4σ | 213/127 | 34.3/37.8 | 63.4/58.3 | 1.29 | 1.44 | 24 | 8m |
| −5σ | 109/73 | 35.8/30.1 | 64.2/69.9 | 1.55 | 1.72 | 23 | 5m |
| −6σ | 65/42 | 33.8/21.4 | 64.6/76.2 | 2.04 | 1.69 | 26 | 2m |
| −7σ | 34/23 | 35.3/34.8 | 64.7/56.5 | 2.40 | 1.94 | 27 | 0m |

At first glance: "price falls back 2:1 from every band — mean reversion!"
**That reading is a tautology, and the control proves it.** The identical
engine run on a seeded driftless **random walk** (no mean reversion by
construction) produces the same shape:

| band | random-walk out% | random-walk back% | gold out% (IS) |
|---|---|---|---|
| ±1σ | 30.3 | 65.6 | 31.6–33.2 |
| ±2σ | 25.1 | 63.0 | 30.0–31.9 |
| ±3σ | 20.0 | 62.3 | 29.5–32.9 |
| ±4σ | 20.8 | 52.8 | 33.7–34.3 |

The mechanism: the deviation coordinate (price − VWAP) shrinks even when price
stands still, because the VWAP keeps averaging toward price. "Back" is partly
the *line catching up*, not price reverting. So:

- **There is no evidence of exploitable mean reversion at any integer band.**
  Gold's back-rates match a random walk's; if anything gold's out-rates at
  2σ–4σ run ABOVE the control's (30–38% vs 20–25%) — gold *continues more*
  than chance in this coordinate, consistent with real vol clustering
  (touching a band means it's an active day).
- **Fading is adverse-heavy at every band.** 60-min fade MFE < MAE at
  essentially every band, and the gap widens at the extremes (+7σ: MFE 1.7σ
  vs MAE 2.9σ — a 7σ tag is usually a news candle still travelling). The
  "VWAP hit%" column falls from 84% at 1σ to ~25% at 4σ+: the further out the
  tag, the *less* likely a full same-day reversion to fair value, not more.
- This independently reconfirms the platform's standing VWAP-band null
  (`VWAP_REVERSION_FINDINGS.md`) from a different construction.

## 3. What DOES hold: the OOS-gated context findings

85 dimension-buckets cleared the shared holds gate (same sign both halves,
n≥30 both, |Δ|≥3pp both). **Chance baseline, measured not assumed**: shuffling
outcomes within each cell and rebuilding the book 20× yields a mean of **41.5**
survivors (range 20–53). 85 > every permutation, so real structure exists —
but any *individual* survivor is ≈50% likely to be noise. Only **themes
repeated across cells/sides** count, and one more filter applies: the
random-walk control was tabulated on the same dimensions, and several
"findings" reproduce on it — those are coordinate mechanics, not gold.

### Killed as mechanical (the control reproduces them — do not trade, do not cite)

| dimension | gold Δout (±1σ) | random-walk Δout | verdict |
|---|---|---|---|
| `vwapDrift` with/against | −7.5 / +7.1 | −7.3 / +6.7 | mechanical (barrier motion) |
| `churn` driven/churned | −8.8 / +4.2 | −7.8 / +4.4 | mechanical |
| `otherSideMaxBand` none/1 | −5.2 / +7.6 | −3.0 / +5.8 | mostly mechanical |
| `sessionPos` early/mid | −4.9 / +6.4 | −3.5 / +7.6 | mechanical |

(Notably, Level Atlas's biggest finding — churn — does NOT transfer to this
coordinate system as a market fact; here the coordinate itself manufactures
it. Same word, different geometry.)

### Held, non-mechanical themes (the real content)

**a) Session clock is the main structure.** The control has no clock, so none
of this can be mechanical:
- **Asia touches revert more.** ±1σ Asia Δout −5 to −6.3pp both halves, both
  sides; +2σ Asia OOS −9.6pp; Wednesday-Asia the strongest single cells
  (−13.5pp IS / −10.1pp OOS on −1σ). Interpretation note: the σ is a
  whole-session unit, so a band tag inside quiet Asia is a relatively bigger
  local event — and it tends to come back.
- **NY, and especially the London/NY overlap (12:00–16:00 UTC), continue
  more.** `overlapWindow=true` holds on 5 separate cells, all positive (up|1
  +7.4 IS / +12.4 OOS; dn|4 +8.1/+8.5); NY session positive on ±1σ/±3σ.
  A band tag during the deep-liquidity window is likelier to be a real move
  going further.
- Day-of-week flavors: Friday leans continuation (both sides), Wednesday-Asia
  strongly reversion. Thinner slices — treat as sub-cases of the session theme.

**b) Touch-bar candle rejection reads the right way.** 8 sign-consistent held
cells: wick-rejection at the band → less continuation (up|2 −10.3/−6.0);
full-body acceptance → more (dn|2, dn|3, dn|4, +5σ all positive, e.g. up|5
accept +4.4 IS / +13.8 OOS). The control shows no systematic accept-bias, so
this is real price behaviour, not mechanics.

**c) Approach character — and here gold is OPPOSITE to the mechanical
baseline.** On the control, a slow grind into the band mildly favours
continuation (+4.3). On gold it strongly favours reversion (grind −9.4/−9.9
up|1, −10.1/−5.0 dn|1, med −6 to −12 on ±2σ), while a spike approach mildly
favours continuation. A grinding drift into a fixed-σ band dies; a fast
arrival keeps going. Because the sign *flips* vs the control, this is the
cleanest genuinely-gold price-action finding in the book.

**d) WaveTrend / other system indicators: mostly nothing.** `wtState`,
`wtMtf`, `wtSlow`, `momAdx`, `htfTrend` produce scattered survivors with
*inconsistent signs across sides* (e.g. wtSlow counter is +9.9 on up|1 but
negative on dn|1) at counts consistent with the ~42-survivor noise floor.
Honest read: **no reliable VuManChu/ADX/4h-trend conditioning of fixed-σ band
touches was found on gold.** The one borderline: 4h EMA trend at ±4σ
(with +3.1/+3.8, against −7.5/−6.7, both directions consistent on up|4) —
plausible (deep tags continue when the 4h trend backs them) but single-cell;
needs the cross-instrument sweep before believing it.

---

## 4. Verdict, plainly

- **Built and causality-tested** — engine, tests, book, controls all
  reproducible. "Built" ≠ "edge": nothing here is a trading claim.
- The fixed-σ construction gives gold a clean, stable **ladder fact-sheet**
  (§1) and honest per-band excursion numbers (§2) — usable as reference for
  sizing/expectations around VWAP-relative stretches.
- The apparent 2:1 reversion from every band is **mechanical**; there is no
  standalone fade edge, and 60-min fade MAE exceeds MFE at every band. The
  fade idea stays null, now from a second geometry.
- What survives honestly: **when** the touch happens (Asia revert / NY-overlap
  continue), **how the touch bar looks** (reject vs accept), and **how price
  arrived** (grind dies — sign-flipped vs the control). WaveTrend/ADX/4h-trend
  conditioning: not found.

## 5. What would extend or change this

1. **Cross-instrument sweep** (the 26-pair M1 archive is on disk) — the themes
   in §3 are one-instrument findings; the same walk on FX majors would show
   whether they're gold facts or general facts. Cheap: the engine is
   instrument-agnostic.
2. **Session anchor sweep** — UTC-day is the Pine convention; a London or NY
   anchored VWAP changes what "the session" means for gold specifically.
3. **σ-definition A/B** — RMS-around-VWAP (this) vs the developing
   volume-weighted σ (`computeSessionVwap`'s `sd`) vs the daily forecast σ:
   same touches, three band units, which coordinate is least mechanical?
4. If any theme is ever taken toward trading, that is a separate,
   harness-gated exercise (costs, `summarizeSplit`, pre-registered outcomes) —
   this book deliberately stops short of it.

## Status

Engine `js/vwapFixedSigmaEngine.js` (+ tests), report
`js/vwapFixedSigmaReport.js` (imports the shared `annotateHolds` gate from
`levelAtlasReport.js`), runner `scripts/run_gold_vwap_sigma.mjs`, controls
`scripts/run_gold_vwap_sigma_controls.mjs`. Registered in `LEGO_MODULES.md`.
No routes/UI yet — per the playbook, the rows + book are the deliverable until
something needs a live view.
