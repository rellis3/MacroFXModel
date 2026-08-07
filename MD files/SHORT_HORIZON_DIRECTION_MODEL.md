# What model predicts "price is about to start dropping / rising" 1–2 hours ahead?

> **Question asked:** a colleague has a model that called a price turn (start
> dropping / start rising) 1–2 hours out and was correct. Using the VuManChu
> reference and this repo's own VuManChu research, infer what that model most
> likely is.
>
> **Answer in one line:** the evidence points to a **multi-timeframe exhaustion /
> mean-reversion model** — WaveTrend stretched into an extreme across several
> timeframes, optionally confirmed by a VWAP co-divergence, outputting a
> _reversion in the next ~1–2 hours_ — exactly the mechanism this repo's own lab
> measured as real, persistent, and falsifier-surviving. A **direction
> sourced-elsewhere (positioning / OI / macro) model** is the credible
> alternative and is the shape of the repo's existing COG replication work.
> Both are described below, with the honest caveat that "was correct" is a
> direction call, not a profit claim.

---

## 1. What the repo already established about VuManChu and direction

Two large, honest studies exist in this repo and they must be read together,
because they appear to disagree until you notice they are asking different
questions.

### 1a. `VUMANCHU_DIRECTION_FINDINGS.md` — "the VuManChu family does not predict direction at intraday horizons"

This study tested every VuManChu representation as a **rank-IC forecast of forward
return** (M15, 13 months, 70/30 IS/OOS, autocorrelation-aware null):

- Every representation lands at **|IC| ≈ 0.02–0.05, uncalibrated, below the
  spread**.
- The apparent "cycle" (the "we're 17 candles into an 18-candle cycle, reversal
  due" idea) is **a property of the smoothing filter, not the market** — a random
  walk reproduces the identical cycle length and CV on every instrument.
- **Multi-timeframe agreement adds nothing** when tested as _conditional vs
  unconditional_ (best incremental t-stat −1.13 IS / +0.48 OOS; signs flip).
- **One exception that matters:** the _faithful_ Money-Flow/MFI (no volume, SMA60
  multiplier 150, per the actual Pine) was **the best single feature found** —
  IC −0.034 IS (p=0.013) / −0.050 OOS (p=0.017) at h=4 (≈1h), near-independent
  of WaveTrend. "**And it still fails.**" — per-quarter decile spread flips sign
  and two of five periods carry the whole effect.
- A 67%-hit-rate oversold "reversal" reading paid nothing: the oscillator reset
  because **its reference line came down to price, not because price went up**.
  Mean move +1.32bp against a 0.69bp spread.

**Takeaway:** VuManChu as a _standalone continuous score_ does not predict
intraday direction net of costs.

### 1b. `vumanchuLab/FINDINGS.md` — "VuManChu state carries a real mean-reversion signal at ~1h"

This study asked the **conditional-probability** question instead — _given the
indicator is in state X, what is P(up) / P(revert) over the next hour_ — on
EURUSD / gold / NQ, with matched hour×vol baselines, an anchor-offset falsifier,
and a full funnel:

- **WT oversold → P(up) rises** at h=60m: EURUSD **+2.28pp**, gold +1.73, NQ
  +1.13. **WT overbought → P(down) rises** symmetrically. Mean-reverting, and it
  **survives the anchor-offset falsifier** (no collapse at k=1 → it is not
  one-bar noise).
- **Multi-timeframe zone agreement roughly doubles it** — all three timeframes
  oversold → **+5.30pp** (EURUSD), all overbought → revert down. This is the
  repo's own measured reason multi-timeframe _zone_ agreement matters even though
  multi-timeframe _score_ agreement did not.
- **Slice 2 (shape):** _"alignment reverts, conflict does nothing."_ All three
  timeframes in the same extreme → revert; all three mid → **continuation**;
  conflicting timeframes → **nothing** (0.00–0.17pp). Tightest cells reach
  **+9–12pp** at ~0.2% frequency.
- **Slice 6 (unguided search):** the **direction sign is extraordinarily
  persistent — 22 of 23 instrument-years positive (p ~ 5e-6)**. This is the
  strongest single piece of evidence in the whole study, and it is about
  **direction, not size**. The _magnitude_ is regime-dependent and not
  forecastable from its own history.
- **Cost reality:** 0 of 15 cells clear the round-trip spread at h=60m; the best
  cell reaches 85–91% of cost. "The cells that are significant don't clear cost,
  and the cells that clear cost aren't significant."

**Takeaway:** the _direction_ of the ~1-hour reversion effect is about as
well-established as anything in this repo; the _size_ is not stable enough to
trade directly.

### 1c. Slice 3's warning — the oscillator "turning" is a continuation marker, not a reversal marker

The single most counter-intuitive and load-bearing lab finding:

> At an actual pivot bar the oscillator has **NOT turned yet** — it is still
> stretched and still pushing into its extreme. The visible roll-over is a
> **lagging** event. "Wait for the cross-back to confirm the turn" systematically
> points at **continuation** bars.

Every "the wave is rolling over" feature (WT cross-back, WT slope turn, VWAP
distance turning back, Money Flow fading) is **2–3× more common at continuations
than reversals**, on all three instruments. The only part that marks a turn is
**WaveTrend stretched into the extreme** (lift 1.16 at 1h, rising to ~1.6–2.0 at
3–6h windows).

**Practical consequence for any inferred model:** a model that fires on the
_cross-back_ (the intuitive reading) will be systematically late. The model that
would have been "correct" fires **while the wave is still stretched**, before the
visible roll-over — which is precisely what a _zone/extreme-state_ trigger does.

---

## 2. The online model landscape (what models exist that claim 1–2h direction)

Web/arXiv research on models for short-horizon (≈1–2h) FX or instrument
direction returns a small, repetitive set of families. Representative results:

| Family                                     | Example / source found                                                                                                                             | Horizon it honestly works at                                              | Direction-only?    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------ |
| **LSTM / attention**                       | GitHub `EURUSD_LSTM_Attention`; arXiv 2409.04471 _Predicting FX EUR/USD direction using ML_; arXiv 2512.12727 _EXFormer (Transformer, FX returns)_ | Publishes 50–60% directional accuracy; **rarely replicated net of costs** | Yes                |
| **Regime-switching / Markov**              | arXiv 2504.06028 _Mean-Reverting model of FX risk premium (OU)_; HMM regime work                                                                   | Regime _classification_ robust; transition _prediction_ weak              | Mostly bias/filter |
| **Order-flow imbalance (OFI)**             | Cont-Kukanov-Stoikov 2014; microstructural impact papers                                                                                           | Seconds–minutes only; **decays before 1h**; needs L2/volume               | Yes, but too short |
| **Oscillator-exhaustion / mean-reversion** | The VuManChu / WaveTrend family itself                                                                                                             | ~1h — **matches the repo's own measured effect horizon**                  | Yes                |
| **Positioning / OI / options-magnet**      | COG (this repo's reverse-engineered colleague system)                                                                                              | Daily pre-open directional call; OI walls as magnets                      | Yes                |
| **Macro cross-asset**                      | COG Gate 3 (`js/cogDirectionGate.js`) — DXY, yields, credit, gold/copper/oil, ES/RTY                                                               | Daily bias, not 1–2h                                                      | Bias layer         |

**The honest read of the online landscape matches the repo's own finding:** short
intraday direction is the hardest thing to predict; the families that publish
headline "accuracy" (LSTM/Transformer) rarely survive costs or replication, and
the families with genuine short-horizon mechanism (OFI) decay faster than 1 hour.
**The 1–2 hour window sits in a gap**: too slow for order-flow microstructure, too
fast for fundamentals. The one mechanism that _does_ demonstrably live at ~1h —
both in the literature's mean-reversion family and in this repo's own lab — is
**oscillator exhaustion → reversion**, and specifically its multi-timeframe,
still-stretched (not yet turned) form.

---

## 3. The inferred model (primary candidate)

Given the VuManChu reference, the repo's two studies, and the online landscape,
the model most consistent with "predicted price would start dropping/rising 1–2
hours ahead and was correct" is:

### A multi-timeframe exhaustion / zone-agreement reversion model

**Inputs (all available from the existing VuManChu bricks):**

1. **WaveTrend zone per timeframe** (oversold / overbought / mid) on at least
   two, ideally three, timeframes — e.g. M5, M15, H1 (the repo's own M1/M5/M15
   stack in `vumanchuLab`, or the ConfluenceBot's M5 + HTF in
   `ConfluenceBot/modules/vumanchu.py`).
2. **The zone, not the score** — the state is oversold/overbought, _not_ the
   continuous oscillator level (the repo's score-level tests were null; the
   zone-state tests were not).
3. **A "still stretched" guard, not a "turned" guard** — the trigger is
   _stretched into the extreme_, never "wait for the cross-back" (Slice 3's
   finding).
4. **Optional VWAP co-divergence** — the lab's `double + VWAP` cell was the
   strongest mechanism-specific positive and it is _real on gold_; on FX/index it
   flags volatility expansion rather than clean reversal, so treat it as a
   magnitude/confidence input, not a direction input.

**Decision rule (the call the colleague would have made):**

| State at decision time (all timeframes read)                                    | 1–2h prediction                                             |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| WT oversold on fast TF **and** confirmed oversold/stretched on slower TF(s)     | **Price likely to start RISING** within ~1–2h               |
| WT overbought on fast TF **and** confirmed overbought/stretched on slower TF(s) | **Price likely to start DROPPING** within ~1–2h             |
| Timeframes conflict (one stretched, one not / mid)                              | **No call** (lab: conflict does nothing)                    |
| All timeframes mid                                                              | **Continuation**, not a turn (lab: mid → −1.44pp on revert) |

**Why this is the plausible "correct" model:**

- The repo measured **the direction sign as persistent across 22/23
  instrument-years** — a model that only ever calls reversion-from-extreme gets
  the _direction_ right more often than not, which is exactly the "he called the
  turn and was right" experience.
- It fires **before the visible roll-over**, which is when turns actually start —
  matching the lab's Slice 3/4 finding that stretch (not turn) is the reversal
  marker.
- The ~1–2h prediction horizon matches the lab's own horizon finding: **the
  effect lives at ~1h and is gone by a day** (60m strong, 240m mostly gone, 1440m
  noise).

**The honest caveat that must accompany it:** this model being _directionally
correct_ is well-supported; it being _profitable_ is **not** — the repo measured
0/15 cells clearing spread costs at h=60m. So if the colleague's "correct" means
_"he said drop and it dropped,"_ the inference is strong. If it means _"he made
consistent money off the calls,"_ that edge is **not in the VuManChu data** and
must come from somewhere else (see §4) — usually the exit, the sizing, or a
direction sourced from non-price data.

---

## 4. The alternative — direction sourced from _elsewhere_ (positioning / OI / macro)

The repo already contains a documented, honest attempt to reverse-engineer a
colleague's model that _does_ call daily direction: **COG** (`cog-replication/`,
`MD files/COG_OBSERVED_SYSTEM.md`).

Key facts about COG that bear directly on "a colleague has a model that called
the direction":

- COG trades **NASDAQ, once per day**, direction delivered **minutes before the NY
  cash open** (stage-3 message), **58.6% win rate, Sharpe 2.32** (his tearsheet).
- His stated inputs are **repo/reverse-repo, central-bank balance sheets** — and
  crucially he says the system _"has nothing to do with NAS"_ price. Direction is
  **not** sourced from the traded instrument.
- The repo's structural analysis (§4g) showed why this must be true: a slow
  weekly liquidity signal **physically cannot** generate 60 independent daily
  direction calls at 58.6% hit rate. So the coherent reading is: **slow
  liquidity = permission/regime filter** (Gate 1), **post-macro-print risk/sizing**
  (Gate 2), **fast pre-open directional read** (Gate 3).
- The repo's candidate for Gate 3 is the **OI / options-magnet** hypothesis:
  price is pulled toward the dominant OI wall / max pain
  (`cog-replication/engine/oiSignalCheck.js`). The owner's OI read matched COG's
  direction **2/2** on the two screenshot days (small-n, noted as such). The
  cross-asset macro direction gate is `js/cogDirectionGate.js` (DXY, USDJPY,
  EURUSD, yields, credit, gold/copper/oil, ES/RTY — never NQ/QQQ).
- The forward log (`cog-replication/FORWARD_LOG.md`) is _correctly_ set up to
  discriminate "runs (slow macro)" vs "alternating (fast positioning)" with the
  run-length test, and to score **who was right, not who agreed**.

**How this maps onto the user's question:** if the colleague's model calls
direction _from positioning / OI walls / macro cross-asset_ rather than from
VuManChu, then VuManChu's role in his workflow is almost certainly what the repo
itself concluded: **"the oscillator as a timing tool for a direction sourced
elsewhere — which is what discretionary use of it actually is."** That is the
single most defensible _integration_ of VuManChu into a directional model: use
VuManChu's ~1h exhaustion/reversion state to time and filter, use a
non-price-derived signal (OI/positioning/macro) for the side.

---

## 5. How to test whichever inference is right — using bricks that already exist

The repo does not need new math to discriminate the two hypotheses; it needs the
three cheap tests it has already designed:

1. **Zone-state forward test (primary candidate).** Re-run the `vumanchuLab`
   panel (`panel.py` / `events.py` / `falsify.py`) restricted to the
   "all-timeframes-stretched" zone states and report, per instrument-year,
   **sign-persistence of the h=60–120m reversion** — the 22/23 result is the
   load-bearing claim. This directly answers "does the inferred model call the
   direction."
2. **Direction run-length test (alternative candidate).** On COG's / the
   colleague's logged direction calls (`cog_signal_log`), compute run-lengths
   vs the random expectation `2·nL·nS/n + 1`. Runs ⇒ slow macro bias (direction
   from elsewhere); alternating ⇒ fast positioning read. Requires only the log,
   no model of his system.
3. **OI-wall magnet test (alternative's mechanism).** `oiSignalCheck.js` already
   computes whether the sign of `(wall − spot)` predicts the sign of the session
   move. It is deliberately small-n honest (n<25 not acted on).

**The exit is where any of these can become profitable even though the entry
direction is sub-cost** — the repo's own COG analysis (§4d) showed roughly a
third of COG's edge sits in the exit, not the entry. So the full "correct model"
likely = direction call (either candidate) + **a stop/tier layer sized off
expected range (GEX/vol)** + **an exit that cuts losers before the stop**.

---

## 6. Bottom line

- **Most likely model that "predicted price would start dropping/rising 1–2h
  ahead and was correct":** a **multi-timeframe WaveTrend zone-exhaustion
  reversion model** — stretched into the extreme across timeframes (still
  stretched, not yet turned) → reversion in the next ~1–2h. This is the one
  direction signal the repo's own lab measured as real, persistent (22/23
  instrument-years same sign), falsifier-surviving, and living at exactly the
  1–2h horizon.
- **Credible alternative:** direction sourced from **positioning / OI walls /
  macro cross-asset** (the COG shape already replicated in this repo), with
  VuManChu used only as a **timing/exhaustion filter** on a side decided
  elsewhere.
- **What "was correct" almost certainly does NOT mean:** that the VuManChu signal
  alone is profitable. The repo measured 0/15 extreme-zone cells clearing spread
  costs at h=60m. A colleague who "calls the direction" correctly is consistent
  with the data; a colleague who _profits reliably_ from the calls is not
  explained by VuManChu state alone — the edge would be in the exit, the sizing,
  or the non-price direction source.

---

## Repo sources

- `MD files/vumanchu_reference.md` — the indicator reference (components,
  divergence, fuel concept).
- `MD files/VUMANCHU_DIRECTION_FINDINGS.md` — score-level direction study (null at
  intraday; faithful MFI the best single feature, still sub-cost).
- `vumanchuLab/FINDINGS.md` — conditional-probability lab (zone states, ~1h
  mean-reversion, 22/23 sign persistence, 0/15 clear cost).
- `MD files/REVERSION_CONTINUATION_EVIDENCE.md` — the peer-reviewed evidence base
  (Osler order clustering, OFI, horizon structure, TA/data-snooping warnings).
- `MD files/COG_OBSERVED_SYSTEM.md` + `cog-replication/README.md`,
  `cog-replication/DECISIONS.md`, `cog-replication/FORWARD_LOG.md` — the
  colleague-system reverse-engineering and its forward test.
- `js/cogDirectionGate.js`, `cog-replication/engine/oiSignalCheck.js` — the
  direction-from-elsewhere candidates.
- `hmm5m.js`, `hmm5m-v2.js` — the repo's HMM regime classifiers.
- `ConfluenceBot/modules/vumanchu.py` — the V2 VuManChu confirmation engine.
- `MD files/STAGE3_VUMANCHU_GATE.md` — honest null: the VuManChu gate filters
  volume, not losers.

## Online sources consulted (2026-08-02)

- arXiv 2409.04471 — _Predicting Foreign Exchange EUR/USD direction using machine
  learning._
- arXiv 2512.12727 — _EXFormer: multi-scale trend-aware transformer for FX
  returns prediction._
- arXiv 2504.06028 — _A mean-reverting model of FX risk premium using OU
  dynamics._
- arXiv 1907.09452 — _Mid-price prediction with ML + technical/quantitative
  indicators._
- arXiv 2001.01860 / 1503.07007 — order-flow / price-impact microstructure.
- GitHub `EURUSD_LSTM_Attention`; MDPI _Exchange Rate Forecasting with Advanced
  ML Methods_; Kalman-filter FX forecasting (dynamic model averaging).
- Search engines returned a consistent set of families (LSTM/attention,
  regime-switching, OFI, oscillator-exhaustion, positioning) — no family outside
  the table in §2 claims reliable 1–2h FX direction net of costs, which itself
  corroborates the repo's finding that the ~1h window is oscillation-exhaustion
  territory.
