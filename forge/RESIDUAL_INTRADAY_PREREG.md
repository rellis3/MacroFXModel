# Study 3 — intraday relative value: does a lagging market catch up? (pre-registration)

Committed 2026-09-30 before any number was computed.

## Background (prior results, from the repo)
- Daily currency-network residual (forge/residual.py): pooled OOS t 1.18 — a de facto null.
- NQ vs SPX multi-day spread (forge/residual.py docstring): not cointegrated, lost before costs.
- Lead-lag (MD files/LEAD_LAG_TESTS.md, yield coupling, rates-pivot-lead): coupling is real
  but SAME-BAR only; nothing leads.
Untested: the INTRADAY gap — within one London day, when a market has moved less than its
partner implies, does the gap close within the hour?

## Pairs (target ← partner), 5-minute bars built from local M1, 2016 → 2026-08
1. **Gold ← USD basket** — synthetic dollar index from EURUSD, USDJPY, GBPUSD, USDCAD, USDCHF
   (ICE weights 0.576 / 0.136 / 0.119 / 0.091 / 0.036, renormalised; SEK not available locally).
2. **NAS100 ← SPX500**
3. **GBPUSD ← EURUSD**
4. **NZDUSD ← AUDUSD**

## Residual (all inputs known before the decision)
- β = OLS slope of the target's 5-min log returns on the partner's, over the previous 20 London
  days (excluding today). Fixed for the whole day.
- Today's residual at bar t = Σ (r_target − β·r_partner) over today's 5-min bars before t
  (London midnight onward).
- Scale = the standard deviation of 5-min residual returns over the previous 20 days × √(bars so far).
- z = residual ÷ scale.

## Trade (fixed)
First bar between 07:00 and 16:00 London where |z| ≥ 2: trade the TARGET toward closing the gap
(z > 0 → the target is rich → sell it), filling at the next 5-min bar's OPEN. Exit at the first of:
the residual crossing back through 0 (at the next bar's open), 60 minutes, or the London day end.
One trade per pair per day. Net of the target's `costForPair`. Return in units of the target's
σ·open. Also reported (not a pass criterion): the hedged version (target − β·partner, both costs).

## Pass
No parameter is fitted beyond the causal rolling β. PASS if, pooled over the 4 pairs, mean net
return > 0 with t ≥ 2.0 in BOTH 2016–2022 and 2023–2026-08, AND positive on at least 3 of 4 pairs.

## Causality
The builder aborts unless sampled decisions' β, residual, z and entry price are identical when the
entry bar and everything after it are replaced with a different random walk (target and partner).
