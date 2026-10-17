# COG-DYNAMIC-LEAD, Addendum D: the episode framing applied to the intraday SOFR, Euribor (I2!) and ESTR futures

*Registered 2026-10-17, on the owner's instruction to make sure the Euribor `I2!` and SOFR futures data are tested with the same framing as the yield spreads. It is registered after the daily results of Addendum C were read (disclosed: those were negative under the registered rules, with the confirmed-episode effect present in 2016 and 2020 and absent or reversed in the other years) and before any intraday episode was detected.*

## What is and is not `I2!`
C.OG's `ICEEUR:I2!` is the continuous second Euribor contract. In the video week it resolved to the **Mar-2027 quarterly (IH7)** (established in the reconstruction, `analysis/output/cog_video_0918/RECONSTRUCTION.md`), not a serial month. Expired contracts cannot be fetched from IBKR, so a literal stitched `I2!` history before April 2026 does not exist in our data. The stand-ins used here are the live Euribor quarterlies **IH7 (Mar27) and IZ6 (Dec26)** back to listing, and the ESTR quarterlies ER3Z6 / ER3H7 (the leg C.OG's Discord note named). SOFR = **SR3U6, SR3Z6, SR3H7** (CME 3-month SOFR). A literal `I2!` can be stitched for 2026-04 to 2026-10 only (serial contracts IK6, IM6, IN6, IQ6, IU6, IV6, IX6 plus IZ6, IH7 by nearest expiry); that is about 6 months, too short for Discovery / Validation / out-of-sample, so it is reported descriptively and is not part of any family.

## Lines (17, fixed now; rate = 100 - price in bp, 15-minute bars, close-labelled, screened for at least 3 distinct prices per leg per day, window 2024-04-15 to 2026-08-20; raw rate arithmetic only, no display scale, offset or plot lead)
- **Single legs (7)**: SR3U6, SR3Z6, SR3H7, IH7, IZ6, ER3Z6, ER3H7 (each as a rate level).
- **Calendar (policy-path) spreads (5)**: SOFR SR3Z6 - SR3U6, SR3H7 - SR3Z6, SR3H7 - SR3U6; Euribor IH7 - IZ6; ESTR ER3H7 - ER3Z6. These are the "futures spreads" of the owner's brief that were not tested before.
- **Cross-curve spreads (5)**: P0 to P4 of COG-MATCHED-PAIRS (SR3U6-IH7, SR3H7-IH7, SR3Z6-IZ6, SR3Z6-ER3Z6, SR3H7-ER3H7).

## Assets
The same 34 (27 FX pairs, gold, SPX500, US30, US2000, NAS100, DE30, UK100), OANDA 1-minute research cache resampled to the registered 15-minute bars; nothing after 2026-08-20.

## Episode definition (identical logic to Addendum C, in 15-minute units)
1. **Spread move**: |x| >= z0 where x = (line change over k bars) / (sigma x sqrt(k)), sigma = standard deviation of the line's 1-bar changes over the previous 20 trading days (at least 10); z0 in {1.0, 1.5, 2.0}; k in {4, 16, 96} bars (1 h, 4 h, 1 day); a cooldown of 16 bars (4 h) per line.
2. **Expected direction** for asset a: sign of the rolling contemporaneous slope of the asset's 1-bar return on the line's 1-bar change over the previous 20 trading days (data to t0 - 1) times the sign of the move.
3. **Confirmation**: the asset's move over the next m bars in the expected direction is at least c of its typical move (sigma_a x sqrt(m), sigma_a over the previous 20 trading days); m in {1, 2, 4, 8} bars; c in {0.25, 0.5, 1.0}. Entry at the close of t_c = t0 + m.
4. **Trade**: hold h bars, h in {4, 16, 96, 192} (1 h, 4 h, 1 day, 2 days); net of the class round-trip cost (as registered: USD majors 0.8 bp, EURGBP / EURJPY / EURCHF 1.2, other crosses 2.0, gold 2.5, indices 1.5).
5. **Coupling state**: "any", or "coupled" = the contemporaneous R-squared over the previous 5 trading days (480 bars) is at least 0.02 and the sign of that 5-day slope equals the sign of the 20-day slope.
Specs: 3 x 3 x 4 x 3 x 4 x 2 = **864**, plus **32 divergence specs**: divergence = the asset moved against the expected direction by at least c over m bars; m in {1, 2, 4, 8}, c in {0.5, 1.0}, h in {16, 96}, z0 = 1.5, k = 16, state any, each scored as catch-up and as breakdown (4 x 2 x 2 x 2 = 32). Each spec is pooled over the 17 lines and 34 assets; **family = 896**.

## Statistic, selection, null, gates (as Addendum C)
Mean net signed return in bp per trade with one-sided t from **day-clustered** standard errors (one cluster per UTC date, conservative); Discovery 2024-05-01 to 2025-03-31 -> Validation 2025-04-01 to 2025-12-31 -> out-of-sample 2026-01-01 to 2026-08-20; Step 1 BH-FDR 10% (mean > 0), Step 2 survivors p < 0.05 and BH 10%, Step 3 frozen scored once out of sample; selection-aware placebo with each line circularly shifted by an independent random 5 to 60 days (**200 draws**) with the whole pipeline rerun, so momentum / drift / the confirmation rule alone are in the null; real counts and best out-of-sample mean must exceed the placebo's 95th percentile; failure rate per quarter; practical-application gate as Addendum C with the out-of-sample years replaced by the two out-of-sample quarters being positive.

## A-priori pairs (economically motivated; pre-fixed spec z0 1.5, k 16, m 4, c 0.5, h 96, state coupled; Holm over the list)
(line -> asset): SR3Z6 -> EURUSD, USDJPY, GOLD, SPX500, NAS100; IH7 -> EURUSD, EURJPY, DE30; IZ6 -> EURUSD, DE30; ER3Z6 -> EURUSD, EURGBP; SR3Z6 - SR3U6 -> EURUSD, USDJPY, GOLD, NAS100; P0 -> EURUSD, USDJPY; P3 -> EURUSD, EURGBP. 24 pairs.

## Questions answered in the report
Which of the 17 lines, if any, show a confirmed-episode excess over the placebo and in which periods; whether the euro leg (`I2!` stand-ins) or the SOFR leg carries it; whether the calendar (policy-path) spreads do better than the cross-curve spreads; the response delay and its consistency; the failure rate; whether the coupling state or the confirmation can be recognised in time (the out-of-sample rows).

## Not changed after results
Everything above. Anything promising that fails a step is recorded as exploratory with the step it failed. The literal 2026 `I2!` stitch, if built, is descriptive only.
