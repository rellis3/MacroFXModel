# close-window-momentum — results

Prereg: `forge/CLOSE_WINDOW_MOMENTUM_PREREG.md` (committed in `2bd383b8`, 2026-11-11, pushed before any outcome).
Run 2026-11-11 (`ranAt` 2026-11-11T14:16Z), seed 20261111, week-cluster bootstrap B = 2,000. Branch `main`.
Ledger ids: `close-window-momentum`, `close-window-momentum-gamma`, `close-window-momentum-trade`,
`close-window-momentum-secondary`, `close-window-momentum-levels`.

## Verdicts

| Question | Verdict | One line |
|---|---|---|
| `close-window-momentum` (P1, P4: NQ/ES futures) | **NULL** | The vol-scaled move prior 16:00 ET → 15:30 ET does not predict 15:30 → 16:00 ET: NQ β −0.001 [−0.016, +0.015], ES +0.002 [−0.019, +0.023]; the first half hour doesn't either (NQ −0.014, ES −0.019). The 0.025 bar is ruled out on all four cells |
| `close-window-momentum-gamma` (P2, P3) | **UNDERPOWERED** (NQ cells NULL; the ES interaction was underpowered by design) | Negative-gamma days are not stronger: β_neg NQ −0.017 [−0.042, +0.011], ES +0.004 [−0.034, +0.050] against the paper's 0.066; interaction NQ −0.011 [−0.052, +0.035] (NULL), ES +0.018 [−0.034, +0.078] (UNDERPOWERED) |
| `close-window-momentum-trade` (P5, P6 trades) | **NULL** | sign(r1) for the last 30 minutes, net: NQ fut +0.26 bp [−1.11, +1.74], ES fut −0.87 [−2.08, +0.47], NQ CFD +0.57 [−0.89, +2.25], SPX CFD −0.06 [−1.38, +1.52]; a 2.75 bp/trade (net Sharpe ~1.2) edge is ruled out on all four |
| `close-window-momentum-secondary` (gold, FX) | **CONTEXT** | GBPUSD and USDJPY 15:30 → 16:00 London carry the day's move slightly: β +0.016 [+0.004, +0.028] and +0.016 [+0.004, +0.026], both halves, BH-significant, below the 0.025 bar; gold, EURUSD, AUDUSD null. Every trade loses net (−0.4 to −2.5 bp) |
| `close-window-momentum-levels` (L1, L2) | **UNDERPOWERED** (EURUSD NULL) | With-the-day arrivals in the last hour follow through no more than at 10:00-15:00: NQ lines +3.3 pp [−7.1, +12.5] (58.5% vs 55.2%), and no more than at shifted placebo lines (+1.8 pp); EURUSD −3.6 pp [−11.0, +3.3] (NULL); gold and NQ walls too thin |

No scored cell is VALIDATED. 6 of 32 cells survive BH at q = 0.10: two FX slopes (CONTEXT) and four gold/FX trade cells
that are significantly **negative** (cost; NULL).

## Scored cells

Slopes are vol-scaled (both sides ÷ trailing NY-close σ); trade cells in bp of the entry price, net of costs; level
cells are follow-share differences (late60 − early, with the day; L2 minus the same difference at placebo lines).
p two-sided from the bootstrap SE; BH q = 0.10 over all 32; halves = point estimates at the cell's own median date.

| Cell | n | Estimate | 95% CI | t | p | BH | Halves | HAC t | MDE | Bar | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P1 β NQ_FUT | 2,356 | −0.0006 | [−0.0157, +0.0151] | −0.07 | 0.94 | – | +0.004 / −0.006 | −0.07 | 0.015 | 0.025 | NULL |
| P1 β ES_FUT | 2,350 | +0.0024 | [−0.0186, +0.0227] | +0.23 | 0.82 | – | +0.006 / −0.001 | +0.22 | 0.018 | 0.025 | NULL |
| P2 β_neg NQ_FUT | 216 | −0.0167 | [−0.0423, +0.0111] | −1.22 | 0.22 | – | −0.015 / −0.018 | −1.24 | 0.042 | 0.066 | NULL |
| P2 β_neg ES_FUT | 174 | +0.0043 | [−0.0339, +0.0499] | +0.20 | 0.84 | – | +0.012 / −0.003 | +0.22 | 0.061 | 0.066 | NULL |
| P3 β_neg − β_pos NQ_FUT | 636 | −0.0112 | [−0.0520, +0.0351] | −0.50 | 0.62 | – | +0.025 / −0.040 | | 0.055 | 0.058 | NULL |
| P3 β_neg − β_pos ES_FUT | 611 | +0.0182 | [−0.0338, +0.0778] | +0.63 | 0.53 | – | +0.049 / −0.007 | | 0.075 | 0.058 | UNDERPOWERED |
| P4 β_fh NQ_FUT | 2,355 | −0.0139 | [−0.0319, +0.0035] | −1.49 | 0.14 | – | −0.003 / −0.024 | −1.44 | 0.022 | 0.035 | NULL |
| P4 β_fh ES_FUT | 2,349 | −0.0188 | [−0.0439, +0.0040] | −1.53 | 0.13 | – | −0.004 / −0.035 | −1.55 | 0.027 | 0.035 | NULL |
| P5 trade NQ_FUT (bp) | 2,355 | +0.26 | [−1.11, +1.74] | +0.36 | 0.72 | – | +0.59 / −0.06 | | 2.49 | 2.75 | NULL |
| P5 trade ES_FUT (bp) | 2,335 | −0.87 | [−2.08, +0.47] | −1.36 | 0.18 | – | −0.97 / −0.76 | | 2.21 | 2.75 | NULL |
| P6 β NQ_CFD | 2,141 | +0.0010 | [−0.0148, +0.0179] | +0.12 | 0.91 | – | +0.004 / −0.002 | +0.11 | 0.017 | 0.025 | NULL |
| P6 β SPX_CFD | 2,021 | +0.0092 | [−0.0155, +0.0366] | +0.69 | 0.49 | – | +0.004 / +0.015 | +0.69 | 0.021 | 0.025 | UNDERPOWERED |
| P6 trade NQ_CFD (bp) | 2,141 | +0.57 | [−0.89, +2.25] | +0.72 | 0.47 | – | +1.52 / −0.38 | | 2.71 | 2.75 | NULL |
| P6 trade SPX_CFD (bp) | 2,010 | −0.06 | [−1.38, +1.52] | −0.08 | 0.94 | – | +0.17 / −0.29 | | 2.52 | 2.75 | NULL |
| S1 β GOLD (13:00-13:30 ET) | 2,141 | +0.0066 | [−0.0023, +0.0155] | +1.48 | 0.14 | – | +0.019 / −0.005 | +1.51 | 0.010 | 0.025 | NULL |
| S1 β EURUSD | 2,517 | −0.0114 | [−0.0229, +0.0001] | −1.91 | 0.06 | – | −0.022 / −0.001 | −1.90 | 0.016 | 0.025 | NULL |
| S1 β GBPUSD | 2,519 | +0.0161 | [+0.0036, +0.0279] | +2.65 | 0.008 | ✓ | +0.015 / +0.017 | +2.53 | 0.016 | 0.025 | CONTEXT |
| S1 β USDJPY | 2,517 | +0.0157 | [+0.0036, +0.0263] | +2.72 | 0.007 | ✓ | +0.014 / +0.017 | +2.80 | 0.014 | 0.025 | CONTEXT |
| S1 β AUDUSD | 2,501 | −0.0049 | [−0.0174, +0.0082] | −0.75 | 0.45 | – | −0.016 / +0.005 | −0.76 | 0.015 | 0.025 | NULL |
| S2 trade GOLD (bp) | 2,141 | −2.52 | [−3.11, −1.96] | −8.53 | <0.001 | ✓ (wrong side) | −2.83 / −2.22 | | 0.98 | 1.0 | NULL |
| S2 trade EURUSD | 2,517 | −1.64 | [−2.04, −1.24] | −8.01 | <0.001 | ✓ (wrong side) | −1.82 / −1.45 | | 0.71 | 1.0 | NULL |
| S2 trade GBPUSD | 2,515 | −1.10 | [−1.62, −0.59] | −4.21 | <0.001 | ✓ (wrong side) | −0.63 / −1.57 | | 0.89 | 1.0 | NULL |
| S2 trade USDJPY | 2,514 | −0.43 | [−0.86, −0.02] | −1.97 | 0.049 | – | −0.76 / −0.09 | | 0.69 | 1.0 | NULL |
| S2 trade AUDUSD | 2,497 | −2.20 | [−2.75, −1.59] | −7.50 | <0.001 | ✓ (wrong side) | −2.62 / −1.77 | | 0.96 | 1.0 | NULL |
| L1 NQ lines | 955 resolved (late 106) | +3.3 pp | [−7.1, +12.5] | +0.65 | 0.51 | – | +7.5 / −1.5 | | 11.6 (planned) | 10 pp | UNDERPOWERED |
| L2 NQ lines vs placebo | 955 | +1.8 pp | [−8.8, +12.1] | +0.34 | 0.74 | – | −0.2 / +1.4 | | 14.2 | 10 pp | UNDERPOWERED |
| L1 GOLD lines | 821 (late 36) | +0.3 pp | [−16.9, +16.9] | +0.03 | 0.98 | – | −4.4 / +6.3 | | 16.9 | 10 pp | UNDERPOWERED |
| L2 GOLD lines vs placebo | 821 | +7.7 pp | [−7.5, +24.1] | +0.95 | 0.34 | – | +3.9 / +13.5 | | 20.7 | 10 pp | UNDERPOWERED |
| L1 EURUSD lines | 1,252 (late 259) | −3.6 pp | [−11.0, +3.3] | −0.99 | 0.32 | – | −1.9 / −5.3 | | 8.9 | 10 pp | NULL |
| L2 EURUSD lines vs placebo | 1,252 | −0.4 pp | [−7.5, +6.7] | −0.12 | 0.91 | – | −1.4 / +0.5 | | 10.8 | 10 pp | NULL |
| L1 NQ walls | 20 (late 4) | −12.5 pp | [−55, +50] | −0.46 | 0.64 | – | | | ~80 | 10 pp | UNDERPOWERED |
| L2 NQ walls vs placebo | 20 | −37.5 pp | [−110, +28] | −1.03 | 0.30 | – | | | ~80 | 10 pp | UNDERPOWERED |

**Trade detail (gross / cost / net bp; long and short trades; always-long benchmark over the same window):**

| Cell | Gross | Cost | Net | Long n, gross | Short n, gross | Always long | Net Sharpe/yr |
|---|---|---|---|---|---|---|---|
| NQ_FUT | +0.91 | 0.65 | +0.26 | 1,312, +0.69 | 1,043, +1.18 | −0.14 | 0.12 |
| ES_FUT | +0.66 | 1.52 | −0.87 | 1,271, +0.40 | 1,064, +0.97 | −0.26 | −0.43 |
| NQ_CFD | +1.21 | 0.64 | +0.57 | 1,207, +0.85 | 934, +1.67 | −0.25 | 0.24 |
| SPX_CFD | +1.03 | 1.09 | −0.06 | 1,089, +0.46 | 921, +1.71 | −0.54 | −0.03 |
| GOLD | −0.26 | 2.27 | −2.52 | 1,164, −0.37 | 977, −0.12 | −0.14 | −2.96 |
| EURUSD | −0.40 | 1.24 | −1.64 | 1,244, −0.84 | 1,273, +0.04 | −0.44 | −2.45 |
| GBPUSD | +0.27 | 1.37 | −1.10 | 1,270, +0.32 | 1,245, +0.21 | +0.05 | −1.32 |
| USDJPY | +0.73 | 1.16 | −0.43 | 1,317, +0.93 | 1,197, +0.51 | +0.25 | −0.65 |
| AUDUSD | −0.31 | 1.89 | −2.20 | 1,268, −0.35 | 1,229, −0.26 | −0.06 | −2.44 |

The index window drifts **down** on average (always long −0.14 to −0.54 bp), so the shorts carry slightly more gross
than the longs; no long-drift trap flatters the trade. The index gross (+0.7 to +1.2 bp) is the whole edge before cost
and it sits inside noise (trade sd ~32-37 bp).

## Controls (descriptive, registered)

- **Pipeline checks.** Futures (end-stamped) and CFD (open-stamped) anchors agree: corr of the window return 0.992 NQ,
  0.986 ES; predictor 0.972 / 0.976, so the stamp handling and DST conversion are right. Planted-signal control on the
  real x and week clusters (synthetic y): β = 0.025 recovered as 0.024 (sd 0.005), CI > 0 in 40/40 draws; β = 0 gives
  −0.001, 0/40. The level builder reproduces the archive's first-touch bar on 4,550/4,550 NQ, 4,588/4,588 GOLD,
  4,479/4,480 EURUSD touches.
- **Mirror windows (indices, same days).** Prior close → 14:30 predicting 14:30 → 15:00 ET: β +0.001 NQ, +0.004 ES
  (HAC t 0.2, 0.7). x predicting 16:00 → 16:15 ET: +0.002 / −0.001. The close window (−0.001 / +0.002) is no different
  from either: there is no close-specific slope to explain.
- **Reversal after the window (Baltussen's second half).** The last 30 minutes do give back part of themselves over the
  next sessions: next-day return on y, NQ fut −0.35 (HAC t −2.5), 2 days −0.40 (t −2.5); ES −0.17 (t −1.3), −0.30
  (t −2.1); NQ CFD −0.24 / −0.32 (t −1.9 / −2.1). Descriptive, not scored; consistent with close-window price pressure
  that reverts, even though it isn't predictable from r1.
- **Raw (unscaled, paper-comparable) slope.** NQ fut +0.0175 [−0.002, +0.039], ES +0.014 [−0.011, +0.044], NQ CFD
  +0.023 [+0.001, +0.047], SPX CFD +0.020 [−0.008, +0.054]. Positive where the vol-scaled slope is ~0 because raw OLS is
  weighted to the highest-vol days: by trailing-σ tercile the vol-scaled β is −0.011 / −0.006 / **+0.025** (NQ, low /
  mid / high) and +0.003 / −0.010 / +0.015 (ES). By year the trade's net is positive in 2018, 2020 (+5.6 bp NQ), 2022
  (+3.9) and negative in most calm years (2025 −4.4); trimming the top and bottom 1% of days takes NQ to +0.01 bp net.
  Whatever close-window momentum exists here lives in the stress years and the top vol tercile; the registered,
  vol-scaled test says it is not a general property of the close.
- **Gamma.** Negative-gamma days have a lower mean x (NQ −0.01 vs +0.09; short gamma follows falls). D+1 timing
  (sensitivity): β_neg NQ −0.031, ES −0.043; β_pos ~0.00 / +0.009: the wrong sign, as at D+2. Within each gamma arm the
  slope does not rise with trailing σ in the negative arm (NQ −0.026 / +0.006 / −0.020).
- **Gao's first half hour by |first-half-hour move| tercile.** NQ β_fh +0.067 / +0.002 / −0.017 (low / mid / high);
  ES −0.064 / −0.022 / −0.018. The opposite of Gao's "stronger when the first half hour is volatile".
- **Level arm detail.** With-the-day follow shares (resolved races): NQ real late60 58.5% (n 106) vs early 55.2%
  (n 849); placebo 55.4% / 53.9%. Late30 only: NQ 63.5% (n 52), EURUSD 50.0% (n 110), gold 54.5% (n 11). About half of
  with-the-day touches never resolve a 0.25σ race inside 30 minutes (`open` NQ 50%, gold 51%, EURUSD 54%), which halved
  the planned n. Against-the-day arrivals (retrace levels) are rare late (NQ 8, gold 6, EURUSD 28).

## Deviations from the prereg

- **A1 (POST-HOC, results seen; a bug fix toward the prereg text, no promotion).** The first run split halves at each
  instrument's full-sample median, so the gamma cells (2020-11 onward) had one half empty or a few months long. The prereg
  says "halves split at each cell's median date"; the code now does that. No verdict changed (all affected cells fail on
  their CI before the halves are read).
- **A2 (POST-HOC, results seen; bookkeeping).** The first run counted the P6 β (CFD) cells into the
  `close-window-momentum` question verdict, which made it UNDERPOWERED via SPX_CFD. The prereg defines that question as
  P1 + P4 on the futures, with the P6 β cells "reported with P1"; the code now follows it (question = NULL). The SPX_CFD β
  cell stays UNDERPOWERED in the table.
- Realised level n is about half the planned n because half of the races are unresolved (`open`), which the power table
  did not anticipate; the affected cells were already UNDERPOWERED by design except EURUSD, which still excludes its bar.

## What this changes

- **Pages / brief:** nothing may say the day's move tends to carry into the US cash close on NQ or ES, with or without
  the gamma map. The library's strongest direction evidence (Baltussen, Gao) does not replicate on 2016-2026 NQ/ES at the
  vol-scaled level, and the CME gamma sign doesn't switch it on.
- **Trading:** no close-window momentum trade on indices, gold or FX majors; the CFD and futures versions are flat to
  negative after cost, and gold/FX are clearly negative.
- **Level question (owner's interest):** not answered. Late with-the-day arrivals at NQ lines follow a little more often
  (58.5% vs 55.2%) but the shifted placebo lines show the same lift (55.4% vs 53.9%), so any late-day boost is a clock
  effect, not a level effect, and it is inside noise. EURUSD rules out a 10 pp late-day lift.
- **What would reopen it:** (1) a pre-registered high-vol-regime version (top trailing-σ tercile, or VIX > 25) on the
  raw slope, judged on the 2026-08-22 → forward period, since the descriptive lift sits there; (2) the full dealer book
  (Cboe SPX/SPY/QQQ capture from 2026-10-19) for the gamma split; (3) the GBPUSD / USDJPY fix-window slope is real but
  sub-cost: only a much cheaper execution (fix orders) would make it tradeable; (4) the next-day reversal of the last
  half hour (NQ −0.35, t −2.5) is the one descriptive with a t above 2 on the indices and could take its own prereg.
