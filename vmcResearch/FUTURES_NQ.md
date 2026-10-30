# VuManChu on NQ futures vs the NQ CFD (exploratory)

Register row `nq-futures-vmc`, 2026-10-30. Owner question: re-run the VuManChu analysis (momentum / WaveTrend, VWAP
oscillator, Money Flow, divergences) on the owner's CME NQ 1-minute file and see whether the futures data shows a
relationship to price that the CFD doesn't.

**Setup.** The existing `vmcResearch` pipeline, unchanged apart from the loader fix below, on two inputs over the same
span (2016-01-04 to 2026-04-22; the futures file ends there, so the lockbox is untouched):

- `nqfut`: the owner's file (`analysis/output/nt8/drive/NQ_1m_drive.parquet`, real traded volume, ratio back-adjusted);
- `nqcfd`: the OANDA CFD cut to the same span.

Scripts: `panel.py` / `fast_panel.py` (features), `futures_ic.py` (new: correlation with past and future moves),
`div_study.py` (divergence), `structural.py` (swing pivots). Volume only enters the VWAP component: `money_flow_vmc`
is built from candle shape, so real volume cannot change Money Flow.

## A bug found on the way (fixed)

The first futures run showed 5-minute WaveTrend slope "predicting" the next 15 minutes with a correlation of 0.39, against
0.01 on the CFD. That was a timestamp-unit bug, not an edge. The futures parquet is stamped in microseconds, and
`panel.py` turns timestamps into seconds with `int64 // 10**9`, which assumes nanoseconds. Every timeframe was then
aligned onto bars that hadn't closed yet (`tf5_close` disagreed with `close` on 68% of rows).

`load_m1` now converts the index to nanoseconds. That changes nothing for the CFD files, which were already nanoseconds.
After the fix, `tf5_close` equals `close` on every row for both sources. Any future study feeding a microsecond-stamped
file through this pipeline would have hit the same leak.

## Results: futures = CFD

**1. Correlation with the future move** (`futures_ic.csv`). This covers 6 components (wt1, WT spread, WT slope, MF,
MF slope, VWAP distance) × 4 timeframes (5m-4h) × 3 horizons (15m, 50m, 4h). Samples are non-overlapping, and the
partial correlation removes the recent return.

| | CFD | futures |
|---|---|---|
| largest \|correlation with the past move\| | 0.87 | 0.87 |
| largest \|correlation with the future move\| | 0.020 | 0.024 |
| largest \|partial future correlation\| | 0.013 | 0.025 |
| cells with \|t\| > 3 (of 72) | 9 | 9 |

Every component describes what price just did, at up to 0.87, and predicts essentially nothing about what it does next.
The few cells with |t| > 3 are around 0.01 in size, and most are slightly negative, i.e. mild mean reversion. That is
the August study's result, reproduced on futures.

**2. Divergence** (`div_study.py`: 1/3/5/15-minute; WaveTrend, WT2, Money Flow and VWAP divergences; 5-60 minute
horizons; all, "extended then diverging" and late-New-York conditions; 160 tests each). Positive means the divergence
paid in its own direction.

| condition | futures: mean signed / tests positive | CFD |
|---|---|---|
| all | -0.001 sigma, 63/160 | -0.003 sigma, 51/160 |
| extended then diverging | -0.007 sigma, 56/160 | -0.010 sigma, 48/160 |
| late New York | -0.010 sigma, 53/160 | -0.011 sigma, 45/160 |

On NQ, divergence doesn't pay on either source: it is slightly negative on average. The August finding that 1-minute
VWAP divergence works in FX was already negative on NQ, and real futures volume doesn't change that.

**3. Swing pivots: "is this THE high?"** (`structural.py`; MAJOR = never regained and ran 2 sigma)

| | swings | MAJOR | best separator | t |
|---|---|---|---|---|
| futures | 21,933 | 25.7% | 5m VWAP distance (2.94 vs 2.43) | 11.4 |
| CFD | 20,856 | 26.2% | 5m VWAP distance (3.04 vs 2.59) | 10.6 |

The one real VuManChu finding replicates on futures at the same size. At a confirmed swing pivot, a bigger stretch from
5-minute VWAP means the swing is more likely to be the real turn. This is VWAP extension, not the WaveTrend dots,
Money Flow or divergence. It is a tilt, not a signal, and it is known only once the pivot is confirmed. Measured at the
moment of a forecast-line touch instead, it added nothing
(`analysis/output/day-reconstruction/futures_check/RESULTS.md`).

**Verdict: context.** Real futures volume and prices reproduce the CFD picture. VuManChu components describe recent
momentum and don't forecast price on NQ. Only VWAP extension at a confirmed pivot carries information, as before.
