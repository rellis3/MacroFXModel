# ONE RANGE FORECAST: do the validated market-state flags still add on top of the shipped lines?

*Pre-registered 2026-10-18, before any number in this file was computed. Build item 2 of
`plans/DATA_AND_INTEGRATION_TRACKER.md`. It decides what the single daily range forecast contains, before four
outputs (Daily Plan, Global Read, the 07:00 digest, the bot) are pointed at it.*

## Why

The daily range is called in four places that never meet:

| Output | Lines it uses | Adjustments it applies |
|---|---|---|
| Daily Plan (`/api/vol-forecast/persist-ladder`) | **SI / S**: persistence + implied vol where IV exists, persistence elsewhere (the FORECAST_PICK winner) | none |
| Global Read (`js/globalReadCore.js` `rangeView`) | the **plain** ladder (`ladder_flat`) | IV÷σ, VIX inverted, VIX front dear/calm, all six down, NQ down-week, NQ gamma sign |
| 07:00 digest (`/api/range-calls`) | 1.0 ATR | its own "fired effects" |
| Live bot | COG bands on the platform σ | none |

The flags Global Read applies were validated on top of the **IV-adjusted** ladder (COMBINED_RANGE, US_EXTRAS_CONFIRM).
They have never been tested on top of SI, which already contains IV÷σ and a persistence term that partly tracks the
same regimes. Stacking them without a test double-counts (Lesson 01 §05). So this test asks one question per add-on.

## Rows, folds, score (identical to FORECAST_PICK so the numbers are comparable)

- **Rows:** the Step 0 table (`forge/FORECAST_HISTORY_SPEC.md`), out-of-sample sessions 2020-08-21 → 2026-08-20,
  complete sessions. Lockbox (after 2026-08-21) untouched.
- **Live-type inputs** (FORECAST_PICK variant 1): live σ, live-type implied vol (VIX/VXN/GVZ/CME ATM30).
- **Walk-forward:** folds 0–5, every coefficient and width fitted only on sessions before the fold's first test date
  minus a 5-session embargo.
- **Score:** pinball over all 12 rungs (OH/OL/HL/OC × p50/p75/p90) ÷ the session's plain σ_used, pooled; date-block
  bootstrap (block 20, 2,000 reps) for 95% intervals.

## Q1 — the US market-state flags (primary)

**Instruments:** NQ, SPX500, DOW, US2000 (the scope US_EXTRAS_CONFIRM confirmed; DE30/UK100/FX/gold are excluded
because the flags made them worse or did nothing in COMBINED_RANGE, and this test does not reopen that).

**Features** (definitions and cut-offs frozen in `forge/run_combined_range.py`; every value dated strictly before
the London session):

| Feature | Definition |
|---|---|
| `vix_inv` | VIX > VIX3M at the previous close |
| `front_dear` / `front_calm` | VIX9D ÷ VIX ≥ 0.9669 / < 0.8858 |
| `all_down` | NQ, SPX500, DOW, US2000, DE30, UK100 all closed down on the last New York-close day before the session |
| `nq_dw` | NQ 5-day return to the last New York close ≤ −1% |

Index closes come from the New York-close daily bars (`analysis/output/ladder_candidates/d1/<NAME>.json`, the bars
the live σ is built from); the d-dated bar ends 22:00 London on d, so "strictly before London date D" is known at
the open.

**Arms:**
- **SI** — as shipped: persistence + IV, β fitted on the whole indices class.
- **SIX** — SI's features plus the five flags, one ridge fit (λ = 1, standardised, centred per instrument) on the
  four US indices, widths refit.
- **SI-US** (diagnostic only) — SI's features fitted on the four US indices alone, to separate "the flags help"
  from "fitting on US indices only helps".

**Pass rule (SIX vs SI, the four US indices pooled):**
1. pooled pinball ratio SIX ÷ SI ≤ **0.99** (point) with the 95% interval wholly below 1;
2. SIX better on **≥ 3 of 4** instruments;
3. HL p75 regime miss (max |exceedance − 25%| across quiet / normal / busy) no worse than SI's by more than 0.5 pp.

The 1% bar is the FORECAST_PICK tie rule doubled: SIX adds three live dependencies (VIX3M, VIX9D, six index closes),
so it has to earn more than a tie. The diagnostic SIX ÷ SI-US is reported; if Q1 passes but SIX ÷ SI-US ≥ 1, the
verdict is **MIXED** (the gain is the fitting pool, not the flags) and the flags do not ship.

## Q2 — NQ dealer gamma sign (secondary, NQ only)

**Feature:** `gex_short` = NQ net GEX < 0 (`oi_research_book/data/daily_master_near_nas100_usd.parquet`,
`net_gex_sum`, the G2 primary spec). **Lag: OI dated ≤ D−2** for London session D, because the CME trade-date-D−1
open interest is published after the London open (the live capture reads it at 07:30 London). The D−1 lag is
reported as a descriptive line only.

**Arms:** the Q1 winner's features (SIX's if Q1 passes, SI's otherwise) fitted on NQ rows alone, with and without
`gex_short`. Fitting both on NQ alone, on the **same** training rows (NQ sessions that have GEX), isolates the gamma term; otherwise the shorter, more recent training window alone could look like a gain (found by the harness's injection check before any real run). Rows: NQ sessions with GEX
(≈ 2020-09 → 2026-08).

**Pass rule:** NQ pinball ratio ≤ 0.99 with the 95% interval below 1, and NQ HL p75 regime miss not worse by more
than 0.5 pp. n is one instrument, so the interval decides.

## Decision (fixed now)

- **The single forecast** is SI where implied vol exists and S elsewhere (already the winner), **plus** the Q1 flags
  for NQ/SPX500/DOW/US2000 if Q1 passes, **plus** the gamma sign for NQ if Q2 passes.
- It is served from one place (a `rangeForecast` brick behind one endpoint). Daily Plan, Global Read and the 07:00
  digest read it.
- **Global Read stops re-applying** IV÷σ (already inside SI), and re-applies the flags or GEX only if they did NOT
  pass here as part of the forecast — in that case they become display chips with no multiplier, never a second
  adjustment on top of SI.
- **The bot is out of scope.** Changing its lines changes its trades; it needs its own costed, pre-registered
  backtest before it reads this forecast.
- If neither Q passes, the single forecast is SI / S alone and the flags stay as context chips.

## Output

Script `scripts/forecast_history/one_forecast.py`; results `analysis/output/one_forecast/RESULTS.md` and
`results.json`. Needs the local Step 0 table, the New York-close bars and `oi_research_book/data` (the laptop; a cloud
session has none of them).

## Variant log

| # | Variant | Why | Run? |
|---|---|---|---|
| 0 | as above | registered | not yet |
