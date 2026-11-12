# Deep Hedging for Quantitative Finance

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=_U1fj5LF-D8 |
| ReelScribe id | j573wgx5phg1dr09zk09geaaah8j3dce · 36 min |
| Notebook | none: not in the library clone (last commit 2026-08-06); he says "I'm definitely not open sourcing this" of the dashboard |
| Recorded | unknown (after Aug 2026, judging by the library) |
| Processed | 2026-11-12 |

## Lesson
The risk-neutral price is the hedged expectation: Monte Carlo of the discounted payoff converges to Black-Scholes
(Feynman-Kac), and a continuously delta-hedged option bought at fair value makes zero P&L on average. A market maker earns
by quoting around that mid (buy the bid, sell the ask), like a casino's fixed edge, *if* it hedges well. Two problems spoil
it: **model risk** (the simulator is never the market) and **discrete hedging** (rehedging at fixed times gives a lower
expectation and a wider P&L distribution, plus costs). Deep hedging (Buehler et al.) trains a neural policy, state →
hedge, on a market simulator. It maximises a **risk measure** (expected shortfall, entropic risk), not expected P&L, and he
shows its tail beating the static delta hedge during training.

## Approach
- **Framing**: name where P&L comes from (spread edge, not direction) and what destroys it (hedging error, frictions). REPEAT of the playbook's "where does the P&L come from".
- **Objective**: risk-adjusted. "Maximize your expected P&L. That would be like psychotic… we're just going to all triple
  lever up on… memecoins."
- **Evidence and its limit**: the agent learns only what the simulator shows it. "We have to assume a model… it's possible
  that we haven't experienced something." Data scarcity: RL is "finicky", and even a toy grid world took 100 episodes.
- **Statistics**: judge decisions, not outcomes ("good decision, bad outcome"; *Thinking in Bets*). One realisation of
  discrete hedging can beat continuous "purely incidentally".
- **Costs**: continuous hedging means infinite transaction costs; practical desks use gamma bands and no-trade regions.
- **Gap**: no out-of-sample or real-market test is shown; the improvement is "in the model sense", in-simulator only.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Discrete rehedging lowers expected P&L and raises its variance (QG) | mechanism | Standard. Theory Lab `delta-hedging-gamma-scalping` |
| 2 | Deep hedging improves tail risk over static delta hedging (QG) | method | In-simulator only. Desk hedges no options; `neural-sdes-spdes` lesson already mentions deep hedging |
| 3 | Everyone, retail included, is "stepping up to the plate… to assume model risk"; overfitting is the retail framing (QG) | method | Agree in spirit; see lesson #13 (a calibrated output ≠ a valid generator) |

## What we could learn
- **The objective is a risk measure, not the mean**: PARTLY. The desk reports tails (stop-risk map p99 2.1R, Portfolio Book
  drawdown) but most studies select and judge on mean R / Sharpe. WATCH: a second source would make it a lesson.
- **A policy trained on a simulator inherits the simulator's errors**: REPEAT of #13. It also argues for the known-answer and
  convergence checks (#1, #2) on any simulator before something learns from it.
- **Judge the decision, not the single outcome**: ALREADY DO (ex-ante benchmark; playbook "judge ex ante").

## Research ideas
Not carded: the desk runs no option book to hedge. If the OI/gamma bots ever hedge, discrete-hedge cost would be the first question.

## Quotes
- "If we had true dynamics, we wouldn't be building models in the first place."
- "Good decisions can yield bad outcomes. Bad decisions can yield good outcomes in a random environment."
- "Everyone's just stepping up to the plate trying to assume model risk to the best of their ability."
