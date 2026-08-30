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

### 9a. Addendum (2026-08-27) — ±3σ only, gated on raw WaveTrend sign vs zero

Owner's follow-up, gold only, pre-registered before running: same mechanics
(entry next bar open, TP=VWAP-at-touch frozen, SL=1.5×ATR15m, 240min cap, one
trade/day, costs on) restricted to the **±3σ band alone** (not pooled with
2σ), tested "regardless" (V0) against a new gate — `requireMomentumAgree`:
fade only when the RAW WaveTrend oscillator is still on the **same side of
zero** as the extension at the touch (sell only if wt1>0 at an upper touch,
buy only if wt1<0 at a lower touch) — the opposite bet from V2's `wtState=
2·neutral` gate above, which requires momentum to already be UN-extended.
Engine: `js/stackedFadeV1Engine.js`'s new `requireMomentumAgree` config
(reuses the same touch rows, now carrying `wtStateValue` — raw wt1 — added
alongside the existing `wtState` bucket). Runner: `scripts/
run_third_band_momentum_fade.mjs`.

| variant | OOS n | OOS mean | OOS t | OOS win% | OOS gross |
|---|---|---|---|---|---|
| V0 band-3-only (regardless) | 460 | −0.0321% | −1.68 | 37.0% | **−0.0121%** |
| V-momentum (wt1 agrees) | 457 | −0.0329% | −1.72 | 37.2% | **−0.0129%** |

**Verdict: NULL, both variants — consistent with, not a new instance beyond,
§9's standing null.** Two things worth stating plainly rather than burying:

1. **The momentum-agree gate barely filters anything** (pool 1,260 → 1,243,
   ~1.3%) — because a fresh, genuine 3σ extension almost always already has
   the raw oscillator on the same side as the move (that's what a momentum
   oscillator does during a real extension). As specified, this condition is
   close to a no-op against the unconditional population, not a distinguishing
   filter the way `wtState=2·neutral` was — so it isn't really testing a
   separate hypothesis from V0 here, and the near-identical numbers above
   reflect that, not a coincidence.
2. **Restricting to 3σ alone is gross-negative even before costs**
   (−0.012 to −0.013%), unlike the pooled 2σ+3σ V0 baseline earlier in this
   section (gross +0.012%, lost only to costs). The raw price path around an
   isolated 3σ touch loses money on this exact entry/exit geometry, not just
   after transaction costs — a materially different (worse) statement than
   the pooled result, worth knowing on its own.

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

## 11. VWAP slope, range-consumed, and momentum×range interaction (2026-08-30)

Owner's request, framed as a research question ("when is VWAP a magnet vs an
origin for expansion"), not an indicator search: three dimensions genuinely
NOT in §1-10, added the same way every other dimension here is — as causal,
prior-history-only fields on the SAME `fixedSigmaWalk()` touch rows, read
through the SAME `annotateHolds` gate, and — the part that matters most —
checked against the SAME random-walk control that already caught two
mechanical artifacts in this study (§2, §7 point 1).

- **`vwapSlope`** — VWAP's own trailing rate of change over the last 30min
  (distinct from the already-existing `vwapDrift`, which is drift since the
  *session open*), σ-normalised, oriented to the touch side.
- **`rangeConsumed`** — today's realized high-low range so far ÷ the
  trailing-20-session median of PRIOR sessions' own full-day range (banked
  the identical causal way `fixedSigma` itself is — a volatility-exhaustion
  read, deliberately NOT a raw "% of session elapsed" feature, since that
  exact shape produced the fake `sessionPos` clock-truncation finding §7
  point 1 already had to catch and fix). Buckets: low (<0.5×) / mid
  (0.5-0.85×) / high (0.85-1.2×) / exhausted (>1.2×).
- **`momRangeMatrix`** — `momAdx` (existing 1h-ADX trend/range bucket) ×
  `rangeConsumed`, combined into one cell the exact way `dowSession` already
  combines `dow`×`session` — the 2×2-style matrix the owner asked for,
  reusing the book's existing machinery rather than a bespoke report.

### Result: `vwapSlope` is mechanical — the control reproduces it almost exactly

| check | gold Δ (IS/OOS or race/return) | control Δ |
|---|---|---|
| ±1σ race, `vwapSlope=3·with` | −15.8 / −14.3 (up\|1) | **−15.2** |
| ±2-3σ return, `vwapSlope=3·with` | +10.8 / +5.3 (up\|1, band 1 shown; ±2-3 pooled below) | **+9.7** |

The random walk — which has no real reversion by construction — reproduces
gold's own delta almost bar-for-bar in both directions. This is the same
class of artifact `vwapDrift`/`churn` were already found to partly carry: a
VWAP that has been sloping toward the touch side moves the BAND itself
toward price at the same time (band = vwap + kσ), so a "touch" needs less
real extension to register — a coordinate effect, not a market one.
**`vwapSlope` is reported here as tested-and-explained-away, not promoted.**

### Result: `rangeConsumed` / `momRangeMatrix` show a real, non-mechanical excess — specifically at DEEP bands, and specifically in the CONTINUATION direction

The shallow-band (±1σ) reading is mixed: `rangeConsumed=2·mid` at up|1 holds
on gold (IS+13.6/OOS+9.9) but the control shows the same-direction Δ+6.0 at
that exact bucket — roughly 60% of gold's OOS number is mechanical, leaving
a modest possible real excess, not a clean read.

**At ±2-3σ it separates cleanly:**

| finding (gold, OOS-held) | gold Δ (IS/OOS) | control Δ (same bucket) |
|---|---|---|
| `rangeConsumed=3·high`, dn\|2 (race, 'out') | +17.7 / **+6.5** | **−0.1** |
| `momRangeMatrix=1·range×3·high`, dn\|2 (race) | +31.0 / **+7.3** | **+1.4** |
| `momRangeMatrix=3·trend×3·high`, dn\|2 (race) | +8.9 / **+9.5** | **−6.8** (sign-flipped) |
| `rangeConsumed=4·exhausted`, up\|3 (race) | +13.4 / **+5.8** | −4.0 (±2-3σ pooled; opposite sign) |

Three of these are the specific, non-obvious kind of finding this project
treats as strongest: gold's OOS delta is either far above a near-zero
control (rangeConsumed=high, momRangeMatrix=1·range×3·high) or the OPPOSITE
SIGN from the control (momRangeMatrix=3·trend×3·high, rangeConsumed=
exhausted) — the same "cleanest genuinely-gold" signature §3 found for the
grind-approach dimension. `momRangeMatrix=3·trend×2·mid` at up|1, by
contrast, is NOT real — the control shows Δ+12.2 against gold's own
OOS+10.7, essentially matched — a reminder that the matrix is real cell-by-
cell, not as a blanket "momentum × range works."

**Reading it straight, and directly against the owner's own hypothesis**:
the brief guessed "high range consumption + extreme VWAP deviation → mean
reversion." What the data actually shows, where it's real, is the OPPOSITE —
a deep band reached after most of the session's typical range is already
used up **continues MORE, not less**, beyond what a random walk's own
volatility-clustering would predict. Consistent with a "the day is already
trending/expansion-shaped" read rather than an "exhaustion" read — but
stated as what the data shows, not fit to the momentum-lifecycle framing
after the fact.

### What this does and doesn't answer from the owner's fuller brief

This covers the "range exhaustion" (§4 of the brief) and "VWAP geometry
slope" (§3) questions specifically, cross-checked the honest way. It does
**not** yet build: the full sequential band-by-band path reconstruction
(brief §8 — this book records first-touch + peak/return per band, not a
walked VWAP→1σ→2σ→3σ timeline with inter-band velocity); a formal
incremental-information/ablation table (brief §12 — the held-findings list
above is the closest existing analogue, dimension-by-dimension, but not a
cumulative baseline→+X→+Y stack); a 5-stage Momentum Lifecycle classifier
(brief §6 — `dayTypeCore.js`'s existing trend-vs-reversion score is the
nearest built brick, not that specific framework); or options/gamma/
liquidity-pool levels (brief §9 — no such data source exists in this repo;
the structural-level question this project CAN answer is already covered by
§8's Asia/Monday range-fib null). None of the above is claimed as done.

## 12. Regime state, band walking, and VuManChu tested last (2026-08-30)

Direct follow-up to §11, driven by the owner's screenshots of a large gold
break: the concern that a naive "-3σ ⇒ fade to VWAP" rule is dangerous
exactly when the band itself is part of an expanding, trending distribution,
not a rotational extreme. Three more additions to the same engine (still no
new engine, no ML pipeline — the project's existing bucket/delta/random-walk-
control method, applied to new fields):

- **`bandSlope`** — a SHORT causal ATR(14, this session's own bars only)
  rate of change over the last 30min, as % change — "is realized volatility
  expanding right now." Deliberately NOT the frozen `fixedSigma` (locked for
  the whole session by design) and NOT the cumulative session-long developing
  σ already in the engine (too smoothed by session-end to move fast) — a
  fresh, short-window read, reusing `indicatorCore.js`'s existing `atrWilder`
  brick.
- **`regimeState`** — `momAdx × bandSlope`, one combined cell (contracting/
  stable/expanding × range/mixed/trend) — the minimal-DOF regime read the
  owner asked for. Deliberately NOT a named 4-state ("Reversion/Expansion/
  Exhaustion/Neutral") classifier — that would be fitting labels to cells
  before knowing what they do; the raw combo is reported and interpreted
  from what the data shows, not the reverse.
- **`wtRegimeState`** — `regimeState × wtState`, VuManChu layered ON TOP,
  specifically to test the owner's "test VuManChu last" instruction: does it
  add anything once momentum and volatility-expansion are already known?
- **`bandWalk`** (a new OUTCOME, not a context dimension) — literal "does
  price stay beyond a lenient (k−0.3)σ threshold for consecutive bars after
  the touch" (rejection vs. walking the band), computed in the SAME forward
  scan the race/return outcomes already use — no extra pass. Threshold
  10+ consecutive bars = "walking." A new `buildBandWalkBook` in
  `vwapFixedSigmaReport.js` mirrors `buildVwapReturnBook` exactly (same
  cells/dims/holds-gate), reading THIS outcome instead. Touch-time context
  dimensions are valid predictors of it (strictly causal); the race/return
  outcomes are never used to predict it — that would be circular, since both
  read the same forward window.

### Band-walk sanity check — it measures what it claims to

Before trusting anything conditioned on it: `candleReject=3·reject` shows
the single largest band-walk deltas in the whole run (up|1 −18.4pp IS /
−14.2pp OOS, similarly at up|2/up|3/dn|1/dn|3) — a rejection wick at the
touch bar predicting LESS subsequent walking is exactly what "rejection"
should mean, and the control's own candleReject delta on the walk outcome is
near zero (Δ−2.7 at n=39). That internal coherence, not just the OOS gate,
is why the outcome is trusted enough to build on.

### `bandSlope` is real, and points opposite to naive intuition

Checked against the control on all three books (race, return, band-walk),
`bandSlope`'s own control deltas sit near zero everywhere (|Δ| mostly <4pp)
— unlike `vwapSlope` in §11, this one is NOT mechanical. What it shows,
consistently across cells and BOTH sides, on the RETURN-to-VWAP outcome:

| bucket | gold pattern (OOS, multiple cells) | control (±2-3σ, matched bucket) |
|---|---|---|
| `3·expanding` | **+3.8 to +7.2pp** (up\|2/3, dn\|2/3) | −1.0 |
| `2·stable` | **−5.4 to −10.5pp** (up\|1-4, dn\|1-2) | +0.4 |
| `1·contracting` | **−6.5 to −14.9pp** (up\|2/3, dn\|2) | −0.5 |

Reading it straight: **expanding realized volatility correlates with MORE
return-to-VWAP, not less; stable/contracting volatility correlates with
LESS.** This is the opposite of "the bands are expanding, therefore price
won't come back" — it does not confirm the naive worry from the screenshots
as stated, at least on this metric. Two honesty notes: (1) this measures
short-window (30min) volatility velocity, NOT the cumulative range-consumed
metric from §11 — the two were NOT tested jointly, and §11's own finding
(high range-consumed → more continuation) is a different, not necessarily
contradictory, statement about a different quantity; reconciling them is
flagged as unfinished, not swept under a single story. (2) `regimeState`'s
own `3·trend×3·expanding` cell shows the clearest owner-hypothesis-shaped
result: real (sign-flipped vs. the control, which shows Δ−9.9 to −16.0 at
the SAME cell across checks) and POSITIVE on gold (+3.7 to +9.5pp
continuation, +6.6 to +7.2pp return) — trending momentum WITH expanding
volatility is the one combination that behaves like real, gold-specific
continuation, distinct from and opposite to what the control's own
mechanical shape would predict for that cell. That is the closest this pass
comes to validating the screenshots' concern, and it is real, not the
volatility-slope story alone.

### VuManChu tested last: honestly inconclusive, not "it helps"

`wtRegimeState` (the 3-way combo) nominally holds more findings than
`regimeState` alone, but it also tests roughly 2× the number of distinct
cells (up to 18 vs. 9 per side/band) — under this study's own permutation-
baseline logic (§ Control 2: ~50% of *any* held finding here is chance at
this cell count), testing more, thinner cells produces more nominal
survivors without that being evidence of real incremental value. A few
individual `wtRegimeState` cells DO show a bigger excess over their control
counterpart than `regimeState` alone at the same momentum×volatility
combination, but this pass did not build the matched-cell-count statistical
comparison needed to say that cleanly (that would be the honest way to
answer "how much does VuManChu add," and is flagged as unfinished, not
claimed). Read plainly: **no clear evidence VuManChu adds real value on top
of momentum+volatility-expansion here** — consistent with, not contradicting,
§3/§7b's standing finding that WaveTrend conditioning on gold is thin.

### What this does and doesn't answer

Covers band-slope/expansion-rate (brief's band-behaviour ask) and band-
walking (brief's "REALLY add this" ask) with the same control discipline as
everything else here. Still NOT built: a named, validated 4-state regime
classifier (deliberately — see above); the "earliest identifiable point"
question (this pass reads regime AT the touch, which is the earliest causal
point available at a touch — finding leading indicators BEFORE a touch even
happens is a different, harder question, not attempted); a joint
bandSlope×rangeConsumed interaction; and a real statistical incremental-
information test (AUC/information-gain) for the VuManChu-last question,
which would need a genuinely different, heavier method than this project's
bucket/delta/control style.

## 13. Cross-instrument replication of §11-12 (2026-08-30)

Per the standing discipline ("gold-only" has burned this study before — the
WT-neutral-returns finding, §7b), the two headline §11/§12 findings checked
against EURUSD/GBPUSD/USDJPY before either is trusted further. Pre-named
checks (T4/T5/R4), added to `scripts/run_vwap_sigma_sweep.mjs` alongside the
existing R1-3/T1-3 replication set — same script, same discipline, not a new
fishing pass.

**`bandSlope` (§12) replicates cleanly, on all three majors, same direction,
similar-to-larger magnitude than gold:**

| | gold | EURUSD | GBPUSD | USDJPY |
|---|---|---|---|---|
| return≤240m: expanding | — | 49.1% (n=1869) | 49.3% (n=1760) | 47.9% (n=1841) |
| return≤240m: stable/contracting | — | 38.6% (n=1692) | 38.1% (n=1767) | 39.3% (n=1464) |
| gap | +7 to +11pp (per-cell) | **+10.5pp** | **+11.2pp** | **+8.6pp** |

This is now the single best-corroborated NEW finding from the last two
sessions' work — real on 4 independent instruments, not gold-specific,
counter to naive intuition on all four: expanding volatility means MORE
return to VWAP, not less.

**`regimeState=3·trend×3·expanding` (§12's headline, the one cell that
matched the owner's own screenshot hypothesis) does NOT clearly replicate:**

| | gold (OOS) | EURUSD | GBPUSD | USDJPY |
|---|---|---|---|---|
| cell out% vs base | **+3.7 to +9.5pp** | 28.4% vs 29.5% (−1.1) | 30.4% vs 31.1% (−0.7) | 33.6% vs 31.0% (+2.6) |

Two of three majors show it flat-to-slightly-negative; USDJPY shows a small
positive, well under gold's own magnitude. Read straight: this looks
gold-specific (or at minimum, not robust), the same pattern already seen for
the WaveTrend-neutral-returns finding in §7b — a momentum-flavoured
conditioning result surviving on gold but not generalising, while the pure
volatility-expansion signal (`bandSlope` alone) does generalise. **Do not
treat `regimeState`'s trend×expanding cell as validated going forward** —
it is reported here specifically to correct the impression §12 may have
given.

**`rangeConsumed` high-vs-low (§11) could not be checked this way** — the
"low" (<0.5× expected range) bucket is essentially unpopulated at the
±2-3σ FX-major touch population (n=3 on EURUSD/GBPUSD, n=3 on USDJPY,
against thousands in the "high" bucket): FX pairs trade a much narrower
range relative to their own σ than gold, so by the time price reaches a
deep band the day's typical range is already mostly spent, on these three
pairs, essentially always. A data-coverage limit, not a failed replication —
the comparison this specific check runs simply isn't testable on FX majors
as framed.

## Status

Engine `js/vwapFixedSigmaEngine.js` (+ tests; also exports `groupUtcDays` /
`computeFixedSigmaByDate` so trade-level engines share the identical band
unit, equivalence-tested; §11 added `vwapSlope`/`rangeConsumed`/
`momRangeMatrix` the same causal way, +2 tests; §12 added `bandSlope`
(new `atrWilder` import)/`regimeState`/`wtRegimeState`/`bandWalk` (a new
forward-scan OUTCOME, not a context dim), +1 test), report
`js/vwapFixedSigmaReport.js` (imports the shared `annotateHolds` gate from
`levelAtlasReport.js`; §11+§12's dims registered in `DIMENSIONS`; §12 added
`buildBandWalkBook`/`walkedEnough`/`WALK_THRESHOLD_BARS` mirroring
`buildVwapReturnBook`'s exact shape), runner `scripts/run_gold_vwap_sigma.mjs`,
controls `scripts/run_gold_vwap_sigma_controls.mjs` (§11+§12's dims added to
the ±1σ/±2-3σ race and return control checks, plus a new band-walk-outcome
control check and permutation baseline), cross-instrument sweep
`scripts/run_vwap_sigma_sweep.mjs` (§13 added T4/T5/R4 pre-named checks for
§11/§12's `rangeConsumed`/`regimeState`/`bandSlope`). Stage-2 trade test
`js/vwapImpulseEntryV1Engine.js` (+ tests) with runner
`scripts/run_gold_vwap_impulse.mjs` — null, kept as a costed, reproducible
harness. Registered in `LEGO_MODULES.md`. No routes/UI — per the playbook,
the rows + book are the deliverable until something needs a live view.
