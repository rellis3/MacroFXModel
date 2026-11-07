# vol-layer-reaction: results

Prereg: `forge/VOL_LAYER_REACTION_PREREG.md` (committed in `445b581b`, amended pre-results in `a59aaa70` and `7b88bd7a`, A3 post-hoc), 2026-11-07. Re-run 2026-11-07 after A3, seed 20261107, B = 2000. Ledger id `vol-layer-reaction`. Chosen lines, 34 instruments, 2020-08 → 2026-08, walk-forward folds 1-5, K = 0.25σ, 120 minutes, date-block 95%.

**Verdict: CONTEXT**  Gate (follow_bottom_net): all_vs_M0_ci_below_0.99 NO, net_ci_above_0 NO, positive_4_of_5 NO, below_all_shuffles yes

Base P(reject | resolved) at the line: 0.4853

## Does the vol state add? (log-loss ratio, below 1 = better)

| comparison | ratio [95%] | Holm p |
|---|---|---|
| 31 old features vs rung/side/class | 1.0002 [0.9993, 1.0012] | |
| new features alone vs rung/side/class | 0.9997 [0.9991, 1.0004] | |
| old + all new vs rung/side/class (GBM) | 0.9994 [0.9986, 1.0001] | gate < 0.99 |
| same, logit | 1.0008 [0.9994, 1.0023] | |
| old + all new vs old | 0.9992 [0.9984, 0.9999] | |
| A_state vs old | 1.0000 [0.9995, 1.0004] | 0.469 |
| B_jumps vs old | 0.9999 [0.9995, 1.0002] | 0.387 |
| C_feedback vs old | 0.9990 [0.9983, 0.9997] | 0.002 |
| D_corr vs old | 0.9994 [0.9984, 1.0004] | 0.387 |

Shuffle placebo: real 0.99918, shuffles min 0.99946, below all True. 

## Trades (units of K = 0.25σ; net = one measured round-trip spread)

| trade | n | mean [95%] | folds + |
|---|---|---|---|
| fade_all_net | 70,965 | -0.192 [-0.205, -0.179] | 0/5 |
| fade_top_gross | 11,339 | -0.007 [-0.024, +0.011] | 2/5 |
| fade_top_net | 11,339 | -0.176 [-0.197, -0.156] | 0/5 |
| follow_bottom_gross | 15,755 | +0.058 [+0.040, +0.076] | 5/5 |
| follow_bottom_net | 15,755 | -0.113 [-0.133, -0.091] | 0/5 |
| old features only: fade_top_net | 15,077 | -0.172 [-0.191, -0.156] | 0/5 |
| old features only: follow_bottom_net | 13,336 | -0.112 [-0.135, -0.090] | 0/5 |
| neighbours: fade_top_net | 63,551 | -0.172 [-0.186, -0.157] | 0/5 |
| neighbours: follow_bottom_net | 60,877 | -0.097 [-0.117, -0.077] | 0/5 |

Neighbours model: all vs M0 1.0021 [1.0000, 1.0045], all vs M1 1.0004 [0.9997, 1.0013].

## Net by class

| class | trade | n | mean [95%] | folds + |
|---|---|---|---|---|
| fx_crosses | fade_top_net | 7,661 | -0.193 [-0.217, -0.169] | 0/5 |
| fx_crosses | follow_bottom_net | 7,595 | -0.174 [-0.204, -0.141] | 0/5 |
| fx_majors | fade_top_net | 2,541 | -0.122 [-0.156, -0.088] | 0/5 |
| fx_majors | follow_bottom_net | 3,615 | -0.026 [-0.055, +0.005] | 0/5 |
| gold | fade_top_net | 236 | -0.198 [-0.285, -0.104] | 0/5 |
| gold | follow_bottom_net | 442 | -0.155 [-0.228, -0.067] | 0/5 |
| indices | fade_top_net | 901 | -0.174 [-0.257, -0.099] | 0/5 |
| indices | follow_bottom_net | 4,103 | -0.070 [-0.104, -0.036] | 0/5 |

## Selected trades by year and concentration

- fade_top_net: mean cost 0.1693 K; without the top 1% of days -0.1616; by year {'2021': -0.1944, '2022': -0.1672, '2023': -0.2058, '2024': -0.1678, '2025': -0.1618, '2026': -0.1732}
- follow_bottom_net: mean cost 0.1708 K; without the top 1% of days -0.1116; by year {'2021': -0.1643, '2022': -0.0957, '2023': -0.0927, '2024': -0.1256, '2025': -0.1151, '2026': -0.1008}

## Feature quintiles at the line (descriptive; BH q ≤ 0.10 are candidates only)

| rung | feature | P(reject) top / bottom | diff [95%] | q | same diff at neighbours | reaction60 top − bottom (σ) |
|---|---|---|---|---|---|---|
| p75 | lam_sch | 0.4643 / 0.5091 | -0.045 [-0.068, -0.021] | 0.000 | -0.028 | -0.030 |
| p50 | resid60 | 0.4475 / 0.5036 | -0.056 [-0.096, -0.016] | 0.180 | -0.065 | -0.092 |
| p75 | p_hi | 0.4953 / 0.4636 | +0.032 [+0.006, +0.058] | 0.180 | +0.005 | +0.026 |
| p75 | err_today | 0.4913 / 0.4542 | +0.037 [+0.006, +0.068] | 0.180 | +0.035 | +0.082 |
| p75 | err_ewm | 0.5055 / 0.4781 | +0.027 [+0.004, +0.052] | 0.189 | +0.007 | +0.048 |
| p50 | lam_un | 0.4757 / 0.4929 | -0.017 [-0.035, -0.000] | 0.213 | -0.010 | -0.013 |
| p50 | rv_so_far | 0.4879 / 0.4665 | +0.021 [+0.000, +0.042] | 0.213 | +0.011 | +0.022 |
| p50 | err_ewm | 0.4986 / 0.4781 | +0.021 [+0.001, +0.039] | 0.213 | +0.009 | +0.033 |
| p50 | err_today | 0.4895 / 0.4654 | +0.024 [+0.003, +0.044] | 0.213 | +0.022 | +0.071 |
| p75 | dsig | 0.4592 / 0.4869 | -0.028 [-0.054, -0.003] | 0.213 | +0.004 | -0.028 |
| p75 | resid60 | 0.4628 / 0.5193 | -0.057 [-0.116, +0.001] | 0.213 | -0.098 | -0.151 |
| p75 | lam_un | 0.4788 / 0.5 | -0.021 [-0.047, +0.002] | 0.296 | -0.013 | -0.006 |
| p75 | sig_rel_har | 0.491 / 0.4684 | +0.023 [-0.003, +0.049] | 0.301 | -0.003 | +0.018 |
| p90 | err_abs | 0.4876 / 0.454 | +0.034 [-0.005, +0.072] | 0.321 | -0.005 | +0.021 |
| p50 | lam_sch | 0.4649 / 0.4823 | -0.017 [-0.039, +0.005] | 0.352 | -0.019 | -0.025 |
| p90 | dsig | 0.465 / 0.4972 | -0.032 [-0.078, +0.011] | 0.352 | -0.013 | -0.074 |
| p75 | common60 | 0.504 / 0.4594 | +0.045 [-0.011, +0.097] | 0.352 | +0.043 | +0.057 |
| p75 | jump_today | 0.4778 / 0.4987 | -0.021 [-0.051, +0.008] | 0.357 | +0.019 | +0.009 |
| p90 | sig_rel_har | 0.4912 / 0.4618 | +0.029 [-0.013, +0.073] | 0.381 | -0.005 | +0.059 |
| p50 | p_hi | 0.493 / 0.4792 | +0.014 [-0.010, +0.035] | 0.399 | +0.012 | +0.035 |
| p75 | cvar60 | 0.5 / 0.466 | +0.034 [-0.016, +0.085] | 0.399 | +0.019 | +0.006 |
| p50 | cvar60 | 0.4765 / 0.4996 | -0.023 [-0.060, +0.013] | 0.399 | -0.005 | -0.003 |
| p90 | err_today | 0.4968 / 0.4653 | +0.032 [-0.015, +0.079] | 0.399 | +0.045 | +0.066 |
| p75 | js20 | 0.4817 / 0.4983 | -0.017 [-0.042, +0.010] | 0.399 | -0.009 | -0.015 |
| p75 | rv_so_far | 0.4849 / 0.4689 | +0.016 [-0.013, +0.042] | 0.484 | +0.015 | +0.003 |

## Reading it

The gate needed a log-loss ratio below 0.99; the best is 0.9994. C feedback (realised vol and range used so far today) is real after Holm and beats all 20 shuffles, but 0.9990 is 0.1%. Quintile spreads at the line are 2-5pp and mostly the same size at the neighbours, so they are about distance and state, not about the line.

Spread is the wall. K = 0.25σ, and one measured round trip costs 0.17 K on average, about 0.04σ. Follow has a real gross effect: +0.058 K [+0.040, +0.076], positive in 5 of 5 folds. It nets to -0.113 K. FX majors come closest at -0.026 K [-0.055, +0.005].

## Deviations from the prereg

A1 and A2, before any outcome was computed. A2 redefined family D and restricted it to the 7 USD pairs after a feature check showed triangular arbitrage had made the first version the pair's own move. A3, after results: follow trades had counted same-bar ambiguous outcomes as wins, against the prereg. Fixed and re-run; gross follow moved from +0.064 to +0.058 K and the verdict did not change.

## What this changes

Nothing live. Under the prereg's CONTEXT rule the state may be drawn beside the lines as a description of reaction odds, with no trade.
