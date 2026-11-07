# swing-walk-heading — during the days before an expiry, does price head toward the walk's zones?

**Pre-registered 2026-11-07, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `swing-walk-heading-touch` (H1), `swing-walk-heading-nextday` (H2) |
| Branch | `swing-walk-heading` |
| Register row | `plans/RESEARCH_REGISTER.md` → `swing-walk-heading` |
| Data | The walk steps already replayed for `swing-walk-track` (`scripts/swing-walk-track/replay.mjs`, live `zoneWalk`/`expiryView` on the Databento books, 8 instruments). Prices: OANDA M1 mid from `data/m1_bidask/<key>_m1.parquet` cut into 17:00 New York sessions (data-rules item 2). **Scored expiries settle 2020-10-01 to 2026-08-21** (lockbox) |
| Seed | `20261107` (every script in this study) |
| Uncertainty | cluster bootstrap by calendar month across all instruments, B = 2,000 (H1: the expiry's month; H2: the origin's month) |
| Scripts / outputs | `scripts/swing-walk-heading/` → `analysis/output/swing-walk-heading/` (`RESULTS.md`, `results.json`, `checks.json`) |
| Harness | own script; verdicts through `forge/verdict_gate.py` |

## 1. The claim (required)

The owner, 2026-11-07, on `swing-walk-track`: "Yeah imagine price wouldn't exactly hit, but it's during the days does
price head towards the zones marked out?" `swing-walk-track` scored only the expiry-date close and left the path out of
scope (its §7). So this asks about the path: during the days between a night's walk and that expiry, does price travel
toward the dot, and reach it, more than it does toward a level the same distance on the other side?

## 2. Why it is not already settled (required)

- **`swing-walk-track` (2026-11-04):** where price closes on the expiry date. Price can visit a zone and leave, and that
  test would not see it. Not the same question.
- **`expiry-pull-side`, `expiry-pull-build` (NULL):** the side of the book's lean, at a fixed 10 or 20 sessions, closes only.
- **`wall-placebo`, `oi-level-map`:** the reaction once a wall is touched intraday. This asks whether it gets reached at
  all, in the days before its own expiry, for all five walk anchors.
- **`oiReachability`:** implemented, "not validated" (`plans/LEVEL_ENGINE_ROADMAP.md`); it is a distance model, not a
  test of whether a marked level draws price.

## 3. Definitions, fixed in advance (required)

- **A step** = one `steps.csv` row: (instrument, night D, anchor, expiry E) with dot T, origin O = first close after D
  (OI(D) is public mid D+1), s₀ = close on O, σ = 60-close SD at O, h = closes in (O, E]. The page-default walk
  (`thin_walk = 0`), 1 ≤ h ≤ 40, E in the scored window, as in `swing-walk-track`.
- **Left out:** |g| < 0.1, g = ln(T/s₀)/(σ√h). A dot on top of price gives no direction to head in (counted per anchor).
- **The control, the mirror level:** M = s₀²/T, the same log distance on the other side of s₀. A random walk reaches both
  equally often, so the mirror removes distance and volatility without a model.
- **Sessions:** M1 bars to New York time, +7h, grouped by date; weekdays, `n ≥ 60`. High/low = the session's M1 high/low.
  Check: the session close must match `daily_m15` (median |difference| < 0.1σ) or the run stops.
- **Path window:** sessions after O up to and including E. Nothing from O or before.
- **H1, reached (scored).** `touch_dot` = price trades through T in the window; `touch_mirror` likewise for M.
  d = touch_dot − touch_mirror. Effect = ½(mean d on dots above price + mean d on dots below price), so upward drift in NQ
  and ES cancels instead of counting as a pull. Minimum effect **5 percentage points**.
- **H2, the next day's heading (scored).** y = sign(T − s₀) · ln(close at O+1 / s₀) / σ, every night's fresh dot.
  Same above/below balance. Minimum effect **0.05σ a day**: at the median horizon of about 16 sessions, travelling a
  quarter of a one-expected-move gap takes 0.06σ a day, the `swing-walk-track` bar in daily terms.
- **Described only:** closest approach as a share of the gap, capped at 1 (dot vs mirror); H1 and H2 by sessions left
  {1-2, 3-5, 6-10, 11-20, 21-40} and by gap size {0.1-0.5, 0.5-1, 1-2, >2 expected moves}; per instrument; FX vs indices.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 | Per anchor: price reaches the dot ≥ 5pp more often than the mirror | **Null** on all five: the banked level work finds marked levels behave like ordinary prices |
| H2 | Per anchor: the next day leans toward the dot by ≥ 0.05σ | **Null** on all five |
| **THE GATE** (per anchor x question) | VALIDATED needs all of: `verdict_gate` VALIDATED; Holm p < 0.05 over the 10 cells; positive in both halves (split 2023-09-01); positive on dots above and on dots below separately; positive both on dots on the side of the trailing 20-close move and on dots against it (OI lags price, so a dot behind a rally could score on reversal alone). A cell clear of zero that misses any of these is CONTEXT | |
| **THE MIRROR** | The reverse (price avoids the dot) is the same statistic below zero. A lower CI bound under −bar is reported, as a separate finding | **Null** |

## 5. Power (required)

`score.py count` flips each (instrument, expiry) at random between dot and mirror, which removes any real side
information, and takes the cluster-bootstrap SE of the effect. MDE = (2.807 + 0.842) x SE (Holm's first step, α 0.05/10,
two-sided, 80%). Whole expiries flip together, because `swing-walk-track` showed that a row-level shuffle understates the
SE when a dot persists across nights. Filled in as amendment A1 (PRE-RESULTS) before `run`. An anchor's MDE above the
minimum effect makes that cell UNDERPOWERED by design.

## 6. Multiplicity (required)

- **Scored:** 5 anchors x H1, H2 = 10 cells, Holm α 0.05, p from the bootstrap CI.
- **Described:** every slice, BH q = 0.10 with the chance count; a survivor is a candidate for its own prereg.
- **Proofs (`verdict_gate`, all required before banking):** planted large and at-the-minimum effects recovered; the
  whole-expiry flip's interval includes zero; session closes match `daily_m15`.

## 7. What this does NOT test (required)

- A trade: no entries, stops or costs. A pass would say price tends to visit the dot, not that the trip pays.
- Whether price stops or turns at the dot (`wall-placebo`, `oi-level-map`).
- Gold, GBP/JPY, NZD/USD (no history; forward record only). The small-books walk. Live forecaster σ (60-close σ here, as
  in `swing-walk-track`).

## 8. What each verdict changes (required)

- **VALIDATED:** the panel says so for that anchor and states the size; the walk tag for "heads toward" becomes VALIDATED,
  while the expiry-close verdict stays as banked. Nothing sizes a position until a forward record agrees.
- **NULL:** the panel states that price reaches the dot no more often than a level the same distance the other way.
- **CONTEXT or UNDERPOWERED:** stated as such, with the numbers.
- In every case the panel shows dot vs mirror reach per anchor, and the forward record scores reach on the live
  `swing_walk/` records, including gold.

## Amendments

### A1 — 2026-11-07 — PRE-RESULTS
**Power table from the count stage** (`score.py count`, whole-expiry flips; no real dot side used). Session closes match
`daily_m15` on all 8 instruments (median difference 0.0σ); no step lacked a session on its expiry. 78,806 scored steps
after the |g| ≥ 0.1 filter, which removes gamma centre 5,168, gamma best strike 2,491, strongest strike 694, max pain
1,413 and OI centre 972 of about 17,909 each.

| Anchor | H1 steps | H1 MDE (bar 5pp) | H1 power | H2 MDE (bar 0.05σ) | H2 power |
|---|---|---|---|---|---|
| gamma centre | 12,741 | 5.8pp | UNDERPOWERED | 0.028 | POWERED |
| gamma best strike | 15,418 | 5.3pp | UNDERPOWERED | 0.027 | POWERED |
| strongest strike | 17,215 | 4.4pp | POWERED | 0.027 | POWERED |
| max pain | 16,495 | 6.7pp | UNDERPOWERED | 0.024 | POWERED |
| OI centre | 16,937 | 4.9pp | POWERED | 0.034 | POWERED |

Applying §5: an H1 cell marked UNDERPOWERED here cannot bank as NULL even if its interval falls short of 5pp. The script
enforces this. No real dot x outcome had been computed.

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/swing-walk-heading/RESULTS.md`.*
