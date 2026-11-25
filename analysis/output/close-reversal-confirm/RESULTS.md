# close-reversal-confirm: results

Prereg `forge/CLOSE_REVERSAL_CONFIRM_PREREG.md` (20513766; A1 pre-results 788efabf). Script
`scripts/close-reversal-confirm/run.py` (`summarise` re-runs the tables). Seed 20261125. Files: `results.json`,
`report.txt`, `summary.csv` (every family × lines × rule), `cuts_F.csv` / `cuts_C.csv` (by τ, London hour, touch
number). Per-trade files are not committed.

**Question:** Jordan says "we use the close level as reversing points". Entering at the touch is a coin flip with a
median overshoot of about 0.16σ (`jordan-lines-mae`). Does **waiting for the turn** fix that?
- **C1:** wait for a 5-minute close back inside the line.
- **C2:** wait for price to come 0.05σ back inside.
- **Both:** the stop goes beyond the extreme, and the target is 1R.
- **Coverage:** every touch of Close+ / Close− (median, 75th, 90th), their own QLIKE calc, 2020 → 2026-08-21.
- **Families:** 25 futures (net of 2.5 ticks) and 40 CFDs (gross). Placebo levels are treated the same way.

## Verdicts (Close± lines, 1R)

| | Trade, line (R) | Line minus placebo | Halves (vs placebo) | Verdict |
|---|---|---|---|---|
| Futures C1, 5-min close back | −0.301 [−0.310, −0.292] | +0.013 [+0.004, +0.022] | +0.029 / −0.002 | **UNDERPOWERED** (line edge leans, trade loses) |
| Futures C2, 0.05σ back | −0.252 [−0.262, −0.242] | +0.013 [+0.004, +0.024] | +0.022 / +0.005 | **UNDERPOWERED** (same) |
| CFDs C1 (gross) | +0.000 [−0.005, +0.005] | +0.001 [−0.004, +0.005] | +0.001 / +0.000 | **NULL** |
| CFDs C2 (gross) | +0.024 [+0.019, +0.029] | +0.004 [−0.001, +0.009] | +0.004 / +0.004 | **NULL** |

Reference, entering at the touch (C0): futures −0.219R net, line minus placebo +0.017 [+0.010, +0.025]; CFDs
−0.005R gross, +0.002.

**Graded weight:**
- **Against** the confirmation entry as a trade.
- **Weak** for "the Close± line is slightly better than a random level". On futures, line minus placebo is about
  +0.013–0.017R with every entry, and that includes entering at the touch, so it isn't the confirmation doing it.
  The CFDs don't repeat it.

## Answers to the owner's question (2026-11-25: "the stops are already in a negative position, can we tighten it?")

1. **Waiting for the turn does not shrink the overshoot.**
   - The adverse move in the 60 minutes after entry has a median of 0.165σ (C1) and 0.169σ (C2), against 0.169σ when
     entering at the touch. P75 is 0.31–0.32σ against 0.33σ.
   - The stop gets tighter (about 0.15σ instead of 0.20σ, because it sits just past the turn).
   - But price runs against the new entry just as far, so the win rate stays at 47–48%.
   - The turn you wait for is mostly noise: a 5-minute close back inside the line predicts the next hour no better
     than the touch did.
2. **Tighter stops make costs the problem.**
   - On futures, gross R is about zero for every entry: C0 +0.001, C1 −0.012, C2 +0.018.
   - With a 0.15–0.20σ stop, 2.5 ticks costs about 0.1–0.3R per trade on most contracts. Rates (ZN/ZB/ZF/ZT) and
     grains are worse, and ZT is over 1R.
   - Only the equity indices carry it lightly: NQ costs 0.02–0.03R, US30 and US2000 about 0.05R.
   - So the tighter the stop, the bigger cost's share. Tightening only works where the tick is tiny next to σ.
3. **The best-looking number is the entry rule, not the line.**
   - C2 on CFDs is +0.024R gross on both halves.
   - But its placebo makes the same (+0.020R): it is a small bounce after any 0.05σ pullback in mid prices, wherever
     the level is.
   - It is smaller than a CFD spread.

## Descriptive pointers (not tested, futures only, not repeated on CFDs)

- Futures, 00:00–07:00 London: line minus placebo +0.05R (C1 and C2). This is the same overnight lean seen in
  `close-level-reversal`, which was put down to drift. CFDs: −0.002 / +0.004.
- Futures, 4th+ touch: +0.04–0.05R over placebo. CFDs: −0.009 / −0.006.
- HL projections (secondary): the same picture. Futures net about −0.23 to −0.27R; CFD C2 +0.031 gross with
  placebo +0.027.

## What it means

- A bare price-turn confirmation does not turn Jordan's close lines into reversing points, and it doesn't cut the
  overshoot.
- The stop the line needs is about 0.3σ (P75) whatever the entry. At that size, the trade needs a real edge from
  something other than the level to beat costs.
- Jordan's "reversing points" edge, if it exists, isn't in price-only confirmation. It would have to come from
  context we haven't tested at these lines, such as order flow at the touch or the state of the day. Or from his own
  trigger, which we don't know.
