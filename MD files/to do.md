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