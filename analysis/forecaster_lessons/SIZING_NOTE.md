# Sizing: "volatility decides how much" (Lesson 03), where this desk actually stands

*Design note, 2026-10-06. The last open row of the Forecaster Portfolio comparison
(`FINDINGS.md` §0). Written before building anything, to decide whether anything needs
building.*

## What the course says

The course gives volatility forecasts their main job as deciding **how much** to hold, not
which way. Two tools carry it:
- **Volatility targeting:** scale exposure by forecast σ, so risk stays steady (Lesson 01
  §06; Lesson 03 §02).
- **Fractional Kelly on a shrunk edge:** set the size of the risk budget itself. Full Kelly
  is f* = μ/σ². Over-estimating the edge 2× means betting 2× Kelly, which gives zero growth,
  so size on a shrunk estimate and below Kelly (Lesson 01 §03, §06).

## What has already been tested here

| Test | Level | Result |
|---|---|---|
| `forge/IV_SIZING_FILTER_PREREG.md` (2026-09-23) | per trade | IV sizing of motif trades: Sharpe 1.62 / 1.65 / 1.67, inside noise. Vote Atlas slightly worse |
| `forge/VOL_TARGET_PREREG.md` (2026-10-05, a parallel session) | portfolio | **Steadies risk: PASS.** Month-to-month swing in risk 0.63 → ~0.25; worst month −20–25%; same Sharpe. A weak trend book improves (−0.16 → +0.16). **Which σ: does not matter** (live, HAR, IV-adjusted and IV within ~0.03) |
| `MD files/MVE_BOOK_SYSTEM_BACKTEST.md` / `MVE_BOOK_FORWARD_TRACKER.md` | the one validated return stream | The factor-neutral 2Y + 10Y spread book is **already sized to a 10% ex-ante vol target** (5× gross cap), forward-tracked since 2026-09-22 with pre-registered kill rules |

## What that means

1. **The course's sizing idea is already in place where it can matter.** The only return
   stream with a validated edge (the spread book) is vol-targeted and forward-tracked.
   Everything direction-shaped that would need sizing is dead (Vote Atlas, the fade family,
   the motifs after the look-ahead fixes).
2. **Swapping in the new forecasts for sizing would change nothing.** VOL-TARGET shows the
   σ choice is immaterial for sizing: dividing by σ relative to its own median cancels
   level differences. The new forecasts earn their keep on the **lines** (range, stops,
   targets), not on position size.
3. **What vol targeting buys is a smaller worst month, not more return.** That matches the
   course: the same edge, lived along one path with smaller drawdowns.

## The one open item: is a 10% target the right size?

That is the Kelly question. It is arithmetic, not new research:
- Kelly leverage on a book at volatility σ is f* = S / σ (Sharpe ÷ vol).
- The spread book's backtest OOS Sharpe is 1.36 (neutral). Shrunk the way Lesson 01 §04
  advises (a short, partly in-sample record, so a sceptical prior), a working Sharpe of
  about **0.5** is more honest.
- At S = 0.5, full Kelly would run the book at **50% vol**, and half Kelly at 25%.
- **The current 10% target is about one fifth of Kelly.** That is conservative, which is
  right while:
  - the forward record is weeks old;
  - one year of data can only confirm a Sharpe ≈ 1 to within ±1 (the tracker's own note).

**Recommendation.** No sizing build. Keep the 10% target until the spread book's
**REVIEW-DUE** (252 forward days). Re-run this arithmetic then, using the **forward** Sharpe
(shrunk), not the backtest.
- If forward Sharpe holds near the backtest, half Kelly would justify a higher target.
- If it fades, the kill rules already handle it.

## Where the forecasts DO help with "how much": the trade-level stop and target

For discretionary trades, the range forecasts answer "how much room" directly:
- **Stops** placed inside normal noise get hit by noise. The daily IV-adjusted p50/p75
  (and Live Range's projected lines intraday) show what normal noise is today.
- **Targets** beyond today's p90 need a top-10% day. From the bold p75 about 2 in 5 days go
  on to p90 (LINE-TOUCH-REACH).
- **Size per trade** = risk budget ÷ stop distance. With stops sized off the forecast,
  position size automatically shrinks on wide days and grows on quiet ones, which is vol
  targeting at the trade level.

That needs no new model: it is a **use** of what is already live, so it belongs in a
how-to-use guide rather than a build.

*Research and education only. No live sizing changes.*
