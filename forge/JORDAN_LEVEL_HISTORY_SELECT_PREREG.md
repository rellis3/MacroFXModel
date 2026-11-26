# jordan-level-history-select: does choosing levels by their own history make Jordan's lines tradeable?

**Pre-registered 2026-11-26, before any outcome in this design was computed.** (It reuses the event files from
`level-context-engine`, built on 2026-11-25. Those were scored pooled across instruments only. No per-instrument
× line × tier walk-forward selection has been computed.)

| | |
|---|---|
| ID / ledger id | `jordan-level-history-select` |
| Branch | `jvphone` (pushed to main through the sparse worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `jordan-level-history-select` |
| Source | **Jordan, 2026-11-26** (paraphrased): he takes trades at the levels "based on historical analysis of what happens at the levels". No extra confirmation is needed. **Owner, 2026-11-26:** follow up on this. Our "every touch" MAE median sits above his (GC 55 vs 34 ticks), while the tails match. That points to him selecting which levels he trades |
| Data | `analysis/output/level-context-engine/events/{F,C}_*.parquet`: 25 NT8 futures (primary, net of 2.5 ticks ÷ u) and 40 OANDA CFDs (replication, gross), 2020-01-02 → 2026-08-21 (lockbox respected). Each touch has a placebo copy (the same line with its distance × 0.75–0.90 / 1.10–1.25) |
| Lines | **Jordan's lines only:** Close+ (`cup`), Close− (`cdn`), and the HL moving projections (`hlH` = running low + HL, `hlL` = running high − HL), at Median / P75 / P90. OH/OL are excluded (they're not his lines) |
| Seed | `20261126` |
| Uncertainty | date-clustered bootstrap, B = 1000, 90% CI |
| Scripts / outputs | `scripts/jordan-level-history-select/` → `analysis/output/jordan-level-history-select/` |
| Lessons applied | Jordan guidance first (his lines only, each line on its own, per instrument); placebo engine (the same selection run on placebo levels); walk-forward only (selection from years before the trade year); costs on; one fixed rule chosen before results |

## 1. Claim

Jordan's selection: for each instrument, line and tier, look at what has happened at that level before, and trade the
side (fade or follow) that has historically worked. That selection should earn a positive net R out of sample. It
should also beat the same selection run on placebo levels.

## 2. Design

**Trade per touch** (from `level-context-engine`):
- A ±u bracket, u = 0.25 line-σ, from the touch.
- The through side counts from the touch bar, the back side from the next bar.
- 120-minute cap with a mark-to-market exit.
- Fade R = `R_fade`, follow R = `R_cont`. Futures net = R − `cost_R`.

**Cell** (Jordan's "what happens at *that* level"): instrument × line (cup / cdn / hlH / hlL) × tier (50 / 75 / 90)
× touch bucket (1st touch of that line that day / later touches).

**Walk-forward:**
- The trade years are 2022, 2023, 2024, 2025 and 2026 (to 2026-08-21).
- For trade year Y, each cell's history is every touch in years < Y (expanding window from 2020-01-02).
- In history, compute the mean net R for fade and for follow, and pick the side with the larger mean.
- **Trade** that side on every touch of the cell in year Y if:
  - history has n ≥ 50 touches,
  - the chosen side's mean net R > 0,
  - and its t-stat (mean ÷ sd·√n) > 1.0.

  Otherwise skip the cell in Y.
- The same rule is run separately on the placebo events (**placebo engine**).

## 3. Hypotheses (primary, futures net)

- **S1:** the selected trades' pooled net R per trade over 2022 → 2026-08-21 is > 0.
- **S2:** the line engine minus the placebo engine (per-trade means, date-paired bootstrap) is > 0.

**Gates:**
- **VALIDATED** if the 90% CI is above 0, it survives BH q = 0.10 over the two, and the halves (2022–23 vs
  2024–26) agree in sign.
- **NULL** if the upper CI is below +0.02R.
- Otherwise **UNDERPOWERED**.

**CFD replication (gross):** the same S1 / S2. It is reported, not gated.

## 4. Descriptive (no gate)

- The variants:
  - rolling 2-year history instead of expanding;
  - t > 0 and t > 2;
  - minimum n of 30 and 100;
  - a cell without the touch bucket.
- The selected cells: the fade vs follow share, and the share per tier and line. Whether a cell's chosen side stays
  the same from one year to the next (persistence of the selection).
- Per selected trade, the excursions recorded at the touch:
  - for NQ, GC, 6E and 6J, the median `mae60` of selected vs all touches, in line σ and in Jordan's units (ticks / pips);
  - does selection shrink MAE toward his medians?
- Per-instrument test R for the selected trades (NQ, GC, 6E and 6J called out).

## 5. Power

Futures Jordan-line touches number about 300k (line) over 2020–26, about 230k of them in the trade years. The
selection is expected to keep 5–30%. At 20k trades and a per-trade SD of about 1R with date clustering, the SE is
about 0.01R, so the MDE is about 0.02–0.03R.

## 6. What it does NOT test

- Jordan's exact stop / target. The bracket is ±0.25 line-σ, not his tick stops.
- His live fills.
- Any selection beyond the level's own history.
- The lockbox.

## 7. What each verdict changes

- **VALIDATED:** a per-level "history says fade / follow" badge in shadow on the futures levels page, forward-logged.
  Nothing live changes.
- **NULL:** his selection, as we can reconstruct it from level history, doesn't add an edge on our lines after costs.
  The next step is to ask Jordan for the exact statistic he looks at (win rate? MAE? sample length?).

## Amendments

(none yet)
