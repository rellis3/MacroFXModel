# funding-forecast-error — results

Prereg: `forge/FUNDING_FORECAST_ERROR_PREREG.md` (committed in `4c02694f`, 2026-10-22). Run 2026-10-22, seed 20261022, B = 2000.
Branch `main`. Ledger ids: `funding-forecast-error-squeeze`, `funding-forecast-error-cpstress`, `funding-forecast-error-levbuild`.

## Verdict: UNDERPOWERED (all three cells)

The test asked whether markets move further than the shipped range forecast (SI where present, else S) on days when short-term credit is dear or leverage is building. It used 52,486 out-of-sample instrument-sessions, 34 instruments, 1,558 London sessions 2020-08 → 2026-08. The forecast is well calibrated overall: mean log error +0.002, and the actual range beat the 75% line on 23.9% of sessions against 25% expected.

| Cell | Top − bottom tercile (realised ÷ forecast) | 95% CI | Halves | FX / indices | Placebo 95% | Holm p | Verdict |
|---|---|---|---|---|---|---|---|
| squeeze (SOFR − floor) | **−2.6%** | [−5.7%, +1.1%] | −4.0% / +5.5% | −3.3% / −0.9% | [−4.5%, +4.4%] | 0.43 | UNDERPOWERED |
| cpstress (CP 3m − SOFR) | **+2.5%** | [−0.8%, +6.1%] | no top-tercile days / −4.2% | +2.8% / +2.8% | [−5.0%, +4.9%] | 0.43 | UNDERPOWERED |
| levbuild (TFF leverage build) | **+1.8%** | [−1.6%, +4.9%] | +3.9% / −0.3% | +1.3% / +3.7% | [−4.7%, +4.6%] | 0.43 | UNDERPOWERED |

None of the cells meets the gate. Each CI still includes a 3% miss on one side, so none can be called NULL. The design's MDE was about 5.4%, and these intervals rule out a systematic miss larger than about 6% in the expected direction for every cell.

## Controls

- **Shift placebo** (circular shifts of at least 63 sessions): all three bands are about ±4.5–5%, centred on 0. All observed values are inside.
- **p75 exceedance by tercile**: squeeze 24.1% (top) / 25.8% (bottom); cpstress 25.3% / 23.6%; levbuild 24.1% / 23.0%. All are close to the 25% design rate.
- **Excluding month-end ±2 sessions**: squeeze −3.9%, cpstress +2.3%, levbuild +1.8%. So month-end calendar noise is not hiding a squeeze effect.

## Design flaw found in the cpstress signal (stated, not fixed after the fact)

`cpstress` compared a **3-month** unsecured rate (CP) with an **overnight** secured rate (SOFR). That gap mostly measures **expected Fed moves over the next 3 months** (it was huge through the 2022 hikes), not bank funding stress. The full-sample terciles put no top-tercile day in the first half (2020-08 → 2023-08), so the first-half number does not exist and the halves gate cannot be met. A proper stress gauge needs matched tenors: CP 3m minus 3-month expected SOFR (from SR3 or term SOFR). That is the course's "OIS–SOFR" idea done properly, and it needs its own prereg.

## Deviations from the prereg

None in the run. The flaw above is in the registered signal definition. It is recorded here and not patched.

## Descriptive (not part of the verdict)

Top − bottom tercile, realised ÷ forecast:
- **RRP level (log)**: +5.2%. Sessions with a large RRP (2021–23) ran further than forecast. This is confounded with that era's high volatility, so it is not a funding effect.
- **HY OAS 20-day change**: **+5.3%**. Sessions after credit spreads have widened ran further than forecast. Only about 3 years of HY OAS history are in the store (FRED serves it from 2023-10), so this is a lead to test on longer credit data, not a finding.
- **SOFR volume 20-day change**: −2.5%. **Reserves 4-week change**: +1.0%.
- Signal correlations: squeeze vs cpstress −0.54 (both move with the rate cycle); levbuild is about ±0.2 with each.

## What this changes

- The range forecaster is unchanged. Funding conditions do not explain its misses at a size this sample can see (more than about 6%).
- Leads, each needing its own prereg:
  1. **Credit-spread widening → ranges above forecast** (+5.3% on 3 years). Retest with a longer series: ICE BofA HY via HYG/JNK from 2007, or Moody's Baa−Aaa, already in the store as `credit_baa10y` / `credit_aaa10y`.
  2. **CP 3m minus 3-month expected SOFR** as a real bank-stress gauge.
