# Study 3 — intraday relative value: does a lagging market catch up?

Rule: forge/RESIDUAL_INTRADAY_PREREG.md. First |z| ≥ 2 residual between 07:00 and 16:00 London each day; trade the target toward closing the gap; exit when the gap closes, after 60 minutes, or at the day end. Net of spread, σ units.

| pair | median β | trades | win % | net 2016–22 (t) | net 2023–26 (t) | hedged (both legs) | median hold (min) |
|---|---|---|---|---|---|---|---|
| Gold ← USD basket | -0.98 | 359 | 43% | -0.070 (-2.4) | -0.071 (-2.5) | -0.070 (-3.7) | 60 |
| NAS100 ← SPX500 | +1.20 | 194 | 46% | -0.069 (-1.4) | -0.043 (-0.9) | -0.057 (-2.7) | 60 |
| GBPUSD ← EURUSD | +0.76 | 364 | 51% | -0.024 (-1.0) | -0.016 (-0.5) | -0.040 (-2.4) | 60 |
| NZDUSD ← AUDUSD | +0.82 | 322 | 46% | -0.047 (-2.3) | +0.002 (+0.1) | -0.034 (-3.6) | 60 |

Pooled: 2016–22 -0.050 (t -3.4, n 747); 2023–26 -0.033 (t -2.0, n 492); positive on 0 of 4.

**Verdict (pre-registered): FAIL**

Descriptive (not a pass rule): the opposite trade (follow the gap) earns roughly minus these figures before a second spread; it was not pre-registered and is not a finding.
