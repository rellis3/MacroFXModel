# Desk Bias Process: widening plan (drafted 2026-11-17)

Status: PLAN ONLY. Nothing built. Code lives on the bias branches (`js/deskBiasProcess.js` is not on `claude/signal-bot-bias-analysis-bwr1qv`; check `origin/claude/one-desk-bias` / `bias-engine-backtest` and what the other session last pushed before editing).

## Problem
1. `PROCESS_MARKETS` is 13 markets, copied from the same-day scoreboard list (7 USD pairs + GBPJPY, EURJPY, gold, NQ, SPX, DOW). It was never chosen as a universe. The macro engine already scores 8 currencies, 28 pairs and 10 assets (~38), so ~25 are dropped.
2. NEUTRAL means three different things: no data, release pending (forced neutral), genuinely balanced. A flat 0 reads as "no data".

## Parts
**A. Widen the universe.** Pairs: all 28 (cross = score(base) - score(quote)). Assets: add silver, WTI, copper, US2000, DE30, UK100. Needs per-market entries in: structure candle map (13 today), event currency map, positioning (COT may be empty; must not block), scoreboard (may not cover; mark "no same-day layer").
**B. Lean + conviction instead of flat NEUTRAL.** Always output a lean; conviction tag LOW/MED/HIGH. NEUTRAL only when macro and structure genuinely disagree.
**C. Release-pending becomes a flag + conviction cut**, not a forced neutral.
**D. Every call carries a stated reason code:** NO_DATA / RELEASE_PENDING / DISAGREE / BALANCED / OK. UI shows the code, never a bare 0.

## Order of work
1. Reason codes + lean/conviction (B, C, D) on the existing 13. No universe change, so any change in output is attributable.
2. Widen universe (A) in tiers: 28 pairs first (derived, cheapest), then assets.
3. Score the new markets forward only through the existing head-to-head harness (one fixed trade rule). Prereg first: widening is not allowed to change the verdict on the original 13.
4. Side-by-side rule: shadow, never edit live calcs. New markets are marked "preview" until they have a forward record.

## Evidence bar (from the Misc/ dashboard review, 2026-11-17)
The dashboard's own walk-forward on 11 instruments: combined score IC ~0.06, hit 53% vs base 53-58%, tape-only Sharpe -0.56, "dashboard now" mix 0.49 and a different mix 0.17: results swing with the weights, so no weight set is trusted. Widening to 38 markets will not create edge; its job is coverage and honest labelling. Do not present new-market calls as validated.

## Open questions for the owner
- Does the one-desk-bias rule ("desk call = the one lean") still hold? Part B changes what NEUTRAL means there.
- Which new assets matter first (silver, WTI, DE30, UK100)?
