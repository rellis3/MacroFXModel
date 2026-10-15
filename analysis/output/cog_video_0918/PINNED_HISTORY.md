# COG-PINNED-HISTORY-CONFIRM results

Run once per forge/COG_PINNED_HISTORY_CONFIRM_PREREG.md.

Holdout: 2024-04-15 00:15:00+00:00 to 2026-04-12, 504 days with both legs and Nasdaq; the quality screen removed 224 days. Pair legs SR3U6 and IH7 (live throughout); April-October = the earlier sample.

## P3 and P1

| test | holdout rho | t | days-clustered SE | n bars | p one-sided (>0) | Apr-Oct rho | t | min detectable rho (2.8 SE, holdout) |
|---|---|---|---|---|---|---|---|---|
| P3 same-hour (1 h line change vs Nasdaq 1 h return) | +0.152 | +5.41 | 0.028 | 37141 | 0.000 | +0.209 | +6.05 | 0.079 |
| P1 primary: divergence (4 h) -> Nasdaq next 8 h | -0.002 | -0.13 | 0.017 | 26918 | 0.551 | +0.111 | +2.63 | 0.049 |
| P1 secondary: divergence (8 h) -> next 8 h | +0.016 | +0.77 | 0.021 | 25025 | 0.219 | +0.093 | +2.16 | 0.057 |
| P1 secondary: divergence (4 h) -> next 4 h | -0.003 | -0.18 | 0.019 | 28578 | 0.570 | +0.065 | +1.26 | 0.052 |

## P2 (holdout): pooled extra chance that Nasdaq turns the same way within 1-8 h after the line turns while it has not

pooled difference +6.7 percentage points, bootstrap SE 0.9, z +7.25, p one-sided 0.000; events counted over the 8 cells 5068; minimum detectable 2.6 pp (2.8 SE); line flips 3157, Nasdaq flips 2473 across the whole window.

| direction, H | events | extra chance (pp) |
|---|---|---|
| -1, 1h | 747 | +3.8 |
| -1, 2h | 747 | +6.8 |
| -1, 4h | 747 | +8.2 |
| -1, 8h | 747 | +6.0 |
| +1, 1h | 520 | +7.3 |
| +1, 2h | 520 | +10.2 |
| +1, 4h | 520 | +6.9 |
| +1, 8h | 520 | +4.0 |

## P2 (Apr-Oct (earlier sample)): pooled extra chance that Nasdaq turns the same way within 1-8 h after the line turns while it has not

pooled difference +8.8 percentage points, bootstrap SE 1.8, z +4.80, p one-sided 0.000; events counted over the 8 cells 1020; minimum detectable 5.1 pp (2.8 SE); line flips 3157, Nasdaq flips 553 across the whole window.

| direction, H | events | extra chance (pp) |
|---|---|---|
| -1, 1h | 151 | +8.7 |
| -1, 2h | 151 | +12.6 |
| -1, 4h | 151 | +9.9 |
| -1, 8h | 151 | +5.1 |
| +1, 1h | 104 | +5.8 |
| +1, 2h | 104 | +10.7 |
| +1, 4h | 104 | +10.2 |
| +1, 8h | 104 | +7.3 |

## Lead grid, holdout (before 2026-04-13): correlation (t) of the line change over W with Nasdaq return over the next H

| W \ H | 15m | 30m | 1h | 2h | 4h | 8h | 24h | 48h |
|---|---|---|---|---|---|---|---|---|
| 15 min | +0.000 (+0.0) | -0.006 (-0.6) | -0.003 (-0.5) | -0.003 (-0.5) | -0.002 (-0.4) | +0.003 (+0.6) | +0.002 (+0.4) | -0.002 (-0.3) |
| 1 h | -0.005 (-0.6) | -0.011 (-1.0) | -0.006 (-0.6) | -0.000 (-0.0) | +0.001 (+0.1) | +0.006 (+0.5) | +0.004 (+0.3) | -0.004 (-0.3) |
| 4 h | -0.005 (-0.8) | -0.005 (-0.5) | -0.003 (-0.2) | -0.003 (-0.2) | +0.018 (+0.8) | +0.023 (+0.9) | +0.029 (+0.9) | -0.006 (-0.2) |

## Lead grid, April-October 2026 (the earlier sample): correlation (t) of the line change over W with Nasdaq return over the next H

| W \ H | 15m | 30m | 1h | 2h | 4h | 8h | 24h | 48h |
|---|---|---|---|---|---|---|---|---|
| 15 min | +0.028 (+2.3) | +0.024 (+2.4) | +0.013 (+1.6) | +0.018 (+1.5) | +0.018 (+1.9) | +0.019 (+1.8) | +0.003 (+0.3) | -0.011 (-1.0) |
| 1 h | +0.017 (+1.7) | +0.013 (+1.0) | +0.013 (+0.6) | +0.021 (+0.8) | +0.029 (+1.2) | +0.036 (+1.5) | -0.002 (-0.1) | -0.035 (-1.3) |
| 4 h | +0.026 (+1.7) | +0.031 (+1.4) | +0.032 (+1.1) | +0.024 (+0.7) | +0.036 (+0.9) | +0.064 (+1.5) | -0.016 (-0.3) | -0.084 (-1.4) |

## Controls for P2 (exploratory, run after the registered result)

### holdout (before 2026-04-13)
C1 (baseline matched on Nasdaq's trailing 1 h move in the event direction, quintiles): pooled excess +5.7 pp, SE 1.0, z +5.98 (registered, unmatched: see P2 above).
C2 (mean signed Nasdaq move after any line flip, vs hour-matched random bars): 1h: -0.003% (z -0.7, n 2597); 2h: +0.002% (z +0.0, n 2495); 4h: +0.002% (z +0.1, n 2422); 8h: -0.011% (z -0.4, n 2214)

### April-October 2026 (earlier sample)
C1 (baseline matched on Nasdaq's trailing 1 h move in the event direction, quintiles): pooled excess +6.9 pp, SE 1.6, z +4.20 (registered, unmatched: see P2 above).
C2 (mean signed Nasdaq move after any line flip, vs hour-matched random bars): 1h: +0.021% (z +1.6, n 545); 2h: +0.024% (z +1.4, n 530); 4h: +0.037% (z +1.5, n 511); 8h: +0.019% (z +0.5, n 469)