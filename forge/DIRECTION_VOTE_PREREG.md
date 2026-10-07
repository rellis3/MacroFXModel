# Direction vote at C.OG's lines: do the weak, consistently-ordered tilts add up? (S6)

*Pre-registered 2026-10-07 late evening, BEFORE the rates-residual results (S1–S3) were seen.*

## Why

Every direction test at his lines has ranked trades the same way — with > none > against — but each too weakly to pass:
20-day trend (with minus none +0.019R), yield-spread book (+0.025R), US−DE 2y momentum (+0.029R), post-FOMC dollar drift
(with minus against +0.105R). If these are partly independent, agreement between several should separate trades more than
any one. **Honest caveat:** each component's SIGN was fixed by its own earlier pre-registration, but the decision to combine
them was made after seeing each tilt the right way. That is a mild selection. The real confirmation is forward (paper
record) and the sealed holdout from 2027-01-04; this test can only say whether combining is worth carrying forward.

## Components (signs fixed by their own pre-registrations)

| component | applies to | "agrees with the trade" when |
|---|---|---|
| T20 (COG_SETUPS) | EURUSD, GOLD, NQ | side = sign of the 20-day return to the prior close (London closes) |
| Yield book (DIP_WITH_BIAS) | EURUSD | a yield-spread book EURUSD trade is open over the session and side = its direction |
| 2y momentum (S5) | EURUSD | widening US−DE 2y (63 obs, 2-day lag) and side = short; narrowing and side = long |
| FOMC drift (S4) | EURUSD, GOLD | session in D+1…D+5 after a decision and side = short (dollar up) |
| Rates gap (S3) | EURUSD, GOLD, NQ | |gap| > 0.5 at the fill and sign(gap) = side |

Vote v = (# components agreeing) − (# disagreeing); a component that is silent counts 0.

## Test

Setup A and C trades (`analysis/output/cog_yield_dir/trades.csv`), 2018-02 → 2026-08 (rates-gap coverage). Primary: keep
trades with **v ≥ 2**. PASS: kept mean net R > 0 with month-block 95% interval above 0; kept minus all above 0; positive in
both halves (split 2022-05). Reported: v ≥ 1, v = 0, v ≤ −1 (the ladder should be monotone if the components add);
per setup and instrument; the same vote without the rates gap on 2016-10 → 2026-08.

Output: appended to `analysis/output/rates_residual/RESULTS.md` (section S6); script `scripts/rates_residual/vote.py`.
