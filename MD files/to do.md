Good question. Here's what I'd consider, roughly in order of signal quality:

Already in the system — just need surfacing at decision point

Fib direction — every level already has direction: 'H→L' or 'L→H'. H→L = price came from above, expect short. L→H = price came from below, expect long. If this conflicts with macro bias → stay out. Already computed, not explicitly shown as a go/no-go gate.

aligned flag — already checks fib direction vs macro bias. A 7-star level with aligned: false is structurally strong but counter-trend. That's your first stay-out signal.

Pivot position — price above PP = lean long, below PP = lean short. Already have pivot data.

Session — already have sessionData. A level hit during Asia consolidation is less reliable than the same level hit during London or NY open.

Not in the system — highest value additions

Candle confirmation on 5m — the single most reliable real-time filter. Don't enter on touch, enter on a 5m close that confirms direction: bullish engulfing / pin bar close above level = long, bearish = short. You already have S.ohlc5m — it's a case of looking at the last 2-3 closed candles at the moment of alert.

EMA alignment on 5m — is the 5m close above or below a fast EMA (8 or 21) at the time of level touch? Price above EMA at a long zone = go, price below EMA at a long zone = wait. Simple, fast, reduces counter-trend entries significantly.

COT positioning — already loaded. If commercials are net long and the level is a long setup, that's institutional alignment. Useful as a weekly-scale confirmation rather than real-time.

The practical flow at a 7-star hit:


Level touched
  → Is it aligned (fib direction = macro bias)?      No → stay out
  → Is session London or NY?                          No → wait
  → Did last 5m candle close confirming direction?   No → wait for next close
  → Is 5m price above/below EMA in bias direction?   No → stay out
  → All yes → take the trade
The candle close + EMA pair is the most actionable because it's real-time and already answerable from data you're already fetching. Want me to build those two as a confirmation layer on top of the existing entry scanner?




Vix trend help the Forex pairs?
can we do session Volume and see VAH/L and POC?  how?


Done - Add the Run Day process to allow to filter by starts like export so can see the benefits of which stars get good results


## 2026-08-10 — ML hub / deep candle-history ML (chat, nothing built yet)

Theoretical discussion, no code written. Parking the ideas here so they don't
get lost. Ordered roughly cheap/likely-useful -> expensive/speculative.

**The core idea worth taking seriously first:** generalise `vumanchuLab`'s
`discover.py` funnel (enumerate cells -> |t_IS|>=2.5 -> OOS same sign -> same
sign on other instruments -> cost-clearing check) into a shared, reusable
harness that ANY new feature set gets run through — not just VuManchu state.
That funnel + a shared feature panel is the actual "ML hub," more than any
single model. Candidate feature sets to feed it:

- Candle-shape SEQUENCES (the "20 candles in a row -> outcome" idea) — this is
  genuinely new territory, nothing in the repo mines sequences today, only
  single-snapshot shape (`shapes.py`). Needs care: `FINDINGS.md` S3 already
  caught the "what did shapes look like AT past reversals" trap (selection on
  outcome, no forward content) — must condition forward, same as everything
  else here.
- True multi-resolution stack extended to 30m/1h (currently only 1m/5m/15m in
  the panel).
- Candle vs volume joint patterns — blocked until a real volume feed exists;
  OANDA volume is tick count, not size, and every MF test so far found it adds
  ~nothing beyond WaveTrend.
- Tree-based learner (XGBoost/LightGBM) as the natural next step up from
  `discover.py`'s pairwise search — finds higher-order interactions
  automatically instead of a human guessing which pairs to test. Same
  falsification bar applies (IS/OOS/cross-instrument/cost), not a shortcut
  around it.
- Image/CNN pattern matching over rendered multi-panel chart snapshots —
  untried, higher effort, park behind the above.

**Wilder "outlandish edge model" list from the same conversation** (explicitly
speculative, no evidence either way, ban the selling words per house rules
until something actually runs):
conformal-prediction wrapper over existing forecasters; mixture-of-experts
"trust gate" that learns which existing signal to believe per regime;
autoencoder reconstruction-error "market weirdness" dial; Hawkes/point-process
model of COT positioning cascades; causal-discovery graph (PCMCI/Granger)
instead of the correlation matrix; topological-data-analysis on the rolling
correlation network (shape/persistent-homology regime-break detector);
Ising-model phase-transition detector over the FX/gold complex; multi-agent RL
sim of COT participant classes (commercials/large specs/small specs) as a
synthetic stress test; diffusion-model scenario generator conditioned on macro
state for tail-scenario sizing; LLM embedding-trajectory tracker for central
bank speeches (FOMC/ECB/BOE/BOJ) as a hawkishness-momentum signal, distinct
from point sentiment scores; contrastive chart-to-vector embeddings for
nearest-neighbour pattern lookup across all 26 pairs + gold.

Next step when we're ready to actually build (not yet): pick ONE — most likely
candidate-shape sequences or the tree-based interaction search — and run it
through the funnel exactly like the existing VuManchu slices, honest nulls
included.

## 2026-08-10 (cont.) — mass cross-asset divergence scan (gold/DXY/VIX/etc, not FX pair-vs-pair)

Also chat only, nothing built. The ask: find genuine divergence between
non-FX-correlated instruments (gold, DXY, VIX, commodities, indices) rather
than pair-vs-pair FX (which already mechanically share a currency).

**This is closer to relative-value/stat-arb than trend-following, and parts
already exist:**
- `gold-miner-arb.html` already runs the cointegration engine
  (`js/hedgeSignalV2Engine.js` — Engle-Granger + OU half-life + rolling
  z-score, the v2 fix over the broken v1 correlation-based hedge) on GDX vs
  Gold, with a VIX filter/stop. A live, real prototype of exactly this shape.
- `HEDGING_VS_SPREAD.md` is the reference for WHY this works and hedging
  doesn't: a divergence trade is a real relative-value edge (the spread IS the
  trade); a correlation hedge bolted onto a directional trade cancels its own
  edge and breaks precisely when needed. Read before building anything here.
- `STAT_ARB_AUDIT.md` names the exact gap: no unified multi-asset / mass
  pairwise-or-basket scan across a broad cross-asset universe today — the
  cointegration machinery is pointed at FX-pairs-for-hedging or one hand-built
  pair (GDX/gold), not run at scale.

**Data blocker, found while reading:** the existing hedge signal doesn't use
real VIX/DXY at all — it proxies them (USDCHF~=VIX, EURUSD~=DXY,
`BETA_FACTOR_PROXIES`), and `HEDGING_VS_SPREAD.md` names this as part of why
the old hedge lost money. Real DXY + VIX series (Yahoo `^VIX`, `DX-Y.NYB`, or
a synthetic DXY basket) are a prerequisite before this is honest — same
data-first discipline as the cross-asset trend scope doc.

**Where ML adds something beyond the existing econometrics** (Engle-Granger/OU
is classical stats, not ML):
- mass pair/basket discovery funnel across ~30-40 instruments (FX + gold + DXY
  + VIX + indices + commodities) — same enumerate/IS/OOS/cost-clear shape as
  `discover.py`, just scored by cointegration instead of conditional P(up)
- basket-level (not just pairwise) divergence via a factor model
  (PCA/autoencoder) — "what should this asset be doing given the whole
  cross-asset picture," generalises the STAT_ARB_AUDIT's ensemble-fair-value
  idea beyond FX
- regime-conditional trust gating on top of the OU z-score (ties to the
  mixture-of-experts idea above)

**Important honesty caveat:** every cointegration result proven in this repo
so far (compass FX fair value, gold OLS, hedge v2) is on DAILY bars and
reverts over WEEKS TO QUARTERS — `STAT_ARB_AUDIT.md` explicitly warns this is
a swing/positioning-horizon effect, not an intraday trigger, and selling it as
one would break the house working agreement. A candle-level/intraday version
of mass cross-asset divergence is genuinely new ground, not an extension of
anything already validated — it needs its own IS/OOS/cost proof from scratch.

## 2026-08-10 (cont.) — proposed build order + owner's shape/image idea

Owner asked for a sequencing recommendation across everything above, given
known gaps (current stack is JS + light sklearn/numpy, no torch/deep-learning
infra; real DXY/VIX feeds not wired in; nothing at candle-sequence
resolution yet). Recommended order, cheapest+most-proven first:

0. **Foundation (infra, no edge claim):** extract the `discover.py`-style
   funnel (enumerate -> IS threshold -> OOS same-sign -> cross-instrument
   same-sign -> cost-clear) into a shared, reusable harness — this IS the "ML
   hub" backbone, everything else plugs into it. In parallel: wire real DXY +
   VIX series (currently proxied), prerequisite for the cross-asset work.
1. **Cheapest extensions of what's already partially proven**, still on the
   existing sklearn/numpy/JS stack, no new infra: candle-SEQUENCE mining
   (extends `shapes.py`, which only did single-snapshot shape so far) through
   the funnel; tree-based (XGBoost/LightGBM) interaction search over the
   existing VuManchu panel as the natural next step past `discover.py`'s
   pairwise search.
2. **Mass cross-asset stat-arb scan** — once real DXY/VIX exist, generalise
   `hedgeSignalV2Engine.js` into a scan across the broader universe. Leverages
   already-proven cointegration math, so this is a scale-up, not new-method
   risk.
3. **Owner's "shape processing to trend the future" / image idea** — placed
   last: highest effort (needs a chart-rendering pipeline + a real
   image/deep-learning stack — torch/CNN, not sklearn — none of which exists
   in the repo yet), least proven (nothing here has tested whether "shape" as
   a concept has legs even in cheap symbolic form beyond the narrow
   lower-wick-at-oversold-stack result), and the highest overfitting risk of
   everything on this list (small effective N per the sequence-model caveat
   above, amplified by pixel-space degrees of freedom). Do this once step 1
   has actually shown whether shape/sequence has any signal at all in the
   cheap form — no sense building the expensive version of an idea that hasn't
   cleared the cheap version yet. **Blocked on the owner re-sharing the
   images** referenced in chat — none came through, and "shape processing"
   could mean a few different things (rendered multi-panel candle+VuManchu
   chart snapshots fed to a CNN? a template library of specific chart shapes?
   something else) worth clarifying before scoping it further.