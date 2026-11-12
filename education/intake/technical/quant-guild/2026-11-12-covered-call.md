# How to Trade the Covered Call

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=iPsPRQlDeTA |
| ReelScribe id | j579xr7947v099hm0p6xewq2518j34ps · ~41 min |
| Notebook | `2026 Video Lectures/106. How to Trade the Covered Call/httcc.ipynb` |
| Recorded | 2026 (lecture no. 106; live NVDA trade ahead of 15 May earnings) |
| Processed | 2026-11-12 |

## Lesson
A covered call is long 100 shares plus a short call. If assigned, you deliver shares you already hold, so the upside
above the strike is capped but never a loss. There are three states at expiry. (1) Between the cost basis and the strike:
you keep the stock gain and the premium. (2) Above the strike: you're assigned, your upside is capped, and you still
profit (sim: $1,000 stock plus $1,686 premium, with $4,102 upside forgone). (3) Far below the cost basis: you carry the full
stock downside, and new calls near spot would lock in a loss (sim: −$2,264 stock, +$1,686 premium = −$578).
"You have all of the downside risk of owning the stock while you cap your upside." He likes it for beginners who'd hold
the stock anyway. Live: NVDA bought at ~216.55, sold the 225 call 25 days out (~40Δ) for $720. Pairs with cash-secured
puts to make "the wheel"; algorithmic version: sell 20–30Δ calls across many underlyings.

## Approach
- **Framing**: enumerate states of the world, not a forecast. Payoff and P&L per state.
- **Evidence**: single random GBM paths, one per state. No distribution, no backtest, no comparison with just holding the stock.
- **Kill rule / risk**: "if you don't have a massive regime change in your underlying". Averaging down is "certainly
  subject for discussion".

## What the code actually does
The simulation prices the call with Black-Scholes at σ = 45% and simulates the stock under the *same* σ with drift r
(risk-neutral). So the short call has zero expected value by construction, and the sim can only show *outcomes*, never
whether covered calls pay. The seed is itself random (`np.random.seed(np.random.randint(0, 1000))`), so no run is
reproducible, and he re-runs until each "state of the world" appears. Whether the strategy earns anything depends on
the variance risk premium (IV vs subsequent RV), which this video never mentions. That question is in
`2026-11-12-volatility-risk-premium.md`.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Covered call = stock downside + capped upside for certain premium (QG) | mechanism | textbook. By put-call parity it equals a short put (not stated in the video) |
| 2 | A good strategy for beginners / algorithmic 20–30Δ selling across underlyings (QG) | trading | UNTESTED here. Equity single names are outside the desk. Cboe BXM is the public benchmark (carded in the VRP note, card 2) |

## What we could learn
- **An illustration simulated under the pricing measure can't show edge.** If the premium is priced at the simulated vol,
  EV = 0 by construction. Any edge claim needs a world where IV ≠ RV. REPEAT of the IV-surface note's lesson (the
  simulation must be able to produce a non-zero answer, and a known zero must come out as zero). Related to #1.
- **A random seed is no seed.** Re-drawing until each state appears is cherry-picking for teaching. Ours fix seeds
  (research-protocol step 3: "one seed for the whole study"): ALREADY DO.

## Research ideas
Not carded separately: the covered-call question for the desk is the VRP question (card 2 in the VRP note uses
Cboe BXM).

## Quotes
- "This covered call is far from a free lunch."
- "Effectively, a covered call is going to give you the downside risk of owning the stock while potentially capping your upside for guaranteed cash flow."
