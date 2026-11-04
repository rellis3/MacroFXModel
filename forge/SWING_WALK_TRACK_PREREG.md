# swing-walk-track — does any Swing Map zone-walk anchor say where price will be on each expiry date?

**Pre-registered 2026-11-04, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `swing-walk-track` (P1, one scored cell per anchor); P2 and P3 are descriptive |
| Branch | `swing-walk-track` |
| Register row | `plans/RESEARCH_REGISTER.md` → `swing-walk-track` |
| Data | CME options per contract per trade date, Databento pulls `OI Data/<PAIR>.csv` (EUR_USD, GBP_USD, AUD_USD, USD_CAD, USD_CHF, USD_JPY, NAS100_USD from 2020-09; SPX500_USD from 2020-10), per expiry via `oi_research_book/scripts/40_expiry_track_history.py` `load_raw` + `build`, forwards from put-call parity on the settlements (`41_expiry_pull_score.py` `load_forwards`). Prices: the 17:00 New York daily closes in `analysis/output/swing-leg-baserates/daily_m15/` (OANDA M1 cut, data-rules item 2). **Scored expiries settle 2020-10-01 to 2026-08-21** (lockbox). Gold has no Databento history: forward record only, from the live `swing_walk/` records (from 2026-11-03) |
| Seed | `20261104` (every script in this study) |
| Uncertainty | cluster bootstrap, cluster = the expiry's calendar month across all instruments, B = 2,000 |
| Scripts / outputs | `scripts/swing-walk-track/` → `analysis/output/swing-walk-track/` (`RESULTS.md`, `results.json`) |
| Harness | own scripts: the walk must be the live `js/swingPaths.js` `zoneWalk` on books built by the live `js/expiryTracker.js` `expiryView`, and the unit (a walk step = one night x one expiry) is not a session or a trade |

## 1. The claim (required)

The owner, 2026-11-04: "the expected path walk day by day. To see if actually we get anywhere near it ... we've got
strongest strike, OI, max pain, ... if any one of them is tracking correct or true." And on how it should behave: a
dot that says 4% away and still says 4% away with a day left is wrong, "it needs to come down as the days get closer
to 0 DTE". Said plainly: each night the Swing Map walk puts a dot on every live expiry (the anchor's price for that date).
If the dot means anything, price on the expiry date should be closer to the dot than chance allows, and the gap
between price and the dot should shrink as the date nears.

The walk has five anchors (`js/swingPaths.js` `zoneWalk`): `gammaCentre` (the page default since 2026-11-03),
`gamma` (best gamma-scored strike), `strike` (the biggest OI strike), `maxPain`, `centre` (the OI-weighted average
strike). All are drawn on the page tagged UNTESTED.

## 2. Why it is not already settled (required)

- **`oi-max-pain`: NULL (2026-09-10).** Price does not pin to max pain into expiry. That entry has no n and no
  interval (it is the case the Evidence Book's strength rules were written for), and it scored one anchor on the
  nightly captures, not the walk. Max pain is re-scored here as one of five anchors, on 6 years of history, with an
  interval; if it comes back null again that is a confirmation with numbers, not a new claim.
- **`expiry-tracker` (REGISTERED, branch `ccr-b1afba0f-vtpty4`, not run):** asks which SIDE of today's price an
  expiry settles on from the book's lean (OI above vs below, a sign), over 10 and 20 sessions. This study asks a
  different question: how far, as a price target, for each of the walk's five anchors, at every horizon from 1 to 40
  sessions, and whether the gap closes. It does not edit that study, use its outputs, or claim its cells.
- **`wall-placebo`, `oi-level-map`:** walls touched intraday behave like ordinary levels. Touch-and-react, not where
  a multi-week path ends.
- **`gex-range` (VALIDATED, range only):** gamma sign sets next-day range size. Not a price target.

## 3. Definitions, fixed in advance (required)

- **A night D** = every Databento trade date with books, 2020-09 → 2026-08-21. The books are the forward-filled
  per-contract OI of `40_expiry_track_history.build` (same conventions: contract key (expiry, strike, right), OI
  forward-filled up to 5 trade dates, inverted pairs' strikes inverted once). For the inverted pairs (USD/JPY,
  USD/CAD, USD/CHF) the call and put columns are swapped after inversion so a column means the same in spot terms as
  the live `expiryView` withLadder rows.
- **Each expiry series** is built with the live `expiryView` (`js/expiryTracker.js`, `withLadder: true`, the 35%
  tail cut against that night's parity forward) on the series truncated at D, so the walk sees exactly the fields the
  live page sees that night: ladder with last-night and since-first OI change, zones, max pain, OI centre, totalOI.
  Futures = the parity forward F(D, E); spot = the price close on D; basis = F − spot (as the live capture).
  A (D, E) with no parity forward is left out of that night's book (counted).
- **Knowable when?** OI dated D is public mid D+1 (memory `project_oi_pipeline_audit`). The walk is therefore
  started at the **origin O = the first price close after D**, with close = price on O, date = O,
  vol = σ(O), and books of night D. Live expiries: E > O and E − D ≤ 100 calendar days; dte = E − D (the live
  `_swingMapExpiries` horizon). `zoneWalk` defaults otherwise: `thin = 0.10`, `includeThin = false` (the page
  default), no reach limit (`sigma` not passed), `zcap` unused.
- **σ** = the 60-close rolling SD of daily log returns ending at O (`41.load_prices`). The live page uses the monthly
  reverting forecast σ; only the two gamma anchors use vol (time scale of gamma, and the hedge cut). Recorded deviation.
- **A unit** = one walk step: (instrument, night D, anchor a, expiry E) with target T = the step's `px`.
  h = number of price closes in (O, E]; units need h ≥ 1, the close on date E present, σ(O) finite.
- **The outcome**, all in log terms and units of σ√h:
  - g = ln(T / s₀) / (σ√h): how far the dot says price will go (s₀ = close on O);
  - z₀ = ln(s_E / s₀) / (σ√h): how far price went (s_E = the 17:00 New York close on date E; FX options
    expire 14:00/15:00 UTC and NQ/ES at their settlement earlier that day, so the close is a few hours after
    expiry: the same noise on every anchor and on the benchmark).
  - miss_a = z₀ − g (the dot's miss), miss_0 = z₀ (the miss of "price stays where it is").
- **P1, the pull coefficient** per anchor: β = Σ g·z₀ / Σ g² (through the origin), pooled over instruments and
  h = 1–40. β = 1: the dot is the expected price; β = 0: the dot says nothing about where price goes; β < 0: price
  goes the other way. With the control: β_c from the OLS z₀ = β_c·g + γ·m (+ intercept per instrument), m = the
  trailing 20-close log return to O over σ√20 (OI follows price, so a centre lags a move: β could be momentum or
  reversal carried in through the lag).
- **Skill** (descriptive companion of P1): 1 − Σ miss_a² / Σ miss_0², the share of the no-move benchmark's
  squared error the dot removes. Positive = the dot beats "price stays where it is" as a forecast (needs β > ~½).
- **P2, convergence** (the owner's "it needs to come down"): per anchor and h bucket {1–2, 3–5, 6–10, 11–20,
  21–40}: β, RMS miss_a vs RMS miss_0, median |g|, and the share of steps with |g| > 2 (a dot more than two
  expected moves away). A dot that means something has |g| that does not grow as h falls, and RMS miss_a below RMS
  miss_0 in the near buckets.
- **P3, stability** per anchor: for the same (instrument, expiry), the night-to-night change in the dot,
  |Δ ln T| / σ, vs the price's own night-to-night change |Δ ln s| / σ; and the correlation of Δ ln T with Δ ln s
  (a dot that just follows price carries no information beyond price).
- **Instruments**: the 8 above, pooled for P1, reported separately (descriptive). FX-6 vs indices-2 reported.
- **Placebo (code check and null)**: g shuffled within (instrument, h bucket) across expiry months, 200 shuffles:
  β's distribution must centre on 0, and the real β's percentile is reported.
- **De-clustering**: none. Every night predicts every live expiry, so units overlap heavily; the cluster bootstrap
  over expiry months (all instruments, all nights and anchors' steps for that month's expiries together) carries it.
- **Sample / halves**: expiries before vs on/after 2023-09-01 (as `expiry-tracker`).

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| P1 | Per anchor: β > 0 — price on the expiry date moves toward the dot | **Null for maxPain** (banked null). **Null or small for the rest** (β < 0.25): OI sits where price has been, the walls/levels work found nothing at single strikes. The gamma centre leans with the book's weight; no prior that it leads |
| P1-skill | Does any anchor beat "price stays where it is" | **No** (skill ≤ 0 for all five): any dot away from price adds its distance to the error unless β > ½ |
| P2 | Does |g| stay bounded and the miss shrink as h → 0 | Strike/maxPain/centre: |g| grows as h falls (fixed strikes, shrinking σ√h) — the owner's "stays at 4%" worry, expected to be real for those three. Gamma anchors: bounded by construction near expiry (gamma pulls to the strike next to price) |
| P3 | Do the dots hold still night to night | Centre and gamma centre follow price (corr > 0.3); strike and maxPain jump in steps |
| **THE GATE** | VALIDATED for an anchor | Holm-adjusted (5 anchors) 95% CI of β excludes 0 above, β ≥ 0.25, β_c (with the trailing control) CI lower > 0, same sign in both halves, real β above the 97.5th percentile of the shuffled placebo |
| **THE MIRROR** | | No natural opposite setup (a reflected dot gives −β by construction). The shuffled-target placebo stands in |

## 5. Power — what this design can and cannot find (required)

The SE of β is SD(z₀) / √(Σ g²) inflated by overlap; z₀ is a price-only quantity (≈ 1 by construction) and g is
the dot (no outcome), so the MDE can be computed before any outcome-dot product: `scripts/swing-walk-track/score.py
count` builds the units and reports Σ g², the effective number of expiry-month clusters, and the MDE of β from the
cluster bootstrap of the **control quantity** (β against a dot drawn at random within instrument × h bucket, i.e.
the placebo SE, `mdeFromCI`). It is appended as amendment A1 (PRE-RESULTS) before `run`. Rule: an anchor whose MDE
(80% power, Holm α 0.05/5 on the first, two-sided) exceeds the 0.25 bar is UNDERPOWERED by design and reported
descriptively. Expected: thousands of units per anchor and ~70 expiry-month clusters, so β's MDE ≈ 0.1–0.2.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells**: P1 β, five (one per anchor). Holm at α = 0.05 over five, p from the bootstrap CI (`pFromCI`).
- **Disaggregation** (per instrument, per h bucket, per half, FX vs indices, the `+thin` walks): descriptive,
  BH q = 0.10 with the chance baseline; a surviving slice is a candidate for its own prereg, never a result.
- **Skill, P2, P3**: descriptive.
- **Promotion bar**: nothing here sizes or gates a position. A VALIDATED anchor stays a drawing until a forward
  record on the live `swing_walk/` agrees.

## 7. What this does NOT test (required)

- Direction as a trade, costs, entries: none. A β > 0 means the dot carries information about the expiry-date
  price, not that a trade toward it makes money.
- Intraday paths, touches before expiry, "was the dot reached on the way": no (only the expiry-date close).
- The live forecaster σ (vol deviation above), and the `+thin` walk as a scored cell.
- Gold (no history), GBP/JPY, NZD/USD: forward only.
- The charm arrows (they do not move the dot).
- Building weights or HEDGE_W tuning: the walk is scored as drawn, no parameter is fitted.

## 8. What each verdict changes (required)

- **VALIDATED (an anchor)** → ledger entry; the Swing Map tags that anchor with its β, and the page says what share
  of the gap price has travelled on average; it becomes the default if it is not already.
- **NULL (an anchor)** → ledger entry; the page keeps drawing it as context with the line "price on the expiry date
  is no closer to this dot than chance (β …)". If the gamma centre (the default) is null and another anchor is
  validated, the default changes.
- **UNDERPOWERED** → descriptive only; the live forward record carries it.
- In every case the page gets a "does the walk track?" panel scoring the live `swing_walk/` records (forward,
  descriptive, never changes a verdict), with P2's near/far table per anchor.

## Amendments

(none yet)

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/swing-walk-track/RESULTS.md`. Nothing above changes after the run except amendments.*
