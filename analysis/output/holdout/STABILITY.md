# STEP D.1 — parameter stability of the chosen forecast (results)

Pre-registration: `forge/STABILITY_AND_HOLDOUT_PREREG.md`. Persistence form, all 34 instruments, walk-forward folds 0–5, pinball ÷ the refit control (lower = better). Note: rows with too little history for the longest window are dropped in every run's own sample, so the base here can differ slightly from 0.980.

## Verdict: **PLATEAU — stable**

| setting | regime window | misses window | ridge λ | pinball ÷ control | vs base |
|---|---|---|---|---|---|
| base | 250 | 5 | 1.0 | 0.9800 | +0.00 pp |
| regime window 125 | 125 | 5 | 1.0 | 0.9785 | -0.15 pp |
| regime window 500 | 500 | 5 | 1.0 | 0.9809 | +0.09 pp |
| misses window 3 | 250 | 3 | 1.0 | 0.9800 | -0.00 pp |
| misses window 10 | 250 | 10 | 1.0 | 0.9827 | +0.27 pp |
| ridge λ 0.1 | 250 | 5 | 0.1 | 0.9800 | +0.00 pp |
| ridge λ 10 | 250 | 5 | 10.0 | 0.9800 | -0.00 pp |
