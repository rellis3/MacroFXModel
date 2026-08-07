# Forecast Level Analyser — Design Spec

> A public, shareable analytics tool that **measures, never trades**. For every
> pair on R2 (FX + NASDAQ + DAX + Gold + indices), it computes the vol/range
> forecast levels each day and reports what price *actually did* relative to
> **every** line — hit rates, reversion vs continuation, retracement depth,
> sliced every way that matters. No entries, no stops, no costs: pure measured
> base rates.
>
> Design basis before building. Companion to `REVERSION_CONTINUATION_CONCEPT.md`
> and `FORECAST_WORKLOG.md`. Follows the lego principle in `CLAUDE.md`.

---

## 0. Decisions (locked)

1. **Track every line independently** (not just the 75p). Reversion/continuation
   is defined against the **ladder of forecast lines** — see §4.
2. **Data:** all R2 M1 parquet files, auto-discovered (no hardcoded pair list).
3. **Refresh:** manual API trigger, **plus** an optional in-process daily
   auto-refresh after the close (toggle via env).
4. **Scope:** all pairs.
5. **Hosting:** same repo, deployed as its **own Railway service** (separate
   public URL), reading precomputed data from R2.
6. **Auth:** a single shared **password** (env var, changeable) gates access to
   the site; share it with trusted people.

---

## 1. Purpose & Audience

- **Internal:** the empirical ground truth that calibrates the fade/follow
  selector and sets honest expectations for any forecast strategy — the
  non-overfittable layer the backtester is calibrated against.
- **Public:** a polished, password-gated research tool trusted people can review
  (like the range-analysis site). Credibility = transparency: methodology,
  sample sizes, coverage, last-refresh all visible.

**Hard rule:** simulates no trades. Records level interactions only — immune to
the stop/fill artifacts that broke the v2 backtester (`FORECAST_WORKLOG.md`).

---

## 2. The Forecast Lines & the Ladder

Reuse the lego core (`computeBands`, `volSigmaSeries`, `classifyRegime`). Per
window (daily / weekly / 20-day), off the open and the walk-forward σ, we draw
**9 lines** — the open plus 4 up and 4 down:

| Line | Term | Distance (fx, ≈σ) |
|---|---|---|
| Open | — | 0 |
| Close med | OC50 = 0.6745·corr·σ | ≈0.61 |
| Close 75p | OC75 = 1.150·corr·σ | ≈1.19 |
| Proj H/L med | HL50 = 1.572·corr·σ | ≈1.52 |
| Proj H/L 75p | HL75 = 2.049·corr·σ | ≈1.87 |

**The ladder.** Sorting the up-side lines by distance from open gives an ordered
ladder: `Open → Close med → Close 75p → Proj H med → Proj H 75p` (the Close/OC
lines sit *inside* the Proj/HL lines — expected close displacement < expected
extreme). The exact order depends only on the per-asset correction constants
(not σ), so it is fixed per asset class and **derived at runtime**, never
hardcoded. Mirror ladder on the down side.

Every line is tracked independently, and its reversion/continuation is measured
relative to **its neighbours in this ladder**.

---

## 3. The Metrics (everything worth seeing)

### 3.1 Forecast calibration — "is the model honest?"
- **Exceedance rates:** does each line hold its percentile? HL75/OC75 exceeded
  ~25% of days, HL50/OC50 ~50%? Deviation = miscalibration.
- **Realized vs forecast:** actual (H−L) vs forecast HL; actual |close−open| vs
  forecast OC; scatter + bias %, per pair / regime / year.
- **σ accuracy:** forecast σ vs realized; over/under-estimation trend.
- **Asset-class correction validation** from realized exceedance.
- **Calibration drift** over time.

### 3.2 Level interaction — per line (the core)
For **each of the 8 directional lines**, per side:
- **Hit rate** — % of windows price reaches the line.
- **First-touch outcome — reverted vs continued** (ladder definition, §4).
- **Retracement depth** — when it reverts, how far back toward open: to which
  inner line / the open, in %, **pips**, and as a fraction of the band — mean,
  median, distribution.
- **Continuation extension** — when it breaks through, which outer line it
  reaches, and how far beyond (%, pips).
- **Overshoot tail** — distribution beyond the outermost line (HL75).
- **Time-to-first-touch** — session / hour the line was tagged.
- **Close location** — where the window closed relative to the line.
- **Touch sequencing** — which line/side hit first.
- **Outside windows** — how often both HL75 up and down are tagged.
- **MAE / MFE from the line** after touch.

### 3.3 Temporal structure
- **Day-of-week**, **session** (Asia/London/NY), **month/seasonality**,
  **year-by-year** evolution, **gap** windows, **event/news** days (if calendar
  wired) vs normal.

### 3.4 Regime & vol conditioning (feeds the selector)
- **Trend regime** (BULL/BEAR/RANGE) — revert vs continue per line per regime.
- **Vol regime** (σ percentile) — does line behaviour change.
- **Trend-strength bucket** (efficiency ratio / ADX) — empirical validation of
  the day-type score `T`: do high-T days actually continue through lines more?

### 3.5 Cross-asset
- **Pair ranking** — which pairs revert most at each line, which trend most.
- **Asset-class differences** (FX vs indices vs gold).
- **Trend-day correlation** across pairs (risk-on/off clustering).

### 3.6 Practical sizing
- **Pip tables** — average pip distance to each line, per pair.
- **Daily-range distribution** (pips & %), per pair / regime.
- **Expected-move tables** — the forecaster's output, validated.

All available at **daily / weekly / 20-day**.

---

## 4. Precise Definitions (the ladder rules — pin these)

The only places an analyser can deceive itself. Configurable; shown in the
methodology panel.

- **Touch / hit:** intrabar price reaches the line (low ≤ line ≤ high within the
  window), using R2 minute bars.
- **First touch:** the first window-bar that hits the line.
- **Reverted vs continued (ladder rule):** after the first touch of a line `L`
  at distance `d` from open, look forward within the same window:
  - **Reverted** if price returns to the **next-inner line** (the neighbour
    toward the open; for the innermost line, the **open** itself) before reaching
    the next-outer line.
  - **Continued** if it reaches the **next-outer line** before returning to the
    inner one. For the **outermost** line (HL75), "continued" = extends a further
    `(HL75 − HL50)` beyond it.
  - **Undecided** if neither by window end → classify by close: beyond `L` =
    continued, back inside = reverted.
- **Retracement depth:** max return toward open after touch — reported as the
  inner line reached, plus % / pips / fraction-of-band.
- **Sample-size floor:** any sliced cell with **n < 30** windows is flagged
  "low-N" and greyed; never headline a thin cell.

> Three knobs only — touch granularity, the ladder revert/continue rule, the N
> floor — all configurable and disclosed.

---

## 5. Filters (the public controls)

Pair (multi-select) · asset class · horizon (daily/weekly/20-day) · date range
(+ 1y/3y/5y/all presets) · day-of-week · session · regime · vol bucket ·
trend-strength bucket · **line** focus (any of the 8) · side (up/down/both) ·
gap/event toggles. Filters compose; active sample size always shown.

---

## 6. Dashboards & Visualisations

Public page (`forecast-analysis.html`), dark theme, modelled on
`asia-range-analysis.html`:

1. **Overview** — headline base rates **per line** (hit %, revert %, avg
   retracement pips), coverage + last-refresh, one-line "what this shows."
2. **Calibration** — exceedance bars (target vs actual) per line,
   realized-vs-forecast scatter, σ accuracy over time.
3. **Reversion / Continuation** — the core: per-line revert-vs-continue split
   (stacked bars across the ladder), retracement-depth histograms, extension
   distributions.
4. **Heatmaps** — hit/revert rate by **day-of-week × session** and **regime ×
   line**.
5. **Time series** — rolling revert rate / calibration by month & year (drift).
6. **Cross-asset** — sortable table ranking pairs by reversion at each line,
   trend-day frequency, avg range pips.
7. **Per-pair drilldown** — all of the above for one instrument; a sample-day
   chart showing the lines + what price did.
8. **Dataset & methodology** — §8.

Every chart: tooltips, the active N, and a definition link.

---

## 7. Storage & Refresh Architecture

Public tool → precompute and serve artifacts; never recompute per visitor or
hammer the data source.

### 7.1 Two-layer data model
- **Raw window records** (per pair, per horizon): one row per window —
  `{date, open, sigma, regime, dow, lines{...}, realized{H,L,C},
   per_line{hit, firstTouchTime, session, outcome, retraceTo, retracePips,
   extTo, extPips, closeLoc}}`.
- **Aggregates:** precomputed rollups for every slice the UI exposes. Keep raw
  for drilldown / re-aggregation.

### 7.2 Source & storage
- **Source:** all R2 M1 parquet files, **auto-discovered** (list R2 keys; no
  hardcoded pairs) via `loadM1ForPair` + D1 build for σ/regime.
- **Storage:** write artifacts back to **R2**:
  `forecast-analysis/{pair}/{horizon}.json` (raw) +
  `forecast-analysis/aggregates.json` (rollups) + `manifest.json` (coverage, row
  counts, last-refreshed, code version, definition knobs).

### 7.3 Refresh — the trigger
Async-job pattern, **password/token gated**:
- `POST /api/forecast-analysis/refresh` `{pair?, horizon?, mode:'incremental'|'full'}`
  → `jobId`. Incremental = only new days since manifest; full = recompute all.
- `GET /api/forecast-analysis/refresh/status/:jobId` → running/done/error + progress.
- **Optional in-process daily auto-refresh:** a `setInterval`/scheduler in the
  service that runs an incremental refresh after the daily close, toggled by env
  (`ANALYSER_AUTO_REFRESH=1`). (Railway has no native cron in the base service;
  in-process is the simplest reliable path on the persistent node server.)

### 7.4 Public read API (no secrets, no compute)
- `GET /api/forecast-analysis/manifest` → coverage + last-refresh.
- `GET /api/forecast-analysis/aggregates?...filters` → precomputed slice.
- `GET /api/forecast-analysis/pair/:pair/:horizon` → raw records for drilldown.
- Cacheable, rate-limited, read-only.

---

## 8. Hosting, Access & Transparency

### 8.1 Separate Railway service (same repo)
- A thin entry `server-analyser.js` (or `server.js` with `ANALYSER_ONLY=1`)
  mounts **only** the analyser: the public read API, the page, and the
  password-gated refresh. Deployed as a **second Railway service** from the same
  repo with its own start command and its own domain. It reads precomputed data
  from R2; the heavy refresh writes to R2.
- The main production app is untouched.

### 8.2 Password gate (simple, shareable)
- One shared password in env (`ANALYSER_PASSWORD`). A minimal login page POSTs
  it; on match, set a signed cookie; all page + API routes require the cookie.
- Change the env var to rotate access. No accounts, no DB — just a shared secret
  for a few trusted people. (Refresh can require the same password or a separate
  `ANALYSER_ADMIN_PASSWORD`.)

### 8.3 Transparency panel (first-class)
- **Coverage table** — per pair: date range, # windows, # days with M1, gaps.
- **Last refreshed** + data source per pair.
- **Methodology** — Brownian range distribution, the line formulas, the ladder
  rule and the N floor, stated plainly.
- **Sample sizes** on every cell; low-N greyed.
- **Limitations** — touch granularity where M1 absent, vendor caveats, no costs
  (by design).
- **Disclaimer** — research/educational, not financial advice.
- **Export** (CSV/JSON of any filtered view) + **permalink** to a filter state.

---

## 9. Lego Reuse

- **Import (core):** `computeBands`, `volSigmaSeries`, `classifyRegime`,
  `ASSET_PARAMS`, `HORIZONS` from `forecastCore.js`; `loadM1ForPair` + R2 listing
  for data.
- **Write (new):** `js/forecastAnalyser.js` (level-outcome measurement +
  aggregation — the new piece); refresh/serve endpoints; `server-analyser.js`
  entry; `forecast-analysis.html`.
- No vol math copied; no trade primitive used. Pure measurement half of the core.

---

## 10. Build Phases

1. **Core measurement** — `forecastAnalyser.js`: per-pair walk-forward, build the
   ladder, tag each line's first-touch + ladder outcome (revert/continue,
   retrace, extend, pips). Unit-test on synthetic windows (no network).
2. **Aggregation + storage** — rollups by every slice; write raw + aggregates +
   manifest to R2; refresh job (incremental/full) + status; password gate;
   R2 auto-discovery of pairs.
3. **Public read API** + minimal page (overview + reversion/continuation + one
   heatmap) wired to stored aggregates; the `server-analyser.js` entry.
4. **Full dashboard** — remaining tabs, filters, charts, transparency,
   export/permalink.
5. **Optional in-process daily auto-refresh**; deploy as the second Railway
   service with its own domain; link from `hub.html`.

Ship 1–2 first — the dataset is the real asset; the UI layers on top.

---

*Decisions locked (§0). Next: build Phase 1 — the measurement engine — since the
dataset is the deliverable.*
