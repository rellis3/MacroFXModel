# hy-spread-vol — results

Prereg: `forge/HY_SPREAD_VOL_PREREG.md` (committed in `96aa353d`, 2026-10-22). Run 2026-10-22, seed 20261022, B = 2000.
Branch `main`. Ledger ids: `hy-spread-vol-fx`, `hy-spread-vol-idx`.

## Verdict: CONTEXT (fx) · CONTEXT (idx) — gate met, demoted by A1

After high yield underperformed Treasuries over 20 sessions (HYG/IEF), the next 5 days of volatility ran above what the previous 20 days predicted, across the scored window 2007-06 → 2020-07. The window does not overlap the 2023–26 lead.
- **FX +8.2% [+3.1, +14.1]**.
- **Indices +39.8% [+28.5, +53.4]**.

Both cells met every registered gate condition. **The mechanism check then showed it is the equity leverage effect, not credit.** The HY signal moves with the S&P's 20-day return (r −0.77 / −0.79). With that return controlled for, HY adds nothing (partial r −0.02 / +0.02), and the S&P return alone predicts the extra vol better. So both cells are recorded as CONTEXT (amendment A1).

## Scored cells

| Cell | Days | Top − bottom tercile | 95% CI | Halves | Ex 2008-09 | Placebo 95% | Holm p | Gate | Banked |
|---|---|---|---|---|---|---|---|---|---|
| fx (7 USD pairs) | 3,984 | +8.2% | [+3.1%, +14.1%] | +9.8% / +6.0% | +6.7% | [−5.1%, +4.7%] | 0.002 | met | CONTEXT (A1) |
| idx (NAS100, SPX500) | 3,451 | +39.8% | [+28.5%, +53.4%] | +40.3% / +41.6% | +38.6% | [−10.3%, +9.8%] | <0.001 | met | CONTEXT (A1) |

## Mechanism checks (post-hoc, demote only — `har_check.json`)

| Check | fx | idx |
|---|---|---|
| HAR baseline (1/5/22-day vol) instead of the 20-day mean | +7.5% | +26.9% |
| Correlation of H with the S&P 20-day return | −0.77 | −0.79 |
| S&P 20-day return alone vs HAR residual (r) | −0.18 | −0.22 |
| **H after removing the S&P 20-day return (partial r)** | **−0.016** | **+0.019** |
| Same, 2020-08 → 2026-08 | −0.078 | −0.082 |

## Descriptive (not part of the verdict)

- 2020-08 → 2026-08, same construction: fx −3.4%, idx +6.3% (HAR baseline: −2.9% / +4.8%). The effect is much weaker recently.
- JNK instead of HYG (2007-12+): fx +6.7%, idx +38.6%. Gold: +8.4%.

## What this changes

- No credit-spread vol note is added. HY spreads tell the desk nothing about coming volatility beyond what the stock market's own recent fall already says. This closes the HY lead from `credit-leads-equities` and `funding-forecast-error` as explained by equities.
- **The real lead is the leverage effect:** after the S&P has fallen over 20 days, volatility runs above HAR persistence (r about −0.2). The open question is whether the **shipped** forecaster (persistence + IV) already captures it. Implied vol usually does for indices, but FX and the instruments without IV may not. That is a clean next prereg on the vf3 forecast-error table.
