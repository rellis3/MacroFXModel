<!-- https://cog000.github.io/Yield-Spread-Live-Example-/ | Yield Spread Application — Live Case Study -->
Colez Trades
Quantitative & Macro Insights
C.OG
C.OG
Live Case Study
# The Spread Moved First

February 17-18, 2026 — A real-time example of yield spread leading EUR/USD by 24 hours

The Setup
## Two Days, One Signal

On Tuesday February 17th, the DE-US yield spread began declining early in the session. It fell steadily throughout the day, signaling that the US yield advantage was widening — a fundamentally bearish input for EUR/USD.

**But EUR/USD didn't reprice.** The pair ranged, mean-reverted, gave no directional signal. Spot traders saw noise. The rates market was already telling a different story.

Timeline
## How It Unfolded

Tuesday
17 Feb '26
#### Spread Declines — Currency Ignores

Yield spread falls throughout the session. EUR/USD ranges, mean-reverts intraday. Price action gives no directional signal. The divergence begins.

Tuesday Night
17-18 Feb '26
#### The Gap Widens

Spread continues lower overnight. EUR/USD still hasn't responded to the fundamental shift. The lead time extends to ~12-18 hours.

Wednesday
18 Feb '26
#### EUR/USD Capitulates

The currency finally catches up. Hard selloff throughout Wednesday, accelerating into the close. What the spread signaled Tuesday, price confirmed Wednesday.

Tuesday 17 February
## The Divergence

DE-US Yield Spread Tue 17 Feb
[IMAGE figures/fig01.png] Yield Spread Tuesday
Declining all day — spread compressing from morning through close. Clear directional move lower.

EUR/USD Tue 17 Feb
[IMAGE figures/fig02.png] EUR/USD Tuesday
Rangebound, mean-reverting — no directional follow-through. Spot traders had nothing actionable.

#### ⚠️ The Warning Was There

The spread was falling while EUR/USD ranged. This divergence is the signal. When rates move but spot doesn't follow, the question isn't "if" — it's "when."

Wednesday 18 February
## The Follow-Through

DE-US Yield Spread Wed 18 Feb
[IMAGE figures/fig03.png] Yield Spread Wednesday
Continued lower — spread kept falling, confirming the Tuesday move was structural, not noise.

EUR/USD Wed 18 Feb
[IMAGE figures/fig04.png] EUR/USD Wednesday
Hard selloff — EUR/USD finally repriced. Dropped aggressively through the session, accelerating into the close.

#### ✓ Spread Confirmed

Both instruments now aligned — spread falling, EUR/USD falling. The lag closed. What was a leading indicator on Tuesday became a confirming indicator on Wednesday.

The Lead
## ~24 Hour Advance Warning

#### Signal Timeline

Spread
Declining ↘
EUR/USD
Selloff ↘
Tue AM Tue PM Wed AM Wed PM
The spread began its move Tuesday morning. EUR/USD didn't respond until Wednesday. That's approximately **24 hours of lead time** — a full trading session to position before the currency caught up to what rates were already pricing.

Side by Side
## What Each Instrument Showed

| Timeframe | Yield Spread | EUR/USD | Signal |
| Tue Morning | ↘ Declining | — Flat/Choppy | Divergence forming |
| Tue Afternoon | ↘ Still falling | ↗ Mean-reverting | Divergence widening |
| Tue Close | ↘ Lower | — Recovered | Max divergence |
| Wed Morning | ↘ Continued | ↘ Starting to fall | Convergence begins |
| Wed Afternoon | ↘ Accelerating | ↘ Hard selloff | Full alignment |

#### The Lesson

If you were watching EUR/USD on Tuesday, you saw nothing actionable — rangebound price action, no momentum, no trend. If you were watching the spread, you saw a clear directional move that hadn't been priced into spot yet. That gap between what rates were saying and what FX was doing — that's the edge. The spread gave you 24 hours to position before price confirmed.

Application
## How To Use This

**Watch for divergence.** When the spread moves but EUR/USD doesn't respond, pay attention. The bigger the divergence, the more likely a snapback is coming.

**Don't fight the spread.** If you're long EUR/USD and the spread is falling, you're fighting institutional capital flows. You might be right on the short-term price action, but the fundamental current is against you.

**Use it for confirmation.** Before entering a EUR/USD position, check the spread. Is it confirming your direction? If spread and price are aligned, you have fundamental backing. If they're diverging, proceed with caution.

**Estimate your lead time.** In normal conditions, expect hours to a couple of days. In this case it was ~24 hours. The more orderly the move, the cleaner the lead. In high-volatility regimes — risk-off episodes, central bank surprises, geopolitical shocks — the lag compresses and the relationship becomes more coincident or can temporarily invert.

Next Steps
## Quantitative Lag Modelling

This case study demonstrates the lead-lag relationship qualitatively. The next stage is to model it quantitatively — moving from observation to systematic measurement.

**Rolling lag correlation.** Compute the optimal lag between spread changes and EUR/USD changes over a rolling window (e.g., 60-day). The lag isn't static — it expands in quiet markets and compresses in volatile ones. Tracking the rolling optimal lag tells you how much lead time to expect in current conditions.

**Granger causality testing.** Formally test whether spread changes improve forecasts of EUR/USD changes beyond what EUR/USD's own history provides. Run this on rolling windows to detect regime shifts. Importantly, the causality can reverse — in certain regimes, particularly during risk-off episodes or when FX markets are driving the narrative, EUR/USD may lead the spread rather than follow it. Detecting these reversals is critical.

**Dynamic lag models.** State-space models or regime-switching frameworks that allow the lag structure to vary with market conditions. Volatility, liquidity, and macro regime all affect how quickly FX reprices to rates moves. A static lag assumption will underperform.

**Regime matters.** The spread-FX relationship is not constant. In carry-dominant regimes, the lead is cleaner and longer. In risk-off regimes, both instruments move together or FX can lead. In policy divergence regimes, the relationship strengthens. In liquidity crises, it can break entirely. Any quantitative model needs regime conditioning to avoid false signals.

### The Lead-Lag Delivered

Rates moved Tuesday. FX followed Wednesday. The spread gave you a full session to position before the currency caught up. That's not luck — that's the lead-lag working exactly as it should.
