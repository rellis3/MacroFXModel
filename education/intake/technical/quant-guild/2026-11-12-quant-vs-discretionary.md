# Quant vs Discretionary Trading (QG lecture 54)

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=3gblERSSHXI |
| ReelScribe id | j573nxppwr07he7evx07e7e7a58j29k7 · 62 min |
| Notebook | `2025 Video Lectures/54. Quant vs Discretionary Trading/quant_disc.ipynb` (+ `NVDA_returns.csv`) |
| Recorded | 2025 (library folder 54; exact date unknown) |
| Processed | 2026-11-12 |

## Lesson
Both camps play the same game: choose a **policy** π\* (a set of actions, not one strategy) that maximises risk-adjusted
return in an *uncertain* system. In a *random* system (roulette) the odds are fixed and the law of large numbers pins the
edge. In an uncertain system (elections, poker, markets) the odds are beliefs, not frequencies, and the edge moves over
time. So the optimal policy is **time-variant**, and a fixed rule fitted to one period carries no guarantee into the next.
**Quants** harvest *fixed statistical/structural mispricings* across a cross-section. Their discretion sits upstream in
the research (features, outliers, scoring), and the strategy runs mechanically until the alpha decays.
**Discretionary** traders choose *when* to act. That can be "low touch": a fully systematic engine that the trader switches on and off.
Their justification for forward stability is experience: "if I'm right on average" about the switching.

## Approach
- **Question**: framed as policy choice: maximise E[trade] − λ·Var[trade] (notebook), i.e. Sharpe, not EV alone. Edge via the
  law of total expectation: P(win)·avg win + P(loss)·avg loss.
- **Model choice**: none for the main argument. The one fitted model is a deliberately weak random forest that shows overfitting.
- **Validation**: chronological 60/20/20 train/validation/test split, scaler fitted on train only. Train Sharpe 3.01 collapses OOS.
  His reading: the conditional optimum (fitted on the training data) is not the unconditional optimum, and the gap is the time-variance of π\*.
- **How a discretionary edge becomes testable (his own terms)**:
  1. Make the switch explicit and it becomes a model-informed rule ("then I'm starting to consider another model-informed value… that's still discretionary").
  2. Check the switched book across *separate on-episodes*: "if I'm right on average then I should see similar performance in regimes where I turn it off and turn it back on."
  3. Treat drawdown as evidence against your regime read: "I should turn it back off once I start to observe this drawdown."
  4. For a career, the evidence is repeated success, like the same faces at poker final tables (notebook cell 70: "experience structures stability").
- **When not to test (his claim)**: a blind backtest of a technical indicator can't disprove a discretionary trader who uses
  it selectively. "You can't just run a backtest with a technical and say, 'Okay, this disproves it.' Cuz… I don't have to trade
  that technical all the time." Hence "lack of evidence does not constitute a lack of existence."
- **What each camp gets right / wrong (as he scores it)**:
  - *Quant right*: scientific basis and economic interpretation demanded (notebook: "we demand some economic interpretation of these mispricings"). The edge is structural and repeatable across many names. *Quant wrong/risk*: alpha decay, crowding, capacity, regime change, data, tech and regulatory risk. "Market-neutral" is not "risk-free". The strategy is not set-and-forget.
  - *Discretionary right*: adapts π\* to regimes, and can turn a negative raw edge positive by selection (poker fold equity, technicals "at the right time").
    *Discretionary wrong/risk*: behavioural, fatigue, information, concentration and liquidity risk. The low barrier to entry makes it "very easy to act with negative EV".
  - *Barrier*: quant has a high barrier, so it is "harder to act at all" but easier to act with +EV. Discretionary is the reverse.
  - *Default for most people*: buy and hold is "the only reasonable fixed policy function".
- **Costs**: named (turnover, transaction costs for the sentiment L/S) but never modelled.
- **Habit**: run several strategies, not one. Quants keep adding to a "portfolio of alphas" as old ones decay.

## What the code actually does
- **The only real-data cell** (42) is NVDA daily OHLC. Features = `Close/High/Low.diff(1..5)` (price-level differences, not
  returns). Target = next close up. A `RandomForestClassifier(n_estimators=7, max_depth=2)` (the comment says
  "max depth=None", so the comment and the code disagree). Payoff = **±1% fixed** per call. Sharpe = √252·mean(r − 2%/252)/sd.
  So the "Sharpe 3.01" is a hit-rate statistic with a synthetic payoff. Costs, position size and real returns are all absent.
- **Everything else is simulated with `np.random`**: the election 80/20 vs a "true" 70/30, poker AA 46% → 60%, the vol-surface
  reversion wealth path, the 2020–22 sentiment decile chart (`returns = 0.0003·(sentiment−50) + noise`) and the
  "Sharpe ~2.75" long-short (`target_annual_vol = 0.073 # To achieve ~2.75 Sharpe`). They illustrate his points. They are **not evidence** of his
  trading results, even though the video presents them in the first person ("that is my trader wealth path").

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Markets are uncertain, not random; edge is time-varying, so π\* is time-variant (QG) | method | ALREADY DO in part: horizon-reversion, vol-layer and regime work treat σ as time-varying. Direction edges are tested per half/year (e.g. fx-factor-stack halves) |
| 2 | "Lack of evidence does not constitute a lack of existence" (QG, 21:30) | method | ALREADY DO: the verdict words separate UNDERPOWERED from NULL. NULL needs the CI to exclude the bar (`research-protocol`, fx-factor-stack A1.5) |
| 3 | A blind backtest of a technical can't disprove its discretionary use (QG) | method | PARTLY ON FILE: `forge/COG_SETUPS_PREREG.md:77` already says a null on the mechanical rule leaves "something we can't see (his macro gates / discretion), and we say so". What differs: QG treats that as the end of the matter. We can test the *selection policy* from an ex-ante log (card below) |
| 4 | His vol-surface reversion system works only when the market *perceives* vol as high, and "high" is relative to recent history (QG) | trading | ALREADY DO the relative framing: `forge/OVERNIGHT_VOL_REGIME_PREREG.md` uses an own-history 252-day percentile; horizon-reversion uses σ vs its 250-day level. Heston-dislocation reversion itself: UNTESTED and out of scope (no surface-fitting engine here) |
| 5 | Overfit ML: train Sharpe 3.01, OOS collapses (QG, 28:23) | method | ALREADY DO: lockbox ≥ 2026-08-21, walk-forward, DSR/PBO in `js/harness` |
| 6 | Text sentiment gives non-reversing cross-sectional return predictability (Tetlock; Loughran-McDonald; Antweiler-Frank) (QG) | mechanism | UNTESTED here. The desk has no equity cross-section or text pipeline. Not carded |
| 7 | Buy and hold is the only reasonable fixed policy (QG, 30:08) | method | ALREADY DO: B1 buy-and-hold is a standard baseline (`forge/DIRECTION_BAR_PREREG.md`) |
| 8 | Discretion can make a raw negative edge positive (AA 46% → 60%) (QG) | mechanism | Illustration only. See ISSUES: the poker arithmetic is wrong |

## What we could learn
- **The desk's position, in his frame.** C.OG is a discretionary trader whose π\* includes gates we can't see. Our nulls on his
  mechanical rules (`cog-setups-direction`, the G3 direction gate) refute the *fixed* rules, not his policy. That is what we already say. What we **don't do** is
  test a discretionary policy at all. QG's own test (similar performance across separate on-episodes, judged forward) is
  doable here: the forward ledger and paper records already log decisions ex ante. **DON'T DO** → card A.
- **Make the switch explicit when you can.** When the owner's or C.OG's "turn it on" condition can be written down (vol
  high *relative to its own past*, a front-month IV ratio, an event day), it becomes a gate we can test. The desk already has one:
  `vol-curve-front` is exactly a regime switch, and it is VALIDATED for range. **ALREADY DO** (relative vol, own-history percentiles).
- **Drawdown as a switch-off rule** = kill rules. **ALREADY DO** for systematic books (`residual-fx8-forward` R1/R2). There is no equivalent
  for the owner's discretionary trading. Owner's call, not a research rule.
- **Name the edge source** (structural mispricing vs selection skill): REPEAT of lesson #4 (WATCH → second QG source).
- **Several books, not one**: REPEAT of the factor-blend / portfolio-book work. **ALREADY DO**.
- **DISAGREE (partly)**: "TA can't be disproven" is true of an unstated policy and false of a stated one. Any discretionary
  policy that is *logged before the outcome* is falsifiable on its own record. Unfalsifiable-by-construction is the risk he
  himself names ("a lot of fraud and misinformation in the space").

## Research ideas
- **A. Is the owner's on/off switch worth anything?** Variable: an ex-ante daily ON/OFF (plus a reason tag) that the owner logs for one named
  systematic book that already has a forward record (candidate: `residual-fx8-forward`, recorder live from 2026-11-13, so ON/OFF can be scored against the same days' book P&L). Condition: ON vs OFF days.
  Horizon: the book's own holding period. Noise threshold: the difference in mean net return between ON and OFF days, from a block bootstrap.
  State the MDE first, because a year gives roughly 250 days at an unknown ON share. Benchmark: always-on, and a random switch with the same ON share
  (the placebo). Changes: whether discretion earns its place as a *gate* over a systematic book, which is QG's model of
  low-touch discretion and the cleanest way to combine C.OG-style judgement with our systems. Screening: evidence_map "discretionary
  switch regime on off" = 0 entries. The lean record and the direction ledger score direction calls, not gating a book, so PARTLY ON FILE (the
  infrastructure exists). Agenda: none fits; suggest a new `discretion-gates.md` or `portfolio-construction.md`. Forward-only
  by construction (no history of the owner's switches).
- Heston-dislocation vol trading: not carded (no surface engine or options history at that depth here).

## Quotes
- "Lack of evidence does not constitute a lack of existence." (21:30)
- "I overfit it to noise… the optimal policy function, the conditional optimal policy function, is not equal to the unconditional optimal policy function." (28:23)
- "I don't get to dictate what the market perceives as high." (~41:00)
- "I should be updating my interpretation of the regime and I should turn it back off once I start to observe this drawdown." (46:14)
- "It is harder to act at all as a quant trader… but it is easier to act with positive expected value." (55:41)
