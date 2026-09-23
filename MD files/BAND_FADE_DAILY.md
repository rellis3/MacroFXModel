# Band fade to fair value — the daily, diversified version (pre-registered 2026-09-23)

*Registered before any real data was run. Nothing above §7 changes after the run;
results get appended below the line.*

## 0. Where this came from, and what has already been tested

The owner shared a chart with stacked bands, used as a "statistical price-location map":
- an EMA/VWAP centre line;
- inner and outer ATR (Keltner-style) envelopes;
- a wider σ channel.

The question: **trade price at a band back to fair value.** This desk has tested that
family before, and the results bind this design.

| Prior test | Result | What it rules out |
|---|---|---|
| `VWAP_REVERSION_FINDINGS.md` (26 pairs, M1, ±2σ session VWAP) | Fade OOS t = −46.6; 0/26 pairs positive | An **intraday** band fade on a band built from the session's own σ |
| `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` (±1…7σ, fixed σ) | The 2:1 "reversion" from every band was **mechanical**, matched by the control | A band touch as a standalone entry |
| `deskEvidence: vwap-extension-fade` | Positive **gross**, 3–8× under cost; the edge shrinks as fast as cost does | Short-horizon fades on FX spreads |
| `deskEvidence: level-touch` | Sharpe 5.36 came from a survivorship filter; the barrier-free re-test was zero vs random prices | Scoring touches that "held" |
| `deskEvidence: execution-gate` | At spread/ATR > 0.15, 0/30 cells were profitable | Anything where cost is a large fraction of the move |
| `atrBandEntryV1Engine.js` | EMA ± k·ATR on M1 | The Keltner fade intraday |

All of these were **intraday**. **The daily-bar version across a diversified book has never
been run.** At the daily horizon the move is roughly 10× the spread, so the execution gate
no longer decides the answer by itself. This is a different test, not a rerun.

## 1. What is changed from the chart, and why (each change comes from a lesson)

| # | Change | Why |
|---|---|---|
| 1 | **Daily bars, 1–10 day holds** | Every intraday version died on cost (above) |
| 2 | **Band unit = ex-ante vol, scaled to what a random walk would produce.** EWMA (λ 0.94) daily σ up to the close. The distance from EMA20 is divided by σ·κ, where κ = √((1−k)/(k(2−k))) and k = 2/21 (κ ≈ 2.23), the stationary sd of a random walk's distance from its own EMA20. So ±2 means "a 2-sd stretch for a random walk", regardless of instrument or regime. | A Bollinger band is built from the same window it is judged on, so it widens exactly when a trend starts. The session-σ version of that geometry was the 0/26 null. |
| 3 | **Close outside the band, not a wick touch** | The touch studies' survivorship lesson: a touch that "held" can't be known at the time |
| 4 | **Exit at fair value (close crosses EMA20) or 10 days; re-arm only after \|z\| < 1.5** | The target is the fair value the chart names. The re-arm (dead band) stops the rule re-entering every day into a trend. |
| 5 | **26 instruments, vol-targeted book** | Risk management: many small independent bets sized by vol, not one chart |
| 6 | **Benchmarks:** a shuffled-return null through the identical procedure, and a random-entry control of the same trades | Anything that "reverts" on shuffled data is a code artefact. A fade must beat random trades of the same size and length. |
| 7 | **FX currency overlap is reported** (net USD share of the book) | The MVE lesson: 25 FX pairs faded together can quietly become one dollar bet |

## 2. Data and definitions (fixed)

| Item | Setting |
|---|---|
| Universe | 25 FX pairs + gold (all 26 instruments with local/R2 M1): majors, EUR/GBP crosses, other crosses, gold |
| Bars | M1 → UTC-day OHLC (`barUtils.resamplePacked`, 1440). Sat/Sun buckets folded into the next Monday. |
| Period | 2016-01 → latest; the first 60 bars per instrument are warm-up |
| Fair value | EMA20 of the daily close (`indicatorCore.ema`) |
| σ | EWMA λ 0.94 of squared daily log returns through t (`statsCore.ewma`) |
| **Primary stretch** | z = (C − EMA20) / (σ·C·κ) |
| Context stretches | Keltner kz = (C − EMA20)/ATR20 (`atrWilder`); Bollinger bz = (C − SMA20)/sd20(close). Each is "outside" at \|·\| ≥ 2. |
| Cost | `perLineStrategy.costForPair` round trip (majors 0.8–1.3 bp … gbpnzd 4.5 bp, gold 2.0 bp) |
| IS / OOS | First 60% of the calendar / last 40% |

## 3. Stage 1 — the bucket test (does the stretch predict reversion at all?)

For each instrument, sampled every 5th trading date (non-overlapping for h = 5):
- fade return f = −sign(z) · ln(C₍t+5₎/C₍t₎) / (σ·√5), in σ units;
- \|z\| buckets [0,1) [1,1.5) [1.5,2) [2,2.5) [2.5,3) [3,∞).

**Standard error.** Instruments are averaged per date first, then the t-stat is taken across
dates. Correlated pairs on the same day don't count as independent evidence.

**Cost hurdle.** Each observation's round-trip cost is expressed in the same σ units, and the
average over the bucket is reported next to the gross mean.

**Null.** 200 draws in which each instrument's daily log returns are shuffled (iid) and the
price rebuilt. The whole procedure runs identically on each draw. This removes any real
autocorrelation. The draws' |z| ≥ 2 t-stats give the 95th percentile.

**BUCKET-EDGE (primary cell: vol band, h = 5, \|z\| ≥ 2) requires all four:**
1. pooled t ≥ 2;
2. gross mean ≥ the bucket's mean cost hurdle;
3. IS mean > 0 **and** OOS mean > 0;
4. t > the shuffled null's 95th percentile.

Otherwise **NO-BUCKET-EDGE**.

**Context cells (reported, not the verdict):**
- h = 1 and h = 10;
- Keltner and Bollinger at 2;
- stack count (1, 2 or 3 of the bands closed outside, same side);
- ADX14 < 25 vs ≥ 25 (daily);
- per instrument.

That is about 12 context cells. At 5%, noise alone gives ~0.6 false "winners", so a lone
context cell is not a finding.

## 4. Stage 2 — the system (one fixed rule, no tuning)

| Item | Setting |
|---|---|
| Entry | Close t with \|z\| ≥ 2, flat and armed in that instrument → position −sign(z) from close t |
| Exit | First close where z has crossed 0 (back at fair value), or after 10 trading days |
| Re-arm | After an exit, a new entry needs \|z\| < 1.5 first |
| Weights | Each open trade: dir / σᵢ (equal ex-ante risk) |
| Book sizing | Scaled to **10% annualised ex-ante vol** using the trailing 60-day covariance of the 26 instruments' daily returns; capped at **5× gross** notional; flat when nothing is open |
| Cost | Every change in notional (entries, exits, daily re-scaling) × one-way cost (½ round trip) |
| P&L | Σ wᵢ · simple return close t → t+1 (decided at close t from data ≤ t) |

**Versions (same code, one run each):**
- **primary** (1× cost)
- **2× cost**
- **random control:** 100 draws; each real trade keeps its instrument and length but gets a
  random entry date and direction.

**Reported:** full / IS / OOS CAGR, Sharpe ± SE, Sortino, max DD, Calmar, underwater, skew,
kurtosis, % days in market, gross, % at cap, cost drag, trades, win %, PF, average hold,
yearly and monthly returns, and mean net-USD share of the FX legs.

**House CSVs:**
- $100k account, compounding;
- R = the trade's entry weight × σᵢ × √10 (its ex-ante 1σ over the max hold), so R varies
  per trade;
- MAE from the **daily high/low** between entry and exit at the entry weight. That is the
  finest path the daily walk has, and it's stated as such.

**SYSTEM-WORTHY requires:**
- Stage 1 BUCKET-EDGE;
- all five of `bookSystem.readSystem`'s checks (full Sharpe ≥ 0.5, IS > 0, OOS ≥ 0.5,
  max DD ≥ −25%, 2×-cost Sharpe ≥ 0.3);
- a full Sharpe above the random control's 95th percentile.

Otherwise **NOT-YET**, with the failed checks named. No better-looking context cell gets
promoted after the fact.

## 5. What each outcome would mean (stated before running)

- **Both stages pass:** daily vol-unit stretch carries a reversion premium that survives
  cost across a diversified book. The next step is forward tracking, not more tuning.
- **Stage 1 passes gross but fails the cost hurdle:** the same pattern as intraday, one
  timeframe up. Extension is information, not a trade.
- **Stage 1 fails:** at the daily horizon, the stretch from EMA20 doesn't predict the next
  week beyond what shuffled prices do. The band is a map, not a signal. This agrees with the
  FX literature's weak short-horizon reversal (`REVERSION_CONTINUATION_EVIDENCE.md` rank 3).
- **Stage 1 fails only on FX but gold passes:** one instrument is not a finding. It's
  reported as context.

## 6. Code

- `js/bandFade/bandFade.js`: pure (bars, stretch, bucket test, null, system walk, trades)
- `js/bandFade/bandFadeEngine.js`: loads M1 → daily and runs both stages
- `js/bandFade/bandFade.test.mjs`: synthetic checks:
  - no lookahead (truncation);
  - shuffled / random-walk data → no bucket edge;
  - a planted AR(1)-reverting series → bucket edge found;
  - vol targeting and the cap;
  - cost accounting;
  - weekend folding.
- `server.js`: `POST /api/band-fade/run` + `GET /api/band-fade/status/:jobId`
- `band-fade.html`: results page
- `scripts/run_band_fade.mjs`: the same engine from the command line

---

## 7. Results

**Run 2026-09-23** (sandbox, same engine as the Railway route; M1 read from the R2 decoded-snapshot cache, 26/26 read-only hits, nothing written).
- Data: 26 instruments, 2,795 weekday bars each, 2016-01-04 → 2026-09-22.
- OOS from 2022-06-10.
- Reproduce with `node scripts/run_band_fade.mjs`.

### Stage 1: NO-BUCKET-EDGE

| Primary cell (vol band, h = 5, \|z\| ≥ 2) | Value |
|---|---|
| Observations / dates | 284 / 125 |
| Mean fade | +0.078σ (cost hurdle 0.018σ) |
| t (per-date pooled) | **0.85** |
| Shuffled-null t, 95th pct (200 draws) | 2.00 (median 0.10) |
| IS / OOS mean | +0.138 / **−0.017** |

Failed: t ≥ 2, IS and OOS both positive, and beating the null. Passed: gross ≥ cost.

**Bug audit before calling it null (CLAUDE.md "assume code failure first").**
- **Synthetic checks: 27/27.**
  - Features at t use data ≤ t (truncation test).
  - Random walks give no edge.
  - A planted random-walk-plus-decaying-shock series is detected (t 5.3) with monotonic
    buckets, and the shuffled null removes it.
  - Per-trade P&L and costs sum to the book.
- **The sampling phase doesn't rescue it.** The five possible 5-day phases give t
  0.85 / −0.10 / 0.36 / −0.18 / 0.10. The pre-registered phase was the best of the five, and
  the IS/OOS signs flip between phases.
- **The system's own fresh entries (484)** have a 5-day fade of +0.02σ, t 0.33.
- **The band isn't mis-scaled.** |z| ≥ 2 on 2.0% of instrument-days: a tail event, as
  designed.

**The buckets don't rise with stretch.** At h = 5: 0–1σ +0.022, 1–1.5 +0.030, 1.5–2 +0.073,
2–2.5 +0.029, 2.5–3 +0.070 (t 0.4), and n = 3 above 3σ. Every one of them is inside noise. The
h = 1 and h = 10 tables show the same thing.

**Context cells (14 counted; ~0.7 false positives expected at 5%):**

| Cell | Mean (σ) | t | IS / OOS |
|---|---|---|---|
| Vol band h = 1 | −0.003 | −0.06 | −0.04 / +0.07 |
| Vol band h = 10 | +0.166 | 1.13 | +0.14 / +0.20 |
| Keltner ≥ 2, h = 5 | +0.072 | 1.77 | +0.09 / +0.05 |
| Bollinger ≥ 2, h = 5 | +0.029 | 0.71 | +0.04 / +0.02 |
| ADX < 25 (n = 36) | −0.277 | −1.67 | −0.57 / +0.11 |
| ADX ≥ 25 | +0.087 | 0.89 | +0.15 / −0.02 |
| FX only | +0.078 | 0.86 | +0.10 / +0.03 |
| Gold only (n = 17) | +0.182 | 0.51 | +0.65 / −0.01 |

**Stacked bands** (how many of vol / Keltner / Bollinger closed outside): 0 → +0.021,
1 → +0.049, 2 → +0.053, 3 → +0.057 (t 0.55, n 179, OOS −0.03). The stack drifts up by a few
hundredths of a σ, but nothing is significant. The "several bands agree = stronger"
claim is **not supported**.

The Keltner bucket at 2–2.5 (t 2.15) is one of about 30 bucket cells, so it's expected from
noise and not promoted.

**Per instrument:** EURUSD t 2.36 (n 7), AUDNZD 2.00, CHFJPY −2.11 of 26. That's three
|t| ≥ 2 in 26, roughly what noise gives, and split both ways.

### Stage 2: NOT-YET

| Version | CAGR | Sharpe ± SE | Max DD | Trades | Win % | PF |
|---|---|---|---|---|---|---|
| Full, 1× cost | +0.82% | 0.14 ± 0.30 | −24.0% | 485 | 50.7 | 1.07 |
| In-sample | −2.59% | −0.26 ± 0.39 | −23.4% | 322 | 47.8 | 0.87 |
| Out-of-sample | +6.15% | 0.74 ± 0.47 | −10.6% | 163 | 56.4 | 1.49 |
| Full, 2× cost | +0.03% | 0.05 | −27.6% | | | |
| Full, no cost | +1.60% | 0.23 | −20.3% | | | |

- **Random-entry control** (100 draws): Sharpe 5th / 50th / 95th = −0.57 / −0.14 / 0.40.
  The fade ranks 82nd percentile, inside the random range.
- **Checks failed:** stage 1, full Sharpe ≥ 0.5, IS > 0, 2×-cost Sharpe ≥ 0.3, and beating
  the control. **Passed:** OOS ≥ 0.5 and max DD ≥ −25%.
- **Activity:** 53% of days in market, average gross 1.7×, never at the cap. Cost drag is
  0.78%/yr. Two thirds of exits were the 10-day time stop (329 time vs 154 at fair value).
- **Skew and USD share:** skew −0.60, excess kurtosis 7.6. Net-USD share of the FX legs
  averaged 26%.
- **Yearly:** 2016 0.0, 2017 +7.0, 2018 −9.6, 2019 −2.2, 2020 −2.9, 2021 +4.1, 2022 −10.3,
  2023 +11.2, 2024 +12.6, 2025 −0.2, 2026 +2.0. The OOS Sharpe of 0.74 is mostly
  **2023–24**. That's the same two years that carried the spread sleeves (MVE §6). A split
  where IS is −0.26 and OOS is +0.74 is what noise around zero looks like, and the full
  sample sits inside the random control.

### Reading (as pre-registered, §5 bullet 3)

At the daily horizon, the stretch from EMA20 doesn't predict the next 1–10 days beyond what
shuffled prices do. That holds whichever band defines the stretch (vol, Keltner or
Bollinger), and stacking them doesn't change it. The band is a **map, not a signal**. This
is now shown on daily bars too, after the intraday nulls. The system's positive OOS isn't
evidence; its full sample is indistinguishable from random trades of the same size and
length.

**What this does not rule out**, per the "pivot" rule; each would be its own
pre-registered test:
1. **Cross-sectional stretch.** Each day, rank the 26 by z; fade the most-stretched-up
   against the most-stretched-down, currency-neutral. The common dollar move that dominates
   a time-series fade cancels. The MVE book lesson says that's where a residual *could*
   live. Coin flip.
2. **The bands as range tools, which they are evidenced for.** `band-reach-from-here` (T7)
   validates the vol bands as a forecast of **how far** price travels. They can set targets
   and stops, and flag when a day's range is already spent. They don't give direction.
