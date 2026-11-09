# jump-after: results

Prereg: `forge/JUMP_AFTER_PREREG.md` with A1 and A2 (pre-results) and A3 (post-hoc, proof checks only; run 1 kept as `RESULTS_run1.md`). Seed 20261107, B = 2000. Units: daily σ, signed so + means the burst carried on.

## Verdicts

Prereg gate, main read (01:00-21:00) and with the rollover:

- main: `jump-after-path` **NULL**, `jump-after-stop-through` **VALIDATED**, `jump-after-intensity` **CONTEXT**
- with rollover: `jump-after-path` **NULL**, `jump-after-stop-through` **VALIDATED**, `jump-after-intensity` **VALIDATED**

Verdict gate (`checks.json`), main read:

| question | verdict | why | power | planted min / large | shuffle |
|---|---|---|---|---|---|
| jump-after-path:unscheduled | **UNDERPOWERED** | interval [-0.0125, +0.0942] neither reaches nor rules out +0.03 | 0.29 | +0.0300 of 0.03 / +0.2000 of 0.2 | [-0.0512, +0.0511] |
| jump-after-path:scheduled | **UNDERPOWERED** | interval [-0.0238, +0.1615] neither reaches nor rules out +0.03 | 0.16 | +0.0300 of 0.03 / +0.2000 of 0.2 | [-0.0899, +0.0925] |
| jump-after-path:all_34 | **CONTEXT** | interval above 0, but +0.0272 is below the minimum +0.03 | 0.76 | +0.0300 of 0.03 / +0.2000 of 0.2 | [-0.0280, +0.0271] |
| jump-after-path:common | **VALIDATED** | interval above 0 and +0.0398 reaches the minimum +0.03 | 0.59 | +0.0300 of 0.03 / +0.2000 of 0.2 | [-0.0312, +0.0286] |
| jump-after-path:own | **CONTEXT** | interval above 0, but +0.023 is below the minimum +0.03 | 0.85 | +0.0300 of 0.03 / +0.2000 of 0.2 | [-0.0218, +0.0265] |
| jump-after-stop-through:d0.25 | **NULL** | whole interval is below the minimum +0.005, so that size is ruled out | 1.00 | +0.0046 of 0.0048 / +0.0531 of 0.05367 | [-0.0005, -0.0000] |
| jump-after-stop-through:d0.5 | **VALIDATED** | interval above 0 and +0.00507 reaches the minimum +0.005 | 0.72 | +0.0057 of 0.00585 / +0.0501 of 0.0515 | [-0.0005, -0.0001] |
| jump-after-stop-through:d1.0 | **NULL** | whole interval is below the minimum +0.005, so that size is ruled out | 1.00 | +0.0042 of 0.00487 / +0.0483 of 0.05281 | [-0.0003, -0.0000] |
| jump-after-intensity:flag_today | **CONTEXT** | interval above 0, but +0.00496 is below the minimum +0.005 | 0.96 | +0.0055 of 0.00556 / +0.0487 of 0.05109 | [-0.0004, +0.0000] |

## Main read: first burst 01:00-21:00 London

8,385 bursts in 2,408 distinct moments.

### After-burst path, 60 minutes

| cell | n | mean [95%] | vs control [95%] | half A / B | Holm p | follow net | fade net | cost |
|---|---|---|---|---|---|---|---|---|
| unscheduled | 1,144 | +0.0374 [-0.0125, +0.0942] | +0.0313 [-0.0185, +0.0886] | +0.1021 / -0.0375 | 0.264 | +0.006 [-0.045, +0.062] | -0.064 [-0.121, -0.013] | 0.029 |
| scheduled | 615 | +0.0691 [-0.0238, +0.1615] | +0.0598 [-0.0308, +0.1570] | -0.0433 / +0.0874 | 0.264 | +0.046 [-0.049, +0.139] | -0.093 [-0.186, +0.001] | 0.024 |
| all_34 | 8,385 | +0.0272 [+0.0033, +0.0534] | +0.0299 [+0.0064, +0.0559] | +0.0467 / +0.0143 | 0.112 | -0.021 [-0.044, +0.005] | -0.076 [-0.103, -0.051] | 0.048 |
| common | 6,701 | +0.0398 [+0.0101, +0.0727] | +0.0434 [+0.0137, +0.0761] | +0.0664 / +0.0226 | 0.060 | -0.008 [-0.037, +0.024] | -0.088 [-0.122, -0.058] | 0.048 |
| own | 1,684 | -0.0230 [-0.0451, -0.0012] | -0.0237 [-0.0452, -0.0006] | -0.0270 / -0.0202 | 0.120 | -0.072 [-0.095, -0.050] | -0.025 [-0.049, -0.003] | 0.049 |

### Stop-through and intensity: Brier gain over σ, calendar, Monday and class

| cell | n | base | gain [95%] | Holm p |
|---|---|---|---|---|
| d0.25 | 66,039 | 0.613 | +0.00122 [-0.00093, +0.00329] | 0.273 |
| d0.5 | 66,039 | 0.142 | +0.00507 [+0.00085, +0.00970] | 0.025 |
| d1.0 | 66,039 | 0.026 | +0.00015 [-0.00133, +0.00204] | 0.398 |
| flag_today | 66,039 | 0.106 | +0.00496 [+0.00211, +0.00796] | 0.000 |

## With the rollover (A1 read, secondary)

9,612 bursts in 2,898 distinct moments.

### After-burst path, 60 minutes

| cell | n | mean [95%] | vs control [95%] | half A / B | Holm p | follow net | fade net | cost |
|---|---|---|---|---|---|---|---|---|
| unscheduled | 1,142 | +0.0381 [-0.0119, +0.0949] | +0.0360 [-0.0147, +0.0923] | +0.1021 / -0.0365 | 0.248 | +0.007 [-0.044, +0.063] | -0.065 [-0.121, -0.014] | 0.029 |
| scheduled | 613 | +0.0684 [-0.0248, +0.1607] | +0.0670 [-0.0238, +0.1631] | -0.0433 / +0.0867 | 0.248 | +0.045 [-0.050, +0.138] | -0.093 [-0.185, +0.002] | 0.024 |
| all_34 | 9,024 | +0.0225 [-0.0001, +0.0485] | +0.0269 [+0.0035, +0.0520] | +0.0399 / +0.0112 | 0.156 | -0.026 [-0.050, -0.000] | -0.071 [-0.098, -0.048] | 0.049 |
| common | 7,184 | +0.0347 [+0.0066, +0.0669] | +0.0403 [+0.0117, +0.0726] | +0.0604 / +0.0182 | 0.090 | -0.014 [-0.043, +0.018] | -0.084 [-0.116, -0.055] | 0.049 |
| own | 1,840 | -0.0249 [-0.0461, -0.0044] | -0.0254 [-0.0471, -0.0036] | -0.0356 / -0.0174 | 0.096 | -0.074 [-0.096, -0.053] | -0.024 [-0.045, -0.003] | 0.049 |

Rollover bursts alone (21:00-01:00):

| cell | n | mean [95%] | vs control [95%] | half A / B | Holm p | follow net | fade net | cost |
|---|---|---|---|---|---|---|---|---|
| rollover | 731 | -0.0226 [-0.0982, +0.0534] | -0.0141 [-0.0890, +0.0586] | -0.0342 / -0.0155 | nan | -0.081 [-0.158, -0.003] | -0.035 [-0.110, +0.039] | 0.058 |

### Stop-through and intensity: Brier gain over σ, calendar, Monday and class

| cell | n | base | gain [95%] | Holm p |
|---|---|---|---|---|
| d0.25 | 66,039 | 0.613 | +0.00177 [-0.00046, +0.00390] | 0.123 |
| d0.5 | 66,039 | 0.142 | +0.00560 [+0.00144, +0.01019] | 0.009 |
| d1.0 | 66,039 | 0.026 | +0.00058 [-0.00090, +0.00254] | 0.226 |
| flag_today | 66,039 | 0.121 | +0.00569 [+0.00257, +0.00907] | 0.000 |

## Descriptive (main read, not scored)

Size thirds cut at 0.419σ and 0.703σ.

| cell | n | mean [95%] | vs control [95%] | half A / B | Holm p | follow net | fade net | cost |
|---|---|---|---|---|---|---|---|---|
| small | 2,795 | -0.0086 [-0.0326, +0.0182] | -0.0087 [-0.0335, +0.0172] | +0.0076 / -0.0172 | nan | -0.052 [-0.076, -0.026] | -0.036 [-0.065, -0.012] | 0.044 |
| medium | 2,795 | -0.0075 [-0.0330, +0.0215] | -0.0060 [-0.0312, +0.0217] | +0.0001 / -0.0132 | nan | -0.056 [-0.081, -0.026] | -0.039 [-0.068, -0.014] | 0.048 |
| large | 2,795 | +0.0977 [+0.0420, +0.1581] | +0.1045 [+0.0480, +0.1666] | +0.1250 / +0.0775 | nan | +0.045 [-0.012, +0.105] | -0.150 [-0.211, -0.096] | 0.053 |
| small common | 1,782 | -0.0017 [-0.0376, +0.0358] | -0.0012 [-0.0367, +0.0358] | +0.0222 / -0.0133 | nan | -0.044 [-0.080, -0.006] | -0.042 [-0.079, -0.005] | 0.043 |
| small own | 1,013 | -0.0207 [-0.0416, +0.0008] | -0.0219 [-0.0446, +0.0005] | -0.0145 / -0.0245 | nan | -0.068 [-0.089, -0.045] | -0.027 [-0.051, -0.005] | 0.047 |
| medium common | 2,290 | +0.0009 [-0.0289, +0.0342] | +0.0027 [-0.0270, +0.0356] | +0.0147 / -0.0088 | nan | -0.047 [-0.077, -0.012] | -0.048 [-0.081, -0.017] | 0.047 |
| medium own | 505 | -0.0457 [-0.0759, -0.0135] | -0.0456 [-0.0761, -0.0126] | -0.0568 / -0.0355 | nan | -0.097 [-0.131, -0.064] | -0.002 [-0.033, +0.028] | 0.050 |
| large common | 2,629 | +0.1019 [+0.0441, +0.1635] | +0.1091 [+0.0501, +0.1719] | +0.1334 / +0.0788 | nan | +0.049 [-0.010, +0.111] | -0.154 [-0.216, -0.097] | 0.053 |
| large own | 166 | +0.0316 [-0.0888, +0.1638] | +0.0317 [-0.0922, +0.1629] | +0.0041 / +0.0553 | nan | -0.022 [-0.148, +0.111] | -0.085 [-0.218, +0.038] | 0.054 |
| Asia 01-07 | 3,012 | +0.0038 [-0.0295, +0.0363] | +0.0108 [-0.0217, +0.0426] | +0.0046 / +0.0032 | nan | -0.047 [-0.081, -0.015] | -0.056 [-0.089, -0.022] | 0.052 |
| London 07-12 | 1,170 | +0.0439 [-0.0178, +0.1142] | +0.0404 [-0.0214, +0.1102] | +0.0609 / +0.0345 | nan | -0.002 [-0.065, +0.069] | -0.087 [-0.155, -0.028] | 0.045 |
| US data 12-14 | 1,628 | +0.0349 [-0.0187, +0.0887] | +0.0396 [-0.0149, +0.0958] | +0.0858 / +0.0077 | nan | -0.005 [-0.059, +0.048] | -0.074 [-0.128, -0.020] | 0.039 |
| Afternoon 14-21 | 2,575 | +0.0421 [-0.0117, +0.1022] | +0.0414 [-0.0141, +0.1026] | +0.0687 / +0.0219 | nan | -0.009 [-0.065, +0.052] | -0.095 [-0.155, -0.041] | 0.052 |
| fx_crosses | 4,812 | +0.0269 [+0.0002, +0.0561] | +0.0329 [+0.0058, +0.0626] | +0.0493 / +0.0125 | nan | -0.034 [-0.061, -0.004] | -0.088 [-0.118, -0.061] | 0.061 |
| fx_majors | 1,768 | +0.0139 [-0.0269, +0.0561] | +0.0179 [-0.0245, +0.0603] | +0.0288 / +0.0040 | nan | -0.025 [-0.067, +0.017] | -0.055 [-0.098, -0.016] | 0.040 |
| gold | 240 | -0.0008 [-0.0702, +0.0715] | -0.0092 [-0.0922, +0.0767] | +0.0012 / -0.0022 | nan | -0.029 [-0.100, +0.044] | -0.033 [-0.104, +0.036] | 0.031 |
| indices | 1,565 | +0.0475 [+0.0084, +0.0897] | +0.0403 [-0.0012, +0.0852] | +0.0655 / +0.0345 | nan | +0.025 [-0.015, +0.069] | -0.067 [-0.109, -0.027] | 0.021 |

| cell | horizon | mean [95%] | vs control |
|---|---|---|---|
| unscheduled | m5 | +0.0112 [-0.0113, +0.0355] | +0.0140 |
| unscheduled | m15 | +0.0296 [-0.0067, +0.0695] | +0.0288 |
| unscheduled | m30 | +0.0361 [-0.0041, +0.0814] | +0.0330 |
| unscheduled | m240 | +0.0599 [-0.0225, +0.1374] | +0.0430 |
| scheduled | m5 | +0.0111 [-0.0195, +0.0383] | +0.0144 |
| scheduled | m15 | +0.0401 [-0.0076, +0.0837] | +0.0395 |
| scheduled | m30 | +0.0569 [-0.0092, +0.1200] | +0.0509 |
| scheduled | m240 | -0.0532 [-0.1937, +0.0878] | -0.0128 |
| all_34 | m5 | +0.0034 [-0.0082, +0.0158] | +0.0085 |
| all_34 | m15 | +0.0161 [-0.0008, +0.0337] | +0.0218 |
| all_34 | m30 | +0.0285 [+0.0081, +0.0511] | +0.0342 |
| all_34 | m240 | +0.0256 [-0.0149, +0.0680] | +0.0420 |
| common | m5 | +0.0104 [-0.0034, +0.0253] | +0.0158 |
| common | m15 | +0.0289 [+0.0087, +0.0501] | +0.0351 |
| common | m30 | +0.0431 [+0.0180, +0.0710] | +0.0493 |
| common | m240 | +0.0448 [-0.0065, +0.0979] | +0.0629 |
| own | m5 | -0.0248 [-0.0356, -0.0141] | -0.0206 |
| own | m15 | -0.0347 [-0.0489, -0.0192] | -0.0313 |
| own | m30 | -0.0297 [-0.0483, -0.0117] | -0.0258 |
| own | m240 | -0.0495 [-0.0851, -0.0152] | -0.0398 |

## Critical read (written after the run; 2026-11-09)

**Banked words, and why some differ from the mechanical gate.**
- **Path: NULL as a trade.** No cell is Holm-significant at 60 minutes (best: market-wide p 0.060). Every follow and fade cell is at or below zero after the spread (about 0.05σ round trip). The news cells are UNDERPOWERED (scheduled half-width 0.093σ against a 0.06σ bar). The gate's VALIDATED for "common" is a gross, unadjusted reading: the prereg gate (Holm, both halves, net) governs.
- **Description that holds (CONTEXT, not banked as a separate word):** bursts that hit only one or two instruments give back about 0.025σ within 5 minutes [−0.036, −0.014] and stay there, the same in both halves. Market-wide bursts drift on for about 30 minutes (+0.043σ [+0.018, +0.071] at 30). This is the split the literature predicts: idiosyncratic noise reverts, information continues. Neither pays after spread.
- **Size:** only the largest third (above 0.70σ) carries on, +0.098σ [+0.042, +0.158], and only when market-wide. Follow net +0.049σ [−0.010, +0.111]. Chosen before results (A2) but descriptive, so it is a lead for its own prereg, not a finding.
- **Rollover:** the main and with-rollover reads agree in every cell. Rollover bursts alone: −0.023σ [−0.098, +0.053].
- **Stop-through: CONTEXT, downgraded from the prereg's VALIDATED.** The d = 0.5 gain (+0.00507 [+0.00085, +0.00970]) only just clears the 0.005 bar. Split by half of the scored years it is +1.1% in 2019–Aug 2022 and −0.04% since; most of it is the old 20-session jump share (`js20`), not the new burst counts. A gain that has been absent for three years is not a stop-sizing input. This downgrade is post-hoc and stated as such.
- **Intensity: CONTEXT.** Burst history adds +0.00496 [+0.00211, +0.00796] to predicting a burst today, just under the bar, and +0.58% / +0.50% in the two halves. Bursts cluster from day to day beyond the calendar: the Hawkes idea, small.
