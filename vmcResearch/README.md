# vmcResearch — VuManChu as a state / confluence layer

A fresh study, built independently of any earlier VuManChu work in this repo.
Nothing from `vumanchuLab/FINDINGS.md` or the `MD files/` write-ups was read or
reused; the only shared code is the indicator math in
`pylego/indicators/vumanchu.py` (WaveTrend, `money_flow_vmc`,
`causal_vwap_dist`, `align_htf_causal`), which is arithmetic, not conclusions.

## The question

Not "does a green dot predict price". Rather: taking **price events as the
independent variable**, does the multi-timeframe VuManChu state carry
information about whether a move continues, pulls back, reverses, or ranges —
enough to act as a state/confluence layer inside a larger system?

## Data

38 instruments are available as M1 parquet; 12 were used, chosen to span
correlated majors, crosses and two non-FX markets so that replication means
something:

    eurusd gbpusd usdjpy audusd usdcad usdchf
    eurjpy gbpjpy audjpy eurgbp          (FX)
    xauusd nq                            (non-FX — the honest holdout)

2016-01-04 → 2026-08-20, 3.84M M1 bars per instrument → 792k M5 rows.

## Layout

| file | role |
|---|---|
| `vmcfeat.py` | per-timeframe VuManChu state vector + divergence |
| `panel.py` | MTF panel: M5 base, 15m/1h/4h aligned by bar close, forward labels |
| `validate.py` | **leak tests** — run this before believing anything |
| `events.py` | price-only event taxonomy and trend-relative outcomes |
| `levels.py` | significant-level construction and touch detection |
| `stats.py` | matched baselines, batch-means SE, shuffled-label null bar |
| `cells.py` | the state definitions, one function per brief section |
| `run_analysis.py` | scores every state against both outcome families |
| `pool.py` | cross-instrument replication |
| `levels_pooled.py` | pooled level tests, MFE/MAE, reversal anatomy |
| `model.py` | gives a GBM every feature at once — the ceiling test |
| `report.py` | assembles all tables |

## Rebuild

    python vmcResearch/panel.py --instruments eurusd,gbpusd,...
    python vmcResearch/validate.py            # must print ALL LEAK CHECKS PASSED
    python vmcResearch/run_analysis.py --instruments ...
    python vmcResearch/levels_pooled.py
    python vmcResearch/model.py
    python vmcResearch/pool.py
    python vmcResearch/report.py > vmcResearch/RESULTS.txt

## The four things that stop this study lying to itself

**1. Causality is tested, not asserted.** `validate.py` rebuilds the panel on
truncated history and requires every causal column to be bit-identical across
the cut. This caught a real leak during development: the WaveTrend shape
classifier set its "steep slope" threshold from a whole-array percentile, so a
2026 volatility spike was classifying a 2016 bar. Multi-timeframe columns are
step-held by bar **close**, never bar start — forward-filling a 4H oscillator
onto M5 rows by start time leaks up to 3h59m of future into every row and makes
MTF agreement look spectacular for entirely mechanical reasons.

**2. Autocorrelation is absorbed, not assumed away.** 792k M5 rows are not
792k observations; a 4h forward label means ~48 consecutive rows share nearly
the same outcome. Every standard error is a batch-means estimate over
contiguous time blocks.

**3. Baselines are matched.** A VuManChu state is not randomly assigned —
"4H oversold" concentrates in high-volatility regimes and particular sessions,
which independently predict outcomes. Each cell is compared against the global
outcome mean **re-weighted to that cell's own** (session × volatility ×
prior-move) distribution.

**4. The significance bar is measured, not assumed.** Scanning 656 cells at
t=2 guarantees ~15 spurious findings. `Scorer.null_threshold` circularly shifts
the outcome — preserving its autocorrelation, breaking only its alignment with
the state — and reports the |t| a scan of this shape reaches by chance. On this
data that bar is **|t| ≈ 3.3–3.9**, not 2.0.

## Reading the results

`cross_t` in the pooled tables overstates its case: EURUSD, GBPUSD and AUDUSD
share a USD leg, so one USD-driven effect appears as three confirmations and
the cross-instrument SE collapses. Prefer, in order: **effect size**, **sign
consistency**, and **whether XAUUSD and NQ agree** — those two are the only
genuinely independent replicates in the set.
