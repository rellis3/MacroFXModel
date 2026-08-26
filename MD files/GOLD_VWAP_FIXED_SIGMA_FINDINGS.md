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

1. **Cross-instrument sweep** — DONE, see §7c: session clock, grind-dies and
   reject/accept replicate on EURUSD/GBPUSD/USDJPY; the WaveTrend conditioning
   does not (gold-only). The remaining 22 pairs are one command away
   (`scripts/run_vwap_sigma_sweep.mjs`).
2. **Session anchor sweep** — UTC-day is the Pine convention; a London or NY
   anchored VWAP changes what "the session" means for gold specifically.
3. **σ-definition A/B** — RMS-around-VWAP (this) vs the developing
   volume-weighted σ (`computeSessionVwap`'s `sd`) vs the daily forecast σ:
   same touches, three band units, which coordinate is least mechanical?
4. If any theme is ever taken toward trading, that is a separate,
   harness-gated exercise (costs, `summarizeSplit`, pre-registered outcomes) —
   this book deliberately stops short of it.

## 6. Stage 2 — the trade-level test (impulse trigger → entry zone)

The owner's follow-up: *"when should a trade open from the VWAP high/low or
back to VWAP? an impulse move happens (30m/1h/4h) — some trigger which unlocks
an entry zone and kicks in a trade."* That crosses from reference book into
signal search, so it runs as a separate, costed, harness-gated exercise:
`js/vwapImpulseEntryV1Engine.js`, reusing `detectH4Impulses` (the existing
causal impulse brick — timeframe-agnostic), the same VWAP/fixed-σ math as the
atlas (equivalence-tested), `walkBars` fills, ATR(15m)×1.5 stops, 0.020%
round-trip cost, `summarizeSplit` IS/OOS.

Two opposite hypotheses through one flow, minimal-DOF, pinned in the engine
header:

- **A `pullback_continuation`** — a closed 30m/1h/4h impulse bar unlocks a
  with-impulse limit entry at the session VWAP for 240 min; target = the
  impulse extreme, stop = 1.5×ATR(15m). "Back to VWAP" as continuation entry.
- **B `band_reentry_fade`** — an impulse closing beyond the fixed +2σ/−2σ band
  arms a fade; the first M1 close back inside the band (the Pine study's
  re-entry event) fires an entry toward VWAP; target = VWAP, stop = 1.5×ATR.

**Pre-registered before running** (this section written first, results filled
in after): "worked" = OOS per-trade t > 2 with positive mean, OOS n ≥ 30, and
positive gross (cost-back-out) — anything else is null. Priors: the atlas is
descriptive evidence only; fade MFE<MAE at every band argues against B;
spike-continues/grind-dies + the NY-overlap theme argue mildly for A; every
entry-trigger family tested in this repo (vwapReversion,
vwapSessionReversion, impulseEmaRange) has come back null after costs.
Default expectation: **null for both**; if either shows anything, more likely
A. One labeled sensitivity (not headline): A restricted to entries in the
London/NY overlap (12:00–16:00 UTC), the book's held continuation window —
one added DOF, stated as such.

**Results (gold, same M1 archive, costed, OOS = last 40%):**

| mode | trigger | OOS n | OOS mean/trade | OOS t | OOS win% | OOS gross |
|---|---|---|---|---|---|---|
| A continuation | 30m | 933 | −0.0022% | −0.29 | 58.1% | +0.018% |
| A continuation | 1h | 658 | −0.0276% | −2.97 | 50.0% | −0.008% |
| A continuation | 4h | 202 | +0.0086% | +0.37 | 45.0% | +0.029% |
| B re-entry fade | 30m | 379 | −0.0469% | −2.55 | 36.7% | −0.027% |
| B re-entry fade | 1h | 306 | −0.0700% | −3.44 | 33.7% | −0.050% |
| B re-entry fade | 4h | 155 | −0.0018% | −0.06 | 37.4% | +0.018% |
| A, overlap-only (sensitivity) | 30m | 496 | −0.0151% | −1.29 | 50.8% | +0.005% |
| A, overlap-only (sensitivity) | 1h | 290 | −0.0315% | −2.20 | 48.3% | −0.012% |
| A, overlap-only (sensitivity) | 4h | 79 | +0.0158% | +0.33 | 39.2% | +0.036% |

**Verdict against the pre-registered bar: NULL for both modes, at every
trigger timeframe.** No cell reaches OOS t > 2 positive; the best cells
(4h continuation, +0.37 and +0.33) are statistically indistinguishable from
zero on small n. In-sample tells the same story (nothing positive), so this
is not an OOS decay — the mechanic never had an edge to decay.

Two honest observations inside the null, both consistent with the book's
descriptive findings rather than contradicting them:
- The **fade loses more, and more consistently, than the continuation**
  (OOS t −2.55/−3.44 vs −0.29/+0.37) — exactly the direction §2's MFE<MAE
  and §3's grind/spike asymmetry pointed. The book's description and the
  trade test agree; neither yields a tradeable number.
- The continuation's shape is >50% win rate with negative mean: the target
  (the impulse extreme) is near, the 1.5×ATR stop is wide, and the cost eats
  the remainder — a payoff-geometry problem as much as a signal problem.
- The overlap-only filter (the book's held continuation window) does not
  rescue any cell — a held *descriptive* context does not convert into an
  after-cost entry edge here. This is the expected relationship between the
  two layers, now demonstrated rather than assumed.

Per the pivot rule, structurally different angles NOT yet tested (no
prediction attached): asymmetric exits (time-stop or trailing instead of the
fixed extreme target — the geometry note above says the exit, not the entry,
is where this dies); gating A on the book's *touch-bar* held themes
(candleReject accept / spike approach) rather than the calendar window;
impulse-range levels (`impulseLevels`) as the zone instead of VWAP; and the
cross-instrument sweep before any of that, to know if gold is even the right
instrument for the question.

## 7. The return-to-VWAP book — the question behind the question

The owner's actual interest, stated after §6: *"price hits x σ in different
volatility sessions / times, maybe with VuManChu momentum, and always returns
to VWAP — trend that via levels of analysis."* Same touch rows, new gated
outcome: **did price return to VWAP** — with two honesty rules that turned
out to be load-bearing:

1. **Fixed horizon, not "before session end."** The first draft used
   return-before-session-end and produced huge `sessionPos=late Δ−40pp`
   "findings" — pure clock truncation (a late touch has less time left; NY is
   simply late in a UTC day). Fixed: outcome = **returned within 240 min**,
   and only touches with ≥240 min of session remaining are eligible (§6.5
   exclusion). Everything below uses that metric.
2. **Read against the random-walk control** — a random walk also "returns to
   VWAP" because the VWAP converges toward price.

### 7a. The headline: the return is real, and much bigger than the artifact

Return-to-VWAP within 240 min, first touches, gold vs the identical engine on
a driftless random walk:

| band | gold (IS/OOS) | random walk |
|---|---|---|
| ±1σ | 61–66% / 59–65% | 53.5% |
| ±2σ | 39–46% / 38–40% | 19.3% |
| ±3σ | 29–30% / 27% | 4.8% |
| ±4σ | 15–26% / 17–19% | 0.0% |

At ±1σ the "price always returns to VWAP" impression is mostly the
coordinate artifact (61% vs 53.5% — modest excess). **At deep bands it is
overwhelmingly real**: a 3σ stretch returns ~6× more often than a random
walk's, a 4σ stretch returns when a random walk's essentially never does.
The intuition from the charts survives the control — at depth. Median time
to return: ~70–100 min at 1–3σ, lengthening with depth.

### 7b. The "levels of analysis" conditioning (gold, OOS-gated)

108 held findings vs a measured permutation baseline of 38.2 (range 29–52
over 20 shuffles) — **~3× the noise floor, the strongest conditional
structure of anything in this study** (the race book ran 85 vs 41.5). The
themes:

- **Session (time layer) — the biggest.** Deep-band (2–3σ) return rates:
  Asia 53% / London 38% / NY 20%. A deep stretch during NY is a real move
  that stays gone; the same stretch in Asia/London snaps back. Held OOS
  across many cells and both sides.
- **VuManChu / WaveTrend (momentum layer) — real on gold, gold-only.**
  At 3σ, WT-neutral touches return 42% vs 25% for WT-extended (held OOS on
  dn|3 +13.4/+25.1, up|3 +8.9/+12, dn|2 +10.3/+4.7; coherently, a fully
  "with" MTF stack at 4–5σ almost never returns within 4h: dn|5 3.5%/2.9%).
  The random-walk control is FLAT on this dimension (Δ±1pp), so it is not
  mechanical — a *drift* to a deep band snaps back, a *momentum move* to the
  same band doesn't. **Caveat that keeps it honest: it did NOT replicate on
  the FX majors (§7c) — treat as a gold-specific, medium-confidence finding
  pending forward validation.**
- **Volatility regime (vol layer) — thin.** Heavy-σ regimes return slightly
  more at deep bands (3σ: 34% vs 27% normal), one OOS-held cell; quiet
  regimes also edge above normal. Not a clean monotone — the weakest of the
  three layers, reported as such.

### 7c. Cross-instrument replication (EURUSD, GBPUSD, USDJPY — pre-named checks)

The six theme checks were fixed from the gold books BEFORE the sweep ran
(a replication, not a second fishing pass). ~2,747 sessions each:

| check | EURUSD | GBPUSD | USDJPY | replicates? |
|---|---|---|---|---|
| deep-band return≤240m (gold 34%, control 16%) | 46.5% | 46.2% | 47.8% | ✅ even stronger |
| NY returns least (gold: NY 20%) | NY 27.9% (min) | NY 24.0% (min) | NY 23.4% (min) | ✅ all three |
| WT neutral ≫ extended | flat | flat | slightly reversed | ❌ gold-only |
| race: Asia out% < NY out% | 22.3 < 38.5 | 27.6 < 32.6 | 24.8 < 33.2 | ✅ all three |
| race: grind < spike | 22.0 < 34.4 | 25.5 < 36.3 | 23.5 < 31.1 | ✅ all three |
| race: reject < accept (±2σ) | 24.0 < 34.3 | 26.2 < 32.8 | 25.8 < 35.8 | ✅ all three |

One nuance: *which* session mean-reverts most is instrument-specific (gold
and USDJPY: Asia highest; EURUSD/GBPUSD: London highest, their Asia being a
dead session) — the universal form is "**deep stretches made during NY don't
come back; stretches made in the quieter sessions do**", plus grind-dies and
reject/accept, which generalize everywhere. Each pair's own return book also
carries more held findings than its race book (116–154 vs 73–85) —
return-to-VWAP is the more conditionable outcome across the board.

### 7d. §6 addendum — the exit-geometry pivot, also null

Per §6's own note that the continuation died on payoff geometry, the same
entries were re-run with a time exit (60-bar mark-to-close, stop still live)
instead of the impulse-extreme target: OOS t −1.3 (30m) / −3.7 (1h) / +0.02
(4h). Null — the exit was not the missing piece either.

## 8. Asia/Monday range-fib levels × VWAP (the owner's third idea)

Two parts, per the request "use the Asia daily / Monday weekly fib extensions
as entry zones and trade VWAP".

### 8a. The descriptive question first: does being AT a range line change band behaviour?

Added as a dimension (`rangeConf`) to the atlas itself — touch within
0.15×fixed-σ of an Asia-range (5m-body, 00:00–06:00 London) or Monday-range
(15m-body) fib level, using `rangeFibEngine`'s own range builders and
`fibProjection`'s grid (|level| ≤ 4), causally gated (Asia levels only after
Asia closes; Monday levels only Tue–Fri). Gold result: **no coherent effect.**
Bucket shares are healthy (none 50% / asia 31% / monday 11% / both 9%), but
deltas are ±3–6pp with signs flipping between bands and sides (e.g. asia-level
+3.3pp at ±1σ but −6.4pp at +3σ), survivor counts at the books' noise floor,
and the return-book cells slightly NEGATIVE (at-a-line touches return
marginally less). Consistent with the repo's standing S/R falsification
(`LEGO_MODULES.md` §1m). Checked on the FX majors below alongside the trade
run.

### 8b. The two trade rules, as worded — pre-registered

`js/rangeFibVwapEntryV1Engine.js` (composes rangeFibEngine's builders,
fibProjection, the atlas σ, `causalAtr`, `walkBars`; costs on; 30-bar VWAP
warmup; one trade/day/rule; pinned thresholds 0.5σ "on VWAP" / 2σ
"stretched"):

- **A `line_on_vwap_extension`** — a ladder level lying within 0.5σ of VWAP
  is touched → enter in the ladder direction, target the next level out,
  stop 1.5×ATR(15m).
- **B `line_fade_stretched`** — a level ≥2σ from VWAP is touched → fade to
  VWAP, stop 1.5×ATR beyond.

**Pre-registered before running** (this text written first): "worked" = OOS
per-trade t > 2, positive mean, OOS n ≥ 30, positive gross. Priors: §1m's S/R
null, §6/§7d's entry nulls, and 8a's flat descriptive read all point the same
way — expectation **null for both**, on gold and the majors alike.

**Results (gold + EURUSD + GBPUSD + USDJPY, costed, OOS = last 40%):**

| rule | instrument | OOS n | OOS mean/trade | OOS t | OOS gross |
|---|---|---|---|---|---|
| A extension | gold | 1066 | −0.0229% | −2.90 | −0.003% |
| A extension | EURUSD | 1088 | −0.0133% | −4.65 | −0.001% |
| A extension | GBPUSD | 1088 | −0.0144% | −4.34 | −0.002% |
| A extension | USDJPY | 1064 | −0.0177% | −4.10 | −0.006% |
| B fade | gold | 768 | −0.0222% | −1.55 | −0.002% |
| B fade | EURUSD | 743 | −0.0067% | −1.00 | +0.005% |
| B fade | GBPUSD | 742 | −0.0125% | −1.77 | −0.001% |
| B fade | USDJPY | 678 | −0.0253% | −3.02 | −0.013% |

**Verdict against the pre-registered bar: NULL, both rules, all four
instruments** — as expected. The extension rule loses steadily and
significantly (gross ≈ 0: it is a coin flip that pays the spread); the fade
rule is null-to-negative everywhere.

The §8a dimension check on the FX majors: same picture as gold on the return
outcome (flat/mixed, ±2pp). One weak but sign-consistent descriptive note,
reported without a trade claim: at ±1σ, touches AT an Asia-fib level lean
continuation vs touches at no level on all four instruments (asia +1.5 to
+4.6pp, none −2.9 to −7.0pp) — small, and gold's own +3σ cell flips sign, so
this is a footnote, not a theme.

## 9. The stacked fade — the one entry the books themselves point at

The only entry candidate the data suggested (§7's own closing note), run at
the owner's request with the multiple-selection risk stated up front: **the
conditions below were chosen by looking at the mined books, so even a passing
number here would need forward validation before belief.** This is the test
that decides whether the descriptive structure converts to an after-cost
entry at all.

**Mechanics (pinned):** first touch of a ±2σ or ±3σ band with ≥240 min of
session remaining; entry at the NEXT bar's open (the touch bar must complete
— the reject gate reads it), toward VWAP; TP = VWAP as of the touch (frozen);
SL = 1.5×ATR(15m) beyond; exit capped at 240 min (mark-to-close) — the exact
window the return book measures. One trade per day (first qualifying). Costs
on (0.020%/0.012%).

**Three pre-registered variants, no sweep:**
- **V0 baseline** — no gates (the named benchmark floor; §2/§6 say this loses).
- **V1 core** — touch NOT in NY session AND touch-bar `candleReject=3·reject`.
  All four instruments (both gates replicated cross-market in §7c).
- **V2 gold-only** — V1 AND `wtState=2·neutral` (the gold-only WT finding).

**Bar (same as every trade test here):** OOS per-trade t > 2, positive mean,
positive gross, OOS n ≥ 30. If OOS n < 30 the verdict is "insufficient n",
not pass or fail.

**Results (costed, OOS = last 40%):**

| variant | instrument | OOS n | OOS mean | OOS t | OOS gross |
|---|---|---|---|---|---|
| V0 baseline | gold | 852 | −0.008% | −0.64 | +0.012% |
| V0 baseline | EURUSD / GBPUSD / USDJPY | 831 / 827 / 755 | −0.008 / −0.015 / −0.017% | −1.3 / −2.4 / −2.3 | ≈0 / −0.003 / −0.005% |
| V1 core | gold | 120 | −0.011% | −0.37 | +0.009% |
| V1 core | EURUSD | 93 | +0.0005% | +0.03 | +0.013% |
| V1 core | GBPUSD / USDJPY | 112 / 102 | −0.043 / −0.032% | −2.59 / −1.82 | −0.031 / −0.020% |
| V2 gold+WT | gold | 30 | −0.092% | −1.52 | −0.072% |

**Verdict: NULL against the pre-registered bar, every variant, every
instrument.** The best cell (EURUSD V1, t +0.03) is exactly zero. The fully
stacked V2 — the books' own favourite conditions — was the WORST cell OOS
(−1.52 at the minimum n), which is what over-selection on mined data looks
like. Conclusion, now demonstrated three separate ways (§6, §8b, §9): the
descriptive structure in these books, real as it is, does not convert into an
after-cost entry by gating touches. The books' honest use is expectations and
exits around edges that exist elsewhere, not entry generation.

## 10. σ-definition A/B — the frozen unit wins

Same touch walk (`sigmaMode` in the engine; default path pinned unchanged by
the test suite) under three band units, each read against the random-walk
control run under the SAME unit. Tag% here counts a day tagged if EITHER side
touched (pooled), so it reads higher than §1's per-side table. Metric =
gold-minus-control **excess** (the non-mechanical information content):

| unit | 3σ tag% (gold) | race excess 3σ/4σ | return≤240 excess 2σ/3σ/4σ |
|---|---|---|---|
| **fixedRms** (this study) | 44% | +11.4 / +14.3 | **+21.9 / +23.6 / +19.1** |
| developing (classic self-widening) | 97% | +9.8 / +16.4 | +2.9 / +4.3 / +4.1 |
| forecast (daily σ) | 2.8% at 2σ | — | +15.3 at 1σ, ladder barely exists |

- **The developing band mostly measures itself.** Because it widens with the
  day's own volatility, "3σ" is tagged on 97% of days and the return excess
  collapses to +3–4pp — the self-scaling unit absorbs exactly the
  information the frozen unit exposes. This is also a clean retrospective
  explanation for why the original developing-band trade test
  (`VWAP_REVERSION_FINDINGS.md`) had nothing to work with.
- **The daily forecast σ is too coarse for an intraday ladder** — 1σ tagged
  on 28% of days, 2σ on 2.8%; decent excess at 1σ but no usable ladder.
- **The frozen RMS unit — the owner's original Pine construction — carries
  by far the largest non-mechanical excess at the depths where the return
  effect lives.** Freezing σ was the right design choice of the three.

Caveats: the control's volatility is uniform by construction (no session
shape, no clustering), so excesses are indicative magnitudes, not precise
nulls; developing-mode 5σ control cells have tiny n.

**Standing discipline:** everything in §7 is descriptive, OOS-gated
reference material. The trade-shaped tests run so far (§6, §7d) are null, so
none of this is claimed as after-cost edge. The natural next harness-gated
candidate — a deep-band fade conditioned jointly on quiet-session ×
non-momentum × reject-candle — stacks several selections, so it needs
pre-registration and a multiple-testing-aware read before anyone believes a
good number from it.

## Status

Engine `js/vwapFixedSigmaEngine.js` (+ tests; also exports `groupUtcDays` /
`computeFixedSigmaByDate` so trade-level engines share the identical band
unit, equivalence-tested), report `js/vwapFixedSigmaReport.js` (imports the
shared `annotateHolds` gate from `levelAtlasReport.js`), runner
`scripts/run_gold_vwap_sigma.mjs`, controls
`scripts/run_gold_vwap_sigma_controls.mjs`. Stage-2 trade test
`js/vwapImpulseEntryV1Engine.js` (+ tests) with runner
`scripts/run_gold_vwap_impulse.mjs` — null, kept as a costed, reproducible
harness. Registered in `LEGO_MODULES.md`. No routes/UI — per the playbook,
the rows + book are the deliverable until something needs a live view.
