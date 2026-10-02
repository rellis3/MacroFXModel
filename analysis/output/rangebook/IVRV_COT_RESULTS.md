# IV ÷ RV in the book, the rich-IV break rule on indices, COT at the lines — results

Pre-registration: forge/IVRV_COT_PREREG.md (bac14d5). Within-cell (line family × London hour × range used) continue differences, day-bootstrap 95% CI. R net of spread. Every IV ÷ RV value is asserted to come from a date before the pass.

## A — IV ÷ RV as a column in the book (7 CVOL instruments)

Rich (top third, ≥ 1.27) vs cheap (bottom, < 1.05) implied vol: continue +4.4pp [+3.1pp, +5.7pp], 2016–22 +4.0pp, 2023–26 +5.1pp, n 57,106 / 69,629 — **real**.

| third | passes | continue | follow R (halves) | fade R (halves) |
|---|---|---|---|---|
| cheap | 69,629 | 34% | -0.040 (-0.039 / -0.043) | -0.042 (-0.046 / -0.036) |
| middle | 67,685 | 36% | -0.051 (-0.056 / -0.042) | -0.039 (-0.033 / -0.050) |
| rich | 57,106 | 40% | -0.017 (-0.017 / -0.017) | -0.081 (-0.080 / -0.082) |

## B — the rich-IV break rule on NQ, SPX, DOW, US2000 (confirmation of forge/BREAK_IVRV_PREREG.md)

Index IV ÷ RV edges (2016–22): 1.17 / 1.53. Top third +0.071R (n=1,129), middle -0.133, bottom -0.038 (n=1,079); top-third longs +0.096, shorts +0.053. Per index (top third): DOW +0.333, NQ +0.019, SPX -0.159, US2000 +0.212.

| condition | holds? |
|---|---|
| top third net R > 0 | yes |
| top > bottom | yes |
| shorts alone > 0 | yes |

**B: CONFIRMED**

Index book race, rich vs cheap: continue +4.4pp [+2.4pp, +6.5pp] (2016–22 +3.4pp, 2023–26 +5.7pp).

## C — COT positioning at the lines (8 instruments)

Touch heading the way speculators are crowded vs against them: continue -2.7pp [-4.1pp, -1.4pp], 2016–22 -1.8pp, 2023–26 -4.3pp, n 49,802 / 53,097 — **real**.

| group | passes | continue | follow R (halves) | fade R (halves) |
|---|---|---|---|---|
| with the crowd | 49,802 | 35% | -0.042 (-0.036 / -0.053) | -0.050 (-0.056 / -0.039) |
| against the crowd | 53,097 | 38% | -0.030 (-0.039 / -0.014) | -0.063 (-0.054 / -0.078) |
| no crowding | 149,288 | 37% | -0.042 (-0.042 / -0.043) | -0.047 (-0.049 / -0.043) |

T2 (A + C): BH 10% over 10 rows, 0 survive; passing both halves too: none.

## Reading
- **Rich implied vol means continuation, on FX/gold AND on indices**, in the plain book race too: +4.4pp on both sets,
  both halves. On FX/gold the rich third's follow trade loses only −0.017R in each half — the closest a plain line
  trade has come to break-even.
- **The rich-IV break rule replicates on the indices** under its pre-registered conditions (+0.071R top third, shorts
  +0.053R, top above bottom). Caveats: 1,129 trades; SPX (2021→ only) is negative, DOW and US2000 carry it, NQ +0.019R.
- **COT: crowded positioning fades at the lines** (touches heading the crowded way continue 2.7pp less; both halves),
  the same direction the August factor test leaned. Small, not tradeable on its own.
- Data: CBOE VXN/VIX/VXD/RVX downloaded 2026-10-02 (analysis/output/rangebook/cboe/); COT via
  scripts/rangebook/cot_fetch.mjs (analysis/output/rangebook/cot/).
