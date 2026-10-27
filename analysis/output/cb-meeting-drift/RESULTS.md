# cb-meeting-drift — results

Prereg: `forge/CB_MEETING_DRIFT_PREREG.md` (committed in `dd8e7ff`, 2026-10-26). Run 2026-10-26, seed 20261026,
B = 2000 (placebo 10,000). Branch `ccr-42a42ec1-xka4ex`. Ledger ids: `cb-meeting-drift-own`, `cb-meeting-drift-continue`.
Script `scripts/cb-meeting-drift/cb_drift.py`.

## Verdict: H1 NULL · H2 UNDERPOWERED

**H1** (own currency rises over the 5 sessions after an ECB or BoE decision, as the dollar does after the FOMC) misses
every gate. Event minus control is **−6.5 bp [−23.0, +12.0]**. The upper bound is under the registered +15 bp null
line, so an FOMC-sized drift is ruled out: **NULL**.

**H2** (the decision-day move, 12:00 → 16:00 London, continues over D+1..D+5) is **+14.6 bp [−1.1, +31.2]**,
p 0.077. That isn't significant after Holm across the two hypotheses. It sits at the 95.1st placebo percentile and is
positive in both halves (+16.3 / +13.1). Two of the three gates hold, the first doesn't, and the interval still
includes effects above +15 bp: **UNDERPOWERED**.

## Scored cells

| Cell | n | Estimate | 95% CI | MDE | Pass bar | Holm | Cell verdict |
|---|---|---|---|---|---|---|---|
| H1 pooled (own currency up) | 170 (103 ECB, 67 BoE) | −6.5 bp | [−23.0, +12.0] | 26.5 bp | CI > 0, placebo > 95th, both halves | p 0.47, fail | NULL |
| H2 pooled (continuation) | 170 | +14.6 bp | [−1.1, +31.2] | ≈ 26.5 bp | same | p 0.077, fail | UNDERPOWERED |

## Controls

- Placebo: H1 event mean at the 22.7th percentile of 10,000 control-window means; H2 at the 95.1st.
- Halves (split 2020-07-01): H1 +1.3 / −12.4 bp; H2 +16.3 / +13.1 bp.
- Excluding the 48 windows that contain an FOMC decision: H1 −6.1 bp (unchanged).
- Two windows couldn't be priced (ECB and BoE 2025-12-18; the D+5 end falls in the Christmas gap). They are counted
  here, not silently dropped.

## Deviations from the prereg

None.

## Descriptive (not part of the verdict)

| | n | H1 event − control | H1 win (event / control) | H2 event − control | H2 win |
|---|---|---|---|---|---|
| ECB / EURUSD 2014–2026 | 103 | −2.6 bp (p 0.82) | 50.5% / 48.2% | +16.9 bp (p 0.13) | 58.3% |
| BoE / GBPUSD 2018–2026 | 67 | −12.7 bp (p 0.41) | 41.8% / 49.7% | +11.1 bp (p 0.47) | 58.2% |

No per-bank cell survives Benjamini–Hochberg at q = 0.10.

## What this changes

- The post-FOMC dollar drift does not generalise to "the meeting currency rises after its central bank meets". Pages
  should describe it as a Fed effect only.
- H2 is a lead, not a result: in both banks, the decision-day move continued over the next week about 58% of the
  time, against about 50% on ordinary days. Pooling more banks (BoJ, RBA, BoC, SNB, RBNZ, whose dates aren't in
  this checkout) is the registered next step that would give it the power to be judged.
