# Forecast Level Analyser — Design Spec

> A public, shareable analytics tool that **measures, never trades**. For every
> pair on R2 (FX + NASDAQ + DAX + Gold + indices), it computes the vol/range
> forecast levels each day and reports what price *actually did* relative to
> them — hit rates, reversion vs continuation, retracement depth, sliced every
> way that matters. No entries, no stops, no costs: pure measured base rates.
>
> Design basis before building. Companion to `REVERSION_CONTINUATION_CONCEPT.md`
> and `FORECAST_WORKLOG.md`. Follows the lego principle in `CLAUDE.md`.

---

## 1. Purpose & Audience

- **Internal:** produce the empirical ground truth that calibrates the
  fade/follow selector and sets honest expectations for any forecast strategy.
  This is the non-overfittable layer the backtester should be calibrated against.
- **Public:** a polished, read-only research tool others can review (like the
  range-analysis site). Credibility comes from transparency — methodology,
  sample sizes, coverage and last-refresh all visible.

**Hard rule:** the analyser simulates no trades. It records level interactions
only. This is what makes it immune to the stop/fill artifacts that broke the v2
backtester (see `FORECAST_WORKLOG.md`).

---

## 2. The Forecast Levels (what we measure against)

Reuse the lego core (`computeBands`, `volSigmaSeries`, `classifyRegime`). Per
window (daily / weekly / 20-day), off the open and the walk-forward σ:

| Level | Term | Meaning |
|---|---|---|
| Proj H/L med | HL50 = 1.572·corr·σ | median expected high / low |
| Proj H/L 75p | HL75 = 2.049·corr·σ | 75th-pct high / low (the extreme) |
| Close med | OC50 = 0.6745·corr·σ | median close displacement |
| Close 75p | OC75 = 1.150·corr·σ | 75th-pct close displacement |

Eight directional levels per day (4 up, 4 down). Same set at every horizon, σ
scaled ×1 / ×√5 / ×√20.

---

## 3. The Metrics (everything worth seeing)

### 3.1 Forecast calibration — "is the model honest?"
- **Exceedance rates:** did HL75 get exceeded ~25% of days? HL50 ~50%? OC75
  ~25%? (the percentiles should hold; deviation = miscalibration).
- **Realized vs forecast range:** actual daily (H−L) vs forecast HL, scatter +
  bias %, per pair / regime / year.
- **σ accuracy:** forecast σ vs realized σ; over/under-estimation trend.
- **Asset-class correction validation:** are the FX / index / commodity
  correction factors right, per the realized exceedance?
- **Calibration drift:** is the model getting better or worse over time?

### 3.2 Level interaction — the core reversion/continuation question
Per level, per side:
- **Hit rate** — % of windows price reaches the level.
- **First-touch outcome — reverted vs continued** (precise definition in §4).
- **Reversion depth** — when it reverts, how far back toward open (in %, pips,
  and as a fraction of the band) — mean, median, distribution.
- **Continuation extension** — when it breaks through, how far it extends to the
  next level (%, pips), and how often it tags the next band out.
- **Overshoot tail** — distribution of how far beyond HL75 price travels.
- **Time-to-first-touch** — which session / hour the level was tagged.
- **Close location** — where the window closed relative to each level (validates
  the OC bands empirically).
- **Touch sequencing** — which level was hit first; up-first vs down-first.
- **Outside windows** — how often BOTH HL75 up and down are tagged (range expanded
  both ways).
- **MAE / MFE from the level** — excursion after touch, both directions.

### 3.3 Temporal structure
- **Day-of-week** — Monday vs Friday behaviour (revert/continue, hit rates).
- **Session** — Asia / London / NY: where levels get tagged and how they resolve.
- **Month / seasonality**, **year-by-year evolution** (the "teach it over time").
- **Gap windows** (indices / weekend gaps), **event/news days** (if calendar
  wired) vs normal days.

### 3.4 Regime & vol conditioning (feeds the selector)
- **Trend regime** (BULL/BEAR/RANGE) — revert vs continue rates per regime. The
  key cut: does HL75 hold in RANGE and break in trend?
- **Vol regime** (σ percentile low/normal/high) — does level behaviour change.
- **Trend-strength bucket** (efficiency ratio / ADX) — the empirical validation
  of the day-type score `T` itself: do high-T days actually continue more?

### 3.5 Cross-asset
- **Pair ranking** — which pairs mean-revert most at HL75, which trend most.
- **Asset-class differences** — FX vs indices vs gold.
- **Trend-day correlation** — do trend days cluster across pairs (risk-on/off)?

### 3.6 Practical sizing
- **Pip tables** — average pip distance to each level, per pair.
- **Daily-range distribution** in pips and %, per pair / regime.
- **Expected-move tables** — the forecaster's output, validated against realized.

All of the above available at **daily / weekly / 20-day** horizons.

---

## 4. Precise Definitions (pin these before building)

Ambiguity here is where analysers lie to themselves. Proposed defaults (open to
change):

- **Touch / hit:** intrabar price reaches the level (low ≤ level ≤ high within
  the window), using R2 minute bars for daily, D1 bars for weekly/monthly.
- **First touch:** the first window-bar that hits the level.
- **Reverted vs continued (default rule):** after first touch of an *upper*
  level, look forward within the same window:
  - **Reverted** if price returns to the **Close-median (OC50)** level before
    extending a further **0.5 × (HL75 − HL50)** beyond the touched level.
  - **Continued** if it extends that far beyond before returning.
  - **Undecided/close-out** if neither by window end → classify by where it
    closed (above touch = continued, back inside = reverted).
- **Retracement depth:** max favourable return toward open after touch, as % and
  as fraction of band.
- **Sample-size floor:** any sliced cell with **n < 30** windows is flagged
  "low-N" and greyed; never headline a thin cell.

> These three knobs (touch granularity, the revert/continue threshold, the N
> floor) are the only places this tool can deceive — they are configurable and
> shown in the methodology panel.

---

## 5. Filters (the public controls)

- **Pair** (multi-select) and **asset class**.
- **Horizon** — daily / weekly / 20-day.
- **Date range** + quick presets (1y / 3y / 5y / all).
- **Day-of-week**, **session**, **regime**, **vol bucket**, **trend-strength bucket**.
- **Level** focus (HL50 / HL75 / OC) and **side** (up / down / both).
- **Gap / event** day toggles.
- Filters compose; the active sample size is always shown.

---

## 6. Dashboards & Visualisations

A multi-tab public page (`forecast-analysis.html`), dark theme, charts via the
existing chart lib, modelled on `asia-range-analysis.html`.

1. **Overview / landing** — headline base rates per level (hit %, revert %, avg
   retracement), a one-line "what this tool shows," coverage + last-refresh.
2. **Calibration** — exceedance bars (target vs actual), realized-vs-forecast
   range scatter, σ accuracy over time.
3. **Reversion / Continuation** — the core view: per-level revert-vs-continue
   split (stacked bars), retracement-depth histograms, extension distributions.
4. **Heatmaps** — hit/revert rate by **day-of-week × session**, and by
   **regime × level**.
5. **Time series** — rolling revert rate / calibration by month & year (drift).
6. **Cross-asset** — sortable table ranking pairs by mean-reversion at HL75,
   trend-day frequency, avg range pips.
7. **Per-pair drilldown** — everything above for one instrument.
8. **Dataset & methodology** — see §8.

Every chart: hover tooltips, the active N, and a "definition" link to the
methodology panel.

---

## 7. Storage & Refresh Architecture (precompute, don't compute-on-load)

Public tool → must be fast and not hammer OANDA per visitor. So precompute and
serve artifacts.

### 7.1 Two-layer data model
- **Raw daily records** (per pair, per horizon): one row per window —
  `{date, open, sigma, levels{...}, regime, dow, session_of_touch, realized{H,L,C},
   per_level{hit, firstTouchTime, outcome, retracePct, extPct, closeLoc}}`.
- **Aggregates**: precomputed rollups for every slice combination the UI exposes
  (so the page never recomputes). Keep raw too, for drilldown / re-aggregation.

### 7.2 Storage
- Write artifacts to **R2** (already used for M1) as compact JSON or parquet:
  `forecast-analysis/{pair}/{horizon}.json` (raw) +
  `forecast-analysis/aggregates.json` (rollups) + `manifest.json`
  (coverage, row counts, last-refreshed, code version, definition knobs used).
- Local cache mirror for fast serving; served read-only.

### 7.3 Refresh — the API the owner triggers
Same async-job pattern as the backtesters, **owner-token gated**:
- `POST /api/forecast-analysis/refresh` `{pair?, horizon?, mode: 'incremental'|'full'}`
  → returns `jobId`. **Incremental** = compute only new days since manifest's
  last-refresh and append; **full** = recompute all. Auth via a refresh token
  (env var) so the public can't trigger expensive recompute.
- `GET /api/forecast-analysis/refresh/status/:jobId` → running/done/error + progress.
- Optional **daily cron** (Railway) for hands-off incremental refresh after the
  daily close.

### 7.4 Public read API (no secrets, no compute)
- `GET /api/forecast-analysis/manifest` → coverage + last-refresh.
- `GET /api/forecast-analysis/aggregates?...filters` → precomputed slice.
- `GET /api/forecast-analysis/pair/:pair/:horizon` → raw records for drilldown.
- Cacheable, rate-limited, read-only.

---

## 8. Dataset Transparency & Trust (for public credibility)

A first-class panel, not an afterthought:
- **Coverage table** — per pair: date range, # windows, # days with M1, gaps.
- **Last refreshed** timestamp + data source (OANDA D1 / R2 M1) per pair.
- **Methodology** — the vol math (Brownian range distribution), the level
  formulas, and the three definition knobs from §4, stated plainly.
- **Sample sizes** shown on every cell; low-N greyed.
- **Known limitations** — daily-bar touch granularity where M1 absent, survivor/
  data-vendor caveats, no trading costs (by design).
- **Disclaimer** — research/educational, not financial advice.
- Optional **CSV/JSON export** of any filtered view, and a permalink to a filter
  state, so others can reproduce a claim.

---

## 9. Lego Reuse (what we import vs write)

- **Import (core):** `computeBands`, `volSigmaSeries`, `classifyRegime`,
  `ASSET_PARAMS`, `HORIZONS` from `forecastCore.js`; `loadM1ForPair` for R2 data.
- **Write (new):** `js/forecastAnalyser.js` — the level-outcome measurement +
  aggregation (the genuinely new piece); the refresh/serve endpoints in
  `server.js`; `forecast-analysis.html`.
- No vol math copied; no trade primitive used. Pure measurement half of the core.

---

## 10. Build Phases

1. **Core measurement** — `forecastAnalyser.js`: per-pair walk-forward, tag each
   level's first-touch + outcome (revert/continue/retrace/extend). Unit-test on
   synthetic windows (no network).
2. **Aggregation + storage** — rollups by every slice; write raw + aggregates +
   manifest to R2; refresh job (incremental/full) + status; owner-token gate.
3. **Public read API** + minimal page (overview + reversion/continuation + one
   heatmap) wired to stored aggregates.
4. **Full dashboard** — remaining tabs, filters, charts, transparency panel,
   export/permalink.
5. **Daily cron** incremental refresh; link from `hub.html`.

Ship 1–2 first (the data is the asset); the UI layers on top.

---

## 11. Open Decisions (need your call before building)

1. **Revert/continue definition** — accept the §4 default (return to OC50 before
   extending 0.5×(HL75−HL50)), or a simpler "where it closed vs the level"?
2. **Storage** — R2 (consistent with M1) vs local files vs a small DB. R2
   recommended.
3. **Refresh cadence** — manual API only, or also a daily cron after close?
4. **Pairs & horizons at launch** — all R2 pairs × daily only first, or all three
   horizons from the start?
5. **Public hosting** — same Railway app (new routes/page) or a separate
   read-only deployment of just the analyser?
6. **Auth** — simple shared refresh token in env, fine? (keeps recompute private,
   data public).

---

*Design basis only — no code yet. Confirm §11 and I'll build Phase 1 (the
measurement engine) first, since the dataset is the real deliverable.*
