# Step 1 — best forecast of HL / OH / OL (findings, 2026-11-22)

Session 00:00–22:00 London. Futures primary (NT8 continuous NQ/GC/6E), CFD alongside (OANDA NQ/gold/EURUSD).
Model choice on discovery 2018–2022; everything below judged on validation 2023 → 2026-08-21 (never seen).
Pinball loss decides; QLIKE reported. 90% CIs from a 63-day block bootstrap (B=2000, seed 20261122).

## 1. Winner
HAR on 5-minute realised variance (`har_rv5`) — one model for all three levels.
- A (one model) vs B (best model per level): identical on 5 of 6 tracks; on EURUSD futures B is *worse* (+0.49% [+0.11, +0.92]).
  Jordan's question answered: per-level models add nothing here.
- vs the 60-session quantile benchmark, HL pinball: NQ −19%, gold −14/−15%, EURUSD −5% (futures) / −2% (CFD, n.s.).

## 2. Do QLIKE and pinball agree? (E1, Spearman across 25 models, validation)
| | HL | OH | OL |
|---|---|---|---|
| NQ F / C | 0.96 / 0.98 | 0.91 / 0.94 | 0.84 / 0.86 |
| Gold F / C | 0.78 / 0.78 | 0.73 / 0.74 | 0.21 / 0.43 |
| EURUSD F / C | 0.61 / 0.41 | 0.49 / 0.49 | 0.56 / 0.33 |
On NQ they agree and both pick har_rv5. On gold/EURUSD OH/OL, QLIKE prefers slow EWMA models — because QLIKE explodes on
days when OH or OL is near zero (the open was the high/low). Use pinball for OH/OL; QLIKE is only sensible for HL.

## 3. Year-by-year stability (E2, har_rv5 rank of 26 each year)
- NQ: #1 in every year for HL (except 2018: #2). Rock solid.
- Gold: #1 in 2019, 2022, 2024–26 for HL; never worse than #4.
- EURUSD: #1 in about half the years; winners rotate (EURUSD is the hardest — little forecastable vol variation).

## 4. Futures vs CFD as the source (E3)
Futures sigma on CFD levels (and the reverse) changes pinball by less than ±0.4%, all CIs straddle zero.
The source does not matter: a forecast built on either feed works for both.

## 5. Refinement round (E4, picks on discovery, vs har_rv5 on validation)
- Semivariance HAR (up/down split of yesterday): NQ HL −0.6% [−1.6, −0.1], OH −0.6% — real but tiny.
- 1-minute RV: gold futures HL −0.7% [−1.6, −0.1]. Tiny.
- Direct-range HAR, 15-minute RV: no improvement.
- Recent 500-session multiplier (for gold's drift): pulls gold HL p50 hit from 56% → 53–54%, pinball unchanged.
Verdict: har_rv5 is the backbone; refinements are within 1%.

## 6. Calibration of har_rv5 (validation exceedance at p50/p75/p90, target 50/25/10)
- NQ F HL 52/26/9, regime miss 1.0pp. NQ C 50/23/8.
- Gold HL 56/28/10, OH 56/30/12 — narrow at p50 (2023–26 gold vol rose; expanding-history multiplier lags).
- EURUSD HL 48/25/12.
