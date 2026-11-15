# growth-inflation-quadrant — RESULTS (run 2026-11-15)

Prereg: `forge/GROWTH_INFLATION_QUADRANT_PREREG.md` (commit `11ce3c39`, pushed before any outcome was scored).
Runner: `scripts/growth-inflation-quadrant/run.py` (commit `242e3817`; `--repack` added for amendment A1). Seed 20261115.
Numbers: `results.json`. Evidence packs: `<cell>/evidence/EVIDENCE.md` for the nine 4-week map / transition / S2 cells.
Prices end 2026-08-21 (lockbox). Macro inputs are ALFRED vintages, snapshotted the day before each Friday.

## Headline

**No cell is VALIDATED. 7 NULL, 14 UNDERPOWERED, 0 CONTEXT.** Built from data as it was published and measured
against each market's own drift, C.OG's growth × inflation quadrant shows **no tilt for the dollar or US indices**.
**Gold leans the way the map says** (+0.13σ at 4 weeks), but it does not survive the correction for 21 cells, the
map-free (cross-fit) version of the same idea comes out negative, and the payrolls/CPI version is flat. The old
`MD files/REGIME.md` table ("S&P/Nasdaq up in goldilocks and reflation") was mostly **revised data plus drift**:
with today's revised numbers the indices estimate is +0.09σ; point-in-time it is +0.02σ.

The design could only ever see a large tilt (MDE ≈ an annualised information ratio of 1.0-1.5, prereg §5). So read
the verdicts as: **a large, folklore-size tilt is ruled out for the dollar and indices at every horizon**; for gold
it is ruled out at 4 and 8 weeks but not at 1-2 weeks. A useful-size tilt (IR 0.3) cannot be seen or excluded by any
test of a monthly macro label on 17 years of data.

## Verdict per cell

Estimate = mean of side × forward return (σ of the h-week return), demeaned per instrument (B0). CI = half-year
cluster bootstrap, B = 2000. Holm over 21 cells. "Large ruled out" = CI upper < the IR 1.0 tilt.

| Cell | Estimate [95% CI] | Holm p | MDE | Useful bar | Large ruled out? | Verdict |
|---|---|---|---|---|---|---|
| map usd 1w | −0.034 [−0.102, +0.038] | 1.00 | 0.154 | 0.042 | yes | **NULL** |
| map usd 2w | −0.038 [−0.137, +0.070] | 1.00 | 0.205 | 0.059 | yes | UNDERPOWERED |
| map usd 4w | −0.067 [−0.202, +0.070] | 1.00 | 0.288 | 0.083 | yes | **NULL** |
| map usd 8w | −0.073 [−0.227, +0.071] | 1.00 | 0.381 | 0.118 | yes | **NULL** |
| map gold 1w | +0.085 [+0.010, +0.155] | 0.46 | 0.136 | 0.042 | no | UNDERPOWERED |
| map gold 2w | +0.114 [+0.014, +0.205] | 0.39 | 0.186 | 0.059 | no | UNDERPOWERED |
| map gold 4w | +0.132 [+0.005, +0.256] | 0.69 | 0.253 | 0.083 | yes (just) | UNDERPOWERED |
| map gold 8w | +0.168 [+0.017, +0.321] | 0.64 | 0.317 | 0.118 | yes | UNDERPOWERED |
| map indices 1w | −0.017 [−0.079, +0.040] | 1.00 | 0.122 | 0.042 | yes | **NULL** |
| map indices 2w | −0.011 [−0.084, +0.066] | 1.00 | 0.172 | 0.059 | yes | UNDERPOWERED |
| map indices 4w | +0.018 [−0.079, +0.114] | 1.00 | 0.236 | 0.083 | yes | UNDERPOWERED |
| map indices 8w | +0.095 [−0.042, +0.224] | 1.00 | 0.316 | 0.118 | yes | UNDERPOWERED |
| transition usd 4w | −0.016 [−0.192, +0.129] | 1.00 | 0.414 | 0.083 | yes | UNDERPOWERED |
| transition gold 4w | +0.193 [+0.002, +0.393] | 0.91 | 0.497 | 0.083 | no | UNDERPOWERED |
| transition indices 4w | −0.183 [−0.473, +0.068] | 1.00 | 0.419 | 0.083 | yes | **NULL** |
| cross-fit usd 4w | −0.030 [−0.129, +0.105] | 1.00 | 0.226 | 0.083 | yes | UNDERPOWERED |
| cross-fit gold 4w | −0.085 [−0.224, +0.173] | 1.00 | 0.246 | 0.083 | yes | UNDERPOWERED |
| cross-fit indices 4w | −0.050 [−0.156, +0.100] | 1.00 | 0.253 | 0.083 | yes | UNDERPOWERED |
| S2 usd 4w | −0.113 [−0.219, −0.012] | 0.64 | 0.210 | 0.083 | yes | **NULL** (raw CI wrong sign) |
| S2 gold 4w | +0.045 [−0.068, +0.161] | 1.00 | 0.272 | 0.083 | yes | UNDERPOWERED |
| S2 indices 4w | −0.074 [−0.167, +0.019] | 1.00 | 0.195 | 0.083 | yes | **NULL** |

Sample: primary quadrant 2009-05-29 → 2026 (900 Fridays; claims and CFNAI vintages start 2009/2011), S2 from 2003-10
(USD), 2004-01 (indices) and 2006-12 (gold). 102 quadrant spells, median 8 weeks; each quadrant ~25% of Fridays.

## Why it holds or fails (evidence packs + gate)

- **Gold (map).** The best case for the claim. 1/2/4w pass every gate check except Holm: estimate above the useful bar,
  above the circular-shift placebo's 97.5th percentile (98th-99th percentile), positive in both halves (4w: +0.008 /
  +0.255 — almost all in the second half), survives top-1% removal (+0.117 at 4w). Per-quadrant 4w (demeaned):
  goldilocks −0.16, reflation −0.09, stagflation +0.10, deflation +0.14 — the map's ordering, every CI spanning zero.
  Against it: raw p 0.02-0.04 on one instrument, the four horizons are the same signal (not four confirmations), the
  first half is ~0, the by-year ladder is noisy (2013, 2015, 2023, 2024 negative; 2025 +0.74), the **cross-fit is
  −0.085** (signs learned in one half do not carry into the other), and **S2 is +0.045**. Pack diagnosis:
  UNDERPOWERED (1× bar plant on null-ized rows detected 0/40, 2× detected 40/40).
- **USD and indices (map).** Flat to slightly wrong-sign at every horizon. USD is negative in both halves and on 7/7
  pairs at 4w; indices +0.035 NQ / +0.001 SPX at 4w. The CIs exclude even the useful bar at USD 1/4/8w and indices
  1w, hence NULL. Pack diagnosis: UNDERPOWERED for the bar (0/40 at 1×, 40/40 at 2× bar), i.e. these NULLs come from
  the sign of the estimate, not from a powerful test.
- **Transitions.** 76 (gold) to 343 (USD) transition rows. Gold +0.19 (both halves positive, but below the placebo's
  97.5th percentile 0.28; 2× bar plant found only 4/40); indices −0.18 (5th percentile of the placebo: the map
  backwards after a change). Nothing usable; "transitions are where the money is" does not show in 4-week returns.
- **Cross-fit (map-free).** Negative for all three groups: whatever tilts exist in one half are not the tilts of the
  other half. This is the cleanest "is there any stable quadrant tilt" test, and it says no.
- **Placebo.** The registered placebo is the circular shift (keeps the quadrant's persistence). The packs' built-in
  row shuffle is far too narrow for a persistent label (e.g. S2 USD: shuffle 97.5% = 0.020 vs circular 0.106), as
  the prereg warned; the packs' placebo percentiles are not used for any verdict.
- **Lookahead canaries (both fired).** (a) Treating every vintage as released 35 days early changes the label on
  42% of Fridays and moves the 4w estimates (USD −0.091, gold +0.187, indices −0.036). (b) The REGIME.md method
  (today's revised data, one-month lag) agrees with the point-in-time label on only 65% of Fridays and gives indices
  **+0.090** (vs +0.018 point-in-time) and gold +0.164 (vs +0.132). The snapshot matters, and the revision path is
  where the old table's equity tilt came from. Leak canary in each pack (side = realised sign): estimate jumps to
  0.72-0.83, so the pipeline sees a leak.
- **Positive controls.** `--selftest`: planted 0.25σ/week tilt → 7/7 cells VALIDATED; zero world with drift → none.
  On the real rows, an effect of each cell's MDE is found 100% of the time on the positive-estimate cells (c7).

## Amendment

**A1 (post-hoc, describe only).** The plants in gate c7 and in the first evidence packs were added on top of the real
estimate, so negative-estimate cells read 0% detection regardless of power. Packs rebuilt with plants on null-ized
rows (`--repack`); c7 left as coded and flagged confounded in `results.json` (`gate_c7_note` on every cell with a
non-positive estimate). No verdict changes: no cell passes c1.

## What this changes for the morning card

- **Dollar and indices:** the quadrant line must not carry a direction. Stop printing REGIME.md's "In this backdrop
  since 2007: S&P ↑ (+1.2%/mo), Nasdaq ↑" as a tilt — point-in-time and net of drift it is ~0, and a large tilt is
  ruled out. Honest wording: *"Quadrant: X (a backdrop description; no measurable 1-8 week tilt for USD or indices)."*
- **Gold:** at most a research-only line: *"gold has leaned up in stagflation/deflation and down in goldilocks
  (+0.13σ over 4 weeks, not significant after correction, unstable across halves)"*. Not a card input.
- **Transitions:** no "quadrant just flipped" flag.
- The quadrant's REGIME.md range finding (stagflation months widest) is untouched by this study.

## Where the nulls point next

- **Gold is the only lead**, and the next test should be stricter, not wider: the gold map on an independent sample —
  pre-2009 with the S2 legs and a longer gold price history (LBMA/FRED pre-2006), or the post-lockbox forward record —
  pre-registered as a single cell so Holm over 21 no longer applies.
- **Power is the binding constraint**, not the construction: any monthly macro label has ~35 independent half-years
  since 2009. Quarterly horizons and a 1970s+ sample (indices from FRED NASDAQCOM, dollar from DTWEXM; payrolls/CPI/IP
  vintages back to the 1960s-90s) are the only route to seeing an IR ~0.5 tilt.
- The **cross-fit's negative sign** suggests the quadrant → asset mapping changed around 2017 (e.g. equities rallying
  in "deflation" as the Fed eased). A regime-of-the-regime question belongs with the policy-path work, not here.
- Range by quadrant (point-in-time) remains untested and is the desk's better-odds use of this label.
