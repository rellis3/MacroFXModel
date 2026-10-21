# net-liquidity-tailwind — results

Prereg: `forge/NET_LIQUIDITY_TAILWIND_PREREG.md` (committed in `21daadb1`, 2026-10-21). Run 2026-10-21, seed 20261021, B = 2000.
Branch `main`. Ledger ids: `net-liquidity-tailwind-spx`, `net-liquidity-tailwind-nq`.

## Verdict: UNDERPOWERED (spx) · UNDERPOWERED (nq)

C.OG's rule: "Net Liquidity = Fed Balance Sheet − TGA − RRP … When it's rising, risk assets have a tailwind." It was tested as a forward claim, point-in-time (first-published ALFRED vintages, signal known by Friday 21:00 UTC), on 786 Fridays 2011-07 → 2026-07.

Weeks with a rising 4-week change in net liquidity were followed by **+0.42 pp** (SPX500) and **+0.39 pp** (NAS100) more return over the next 4 weeks than falling weeks. The sign is right in both halves and survives a one-week lag. But the bootstrap CIs include 0 ([−0.47, +1.32] and [−0.61, +1.55]) and the estimates sit inside the shift-placebo band, so the gate fails. The CIs still reach past the 1 pp useful bar, so the verdict is UNDERPOWERED, not NULL.

## Scored cells

| Cell | Weeks (rising / falling) | Rising mean | Falling mean | Difference (pp / 4w) | 95% CI | MDE | Useful bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| spx | 786 (394 / 392) | +1.09 | +0.67 | +0.42 | [−0.47, +1.32] | 2.0 | 1.0 | 0.72 | UNDERPOWERED |
| nq | 786 (394 / 392) | +1.47 | +1.08 | +0.39 | [−0.61, +1.55] | 2.4 | 1.0 | 0.72 | UNDERPOWERED |

## Controls

- **Shift placebo** (circular shifts of at least 26 weeks): spx [−0.82, +0.82], mean −0.02; nq [−1.09, +1.05], mean −0.04. Centred on 0, and the observed values are inside.
- **Halves** (split 2019): spx +0.47 / +0.39; nq +0.46 / +0.37. Both positive.
- **Lag +1 week**: spx +0.63; nq +0.73. Same sign.
- **By year** (descriptive): spx is positive in 8 of 15 years, nq in 7 of 15. 2020 is strongly negative (−3.6 / −2.6), because the March 2020 crash happened while the Fed balance sheet was already exploding.

## Deviations from the prereg

None. Observation dates before 2011 exist in the first WALCL vintage (2011-07), but they only feed four-week-earlier lookups once they are known, so the primary sample starts 2011-07 as registered.

## Descriptive (not part of the verdict)

- **Same window** (ΔNL4 against the return over the same 4 weeks): spx +0.74 pp, r 0.09; nq +1.12 pp, r 0.14. Even the "moves together" link is weak at weekly resolution.
- **Continuous** (z-scored ΔNL4 against the forward 4-week return): r +0.12 (spx), +0.10 (nq).
- **Other horizons**: 1 week +0.03 / −0.03 pp; **13 weeks +1.27 / +2.00 pp** (overlapping, not scored).
- Excluding 2020: spx +0.56, nq +0.35.
- Gold: −0.20 pp.
- Latest net liquidity: $5.87tn (2026-10-14).

## What this changes

- The today.html liquidity tooltip now cites this test. Net liquidity stays context and is never shown as a forecast.
- The point estimate (~+0.4 pp per 4 weeks, ~5% a year) and the longer-horizon +1.3 to +2.0 pp at 13 weeks are consistent with a slow, small tailwind that one series over 15 years cannot confirm. A 13-week prereg would be the next look, though it has even fewer independent windows, about 60. The forward record (funding_read_v1 plus this definition) is the honest route.
