# How to Read Options Chains

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=RrRbz6oXwxE |
| ReelScribe id | j57fe61mdfcty97ameze482t9s8j380x · ~14 min |
| Notebook | none (folder `2026 Video Lectures/105. How to Read Options Chains/` holds only the video link; screen walkthrough of IBKR TWS) |
| Recorded | 2026 (lecture no. 105) |
| Processed | 2026-11-12 |

## Lesson
A walkthrough of the IBKR TWS Option Trader. Calls sit on the left and puts on the right, one expiry at a time, with
in-the-money rows shaded. OTM rows are "more liquid" and the ones you trade. Columns: bid/ask, volume, delta, gamma,
vega, theta, IV. Delta is "a very rough estimate of the probability" of finishing ITM: a model number from the BS
framework that changes through the day. You buy at the ask and sell at the bid, and can't trade at mid. Spreads widen as
liquidity falls and as strategies get more legs. The ATM IV shown is "a compression" of a surface.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | A backtest at mid looks great; "as soon as you take the spread into account... rude awakening"; the more legs, the wider the spread, "the more correct you have to be" (QG) | method | ALREADY DO: `execution-gate` (spread/ATR > 0.15 = dead), costs at 1× and 2× spread in every prereg; vrp-forecast at 0.4/0.8 vol pts |
| 2 | Delta ≠ a convergent frequency (QG) | method | DISAGREE: see the crash-course note (calibration is testable; risk-neutral vs physical is the real gap) |
| 3 | ATM IV is a compression of the surface (QG) | mechanism | ALREADY DO: iv30/rr25/bf25 kept separately; Surface Lab |

## What we could learn
- **Cost scales with structure complexity**: ALREADY DO for single-leg trades. For any future options study, cost per
  leg and the round trip (open + close) must both be counted. Note it in an options prereg when one is written; no rule edit yet.

## Research ideas
Not carded: platform walkthrough.

## Quotes
- "If you begin to backtest your own options strategies... you may see a very nice equity curve... But as soon as you take the spread into account in reality, you are going to be in for a rude awakening."
- "It is a model probability, and we know that all models are wrong, but some are useful."
