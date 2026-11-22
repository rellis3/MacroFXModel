# Exhaustion trading system: architecture plan (NQ, GC, 6E futures)

Drafted 2026-11-19. **Plan only: nothing here has been built or run.** It follows the eight released lessons of
C.OG's "Case Study: The Forecaster Portfolio" (`education/forecaster-portfolio-case-study/LESSON_01..08`, read in
full) and sits on top of the vol runbook (`plans/VOL_EXHAUSTION_RUNBOOK.md`), where the ladder and exhaustion work
already live.

## 0. What the lessons give us, and what they don't

**Stated by C.OG (the lessons):**
- The system is built in **seven layers**. Layer 3 is volatility forecasting and another layer is meta-labelling. The
  other five are proprietary, and the course says it will never describe them (L3 §01, L4 §05).
- Volatility can be forecast and direction almost can't. A risk forecast is turned into exposure decisions (L3 §02).
- The record is **10 legs in two books**, with average correlation 0.000 and about 9.5 effective bets (L6).
- Daily simple returns, before costs, Jan 2022 → Jul 2026: Sharpe 3.51, volatility 29.7%, 50% winning days, win/loss
  1.83, daily skew +0.97, worst drawdown −17.25% (L1, L8).
- Built in **5 versions** on research years 2022–25, with **2026 held out** and looked at once. The version that went
  backwards is kept in the record (L7).
- Data: futures with raw contracts that are never edited, rolls handled in code, screens that flag and never change
  values, hashed datasets (L5).
- Validation is a 12-check list, run in a set order (L1 §05).

**What they do not give:** any entry rule, any statement that a leg trades exhaustion, any stop or target, any
instrument list.

**Ours (inference):** the exhaustion mechanism, the VWAP target (Jordan's idea) and every trade spec below. The lessons
supply the build order, the architecture and the tests each piece must pass. They don't supply the edge.

**What his record tells us to aim for (our arithmetic from his numbers):**
- **Per leg:** a portfolio Sharpe of 3.51 from 10 legs at correlation 0 means each leg is only about **1.1 gross**
  (3.51 ÷ √10). His legs are individually modest. The portfolio does the work.
- **Payoff shape:** about half the days are winners, wins average 1.83× losses, and skew is positive. That means
  frequent small losses and fewer, larger wins. A near-target, wide-stop fade has the opposite shape: high win rate
  and negative skew. **So an exhaustion leg must be built for positive skew:** a tight stop that proves us wrong just
  past the exhaustion zone, and a target well away.
- **Our ceiling:** three instruments give at most √3 ≈ 1.7× one leg's Sharpe at zero correlation. Fade and
  continuation books on each would give six legs, but they share instruments, so they won't be at zero correlation.

## 1. The finding that shapes the plan

From our own banked studies (this branch, 2026-11-19):
- `ladder-v2-nq/gold/eurusd`: VALIDATED on CFD and futures. The lines are now regime-correct.
- `exhaustion-v2-nq/gold/eurusd`: VALIDATED. P(further travel after a touch) depends strongly on the clock: next
  rung about 61–67% before 07:00 and 21–26% after 16:00, against a flat ~45%. The logistic blend X7 cuts the miss
  from ~11pp to ~3.5pp.
- **However, X2 (a random walk on the vol clock) nearly matches X7:**

  | | X2 miss | X7 miss |
  |---|---|---|
  | NQ | 3.45pp | 3.37pp |
  | Gold | 4.08pp | 3.67pp |
  | EURUSD | 4.20pp | ~3.8pp |

  On EURUSD, real lines travel exactly as X2 predicts (46.1% vs 45.8%).

**What that means:** most of the exhaustion we can measure is *time running out*, which is geometry. Under the
optional-stopping theorem, a trade priced off a random walk has zero expected value whatever its stop and target.
The only tradeable part is where the conditional probability **moves away from X2**, by more than costs, after
paying for the geometry of the trade. This is C.OG's "find the noise threshold, read against a benchmark" step, and
it is **Gate A** below. It sits before any trade logic, so a null costs days, not months.

## 2. What is new, compared with the ~30 fade nulls already banked

The prior nulls are in `project_range_book_eurusd`, `futures-exhaustion-vwap` (0/117), `vwap_extension_phase2` and
`line_touch_wide_scan`. This plan differs from them in five ways:
1. **Regime-correct v2 lines.** The old lines were too narrow on quiet days, so fades sold moves that should have
   gone further.
2. **A calibrated probability for each touch** (X7), not a raw touch. That allows EV gating per trade.
3. **Confirmation entries** using the `reversal-zones` definitions (R = 0.25/0.5σ pullback from the post-touch
   extreme). The largest odds shift ever found here was "back inside after 15 min → 23% continue".
4. **Positive-skew geometry on purpose, judged as daily legs (L8),** not as mean R per trade.
5. **Futures-only inputs:** exchange volume, session VWAP, aggressor flow and exchange costs.

The honest risk is that it is still geometry. Gate A exists to find that out cheaply.

## 3. The plan, stage by stage

Each stage names the lesson it comes from. **Gates** are pass rules written down before the data is looked at. They
are statistical stopping rules, not owner review points.

### Stage 0: Charter, search budget, holdout  (L2, L4 §06, L7)
- One register row, `exhaustion-system`, treated as **one research direction** with a stopping rule. At most **5
  builds**, like C.OG's five. Each build is a full spec fixed at a date, with its SHA-256 committed before it runs
  (c = H(spec ‖ nonce)).
- **Log every variant, including the builds that go backwards.** The trial count feeds the deflated Sharpe in Stage 8.
- Before any run, compute the expected best-of-N flattery for the grid size: 1.16 SE for 5, 1.67 for 13.
- **Windows:**
  - **Build:** 2018 → 2024, walk-forward.
  - **Validation:** 2025-01 → 2026-08-21. This tier is weaker. The exhaustion and reversal studies have *described*
    it, but no trade has been scored on it. Say that openly.
  - **One-shot holdout:** the lockbox after 2026-08-21 plus the forward record. Examined once, with the build frozen.
- No timetable (L2). Use the 3×-median stopping rule per direction instead of dates.

### Stage 1: Futures data  (L5; runbook Phase 0)
- **Fix data holes before a leg is built on that instrument.** GC is missing ~500 days and 6E ~330 days. NQ is clean.
  Report missing days as a share of the calendar, because missing days are not random and that is a survivorship risk.
- **Raw per-contract prices, never edited:**
  - Roll on a volume crossover computed only from activity already seen.
  - Each roll is two priced trades.
  - P&L comes from the contract actually held.
  - Signals come from the held contract or the return index, never across a roll gap.
  - Run the return-index round-trip check.
- **Bid/ask M1** from NT8 `market_data_type` bid/ask bars, so fills happen at the quote and never at the trade print.
- **Costs:** Lucid commission + 1 tick slippage + roll cost, per instrument, in σ units.
- **Signature plot** (vol at 1/2/5/15/30 min) to choose the decision bar. Pick the finest bar that isn't
  noise-inflated (L5 §04).
- `forge/data_screens.py` flags each dataset, and the dataset hash goes into every `results.json`.
- **Pre-flight cost gate (before anything else):** at the chosen bar and stop size, cost ÷ stop in R. Above ~0.15
  spread/ATR nothing in this repo has ever survived (`execution_feasibility_gate`). 6E at 1–5 min is the risk case.
  Compute it first.

### Stage 2: The scorecard, built before the strategy  (L1, L8)
- One generic harness (extend `forge/evaltools.py`) that takes **daily simple returns on a notional account**, gross and
  net, per leg and combined. Build it before any strategy exists, so the strategy can't shape how it's scored.
- **Outputs:**
  - Sharpe with SE (skew/kurtosis), PSR, minimum track length
  - Lo autocorrelation check
  - block-bootstrap fan (mean block 10)
  - loss frequency by day/week/month/quarter vs Φ(−S√h)
  - equity curve, drawdown, time under water vs synthetic strategies of the same Sharpe, spell histogram
  - monthly heatmap (worst month read first) and annual bars
  - K-ratio, and the Bayesian-shrunk Sharpe (prior mean 1.0)

### Stage 3: Volatility forecast  (L3; done)
- Freeze the `ladder-v2` winners (NQ har_rv_log; GC HAR-RV 5-min; 6E SHAR). **No new forecast variants** (stopping
  rule).
- Add two descriptive numbers per instrument:
  - the GARCH half-life of a vol shock (L3 §02)
  - the jump share of variance (L3 §03)

  Both feed Stage 7, not the entry.

### Stage 4: The exhaustion map, then Gate A  (our layer; "construct, condition, sweep, noise threshold, benchmark")
- **Inputs:**
  - `exhaustion-v2` X7 probabilities (banked)
  - `reversal-zones` overshoot bands and reversal-first shares (in flight; wait for it)
- **Variable:** for each touch, `edge = P_X7(reversal first) − P_breakeven(stop, target, cost)`. Shown beside it:
  `P_X7 − P_X2`, the part that isn't geometry.
- **Map axes:** instrument × rung (EXT p75/p90, CLOSE p75) × London bucket (00–07, 07–12, 12–16, 16–22) × candidate
  geometry. Sweep horizons from 15 min and 60 min to the 22:00 close.
- **Gate A (fade leg):** at least one cell where `edge > 0` with a 90% CI that excludes 0 in both build halves, after
  BH across all map cells, **and** where `P_X7 − P_X2` carries the edge.
  - **If no cell passes:** stop the fade leg. Exhaustion is then used only as an input to other legs: smaller targets
    late in the day, stand-aside for continuation trades, size. That is still a real result.

### Stage 5: The primary decision, a small fixed family  (L3 "one job per layer")
Only for cells that pass Gate A:
- **Trigger:** touch of the rung, then a confirmation option:
  - none
  - an R = 0.25σ pullback from the post-touch extreme
  - back inside the line after 15 min
- **Entry:** the bar after the confirmation, at bid/ask. Never the same bar (L5 §03).
- **Stop:** structural, just past that cell's reversal-zones overshoot p75. This is the "proved wrong" point.
- **Targets**, fixed in price at entry. Moving targets are a known artefact. Candidates:
  - the rung behind
  - the session VWAP frozen at entry (Jordan's idea)
  - the London open
  - a time exit
- **Geometry rule:** target ≥ ~1.8× stop, for the skew target in §0.
- **Size the grid in advance.** For example, 3 instruments × 2 rungs × 3 confirmations × 3 targets = 54 cells, with
  its best-of-N bound written in the prereg.
- **Book B, continuation,** is built from the same map (high P(further travel), early-day buckets). Rule A
  (rich-IV breaks) already lives there. Two books from one map mirrors the shape of his record. Whether his books
  split this way is our inference.
- **Gate B:** gross daily Sharpe per leg has a CI lower bound above 0 in both halves. Then **Gate C:** the same net of
  Stage 1 costs.

### Stage 6: Meta-labelling  (L3)
Only if a leg passes Gate C:
- A second model scores P(this trade works), which decides act / skip / size. The primary's direction is never changed.
- **Features**, all point-in-time:
  - VWAP extension at entry. This is the repo's one transferable risk filter: MAE z ≈ 5, P&L z = 2.33.
  - IV/RV richness
  - a release still to come
  - range used
  - H1 counter-trend
  - aggressor delta at the touch (futures)
- **Method:** purged walk-forward with an embargo; effective sample from label uniqueness.
- **Prior warning:** past meta-label attempts died of sample size, so report effective n first.

### Stage 7: Sizing and risk  (L1 §06, L3 §03, L6)
- **Per leg:** volatility-target each leg to the same risk budget. Use half-Kelly from the **shrunk** Sharpe, because
  estimation error makes full Kelly act like 2× Kelly.
- **Jump risk:**
  - no positions held across releases or weekends, or sized down (stop-risk map: p99 2.1R across weekends, 1.6R at
    releases)
  - micro contracts (MNQ/MGC/M6E) for fine sizing
- **Portfolio checks:**
  - correlation matrix and Marchenko–Pastur spectrum
  - effective bets by participation ratio
  - joint worst-5%-day count vs k²/T, and each book's P&L on the other's worst days
  - Forbes–Rigobon for any correlation measured in stress
  - correlation set to 1 as a stress scenario
- **Allocation:** equal risk contribution across legs.

### Stage 8: Validation, in the course's order  (L1 §05, L7)
1. Significance: t-stat, PSR, minimum track length.
2. Search priced: deflated Sharpe using the Stage 0 trial count.
3. Plateau: neighbouring stop/target/confirmation settings. A plateau, not a peak, like his 64 variants.
4. +1 bar delay check.
5. Block bootstrap of the daily P&L, with the realised drawdown's percentile.
6. Regimes: 2018–19, 2020, 2022 tightening, 2023–24, read against the few regimes the record contains (L5 §05).
7. Gross → net.
8. **One look at the holdout.**
9. Forward paper record with a power calculation for detecting decay.

Read the pattern of passes and failures as a diagnosis (L1 §05):
- significant but not general → overfit
- general in sample but fails out of sample → the relationship changed
- survives the holdout but fails the bootstrap → rests on one episode
- passes gross but fails net → too small to trade

### Stage 9: Reading the record  (L8)
- **A site page** (with a commandHub shortcut) per leg and combined:
  - equity curve on a $200k notional, simple returns
  - drawdown, with time under water against same-Sharpe synthetic strategies
  - spells histogram
  - monthly heatmap and annual bars
  - build history showing all builds, including any that fell back
- Gross and net side by side.

### Stage 10: Forward  (L4 §06, L16 preview)
- Shadow paper record of the frozen build, with its hash published before it starts.
- Lockbox protocol limits how often it is looked at.
- Nothing goes live until the owner chooses.

## 3b. Same system as the Vol-Layer page (added 2026-11-19)

C.OG's 28/09/2026 Discord thread (`education/cog_inbox/2026-09-28-market-movers-vol-forecaster-as-a-layer.md`) is the
source of `vol-layer-system.html`. It describes the same architecture as Lesson 3: the forecaster is one layer of
"something like 6"; "conditional views and then other layers supporting it"; "not quite possible to match what I'm
doing by using purely a vol forecaster". So this plan is **not a separate track**. Each stage maps onto a vol-layer
tab and reuses what that tab has already banked:

| Stage here | Vol-layer tab | Already banked there | Use here |
|---|---|---|---|
| 3 Vol forecast | 1 Vol state (five fields) | RV5 +1.2% validated; forecast error +0.39σ beyond σ | Publish the five fields per instrument; X7's ρ (realised so far ÷ expected) is the intraday forecast-error field |
| 4 Exhaustion map | 4 Conditional views | Views 0/993 vs a random-walk null | **The exhaustion map is the conditional view.** Gate A is the same test as tab 4: beat the random walk |
| 5 Stops/targets | 7 Stop orders | Recipe that holds: σ + vol-clock time left + spread + weekend; no market-wide noise threshold | Stop = overshoot band + that recipe; "map YOUR distribution" = the leg's own entries |
| 5 Entry timing | 2 Jumps | No trade right after a burst; own bursts revert, market-wide ones continue | Skip entries inside a burst; separate own from market-wide |
| 6 Meta-labelling | 5 Meta-labelling | Side-picking AUC 0.52–0.58, loses net; null review: "wrong primary" | Run on the exhaustion leg, the primary he means |
| 7 Sizing | 6 Black-Litterman | Blocked: BL needs a mean view, and a range forecast has none | The fade leg supplies a signed view, which unblocks it |
| 7 Portfolio | 3 Correlation ÷ variance | Untested (null review row 5) | GC and 6E share the USD factor, so 3 instruments ≠ 3 bets. Split own vol from the dollar share |
| 8–10 | 8 Feedback loop | Spec only | Forecast errors feed sizing and the forward record |

The vol-layer stage 4 note (2026-11-15) says Rule A, with its 0.2σ stop and 72% stopped, was the wrong test bed, and
that the next one needs a **wide-stop base system**. The exhaustion leg with a structural stop beyond the overshoot
band is that base system.

## 4. Order of work and first step

1. Stage 0 charter + Stage 1 pre-flight cost gate (cheap; uses data on disk).
2. Wait for `reversal-zones`, then the Stage 4 map + **Gate A**. This one step decides whether a fade leg exists.
3. Stage 2 scorecard (needed by everything after Gate A, whatever it says).
4. Stages 5 → 10 only through the gates.

GC and 6E data repair (runbook 0.2) runs in parallel. NQ can go first because its data is clean.
