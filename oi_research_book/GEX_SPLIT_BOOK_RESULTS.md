# gex-split-book — results

Prereg: `oi_research_book/GEX_SPLIT_BOOK_PREREG.md` (committed in `264d7df5`, 2026-11-03; amendment A1 pre-results in
`56f1d2ea`). Run 2026-11-03, seed 20261103, B = 10,000. Branch `ccr-1e1f5362-zln3nr`. Ledger id: `gex-split-book`.
Script `oi_research_book/scripts/31_gex_split_book.py` → `data/results/gex_split_book.json`.

## Verdict: NULL

On the 135 days NQ's and ES's dealer books disagree, the NQ−ES range spread does not lean toward the short book once
relative falls are controlled: **β = +0.027, 95% CI [−0.024, +0.078], t 1.02**. The real β sits above 85% of 130
all-shift placebos (mean −0.002, sd 0.026; the 95% gate is not met). Mirror: b₊ = −0.025 (registered > 0, fails),
b₋ = −0.079 (< 0, holds). The CI upper bound is below the +0.10 operational bar, so a book-specific effect of a size
that would matter is ruled out **on these days**.

## Scored cell

| Cell | n (NQ-only / ES-only / agree) | β | 95% CI | Placebo (mean, sd, real above) | Gate | Cell verdict |
|---|---|---|---|---|---|---|
| β, controlled (Δr5, Δr20, Δdd60, ln σ ratio) | 83 / 52 / 635 (770 joined by date and target session) | +0.027 | [−0.024, +0.078] | −0.002, 0.026, 85% | β ≥ 0.05 ✗ · CI > 0 ✗ · placebo ≥ 95% ✗ · b₊ > 0 ✗ · b₋ < 0 ✓ · n ≥ 40 ✓ | NULL |

## Checks

- **Pipeline reproduces the banked numbers** on the same frames: NQ raw ΔDR +0.185, vol-matched +0.288; ES +0.208,
  +0.377 (identical to `gex-range` / `gex-range-es`).
- **Planted signal (A1):** adding +0.15 to the short book's DR on disagreement days raises β by exactly +0.150. The
  bookkeeping is right. (OLS is linear in y, so this checks the coding, not power; the power table in the prereg is
  the power statement.)
- Placebo sd (0.026) is well under the 0.05 gate distance, so the placebo was able to discriminate.

## Descriptive (not part of the verdict)

| | Value |
|---|---|
| Raw ΔS = mean S(NQ-only short) − mean S(ES-only short) | −0.016 |
| Uncontrolled β | −0.008 |
| Mean S: NQ-only short / ES-only short / both short / both long | −0.088 / −0.073 / −0.088 / −0.004 |
| β by half (first / second) | +0.075 / −0.038 |
| Horizon family β: S(D+2) / 3-session / 5-session window | +0.027 / +0.007 / −0.001 |

**Post-hoc (run after the verdict; can only qualify it, not change it):**

- **Disagreement days are weak-book days.** On them, the short book's |GEX| sits at the 29th (NQ) and 27th (ES)
  percentile of that market's own short days, and the long book's at the 22nd and 24th percentile of its long days.
  Disagreement happens when both books are near zero.
- **Both markets widen together on those days.** NQ's DR on NQ-only-short days is 1.066 against 0.893 on NQ's long
  days, but ES widens just as much on the same days, so the spread doesn't move. Something common to both markets
  moves the range on these days; the book that is short doesn't.

## What this changes

- **What we can say:** where the two CME books disagree, which one is short tells you nothing about which market runs
  wider. The per-instrument "short gamma is wider" result is consistent with a common driver, recent falls and their
  vol, that the gamma sign is correlated with, rather than with each market's own dealer hedging.
- **What it does not rule out:** a book-specific effect when a book is **strongly** short. This design can't see
  those days, because both books are rarely strong and opposite at the same time. That is the honest limit of the
  split-book control on the CME monthly/quarterly book (about 5% of Nasdaq dealer gamma).
- **Per the prereg (§8):** the per-instrument effect is treated as the leverage/common-move effect wearing a gamma
  label until a stronger test says otherwise. Agenda Q2–Q5 on the CME book are closed. The book-specific question
  waits for the full Cboe index + ETF capture (`hedging-state-forward`, from 2026-10-19), where books are larger and
  more often strong.
- Nothing live changed; `gex-range` and `gex-range-es` were already research-only.
- **Reopens if:** a strongly-short-vs-long split (e.g. both books beyond their own 50th percentile, opposite signs)
  reaches ~100 days on the forward capture, or the Cboe book shows a book-specific effect.
