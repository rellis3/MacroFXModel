# "Become a relative value trader": dollar-, beta- and vol-neutral pairs

| | |
|---|---|
| Lane / source | informational / crown |
| Speaker(s) | NC = Nicholas Crown |
| URL | https://www.facebook.com/share/r/1Fe2iqZ1hi/ |
| ReelScribe id | j57fcwn9ptmx256ctyjenxb2n98j9pwa · 60 s |
| Recorded | 2026-11-15 (posted), "closer to this Fed meeting" |
| Processed | 2026-11-15 (from the research hub drop box; owner: "interesting idea in correlation and hedging, worth taking further") |

**A repeat of the 2026-11-03 CROWN_WATCH entry** ("Become a statistician"), which already worked the hedge-ratio arithmetic
with the desk's numbers. New here: the caption names all three weightings, and the clip says dollar-neutral.

## Lesson
Relative value means long one thing and short another so the shared market move cancels and you hold the *difference*.
How much of each leg you hold decides what cancels. The caption lists three weightings: **dollar-neutral** (equal money
each side), **beta-neutral** (scale each leg by its sensitivity to the market) and **vol-neutral** (scale by each leg's
volatility). In the clip he says to use dollar-neutral, with RSP vs SPY, NVDA vs SOXX, CRWV vs SOXX and NVDA vs SPY as
pairs to watch into the Fed.

## Approach
- **Question**: "who's getting rewarded": read leadership from ratio charts, not from either price alone.
- **Habit**: keep a few ratio charts open; size the legs by a rule, never by share count.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "You do a dollar neutral… buy 100 bucks of this, sell 100 bucks of that" (NC, clip) vs the caption's three weightings, "each serves a different purpose depending on the exposure we want to isolate" (NC) | method | **ON FILE**: CROWN_WATCH 2026-11-03: dollar-neutral NVDA/MSFT leaves residual beta **+1.10** and 0.39 correlation with the S&P; beta-neutral needs 2.11 MSFT per NVDA, vol-neutral 1.80. Dollar-neutral is only neutral when the two betas match (RSP/SPY ≈ yes; NVDA/SPY no, NVDA beta ≈ 2.1) |
| 2 | Ratios show who leads as the Fed nears (NC) | understanding | Display only. `eqwt` tile (RSP−SPY, `js/marketScan.js`) exists; breadth narrowing predicts nothing (memory `breadth-narrowing-null`) |
| 3 | "The market is about to get narrower" (NC) | call | Dated call: Crown calls-to-score, not scored here |
| 4 | Pairs "pair off… one goes up, one goes down" (NC) | mechanism | Only for the factor you hedged: `spread-sleeve-factor-audit` (CROWN_WATCH 11-03 §2c). The desk's spread-reversion record is weak (`hedge-residual-mr` NULL −1.19 Sharpe net; `ou-bands-fx-crosses` UNDERPOWERED) |

## What we could learn
- The owner's interest (correlation and hedging) lines up with the one desk result here that **works**:
  `hedge-finder-book-es` VALIDATED (the finder's hedge cuts a book's 5% ES by 9.2%, every year). The Hedge finder uses the
  min-variance ratio (β = ρ·sd_X/sd_Y, 60 days). What has never been measured is **which weighting stays neutral after
  you set it**: betas drift, so a beta-neutral pair set today may not be neutral next month.

## Research ideas
- **Which hedge ratio stays neutral out of sample?** Carded: `portfolio-construction` Q5.
- **Pair builder** (display; proposed in CROWN_WATCH 11-03, still unbuilt): any two names, dollar / vol / beta ratios
  side by side with each one's residual beta and S&P correlation. Q5's answer says which of those numbers to trust.

## Quotes
- "It's buy one thing, sell the other. But what ratio?" (0:04)
- "Become a relative value investor to see who's getting rewarded." (0:44)
