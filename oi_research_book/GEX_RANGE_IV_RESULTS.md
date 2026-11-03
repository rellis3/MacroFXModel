# gex-range-iv — results

Prereg: `oi_research_book/GEX_RANGE_IV_PREREG.md` (committed in `31c7a9e7`, 2026-11-03; script committed in `f4ed8a9d`
before it was run). Run 2026-11-03, seed 20261103, B = 4,000. Branch `ccr-1e1f5362-zln3nr`. Ledger id: `gex-range-iv`.
Script `oi_research_book/scripts/32_gex_range_iv.py` → `data/results/gex_range_iv.json`.

## Verdict: UNDERPOWERED (ES and NQ); implied vol absorbs most of the effect (pre-set rule met on both)

Adding implied vol (Cboe VIX for ES, VXN for NQ, as a ratio to trailing realised) to the return-controlled baseline
shrinks the short-gamma coefficient by **64% on ES and 73% on NQ**. Both shrinkages are clear of zero on a paired
bootstrap. What is left (ES +0.054, NQ +0.044) is inside the noise: neither passes the gate, and neither CI is narrow
enough to call a clean NULL (upper bounds +0.18 / +0.15 against the +0.10 bar). As registered, the label is
UNDERPOWERED, with the absorbed share as the headline.

## Scored cells

| Cell | n | b (B0: returns, drawdown, σ) | b_IV (B1: + implied/realised) | 95% CI | Holm p | Placebo (sd, real above) | Gate | Verdict |
|---|---|---|---|---|---|---|---|---|
| ES (VIX) | 770 | +0.147 (reproduces 27b) | **+0.054** | [−0.070, +0.178] | 0.79 | 0.057, 81% | b ≥ 0.05 ✓ · CI > 0 ✗ · Holm ✗ · placebo ✗ | UNDERPOWERED |
| NQ (VXN) | 770 | +0.165 (reproduces 27b) | **+0.044** | [−0.059, +0.147] | 0.79 | 0.050, 80% | all ✗ | UNDERPOWERED |

## Absorbed share (descriptive, reading rule fixed in the prereg)

| | Δb = b − b_IV | paired 95% CI | share | "IV absorbs most" (Δb ≥ 0.5·b and CI > 0) |
|---|---|---|---|---|
| ES | +0.094 | [+0.023, +0.164] | 64% | **yes** |
| NQ | +0.121 | [+0.068, +0.174] | 73% | **yes** |

**Why:** within each trailing-vol quintile, short-gamma days already carry implied vol about **17–18% higher relative to
realised** (mean log IV/RV gap short − long: ES +0.178, NQ +0.167, every quintile positive, post-hoc check). Options
price those sessions as wider before they open. The IV ratio's own coefficient on DR is large (ES +1.22, NQ +0.95 per
log unit).

## Descriptive

| | ES | NQ |
|---|---|---|
| b_IV with IV in quintile dummies (instead of linear) | +0.041 | +0.058 |
| b_IV with CME `iv30` instead of VXN | — | +0.029 |
| b_IV by half (first / second) | +0.034 / +0.041 | +0.068 / +0.005 |
| Mirror: DR long / DR short | 0.93 / 1.14 | 0.89 / 1.08 |

All sensitivities land in the same place: a remainder of +0.03 to +0.06, below the gate and inside the placebo spread.

## What this changes

- **What we can say:** "short gamma runs wider" is mostly what implied vol already prices. About two-thirds to
  three-quarters of the return-controlled effect goes once IV is in the baseline, and what is left is too small for 770
  sessions to separate from noise. Together with `gex-split-book` (no book-specific effect where the books disagree),
  the CME gamma sign looks like a proxy for a market state that IV and recent returns already capture.
- **For the range lines:** this matches `one-range-forecast` Q2 (gamma adds nothing on top of IV-based lines). There is
  no case for a gamma multiplier on the lines from the CME book.
- **Not ruled out:** a small remainder (≤ ~+0.15), and anything in the full Cboe book (much larger, 0DTE-heavy).
- **Per the prereg (§8):** nothing reopens on the CME book; the question moves to the Cboe capture
  (`hedging-state-forward`). Agenda Q1b (strong opposite books on the Cboe capture) stays parked.
- Nothing live changes.
