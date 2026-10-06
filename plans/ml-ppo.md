# PPO (reinforcement learning) for the forecaster system — what it is, whether it fits, and how we would build it

*Written 2026-10-06. A plan, not a result. Nothing here has been run. Read with `plans/FORECASTER_SYSTEM_BLUEPRINT.md`,
`plans/LAYER_INTERFACES.md` and `plans/LESSON_COMPLIANCE_REVIEW.md`; this plan must obey their rules.*

---

## 1. What PPO is, in one paragraph

Proximal Policy Optimization is a **reinforcement learning (RL)** method. An *agent* watches a *state* (what it knows
now), takes an *action*, and later receives a *reward*. Over many replayed episodes it learns a *policy*: which action
to take in which state to collect the most reward. PPO's particular trick is to change the policy only a little at each
update (the "clip"), which makes training stable. It is the standard, well-behaved choice for this kind of problem.

Machine-learning map, for orientation:

| Type | Learns from | Already used here |
|---|---|---|
| Supervised | examples with known answers | the continue-vs-fade GBM (`FINGERPRINT_RESULTS.md`), layer 6 confidence |
| Unsupervised | structure in unlabelled data | the HMM regimes |
| **Reinforcement (PPO)** | trial and error against a reward | **not yet** |

Supervised models *predict* ("55% chance this touch continues"). RL *decides* ("hold / take half / exit now"), taking
the predictions, the costs and the future path into account.

---

## 2. Is "walk the forecast through the candles and trade continue vs fade" a good use case?

**Split the question in two. The evidence answers them differently.**

### 2a. Choosing fade vs continue at the touch — **not a good use case**

What the research established (fade-continue-book branch; `MD files/TRIAL_LEDGER.md`; blueprint layers 4–6):
- Touches that continued and touches that faded look identical coming into the line on 30 features (every AUC 0.48–0.51,
  `FINGERPRINT_RESULTS.md`).
- A model combining everything sorts touches from 7% to 55% continue, accurately on unseen years — but that knowledge
  comes only from the line, its distances, the clock and the range used, and every decile loses after spread and stalls.
- Layer 4 (path map): real lines race exactly like placebo lines in all 314 cells; what varies is **time left**.

An RL agent learning the fade/continue choice from the same information can only rediscover that, or overfit noise
and look brilliant in-sample. RL does not create information. **We would run it only as a falsification check** (2c below),
never as the product.

### 2b. Managing a trade once it exists, and how much to hold — **a reasonable use case**

This is a sequential decision with a delayed payoff — exactly what RL is built for — and its inputs are the things that
*are* forecastable here:
- how far price can still travel (layer 5, remaining travel, near-pass),
- time left in the London day (the dominant variable in layer 4),
- distance to the next line out and the line behind,
- vol regime / IV ÷ RV (the one input that carried an edge: the rich-vol break rule, live in `paper-record.html`),
- stop risk by condition (layer 7, `forge/STOP_RISK_PREREG.md`).

Concretely: given an open trade (e.g. a rich-vol break), each bar choose **hold / take half / move stop to entry / exit**.
The rich-vol break trades are the natural first target: their result rests on a few large winners, so "when to let it
run vs bank it" is where a better decision could be worth something.

### 2c. Where it sits in the layer system

The blueprint's first rule is **one job per layer, tested against its own standard**. RL naturally fuses decision,
timing and sizing into one black box — the failure that killed Vote Atlas. So:
- PPO is a candidate for the **execution/management part of layer 5–7 only**, consuming the frozen outputs of layers
  3–5 as inputs. It never touches the forecast (layer 3) or the map (layer 4).
- It is scored against **its own standard**: does it manage trades better than a simple frozen rule on the same trades?
  Not "does the final P&L look good".
- It runs as a **shadow** next to the live system. Nothing live changes until the owner chooses
  (`feedback_side_by_side_no_live_impact`). No Vote Atlas data or logic as input.

---

## 3. What we need

### Software (free; none installed yet)
- Python 3 (have), `gymnasium` (the environment interface), `stable-baselines3` (a tested PPO implementation),
  `torch` (CPU is enough for this size). `pip install gymnasium stable-baselines3 torch`.
- No paid data. Everything below already exists locally.

### Data (have)
- M1 history per instrument (`VolRangeForecaster/data/m1`, loaded by `js/volBacktestM1Engine.js`), 2016 → 2026-08.
- The forecast lines for each day — **layer 3's HAR-800 ladder** (the system's preferred forecast), not an approximation
  (`project_export_levels_target`). The research line code (`js/voteAtlasV4Lines.js`) is parity-checked against the
  backtests and can be pointed at the HAR ladder.
- Trade lists to manage: the rich-vol break trades (`scripts/rangebook/asym_build.mjs` BREAK rows; live core
  `js/paperRecordCore.js`, parity-checked 6,568/6,568 trades).
- Implied vol: CVOL file (to 2026-08), settlement IV, CBOE VXN/VIX/VXD/RVX (`analysis/output/rangebook/cboe/`).
- Costs per instrument: `costForPair` (`js/perLineStrategy.js`); stop slippage by condition: layer 7's `stop-risk.json`.

### Compute
A laptop CPU. Order of magnitude: ~30k managed trades × ~600 bars each ≈ 20M environment steps per training pass;
PPO on a small network does this in hours, not days. Several seeds are needed (see §5).

---

## 4. How we would build it (phases, each with its own stop/go)

### Phase 0 — Lock the holdout first (blueprint action A7)
Before anything trains: freeze a **lockbox** (e.g. 2025-07 → 2026-08) that no step of this plan touches until the final
evaluation, once. Train on 2016–2022, tune on 2023–2025-06, open the lockbox at the end. Write the pre-registration
(`forge/PPO_TRADE_MANAGER_PREREG.md`) with the variant table *before* any run (lesson L2: search breadth counts).

### Phase 1 — The environment ("walking the forecast through the candles")
A `gymnasium` environment that replays one trade at a time, bar by bar:
- **Episode** = one trade from its entry bar to the London day end (or until the agent exits).
- **State at each bar** (only information known at that bar's open — same look-ahead discipline as every builder):
  minutes left in the day; range used ÷ HAR p50; layer-5 remaining-travel estimate in σ; open profit in R; distance to
  the next line out and the line behind in σ; IV ÷ RV; H1 trend state; whether the stop is already at break-even.
- **Actions:** hold · exit · take half · move stop to entry. (Small, discrete. A bigger action set = more overfitting.)
- **Reward:** change in net R per step after spread; stop fills use layer 7's loss-given-stop; a small penalty per action
  so the agent does not churn.
- **Parity check (must pass before Phase 2):** a scripted "always hold to 5R/10R or day end" policy run through the
  environment must reproduce the backtest's R for those trades exactly — the same test the paper-record core passed.
- **Future-scramble check:** scrambling bars after the current one must not change the state the agent sees.

### Phase 2 — Baselines (no learning yet)
Score simple frozen rules on the same trades in the environment: fixed 5R/10R; exit at the next line; exit at 17:00;
trail by 0.5σ; break-even after +1R. **The best baseline is the bar PPO must beat.** If the baselines are all equal,
there may be nothing for an exit policy to learn — that is a valid result and would stop the project here.

### Phase 3 — PPO exit manager
Train PPO on 2016–2022 trades, ≥ 5 random seeds, small network (2 × 64), standard PPO settings, early stopping on the
tuning years only. Report per seed — a policy that only works for one seed is noise.

### Phase 4 — The falsification check for fade/continue (optional)
Same environment, but the episode starts at **every line touch** and the first action is **skip / follow / fade**.
Expectation from the evidence: it learns "skip" almost everywhere, or it beats nothing out of sample. If it ever beats
the best baseline on the lockbox, that is a real finding and goes through the full pre-registration on its own.

### Phase 5 — Lockbox, then shadow
Open the lockbox once. If PPO beats the best baseline there (rules below), run it as a shadow on the paper record: it
"manages" each logged rich-vol break alongside the frozen rule, both scored daily, owner decides later.

---

## 5. How we judge it (pre-registered, before any run)

- **Against its own standard:** net R per trade of PPO-managed vs best-baseline-managed **on the same trades**, paired,
  day-clustered bootstrap 95% CI. Must be above zero.
- **Both halves** of the evaluation period, **≥ 4 of 5 seeds**, and on the **lockbox**.
- **Indices:** shorts alone must improve too (no long-drift passes).
- **Deflated Sharpe / variant count:** every reward tweak, state change and setting tried is logged as a variant and
  counted (`plans/SEARCH_BREADTH.md`).
- **One-day-delay check** (compliance review): the result must survive using inputs one day staler.
- **Fills:** spread at the actual hour (00:00–02:00 London is wide); the rich-vol edge is ~one spread wide (Q5 stress).

---

## 6. Pitfalls specific to RL on markets

1. **It finds bugs before it finds edges.** RL is excellent at exploiting any leak in the environment (a look-ahead, a
   too-cheap fill, a same-bar tie resolved in its favour). That is why Phase 1's parity and scramble checks come first.
2. **Overfitting looks like brilliance.** In-sample RL equity curves are meaningless. Only the lockbox counts.
3. **Non-stationary markets.** A policy learned on 2016–22 can break in a new regime; the rich-vol rule itself only works
   from 2020. Report by year.
4. **Seed lottery.** Different random seeds give different policies. Report all of them.
5. **Reward hacking.** If the reward lets it avoid losses by never trading, it will. Measure per trade *and* per signal.
6. **Black box.** Keep the action set small and log the decision per bar, so its behaviour can be read ("it exits at
   17:00 and when 80% of remaining travel is used") — if it learned a rule we can write down, we should test that rule
   directly instead.

---

## 7. Effort and order

| Step | Work | Rough effort |
|---|---|---|
| 0 | Pre-registration + lockbox | ½ day |
| 1 | Environment + parity + scramble checks | 2–3 days |
| 2 | Baselines | ½ day |
| 3 | PPO training, 5 seeds, report | 1–2 days |
| 4 | Fade/continue falsification (optional) | 1 day |
| 5 | Lockbox + shadow page | 1 day |

**Recommended start:** Phases 0–2 only. They are useful even if PPO never happens: the baselines alone tell us whether
trade management of the rich-vol breaks can be improved at all, and by how much a smarter exit could be worth.

## 8. What this will not do

- It will not find a fade/continue entry edge at the lines that the research has shown is not in the price data.
- It will not replace the forecast, the path map or the remaining-travel layer; it consumes them.
- It will not go live. Shadow only, owner's decision afterwards.
