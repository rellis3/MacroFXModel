# post-release-drift-pooled — results

Prereg: `forge/POST_RELEASE_DRIFT_POOLED_PREREG.md` (committed in `3849e8a7`, 2026-11-14). Run 2026-11-14, seed 20261114, B = 2000, sign flips 20000, placebo replicates 2000.
Branch `claude/signal-bot-bias-analysis-bwr1qv`. Ledger ids: `post-release-drift-pooled`, `post-release-momentum-pooled`.

## Verdict `post-release-drift-pooled`: UNDERPOWERED

Registered gate (prereg §4, conditions 1-7, continuation or reversal) per cell; Holm over 4 horizons. Headline h2 (21:00 UK): -0.049σ [-0.111, +0.012], n = 374 events, Holm p 0.4362, placebo percentile 0.9. Cell labels: h1 underpowered, h2 underpowered, h3 underpowered, h4 underpowered.

| Cell | n | Estimate (σ) | 95% CI (event-cluster) | MDE (placebo) | Pass bar | Holm p | t | Gate (cont / rev) | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| h1 | 383 | -0.024 | [-0.059, +0.010] | 0.030 (POWERED) | 0.05 | 0.4525 | -1.37 | 0000000/0010011 | underpowered |
| h2 | 374 | -0.049 | [-0.111, +0.012] | 0.065 (POWERED) | 0.10 | 0.4362 | -1.59 | 0000000/0010011 | underpowered |
| h3 | 373 | -0.036 | [-0.103, +0.030] | 0.080 (POWERED) | 0.10 | 0.6017 | -1.09 | 0000000/0000001 | underpowered |
| h4 | 383 | +0.039 | [-0.087, +0.169] | 0.207 (UNDERPOWERED) | 0.20 | 0.6017 | +0.57 | 0000001/0000000 | underpowered |

Gate string = conditions c1..c7 as 1/0 (c1 Holm p, c2 bar, c3 placebo 97.5/2.5 pct, c4 halves, c5 top-1% clusters removed, c6 drift-adjusted β, c7 ≥ 3 of 5 instruments); continuation / reversal.

## Verdict `post-release-momentum-pooled`: NULL

Registered gate (prereg §4, conditions 1-7, continuation or reversal) per cell; Holm over 4 horizons. Headline h2 (21:00 UK): -0.031σ [-0.082, +0.019], n = 374 events, Holm p 0.7440, placebo percentile 0.7. Cell labels: h1 underpowered, h2 null, h3 null, h4 null.

| Cell | n | Estimate (σ) | 95% CI (event-cluster) | MDE (placebo) | Pass bar | Holm p | t | Gate (cont / rev) | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| h1 | 383 | -0.026 | [-0.056, +0.002] | 0.025 (POWERED) | 0.05 | 0.3214 | -1.79 | 0000000/0010011 | underpowered |
| h2 | 374 | -0.031 | [-0.082, +0.019] | 0.057 (POWERED) | 0.10 | 0.7440 | -1.25 | 0000000/0010001 | null |
| h3 | 373 | -0.008 | [-0.063, +0.044] | 0.071 (POWERED) | 0.10 | 1.0000 | -0.30 | 0000001/0000000 | null |
| h4 | 383 | -0.004 | [-0.122, +0.120] | 0.171 (POWERED) | 0.20 | 1.0000 | -0.07 | 0000000/0000001 | null |

Gate string = conditions c1..c7 as 1/0 (c1 Holm p, c2 bar, c3 placebo 97.5/2.5 pct, c4 halves, c5 top-1% clusters removed, c6 drift-adjusted β, c7 ≥ 3 of 5 instruments); continuation / reversal.

## Controls (placebo, drift, concentration, sensitivities)

| id | h | placebo mean | placebo 2.5-97.5 | pct | halves | top-1% removed (p) | β drift-adj [CI] | last 3y | instruments |
|---|---|---|---|---|---|---|---|---|---|
| drift | h1 | +0.001 | -0.017 .. +0.018 | 0.4 | +0.092 / -0.036 | -0.013 (0.409) | -0.026 [-0.062, +0.008] | +0.003 | eurusd -0.02, gbpusd -0.02, gold -0.03, nq -0.02, usdjpy -0.03 |
| drift | h2 | -0.002 | -0.040 .. +0.039 | 0.9 | +0.039 / -0.058 | -0.036 (0.228) | -0.052 [-0.116, +0.010] | -0.003 | eurusd -0.04, gbpusd -0.04, gold -0.04, nq -0.11, usdjpy -0.02 |
| drift | h3 | +0.001 | -0.045 .. +0.048 | 6.3 | +0.044 / -0.045 | -0.026 (0.441) | -0.041 [-0.109, +0.023] | +0.015 | eurusd -0.03, gbpusd -0.03, gold -0.02, nq -0.06, usdjpy -0.03 |
| drift | h4 | -0.004 | -0.123 .. +0.116 | 75.3 | +0.028 / +0.040 | +0.005 (0.934) | +0.053 [-0.081, +0.190] | +0.162 | eurusd +0.04, gbpusd +0.11, gold +0.05, nq +0.14, usdjpy -0.10 |
| momentum | h1 | +0.003 | -0.010 .. +0.017 | 0.0 | +0.065 / -0.036 | -0.018 (0.207) | -0.029 [-0.060, +0.001] | -0.009 | eurusd -0.03, gbpusd -0.01, gold -0.01, nq -0.04, usdjpy -0.04 |
| momentum | h2 | +0.007 | -0.023 .. +0.040 | 0.7 | +0.076 / -0.043 | -0.025 (0.350) | -0.033 [-0.083, +0.019] | -0.024 | eurusd -0.02, gbpusd +0.02, gold -0.00, nq -0.13, usdjpy -0.03 |
| momentum | h3 | +0.008 | -0.030 .. +0.045 | 20.6 | +0.119 / -0.022 | -0.004 (0.901) | -0.011 [-0.066, +0.044] | -0.021 | eurusd +0.00, gbpusd +0.02, gold +0.02, nq -0.08, usdjpy +0.00 |
| momentum | h4 | +0.043 | -0.050 .. +0.137 | 16.8 | +0.228 / -0.029 | -0.048 (0.406) | -0.016 [-0.146, +0.120] | -0.060 | eurusd -0.00, gbpusd +0.07, gold +0.13, nq -0.05, usdjpy -0.11 |

**Sensitivities** (estimate [CI]):

- drift h1: entry_+1min -0.029 [-0.061, +0.007]; entry_+30min -0.038 [-0.071, -0.002]; sigma60 -0.015 [-0.049, +0.018]; nq_m15_rows_dropped -0.024 [-0.058, +0.008]; month_block_ci — [-0.061, +0.014]
- drift h2: entry_+1min -0.052 [-0.112, +0.008]; entry_+30min -0.062 [-0.119, -0.004]; sigma60 -0.036 [-0.094, +0.024]; nq_m15_rows_dropped -0.049 [-0.110, +0.011]; month_block_ci — [-0.114, +0.014]
- drift h3: entry_+1min -0.039 [-0.105, +0.021]; entry_+30min -0.050 [-0.110, +0.009]; sigma60 -0.028 [-0.096, +0.041]; nq_m15_rows_dropped -0.036 [-0.107, +0.028]; month_block_ci — [-0.107, +0.037]
- drift h4: entry_+1min +0.035 [-0.092, +0.167]; entry_+30min +0.024 [-0.104, +0.152]; sigma60 +0.036 [-0.087, +0.178]; h4_contaminated_censored +0.009 [-0.173, +0.191]; nq_m15_rows_dropped +0.039 [-0.100, +0.168]; month_block_ci — [-0.088, +0.171]
- momentum h1: entry_+1min -0.029 [-0.058, +0.001]; entry_+30min -0.011 [-0.040, +0.018]; sigma60 -0.024 [-0.055, +0.005]; nq_m15_rows_dropped -0.026 [-0.057, +0.002]; month_block_ci — [-0.054, +0.003]
- momentum h2: entry_+1min -0.023 [-0.068, +0.023]; entry_+30min -0.019 [-0.063, +0.027]; sigma60 -0.033 [-0.078, +0.015]; nq_m15_rows_dropped -0.031 [-0.079, +0.016]; month_block_ci — [-0.078, +0.016]
- momentum h3: entry_+1min +0.002 [-0.051, +0.057]; entry_+30min +0.010 [-0.043, +0.064]; sigma60 -0.003 [-0.062, +0.053]; nq_m15_rows_dropped -0.008 [-0.062, +0.042]; month_block_ci — [-0.061, +0.044]
- momentum h4: entry_+1min -0.004 [-0.130, +0.121]; entry_+30min +0.048 [-0.073, +0.175]; sigma60 -0.013 [-0.135, +0.115]; h4_contaminated_censored +0.019 [-0.153, +0.203]; nq_m15_rows_dropped -0.004 [-0.130, +0.115]; month_block_ci — [-0.123, +0.121]

## Power run (committed before scoring; reads no event outcome)

Placebo within-event ρ̄ (h2, signed legs): 0.307 (the prereg table assumed 0.45).

| cell | n events | placebo SE | MDE (α 0.0125) | bar | verdict | power at bar | recovery ok | null rejection | placebo mean ok |
|---|---|---|---|---|---|---|---|---|---|
| post-release-drift-pooled|h1 | 390 | 0.0088 | 0.030 | 0.05 | POWERED | 1.00 | True | 0.046 | True |
| post-release-drift-pooled|h2 | 390 | 0.0195 | 0.065 | 0.10 | POWERED | 0.99 | True | 0.054 | True |
| post-release-drift-pooled|h3 | 390 | 0.0240 | 0.080 | 0.10 | POWERED | 0.95 | True | 0.048 | True |
| post-release-drift-pooled|h4 | 390 | 0.0619 | 0.207 | 0.20 | UNDERPOWERED | 0.76 | True | 0.050 | True |
| post-release-momentum-pooled|h1 | 390 | 0.0074 | 0.025 | 0.05 | POWERED | 1.00 | True | 0.038 | True |
| post-release-momentum-pooled|h2 | 390 | 0.0169 | 0.057 | 0.10 | POWERED | 1.00 | True | 0.036 | True |
| post-release-momentum-pooled|h3 | 390 | 0.0212 | 0.071 | 0.10 | POWERED | 1.00 | True | 0.058 | True |
| post-release-momentum-pooled|h4 | 390 | 0.0511 | 0.171 | 0.20 | POWERED | 0.99 | True | 0.132 | True |

## Trading view (R at a 0.5σ stop; descriptive)

| id | h | rows | unresolved | R gross | R net | placebo-entry R | gross − placebo | net R event CI | P(win) | E[win] | E[loss] | stop rate | MAE / MFE median (σ) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| drift | h1 | 1902 | 0 | -0.053 | -0.102 | +0.002 | -0.055 | [-0.167, -0.043] | 0.46 | +0.59 | -0.60 | 0.21 | 0.25 / 0.23 |
| drift | h2 | 1855 | 0 | -0.045 | -0.096 | +0.008 | -0.053 | [-0.188, -0.007] | 0.40 | +1.18 | -0.86 | 0.47 | 0.46 / 0.35 |
| drift | h3 | 1851 | 0 | -0.019 | -0.070 | +0.015 | -0.034 | [-0.166, +0.022] | 0.38 | +1.42 | -0.91 | 0.53 | 0.50 / 0.40 |
| drift | h4 | 1875 | 0 | +0.096 | +0.045 | +0.013 | +0.084 | [-0.105, +0.191] | 0.23 | +3.77 | -0.99 | 0.76 | 0.52 / 0.46 |
| momentum | h1 | 1899 | 0 | -0.060 | -0.109 | +0.009 | -0.069 | [-0.160, -0.059] | 0.47 | +0.57 | -0.62 | 0.22 | 0.25 / 0.23 |
| momentum | h2 | 1852 | 0 | -0.028 | -0.079 | +0.025 | -0.054 | [-0.154, -0.010] | 0.41 | +1.16 | -0.87 | 0.47 | 0.46 / 0.35 |
| momentum | h3 | 1848 | 0 | +0.016 | -0.035 | +0.030 | -0.014 | [-0.113, +0.048] | 0.40 | +1.42 | -0.91 | 0.52 | 0.50 / 0.39 |
| momentum | h4 | 1871 | 0 | +0.074 | +0.023 | +0.075 | -0.001 | [-0.124, +0.163] | 0.22 | +3.79 | -0.99 | 0.77 | 0.52 / 0.47 |

## Deviations from the prereg

- Script layout: one entry point `run.py`; prereg §8's numbered files map to `events.py` (01), `sigma.mjs` (02), `pipeline.power_run` (03), `pipeline.score` (04), `report.py` (05). `fetch.sh` is not needed: the runner reads local files only.
- Positive control: 2,000 event sign flips per planted draw (the scored cells use 20,000).
- HAR σ: the last 800 NY-close bars, or every available bar (>= 250) where fewer than 800 exist (start of each M1 file, NQ's M15 era).
- Spot-check of 20 events against first prints: the runner writes the sample to DATA_AUDIT.md with an empty first-print column to fill by hand (no network access in the runner).
- Power run event set: scored events with placebo candidates (no outcome availability read). The scored cells use events with >= 3 instruments measured.
- Placebo-entry R: 200 placebo draws per event.
- Non-US mirror: legacy calendar file only (to 2026-07-02).
- Pre-2016-10 cost: 1.5 x the instrument x family median cost measured in R units (the prereg says 1.5 x the median entry spread; R units also carry sigma, so this is the same rule up to the sigma ratio).
- PPI 2014-15 summer rows stamped 13:30Z in calendar_events.csv are re-clocked to 08:30 ET (one-hour vendor slip); the 2y release-bar audit is the check.

## Descriptive (not part of the verdict)

**post-release-drift-pooled slices** (BH q 0.10): 0 survive; 4 of 72 at p < 0.05 vs 3.6 expected by chance (P ≥ that: 0.488). Survivors are candidates for their own prereg, never results.

| slice | n | est | CI | p | BH |
|---|---|---|---|---|---|
| family=CPI|h1 | 92 | -0.034 | [-0.091, +0.023] | 0.236 |  |
| family=NFP|h1 | 114 | -0.025 | [-0.078, +0.029] | 0.365 |  |
| family=PPI|h1 | 108 | +0.009 | [-0.029, +0.046] | 0.635 |  |
| family=FOMC|h1 | 69 | -0.060 | [-0.186, +0.068] | 0.364 |  |
| inst=gold|h1 | 377 | -0.031 | [-0.075, +0.012] | 0.177 |  |
| inst=eurusd|h1 | 383 | -0.017 | [-0.064, +0.027] | 0.455 |  |
| inst=gbpusd|h1 | 383 | -0.020 | [-0.062, +0.020] | 0.332 |  |
| inst=usdjpy|h1 | 383 | -0.029 | [-0.066, +0.007] | 0.133 |  |
| inst=nq|h1 | 569 | -0.004 | [-0.035, +0.031] | 0.836 |  |
| tercile=1|h1 | 169 | -0.036 | [-0.089, +0.015] | 0.153 |  |
| tercile=2|h1 | 98 | -0.007 | [-0.066, +0.052] | 0.817 |  |
| tercile=3|h1 | 111 | -0.024 | [-0.088, +0.041] | 0.462 |  |
| agree=1|h1 | 198 | -0.029 | [-0.067, +0.008] | 0.133 |  |
| agree=0|h1 | 81 | +0.022 | [-0.034, +0.081] | 0.395 |  |
| fomc_entry+60|h1 | 68 | -0.051 | [-0.133, +0.031] | 0.243 |  |
| nq_regime_signed|h1 | 569 | -0.004 | [-0.037, +0.028] | 0.794 |  |
| mirror=MIRROR_EA|h1 | 62 | +0.016 | [-0.035, +0.062] | 0.530 |  |
| mirror=MIRROR_UK|h1 | 80 | +0.064 | [+0.003, +0.127] | 0.043 |  |
| family=CPI|h2 | 87 | -0.062 | [-0.195, +0.073] | 0.359 |  |
| family=NFP|h2 | 114 | -0.037 | [-0.147, +0.067] | 0.502 |  |
| family=PPI|h2 | 104 | -0.032 | [-0.130, +0.064] | 0.532 |  |
| family=FOMC|h2 | 69 | -0.078 | [-0.238, +0.082] | 0.336 |  |
| inst=gold|h2 | 367 | -0.039 | [-0.112, +0.043] | 0.322 |  |
| inst=eurusd|h2 | 374 | -0.043 | [-0.128, +0.039] | 0.299 |  |
| inst=gbpusd|h2 | 374 | -0.036 | [-0.111, +0.045] | 0.360 |  |
| inst=usdjpy|h2 | 374 | -0.021 | [-0.089, +0.045] | 0.536 |  |
| inst=nq|h2 | 545 | -0.046 | [-0.121, +0.032] | 0.245 |  |
| tercile=1|h2 | 166 | -0.100 | [-0.194, -0.003] | 0.042 |  |
| tercile=2|h2 | 94 | +0.033 | [-0.067, +0.131] | 0.521 |  |
| tercile=3|h2 | 109 | -0.049 | [-0.165, +0.066] | 0.420 |  |
| agree=1|h2 | 192 | -0.050 | [-0.127, +0.022] | 0.247 |  |
| agree=0|h2 | 80 | -0.034 | [-0.159, +0.090] | 0.587 |  |
| fomc_entry+60|h2 | 68 | -0.060 | [-0.148, +0.030] | 0.184 |  |
| nq_regime_signed|h2 | 545 | -0.024 | [-0.104, +0.054] | 0.540 |  |
| mirror=MIRROR_EA|h2 | 62 | -0.004 | [-0.264, +0.249] | 0.978 |  |
| mirror=MIRROR_UK|h2 | 80 | -0.095 | [-0.265, +0.071] | 0.279 |  |
| family=CPI|h3 | 86 | -0.053 | [-0.195, +0.082] | 0.470 |  |
| family=NFP|h3 | 114 | -0.080 | [-0.197, +0.039] | 0.196 |  |
| family=PPI|h3 | 104 | -0.003 | [-0.117, +0.111] | 0.957 |  |
| family=FOMC|h3 | 69 | +0.007 | [-0.185, +0.211] | 0.947 |  |
| inst=gold|h3 | 365 | -0.020 | [-0.117, +0.074] | 0.690 |  |
| inst=eurusd|h3 | 373 | -0.035 | [-0.126, +0.059] | 0.459 |  |
| inst=gbpusd|h3 | 373 | -0.027 | [-0.114, +0.058] | 0.540 |  |
| inst=usdjpy|h3 | 373 | -0.027 | [-0.120, +0.065] | 0.538 |  |
| inst=nq|h3 | 555 | -0.011 | [-0.097, +0.073] | 0.806 |  |
| tercile=1|h3 | 166 | -0.107 | [-0.217, +0.001] | 0.051 |  |
| tercile=2|h3 | 94 | +0.026 | [-0.093, +0.154] | 0.673 |  |
| tercile=3|h3 | 108 | +0.016 | [-0.121, +0.152] | 0.817 |  |
| agree=1|h3 | 191 | -0.050 | [-0.133, +0.032] | 0.287 |  |
| agree=0|h3 | 80 | -0.075 | [-0.208, +0.057] | 0.271 |  |
| fomc_entry+60|h3 | 68 | +0.026 | [-0.100, +0.152] | 0.690 |  |
| nq_regime_signed|h3 | 555 | -0.038 | [-0.124, +0.047] | 0.398 |  |
| mirror=MIRROR_EA|h3 | 62 | -0.073 | [-0.348, +0.204] | 0.603 |  |
| mirror=MIRROR_UK|h3 | 80 | -0.078 | [-0.257, +0.098] | 0.407 |  |
| family=CPI|h4 | 92 | -0.063 | [-0.334, +0.213] | 0.666 |  |
| family=NFP|h4 | 114 | -0.047 | [-0.284, +0.188] | 0.688 |  |
| family=PPI|h4 | 108 | +0.008 | [-0.248, +0.253] | 0.948 |  |
| family=FOMC|h4 | 69 | +0.363 | [+0.018, +0.716] | 0.048 |  |
| inst=gold|h4 | 362 | +0.051 | [-0.157, +0.248] | 0.649 |  |
| inst=eurusd|h4 | 383 | +0.040 | [-0.146, +0.226] | 0.673 |  |
| inst=gbpusd|h4 | 383 | +0.109 | [-0.086, +0.306] | 0.263 |  |
| inst=usdjpy|h4 | 383 | -0.097 | [-0.306, +0.116] | 0.378 |  |
| inst=nq|h4 | 553 | +0.172 | [-0.006, +0.351] | 0.063 |  |
| tercile=1|h4 | 169 | +0.004 | [-0.210, +0.221] | 0.969 |  |
| tercile=2|h4 | 98 | -0.092 | [-0.328, +0.155] | 0.449 |  |
| tercile=3|h4 | 111 | +0.241 | [-0.004, +0.497] | 0.089 |  |
| agree=1|h4 | 198 | -0.031 | [-0.210, +0.153] | 0.736 |  |
| agree=0|h4 | 81 | +0.050 | [-0.204, +0.306] | 0.741 |  |
| fomc_entry+60|h4 | 68 | +0.426 | [+0.094, +0.771] | 0.019 |  |
| nq_regime_signed|h4 | 553 | -0.156 | [-0.326, +0.027] | 0.091 |  |
| mirror=MIRROR_EA|h4 | 62 | +0.026 | [-0.540, +0.601] | 0.930 |  |
| mirror=MIRROR_UK|h4 | 79 | -0.125 | [-0.475, +0.224] | 0.513 |  |

**post-release-momentum-pooled slices** (BH q 0.10): 0 survive; 5 of 68 at p < 0.05 vs 3.4 expected by chance (P ≥ that: 0.253). Survivors are candidates for their own prereg, never results.

| slice | n | est | CI | p | BH |
|---|---|---|---|---|---|
| family=CPI|h1 | 92 | -0.050 | [-0.106, +0.005] | 0.077 |  |
| family=NFP|h1 | 114 | -0.043 | [-0.090, +0.004] | 0.083 |  |
| family=PPI|h1 | 108 | -0.004 | [-0.039, +0.032] | 0.833 |  |
| family=FOMC|h1 | 69 | -0.002 | [-0.110, +0.102] | 0.967 |  |
| inst=gold|h1 | 376 | -0.012 | [-0.054, +0.032] | 0.584 |  |
| inst=eurusd|h1 | 383 | -0.028 | [-0.073, +0.018] | 0.229 |  |
| inst=gbpusd|h1 | 383 | -0.012 | [-0.054, +0.026] | 0.545 |  |
| inst=usdjpy|h1 | 381 | -0.041 | [-0.077, -0.006] | 0.034 |  |
| inst=nq|h1 | 566 | -0.025 | [-0.057, +0.009] | 0.143 |  |
| tercile=1|h1 | 169 | -0.037 | [-0.080, +0.004] | 0.082 |  |
| tercile=2|h1 | 98 | -0.032 | [-0.080, +0.019] | 0.256 |  |
| tercile=3|h1 | 111 | -0.011 | [-0.073, +0.050] | 0.727 |  |
| agree=1|h1 | 198 | -0.039 | [-0.075, -0.006] | 0.030 |  |
| agree=0|h1 | 81 | -0.024 | [-0.085, +0.027] | 0.317 |  |
| fomc_entry+60|h1 | 68 | +0.030 | [-0.053, +0.108] | 0.464 |  |
| mirror=MIRROR_EA|h1 | 61 | +0.008 | [-0.039, +0.058] | 0.751 |  |
| mirror=MIRROR_UK|h1 | 80 | +0.043 | [-0.018, +0.108] | 0.178 |  |
| family=CPI|h2 | 87 | -0.062 | [-0.192, +0.067] | 0.348 |  |
| family=NFP|h2 | 114 | -0.044 | [-0.138, +0.053] | 0.363 |  |
| family=PPI|h2 | 104 | -0.018 | [-0.098, +0.063] | 0.656 |  |
| family=FOMC|h2 | 69 | +0.007 | [-0.136, +0.134] | 0.916 |  |
| inst=gold|h2 | 366 | -0.004 | [-0.080, +0.068] | 0.915 |  |
| inst=eurusd|h2 | 374 | -0.025 | [-0.099, +0.045] | 0.545 |  |
| inst=gbpusd|h2 | 374 | +0.023 | [-0.048, +0.095] | 0.555 |  |
| inst=usdjpy|h2 | 372 | -0.029 | [-0.100, +0.037] | 0.395 |  |
| inst=nq|h2 | 542 | -0.115 | [-0.184, -0.043] | 0.003 |  |
| tercile=1|h2 | 166 | -0.060 | [-0.136, +0.022] | 0.161 |  |
| tercile=2|h2 | 94 | -0.041 | [-0.125, +0.047] | 0.371 |  |
| tercile=3|h2 | 109 | +0.017 | [-0.085, +0.120] | 0.762 |  |
| agree=1|h2 | 192 | -0.078 | [-0.146, -0.010] | 0.046 |  |
| agree=0|h2 | 80 | +0.028 | [-0.083, +0.151] | 0.612 |  |
| fomc_entry+60|h2 | 68 | +0.030 | [-0.058, +0.111] | 0.479 |  |
| mirror=MIRROR_EA|h2 | 61 | +0.249 | [-0.015, +0.503] | 0.059 |  |
| mirror=MIRROR_UK|h2 | 80 | +0.032 | [-0.144, +0.202] | 0.717 |  |
| family=CPI|h3 | 86 | -0.048 | [-0.198, +0.083] | 0.495 |  |
| family=NFP|h3 | 114 | -0.052 | [-0.159, +0.063] | 0.366 |  |
| family=PPI|h3 | 104 | +0.007 | [-0.092, +0.101] | 0.888 |  |
| family=FOMC|h3 | 69 | +0.089 | [-0.080, +0.247] | 0.294 |  |
| inst=gold|h3 | 364 | +0.020 | [-0.071, +0.114] | 0.696 |  |
| inst=eurusd|h3 | 373 | +0.000 | [-0.087, +0.084] | 0.995 |  |
| inst=gbpusd|h3 | 373 | +0.019 | [-0.065, +0.102] | 0.675 |  |
| inst=usdjpy|h3 | 371 | +0.002 | [-0.082, +0.083] | 0.969 |  |
| inst=nq|h3 | 552 | -0.081 | [-0.165, +0.002] | 0.072 |  |
| tercile=1|h3 | 166 | -0.025 | [-0.108, +0.060] | 0.593 |  |
| tercile=2|h3 | 94 | -0.072 | [-0.183, +0.035] | 0.198 |  |
| tercile=3|h3 | 108 | +0.075 | [-0.044, +0.189] | 0.246 |  |
| agree=1|h3 | 191 | -0.077 | [-0.153, +0.000] | 0.068 |  |
| agree=0|h3 | 80 | +0.062 | [-0.075, +0.196] | 0.338 |  |
| fomc_entry+60|h3 | 68 | +0.170 | [+0.052, +0.282] | 0.004 |  |
| mirror=MIRROR_EA|h3 | 61 | +0.223 | [-0.049, +0.490] | 0.112 |  |
| mirror=MIRROR_UK|h3 | 80 | +0.036 | [-0.146, +0.219] | 0.705 |  |
| family=CPI|h4 | 92 | -0.034 | [-0.297, +0.217] | 0.793 |  |
| family=NFP|h4 | 114 | -0.139 | [-0.320, +0.056] | 0.158 |  |
| family=PPI|h4 | 108 | +0.004 | [-0.190, +0.219] | 0.967 |  |
| family=FOMC|h4 | 69 | +0.246 | [-0.119, +0.587] | 0.170 |  |
| inst=gold|h4 | 361 | +0.128 | [-0.100, +0.374] | 0.248 |  |
| inst=eurusd|h4 | 383 | -0.003 | [-0.187, +0.172] | 0.977 |  |
| inst=gbpusd|h4 | 383 | +0.069 | [-0.125, +0.266] | 0.476 |  |
| inst=usdjpy|h4 | 381 | -0.111 | [-0.306, +0.102] | 0.316 |  |
| inst=nq|h4 | 549 | -0.078 | [-0.258, +0.092] | 0.397 |  |
| tercile=1|h4 | 169 | -0.069 | [-0.246, +0.105] | 0.446 |  |
| tercile=2|h4 | 98 | -0.066 | [-0.276, +0.146] | 0.545 |  |
| tercile=3|h4 | 111 | +0.170 | [-0.081, +0.450] | 0.188 |  |
| agree=1|h4 | 198 | -0.115 | [-0.275, +0.043] | 0.152 |  |
| agree=0|h4 | 81 | +0.059 | [-0.226, +0.383] | 0.659 |  |
| fomc_entry+60|h4 | 68 | +0.230 | [-0.127, +0.585] | 0.208 |  |
| mirror=MIRROR_EA|h4 | 61 | +0.548 | [+0.007, +1.110] | 0.058 |  |
| mirror=MIRROR_UK|h4 | 79 | +0.052 | [-0.311, +0.418] | 0.784 |  |

In-line events (s = 0), unsigned USD-positive-direction σ return: h1 +0.104 (n 78), h2 +0.138 (n 75), h3 +0.166 (n 76), h4 +0.114 (n 75)

B0 (placebo, d-direction mean σ return per instrument): h1: eurusd -0.001, gbpusd -0.002, gold +0.001, nq -0.002, usdjpy +0.004; h2: eurusd -0.002, gbpusd -0.011, gold -0.003, nq -0.013, usdjpy +0.020; h3: eurusd -0.024, gbpusd -0.011, gold -0.042, nq -0.038, usdjpy +0.017; h4: eurusd -0.017, gbpusd -0.012, gold -0.169, nq -0.156, usdjpy +0.094

By year (h2): drift: 2017 +0.04, 2018 -0.05, 2019 -0.05, 2020 +0.02, 2021 -0.05, 2022 -0.31, 2023 +0.07, 2024 -0.04, 2025 -0.01, 2026 -0.09; momentum: 2017 +0.08, 2018 -0.09, 2019 -0.16, 2020 +0.03, 2021 +0.03, 2022 -0.15, 2023 +0.07, 2024 -0.10, 2025 -0.01, 2026 +0.02

## Data


## Coverage (exact)

| family | years | events | signal != 0 | in line | no consensus / no 2y move | timestamp-dropped |
|---|---|---|---|---|---|---|
| CPI | 2010-2026 | 198 | 140 | 58 | 0 | 0 |
| NFP | 2010-2026 | 200 | 197 | 2 | 1 | 0 |
| PPI | 2014-2026 | 151 | 139 | 11 | 1 | 0 |
| FOMC | 2010-2026 | 132 | 123 | 0 | 9 | 0 |
| **total** | | 681 | 599 | | | |

Signal events by year: 2010: 27, 2011: 27, 2012: 24, 2013: 25, 2014: 37, 2015: 38, 2016: 38, 2017: 37, 2018: 36, 2019: 41, 2020: 40, 2021: 40, 2022: 43, 2023: 41, 2024: 40, 2025: 38, 2026: 27

Agreement defined (data families): 420 (CPI 121, NFP 184, PPI 115); tercile assigned: 472
Mirror events (signal != 0): MIRROR_EA 62 (2018-2026), MIRROR_UK 80 (2018-2026)
- gold: M1 2016-01-04 -> 2026-08-20 23:59Z, 3,722,340 bars.
- eurusd: M1 2016-01-04 -> 2026-08-20 23:59Z, 3,840,908 bars.
- gbpusd: M1 2016-01-04 -> 2026-08-20 23:59Z, 3,815,842 bars.
- usdjpy: M1 2016-01-04 -> 2026-08-20 23:59Z, 3,874,254 bars.
- NQ: M1 from `portfolioBacktest\cache\nq_m1.parquet` starting 2016-01-04; OANDA M15 closes before that.
- gold: sigma available from 2016-12-19 (2496 daily bars with HAR sigma)
- eurusd: sigma available from 2016-12-16 (2509 daily bars with HAR sigma)
- gbpusd: sigma available from 2016-12-16 (2509 daily bars with HAR sigma)
- usdjpy: sigma available from 2016-12-16 (2509 daily bars with HAR sigma)
- nq: sigma available from 2010-10-19 (4093 daily bars with HAR sigma)

## What this changes

Per prereg §8, by the verdict words above: VALIDATED → a research-only decaying lean at the passing horizon and a forward-record prereg; CONTEXT → a release-day page line with size and interval, never a trade; NULL → the desk stops saying "trade the surprise"; UNDERPOWERED → recorded with power.json, more release families as one family is the next design.
