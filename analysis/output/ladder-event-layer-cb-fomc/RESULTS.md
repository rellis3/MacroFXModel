# ladder-event-layer-cb-fomc: results

Prereg: `forge/LADDER_EVENT_LAYER_CB_FOMC_PREREG.md` (pushed 770a99a1 before scoring). Layer fitted by
`scripts/ladder-event-layer-cb-fomc/fit_layer.py` → `js/ladderV2EventLayerCfdParams.json`; forward test
`forward.py score`, run **once** on 2026-11-24 with the owner's OK. Seed 20261124, B = 2000. Numbers
`forward_results.json`; every scored row `forward_rows.csv`; in-sample `insample.json`.

Forward window 2026-08-24 → 2026-11-23: 66 sessions × 40 CFDs (UK100 65), base = the site's own CFD QLIKE per-line
levels (production API), realised from OANDA M5 mid. 12 decision dates; 632 instrument-line event rows (360 on
central-bank days, 272 on FOMC days), 190 instrument × line cells.

## Verdict: **NULL** (pre-registered statistic)

| | Δ pinball, layer 2 vs base, event days |
|---|---|
| **Pre-registered**: mean over cells of the cell ratio | **+3.36% [−0.20, +15.05]** → CI lower > −0.5% → NULL |
| All sessions (layer is ×1 off event days), same statistic | −0.75% |

## Descriptive (cannot change the verdict)

The equal-weight mean of cell ratios gives a quiet cell (a few small-loss rows on a close line) as much say as a
big HL miss. Pooling the loss instead (sum over all event rows) tells a different story:

| Pooled event rows | Δ pinball |
|---|---|
| All event days | −7.3% |
| Central-bank days | **−13.6%** (HL −22.6%, Close+ −18.3%, OH −8.2%, OL −8.4%, Close− −6.1%) |
| FOMC days | **+3.5%** (HL −8.2%, but Close− +15.6%, OH +5.6%, OL +4.8%, Close+ +5.7%) |

**Coverage (share of sessions beyond the line, targets 50 / 25 / 10%):**

| | base p50 / p75 / p90 | layer 2 p50 / p75 / p90 |
|---|---|---|
| Central-bank days (360) | 68% / 46% / **27%** | 58% / 31% / **18%** |
| FOMC days (272) | 52% / 21% / 9% | 45% / 20% / 7% |
| Ordinary days (9,922) | 49% / 24% / 9% | unchanged |

**By date:** the layer helped a lot on the big decision days (2 Sep BoC + RBNZ −22%, 18 Sep BoJ −29%, base p90 beaten
on 60–64% of rows) and hurt on quiet ones (30 Oct BoJ +29%, 3 Nov RBA +19%, base p90 beaten 4%).

Read: on central-bank days the base runs far too narrow (p90 beaten 27% of the time forward, against 10%) and the
layer roughly halves that gap; on FOMC days in this window the base was already wide enough and the layer
over-widened the open-to-extreme and close lines. Twelve dates is too few to separate "central-bank days need wider
levels" from which decisions happened to be lively. Graded weight: **weak, mixed**: promising for central-bank days
on HL, against for FOMC on the close lines.

## What it changes

- Layer 2 stays on the CFD export as a **switchable shadow layer, default OFF** (prereg). The base is unchanged;
  unticking the box returns it exactly. The params file carries `verdict: "null"`.
- Nothing about this result can promote the layer. Candidate for a later prereg (post-hoc, named here only): a
  central-bank-only layer, judged on the next decision dates forward (pooled loss, HL first).
