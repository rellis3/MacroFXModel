# vol-layer-rule-a-confirm: results

- **Prereg:** `forge/VOL_LAYER_RULE_A_CONFIRM_PREREG.md`, committed in `2bb73c3e` on 2026-11-15.
- **Run:** 2026-11-15, seed 20261115, B = 2000, on branch `main`.
- **Ledger ids:** `vol-layer-rule-a-confirm-s1`, `-s2`, `-s3`, `-z1`, `-k1`.

## Verdict: NULL (2 cells) / UNDERPOWERED (3 cells). Nothing passes.
The four registered overlays were scored once on unseen 2023-01-01 → 2026-08-20, using Rule A's own 1,135 trades and 943 book days with M1 bid/ask fills:
- spread-aware stop;
- vol-clock time-left stop;
- both together;
- σ level floor.

None of them changes the book Sharpe. Every ΔSharpe is between −0.03 and +0.00, and every Holm p is 1.0.
- **S3 and Z1:** the 95% intervals exclude the +0.15 Sharpe bar, so these are NULL.
- **S1 and S2:** the intervals still reach +0.19 and +0.16, so these are UNDERPOWERED, as the power table said they would be.

**The dollar cap (K1):**
- It halves the depth of the worst days: CVaR5 −4.61R becomes −3.71R, a change of +0.90 [+0.51, +1.37].
- But skipping the same number of trades at random on the same days does as well: −3.74R, p 0.19 against 500 random skips.
- It costs Sharpe: −0.14 [−0.49, +0.24].
- Verdict: UNDERPOWERED (amendment A1).

## Scored cells
| Cell | n trades | Estimate | 95% CI | MDE | Pass bar | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|
| S1 spread-aware stop (a = 1) | 1,135 | ΔSharpe −0.009 | [−0.20, +0.19] | 0.31 | p < 0.05, plateau, years | 1.00 | UNDERPOWERED |
| S2 vol-clock stop (p = 0.5) | 1,135 | ΔSharpe −0.029 | [−0.20, +0.16] | 0.25 | same | 1.00 | UNDERPOWERED |
| S3 both | 1,135 | ΔSharpe −0.001 | [−0.12, +0.13] | 0.27 | same | 1.00 | NULL |
| Z1 σ floor (q = 0.2) | 1,135 | ΔSharpe −0.025 | [−0.13, +0.09] | 0.10 | same | 1.00 | NULL |
| K1 dollar cap (c = 2) | 946 kept, 189 skipped | ΔCVaR5 +0.90R | [+0.51, +1.37] | — | p vs random skip < 0.05 | 0.94 (raw 0.19) | UNDERPOWERED |

## Controls
- **Parity:** the bid/ask re-run reproduces the registered mid grid on 1,135 of 1,135 trades, with gross +0.195R in both. In discovery it matched 922 of 922.
- **Plateau (descriptive):**
  - S1 at a = 0.5, 1, 1.5: +0.04, −0.01, −0.00.
  - S2 at p = 0.25, 0.5, 0.75: −0.11, −0.03, −0.02.
  - Z1 at q = 0.1, 0.2, 0.3: +0.02, −0.03, −0.05.
  - All of these are flat around zero; no setting has a peak.
- **+1 lag:** S1 lag −0.04; Z1 lag −0.03. Neither has anything to survive.
- **Years:** no overlay keeps one sign across 2023–2026.
- **K1 benchmark:** the worst days are no better than a random skip of the same number of trades on the same days.

  | | Random skip (500-draw mean) | K1 dollar cap | B0 (no cap) |
  |---|---|---|---|
  | CVaR5 | −3.74R | −3.71R | — |
  | Sharpe | −0.05 | 0.30 | 0.44 |

  - Random skips on the busy days remove Rule A's big trend-day winners. The top 10 trades are 56% of the window's profit.
  - The cap skips the later same-direction USD breaks, so it keeps more of the profit than chance does, but still less than no cap.

## Deviations from the prereg
A1 (post-hoc, demote/describe only): K1's NULL clause ("ΔCVaR5 CI includes 0") cannot be met by any rule that skips trades, because fewer trades always means shallower worst days. The registered benchmark, random skip, is what decides. K1 is not distinguishable from it, so K1 is banked UNDERPOWERED, not NULL.

## Descriptive (not part of the verdict)
- **Rule A itself on bid/ask, one real spread:**

  | Window | Net R per trade | 95% CI | Sharpe |
  |---|---|---|---|
  | 2023–26 | +0.078R | [−0.094, +0.267] | 0.44 |
  | 2020-08 → 2022 | +0.215R | [+0.025, +0.390] | 1.23 |

  The gross mid figure fell from +0.350R to +0.195R. The rule's edge is thinner in the recent window. That is consistent with the forward record being the real test (`rule-a-book-forward`).
- **Stop rate:** about 72% for every arm. Rule A stops out by design, so moving a 0.27σ stop by a spread or a vol-clock factor reshuffles which trades stop without changing the outcome mix.

## What this changes
- **For Rule A:** nothing. The paper arm stays as registered.
- **For the Vol-Layer system:** the stage 3 risk recipe (spread-aware, time-left σ stop, floor, dollar cap) does not transfer to a narrow-stop, same-day break system. It was measured on stops of 0.5σ or more held to 22:00 or longer, and that is where it still applies.
- **To reopen:** a base system with stops of at least 0.5σ, held for a session or more. That is the next stage 4 candidate.
