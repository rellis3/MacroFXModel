# Impulse 4H Range-Levels — Gold, NAS100, and 5 FX pairs, 2016–2026

An honest, exploratory test of an untested idea from a colleague's video
("Husky", video 17 in `education/jordan_video_transcripts/`, tagging
`@C.OG`'s group): find a single standout 4-hour "impulse" candle and draw
the group's usual 45-level fib-style range-extension ladder off *that one
candle's own wick high/low* instead of a session/calendar range — "you'll be
quite intrigued by what you see." Nobody in the source material had tested
this before this file. It is not a lookahead-free trading rule as it
stands — see **What this is and isn't** below before reading any number as a
signal.

Engine: [`js/impulse4hRangeLevelsEngine.js`](../../js/impulse4hRangeLevelsEngine.js).
Mechanises [`impulse_4h_range_levels.pine`](../jordan_video_transcripts/impulse_4h_range_levels.pine)
exactly (same eligibility gate, same trailing-local-max selection, same
20-bar cooldown, same 45-value FIB array) and reuses this repo's existing
tested bricks throughout: `loadM1ForPair` (data), `atrWilder` (ATR(14),
Wilder), `resampleToH4` (M1→4H), `computeSessionVwap` (VWAP), `summarizeTrades`
(trade stats, MAE grid), and a date-fraction IS/OOS split matching
`honestForecastEngine.summarizeSplit`'s convention (first 60% of the
date-sorted sample = in-sample, last 40% = out-of-sample).

---

## What this is and isn't

**Is:** a real, causal detector for WHICH 4H candle counts as an "impulse"
(matches the Pine script's `barstate.isconfirmed` gate — no future bar is
ever used to decide whether a candle qualifies), followed by an honest
DESCRIPTIVE characterization of what price actually did against that
candle's ladder afterward, using this repo's real local M1 archive
(`VolRangeForecaster/data/m1/`, refreshed 2 days before this was run).

**Isn't:** a lookahead-free trading signal. Several of the headline numbers
below — the "exhaustion" fib level, the reversal size after it — are
computed by looking at the WHOLE forward path within a bounded window after
the impulse (until the next impulse fires, or a 40-day cap, whichever comes
first). That is a legitimate historical/backward-looking read of "what this
pattern typically does," but it is **not** something knowable in real time
at the moment the impulse candle closes. Only the impulse *detection* itself
is causal. This distinction is preserved everywhere below and should not be
collapsed when reading this file.

The one piece meant to model an actually-fillable, causal trade is the
**continuation-trade hypothesis** used for the stop-sizing section (§4):
enter at the next bar's open in the impulse's own direction, stop beyond the
candle's own opposite extreme, target the `fib=2.0` ladder rung. One pinned,
low-DOF formalisation — not a fitted or validated system, and not the only
way this idea could be traded.

---

## Data and instruments

Real M1 OHLC, `loadM1ForPair` (local parquet cache, no network needed),
2016-01-04 → 2026-08-20 (~10.6 years) for every instrument tried. All 7
priority instruments loaded and ran without incident — nothing silently
dropped:

| Instrument | Class | M1 bars | H4 bars | Impulses detected |
|---|---|--:|--:|--:|
| XAU/USD (gold) | commodity | 3,722,340 | 17,006 | 317 |
| NAS100_USD | index | 3,693,815 | ~17,000 | 335 |
| EUR/USD | fx | 3,840,908 | ~17,000 | 318 |
| GBP/USD | fx | 3,815,842 | ~17,000 | 344 |
| USD/JPY | fx | 3,874,254 | ~17,000 | 352 |
| AUD/USD | fx | 3,686,619 | ~17,000 | 340 |
| USD/CAD | fx | 3,850,955 | ~17,000 | 323 |

Impulses run ~30–33/year per instrument (1.8–2.1% of all H4 bars), using the
Pine script's own defaults throughout: ATR(14) Wilder, 1.5× ATR floor, 0.6
min body/range ratio, 20-bar trailing local-max window, 20-bar cooldown.

---

## Validation before scaling (Phase 3, gold only)

Before running any other instrument, the engine was checked three ways on
gold:

1. **Ladder arithmetic**, by hand, for 3 real impulses — `ladderPrice(low,
   high, fib)` vs `low + (high-low)*fib` computed independently, all 8
   spot-checked fib values (`-1, -0.5, 0, 0.5, 1, 1.5, 2, 3`) matched to
   1e-9. E.g. the 2016-01-27 impulse (low=1115.222, high=1127.816):
   fib=0 → 1115.222 (the low, exactly), fib=1 → 1127.816 (the high, exactly),
   fib=2 → 1140.410 = high + range. Reproduce:
   `node scripts/sanity_check.mjs xauusd`.
2. **A synthetic causal-logic unit test** (`scripts/unit_test_impulse_detection.mjs`),
   independent of any real market data: a hand-built bar sequence with a
   known-by-construction answer (one clean impulse, two imposter bars right
   after that are eligible on ATR/body terms but NOT the largest range in
   the trailing window and must NOT fire, then a second genuine impulse
   after cooldown clears) — detector returns exactly the 2 real impulses,
   nothing else. **PASS.**
3. **Manual read of the first 10 real gold impulses** — dates, direction,
   range/ATR multiple, low/high all printed and eyeballed; the 2016-02-11
   and 2016-03-16 impulses (gold's well-documented Feb–Mar 2016 rally) show
   up correctly as large bullish impulses, which is an independent
   plausibility check against known market history, not just internal
   arithmetic.

Only after all three passed did the run scale to the other 6 instruments.

---

## 1. Level hit-rate table

For every detected impulse, which of the 45 ladder levels does price go on
to touch (within the bounded post-impulse window)? Selected rungs, full
sample, per instrument (%):

| fib | gold | NAS100 | EURUSD | GBPUSD | USDJPY | AUDUSD | USDCAD |
|---|--:|--:|--:|--:|--:|--:|--:|
| -2 | 12.6 | 17.3 | 13.5 | 16.9 | 19.6 | 18.5 | 18.6 |
| -1 | 31.9 | 33.7 | 34.3 | 36.0 | 41.5 | 39.1 | 38.7 |
| -0.5 | 50.2 | 52.2 | 53.1 | 53.2 | 56.8 | 60.6 | 59.1 |
| 0 (low) | 74.1 | 71.0 | 75.2 | 75.9 | 73.3 | 77.9 | 79.6 |
| 0.5 | 80.4 | 79.7 | 83.3 | 82.6 | 78.7 | 80.9 | 80.8 |
| 0.75 | 80.8 | 78.8 | 81.5 | 82.8 | 81.0 | 82.3 | 77.1 |
| 1 (high) | 78.5 | 80.3 | 76.7 | 77.3 | 74.7 | 78.2 | 69.7 |
| 1.25 | 66.3 | 68.4 | 66.7 | 66.0 | 64.2 | 67.3 | 60.4 |
| 1.5 | 55.5 | 59.7 | 57.9 | 53.2 | 54.5 | 58.2 | 52.0 |
| 2 | 43.9 | 46.0 | 41.8 | 35.5 | 39.2 | 41.5 | 34.4 |
| 2.5 | 26.8 | 32.5 | 29.6 | 24.7 | 29.0 | 28.8 | 23.8 |
| 3 | 20.5 | 19.7 | 18.6 | 17.4 | 21.3 | 20.6 | 17.6 |
| 4 | 10.1 | 9.0 | 6.9 | 8.4 | 9.9 | 9.1 | 8.7 |
| 5 | 6.3 | 4.2 | 2.5 | 3.2 | 3.1 | 4.1 | 3.1 |

**Reading it straight:** the shape is smooth, monotonic-decaying-with-distance,
and strikingly consistent across gold, an index, and 5 FX pairs — peak
hit-rate sits at fib 0.5–0.75 (~77–83%, unsurprising: that's *inside* the
candle's own range, barely an "extension" at all), fib=1.5 (half a range
beyond the candle's own edge) is touched roughly half the time (52–60%),
and by fib=3 (two range-widths beyond the edge) it's down to 17–21%. Nothing
here says a *specific* level like "fib 2.0" is special — it's a smooth
decay, not a cluster or a shelf at any one rung, on every instrument tried.
This table on its own is a description of typical follow-through distance,
not evidence of a discrete "reach this level" edge.

---

## 2. Impulse size vs. exhaustion level — a real, consistent, negative correlation

*Extension magnitude* = how many range-widths beyond the impulse candle's
own edge price travelled (continuation direction) before its bounded window
ended. Correlated against the impulse's own size (range/ATR multiple),
reported honestly split first-60%/last-40% by date (IS/OOS):

| Instrument | r (full) | r (IS) | r (OOS) |
|---|--:|--:|--:|
| Gold | −0.131 | −0.136 | −0.115 |
| NAS100 | −0.253 | −0.270 | −0.213 |
| EURUSD | −0.249 | −0.280 | −0.204 |
| GBPUSD | −0.196 | −0.201 | −0.188 |
| USDJPY | −0.225 | −0.257 | −0.221 |
| AUDUSD | −0.184 | −0.170 | −0.189 |
| USDCAD | −0.204 | −0.201 | −0.212 |

**This is the single most consistent finding in this whole study.** Every
one of the 7 instruments shows a NEGATIVE correlation, of similar magnitude
(−0.13 to −0.25), and the sign holds in both IS and OOS on every single
instrument — no flip anywhere. The naive prior ("a bigger impulse should run
further") is not what the data shows. If anything, a bigger impulse
(relative to its own ATR) tends to travel modestly *less far, proportionally
speaking*, beyond its own candle before exhausting than a smaller one does.
A plausible (not proven) story: an unusually large impulse candle is itself
often the climactic/exhaustive move — the outsized range comes from the
move using itself up — while a moderate impulse (barely clearing the 1.5×
ATR floor) is more often the *start* of continued follow-through. This is a
correlation, not a demonstrated mechanism; it's reported because it's real,
consistent, and survives an honest OOS check, not because a cause is proven.

---

## 3. Reversal magnitude after exhaustion

Once price reaches its furthest continuation-direction extreme within the
bounded window, how far does it then reverse (in ATR units, measured to the
worst point reached in the opposite direction before the window ends)?
Impulses whose reversal window was cut off by the horizon cap before any
reversal could be observed are excluded (a small fraction, 0–5 per
instrument — flagged, not silently zeroed):

| Instrument | n | Mean (ATR) | Median (ATR) | IS mean | OOS mean |
|---|--:|--:|--:|--:|--:|
| Gold | 316 | 5.34 | 4.81 | 5.08 | 5.73 |
| NAS100 | 330 | 5.58 | 4.68 | 5.60 | 5.55 |
| EURUSD | 318 | 4.95 | 4.48 | 4.94 | 4.96 |
| GBPUSD | 343 | 5.32 | 4.53 | 5.48 | 5.09 |
| USDJPY | 352 | 5.44 | 4.79 | 5.21 | 5.78 |
| AUDUSD | 339 | 5.13 | 4.50 | 4.98 | 5.36 |
| USDCAD | 322 | 4.84 | 4.12 | 4.73 | 5.02 |

Reversal size is large in absolute terms (roughly 4–6× the impulse's own
ATR) and stable IS vs OOS on every instrument — but this reflects the
bounded window itself (up to 40 days) letting a lot of subsequent market
action count as "the reversal," not a tight, fast, tradeable snap-back.
**Correlation with impulse size** (does a bigger impulse produce a bigger
reversal?) is weak and sign-inconsistent — this is the one correlation claim
in this study that does **not** hold up:

| Instrument | r vs impulse size (full/IS/OOS) |
|---|---|
| Gold | 0.063 / 0.062 / 0.079 |
| NAS100 | 0.115 / 0.100 / 0.144 |
| EURUSD | −0.042 / **+0.041** / **−0.153** |
| GBPUSD | −0.029 / +0.009 / −0.096 |
| USDJPY | 0.086 / **+0.211** / **−0.054** |
| AUDUSD | −0.025 / −0.036 / −0.029 |
| USDCAD | −0.077 / −0.030 / −0.144 |

Every |r| is under 0.13, several flip sign between IS and OOS (EURUSD,
USDJPY), and gold/NAS100's mildly positive reading is nowhere near strong
enough to call a real relationship. **Reading it straight: reversal size is
not, in this data, a function of how big the triggering impulse was.**

---

## 4. Stop-sizing — does a losing setup reveal itself fast?

Owner's framing: *"if the trade is bad, the SL needs to be small to get out
fast."* Tested the same way a sibling engine's stop was tested
(`education/jordan_impulse_range_backtest/MAE_DYNAMIC_STOP.md`, methodology
reused, not reinvented) against the pinned continuation-trade hypothesis
(§ "What this is and isn't"): entry = next bar's open in the impulse's own
direction, stop = beyond the candle's opposite extreme + 0.25×ATR, target =
the `fib=2.0` ladder rung (≈1:1 R:R by construction, so ~50% win rate is
breakeven before costs).

**Baseline** (no dynamic stop, one instance per impulse):

| Instrument | Trades | Win% | Mean R | Sharpe |
|---|--:|--:|--:|--:|
| Gold | 317 | 45.4% | −0.045 | −0.263 |
| NAS100 | 335 | 49.6% | +0.047 | 0.208 |
| EURUSD | 318 | 51.9% | +0.059 | 0.280 |
| GBPUSD | 344 | 44.5% | −0.090 | −0.313 |
| USDJPY | 352 | 50.9% | +0.053 | 0.232 |
| AUDUSD | 340 | 45.9% | −0.032 | −0.212 |
| USDCAD | 323 | 48.0% | −0.043 | −0.174 |

Close to breakeven everywhere, as expected from a near-1:1-R:R rule with
win rates clustered around 45–52% — this specific continuation trade is not,
on its own, a source of edge on any of the 7 instruments.

**Phase 1 — adverse-excursion-by-bar-count, winners vs losers.** Same shape
found in the sibling study: losers do reveal themselves via a deep adverse
move (85–100% of losers reach ≥1.0R adverse — tautological, that IS the
stop, at a median of ~2,000 M1 bars/~1.4 days in), but a large minority of
*winners* also dip into the same early-adverse zone at a similar timescale
(e.g. gold: 51.4% of winners reach ≥0.25R adverse at median bar 433 vs
losers' median bar 461 — nearly the same timing). Full per-instrument tables
in `data/<pair>.mae_dynamic_stop.json`. **The early dip does not
discriminate winners from losers** — a stop keyed on early depth/time alone
can't tell them apart from the shape of that dip.

**Phase 2 — dynamic-stop grid, tested the honest way.** A stop tightened to
`fracEarly`× the structural distance for the first `kBars` M1 bars, full
stop after, swept over `fracEarly ∈ {0.25…1.0}` and `kBars ∈ {30,60,120,240,480}`
minutes. Picking the "best" cell by its FULL-sample Sharpe (what a naive
grid search would do) already leaks the OOS window into the selection — so
here the cell is instead chosen using ONLY its in-sample Sharpe, and its
out-of-sample Sharpe is reported for that same cell, unpicked:

| Instrument | Cell (fracEarly, kBars) | IS Sharpe | OOS Sharpe | Baseline (full) Sharpe |
|---|---|--:|--:|--:|
| Gold | 0.25, 480 | −0.233 | **+0.190** | −0.263 |
| NAS100 | 0.25, 480 | +0.655 | **−0.223** | +0.208 |
| EURUSD | 0.5, 60 | 0.000 | **+0.576** | +0.280 |
| GBPUSD | 0.25, 120 | −0.175 | −0.063 | −0.313 |
| USDJPY | 0.35, 240 | +1.086 | **−0.115** | +0.232 |
| AUDUSD | 0.35, 480 | +0.253 | **−0.121** | −0.212 |
| USDCAD | 0.25, 480 | +0.077 | **−0.174** | −0.174 |

**No consistent, IS/OOS-robust improvement.** In 5 of 7 instruments (NAS100,
USDJPY, AUDUSD, USDCAD, and GBPUSD stays negative both ways) the
IS-picked "best" tightening either evaporates or reverses OOS — the exact
overfitting signature this two-step check exists to catch. Only gold and
EURUSD show OOS *better* than IS, on modest OOS sample sizes (n=127, n=128)
— plausibly just favorable noise in that particular later window rather
than a transferable rule, and not something to build on without a lot more
scrutiny. **Conclusion: this data does not support tightening the stop for
a fixed early window as an empirically-derived improvement over the plain
structural stop.** This mirrors the sibling engine's own
MAE_DYNAMIC_STOP.md conclusion almost exactly — "loses fast" is true of
losers, but it's also true of enough winners that it isn't a usable
discriminator, and grid-searching a fix doesn't survive honest OOS checking.
The best answer this data can offer for "what stop size" is still the plain
structural one already used here (beyond the impulse candle's own opposite
extreme + a small ATR buffer) — nothing tighter was found to help reliably.

---

## 5. VWAP

**Touch rate within the bounded window is ~100% everywhere** — expected and
close to uninformative on its own: session VWAP resets every UTC day, so
across windows that can run up to 40 days, touching *some* day's VWAP is
close to guaranteed by construction, not a property of this pattern. The
more informative cut is bars-to-touch:

| Instrument | Median bars to touch | % within 4h | % within 24h | % within 3 days |
|---|--:|--:|--:|--:|
| Gold | 365 | 33.4% | 100%* | 100%* |
| NAS100 | 230 | 51.6% | 100%* | 100%* |
| EURUSD | 358 | 35.9% | 100%* | 100%* |
| GBPUSD | 411 | 31.7% | 100%* | 100%* |
| USDJPY | 417 | 34.7% | 100%* | 100%* |
| AUDUSD | 322 | 37.9% | 100%* | 100%* |
| USDCAD | 358 | 30.3% | 100%* | 100%* |

*24h/3-day figures saturate at 100% for the same mechanical daily-reset
reason as the overall touch rate — reported for completeness, not as a
finding. The **4-hour cut (same H4 bar as the impulse itself) is the one
real differentiator**: NAS100 touches its own VWAP same-bar most often
(51.6%), the FX pairs and gold cluster around 30–38%.

**Distance-from-VWAP-at-exhaustion vs. subsequent reversal size — the
second-strongest finding in this study.** |Distance from session VWAP at
the point of furthest extension|, in ATR units, correlated against the
reversal size that follows (also ATR units):

| Instrument | r (full) | r (IS) | r (OOS) |
|---|--:|--:|--:|
| Gold | 0.298 | 0.341 | 0.237 |
| NAS100 | 0.446 | 0.399 | 0.520 |
| EURUSD | 0.254 | 0.311 | 0.182 |
| GBPUSD | 0.334 | 0.358 | 0.288 |
| USDJPY | 0.384 | 0.315 | 0.440 |
| AUDUSD | **0.509** | **0.535** | **0.497** |
| USDCAD | 0.296 | 0.265 | 0.333 |

Positive on all 7 instruments, holds sign IS and OOS on every single one,
and meaningfully stronger than the impulse-size-vs-reversal correlation from
§3 (which was null). **The further price has stretched from session VWAP at
its extreme, the bigger the reversal that follows tends to be** — AUDUSD is
the strongest (r≈0.5 in both halves), gold and EURUSD the weakest of the
seven (still clearly positive, r≈0.2–0.3). This is consistent with VWAP
acting as a rough "fair value" magnet the further price stretches from it —
intuitive, and unlike §3, actually survives the honest split.

---

## 6. Other patterns explored

- **Time-of-day is the strongest structural pattern found, on every single
  instrument.** Because impulses are detected on 4H bars, there are only 6
  possible UTC start times (00/04/08/12/16/20) per day — and the 12:00 UTC
  bar (12:00–16:00 UTC, the London/NY overlap into the US morning session)
  accounts for a large plurality-to-majority of ALL impulses on every
  instrument tried: gold 202/317 (64%), NAS100 207/335 (62%), EURUSD 166/318
  (52%), GBPUSD 166/344 (48%), USDJPY 160/352 (45%), AUDUSD 141/340 (41%),
  USDCAD 230/323 (71%). This isn't a subtle effect — it's a large, uniform,
  economically sensible skew (the highest-liquidity/most-news-dense window),
  present with no exceptions across gold, an index, and 5 FX pairs.
- **Day-of-week: Wednesday is the modal day in 6 of 7 instruments** (gold,
  NAS100, EURUSD, GBPUSD, USDJPY, AUDUSD), with USDCAD the one exception
  (Friday narrowly ahead, 77 vs 73). A real but milder pattern than the
  time-of-day one, and not universal.
- **Direction bias is roughly 50/50 for gold and every FX pair** (47.9–53.5%
  bullish), **but NAS100 is skewed bearish — 193/335 (57.6%) bearish
  impulses vs 142 (42.4%) bullish.** Consistent with the well-known
  asymmetry that equity-index selloffs tend to be sharper/faster than
  rallies (more likely to clear the impulse bar).
- No further exploration was done beyond what's reported above — this
  section stops at what was actually checked, not a promise that nothing
  else is there.

---

## Summary — is there anything here worth building into a real rule?

Two findings survived an honest IS/OOS check on all 7 instruments and are
worth further work:

1. **Impulse size (range/ATR) correlates negatively with how far price
   extends beyond the candle before exhausting** (§2) — real, consistent,
   OOS-stable, but the correlation magnitude (−0.13 to −0.25) is modest; it
   would need to be turned into an actual sizing/filtering rule and
   re-tested as a trading signal (not just a descriptive correlation) before
   it's worth anything.
2. **Distance from session VWAP at the extension point correlates
   positively with the size of the subsequent reversal** (§5) — the
   strongest, most consistent correlation in this whole study (0.25–0.51,
   same sign IS and OOS on every instrument). This is the most promising
   single thread to pull next.

Everything else tested cleanly null or inconclusive:

- The level hit-rate table (§1) is a smooth, unsurprising decay curve with
  distance — no discrete "special" rung on any instrument.
- Reversal size is **not** a function of impulse size (§3) — weak,
  sign-inconsistent correlation, the one correlation claim in this study
  that fails its own OOS check.
- The pinned continuation-trade hypothesis is close to breakeven on every
  instrument (§4) — not a source of edge as pinned.
- Tightening the stop for an early window, on the "loses fast" premise,
  does **not** hold up once selection is done honestly (IS-pick, OOS-check)
  — same conclusion as the sibling engine's own MAE_DYNAMIC_STOP.md, tested
  independently here on a different pattern and a wider instrument set.

**Update (2026-08-23):** a colleague is reported to trade this exact
pattern as a fade (not the continuation hypothesis pinned in §4) — tested
in [FADE_EXTENSION_TRADE.md](FADE_EXTENSION_TRADE.md). Same honest
IS/OOS-selection discipline as §4 above, and same conclusion: whenever
in-sample showed a positive Sharpe worth selecting, the honestly-checked
out-of-sample result was negative on every instrument tried. A follow-up
gating entries by §5's VWAP-distance finding (same file) didn't fix it
either — on 3 of 7 instruments the honestly-picked gate made OOS
measurably worse than the ungated baseline; only 1 of 7 (GBPUSD) improved,
which is not a cross-instrument result. Real Discord screenshots of actual
trades were then checked against real market data, which surfaced two
things: the 0.6 min body/range ratio was silently excluding real large
impulses, and entries matched a classic 38.2–61.8% retracement continuation
rather than the ladder — tested honestly in
[RETRACEMENT_CONTINUATION_TRADE.md](RETRACEMENT_CONTINUATION_TRADE.md),
also null on every instrument. Four distinct trade formalisations tested
in total; none produced a real out-of-sample edge.

**Update 2 (2026-08-23):** real Discord screenshots of actual trades were
checked against this repo's real M1 data — none matched the extension
ladder. What they matched (one confirmed example precisely) was a classic
38.2–61.8% pullback into the impulse before continuing in its own
direction — tested in
[RETRACEMENT_CONTINUATION_TRADE.md](RETRACEMENT_CONTINUATION_TRADE.md).
Also surfaced a real detector bug in the process: the 0.6 min body/range
ratio filter was silently excluding real, large impulse candles. Even this
most evidence-grounded rule in the whole study doesn't survive honest
IS/OOS checking on any of the 7 instruments — same signature as every
other pinned trade tried: good in-sample results go negative out-of-sample.

**What would need to happen next**, if this line of research continues:
(a) turn the impulse-size↔exhaustion and VWAP-distance↔reversal
correlations into an actual entry/exit RULE (e.g. size the target by
impulse-size band, or gate/size a reversal-fade entry by VWAP distance) and
backtest THAT as a trading rule with costs, not just report the correlation;
(b) the continuation-trade hypothesis pinned here (§4) is only one of many
ways to trade this pattern — a fade-the-exhaustion variant, informed by the
two findings above, is the natural next formalisation to pin and test; (c)
none of this has been checked against realistic slippage/spread beyond the
flat round-trip cost figures already used elsewhere in this repo, or against
execution feasibility at the specific ladder levels. Nothing here is
"confirmed" or "validated" — it's exploratory, and reported as such.

---

## Reproduce

```bash
# Validation (gold only, run first)
node education/jordan_impulse_4h_range_levels_backtest/scripts/sanity_check.mjs xauusd
node education/jordan_impulse_4h_range_levels_backtest/scripts/unit_test_impulse_detection.mjs

# Per-instrument analysis (level hit-rate, correlations, VWAP, IS/OOS)
node education/jordan_impulse_4h_range_levels_backtest/scripts/run_analysis.mjs xauusd     education/jordan_impulse_4h_range_levels_backtest/data
node education/jordan_impulse_4h_range_levels_backtest/scripts/run_analysis.mjs nas100_usd education/jordan_impulse_4h_range_levels_backtest/data
node education/jordan_impulse_4h_range_levels_backtest/scripts/run_analysis.mjs eurusd     education/jordan_impulse_4h_range_levels_backtest/data
node education/jordan_impulse_4h_range_levels_backtest/scripts/run_analysis.mjs gbpusd     education/jordan_impulse_4h_range_levels_backtest/data
node education/jordan_impulse_4h_range_levels_backtest/scripts/run_analysis.mjs usdjpy     education/jordan_impulse_4h_range_levels_backtest/data
node education/jordan_impulse_4h_range_levels_backtest/scripts/run_analysis.mjs audusd     education/jordan_impulse_4h_range_levels_backtest/data
node education/jordan_impulse_4h_range_levels_backtest/scripts/run_analysis.mjs usdcad     education/jordan_impulse_4h_range_levels_backtest/data

# MAE / dynamic-stop grid (same instrument list)
node education/jordan_impulse_4h_range_levels_backtest/scripts/mae_dynamic_stop.mjs <pair> education/jordan_impulse_4h_range_levels_backtest/data

# Pooled comparison tables (this file's tables)
node education/jordan_impulse_4h_range_levels_backtest/scripts/aggregate.mjs education/jordan_impulse_4h_range_levels_backtest/data xauusd nas100_usd eurusd gbpusd usdjpy audusd usdcad
```

Per-instrument raw impulse records: `data/<pair>.impulses.json`. Aggregate
summaries: `data/<pair>.summary.json`. MAE/dynamic-stop grids:
`data/<pair>.mae_dynamic_stop.json`. Pooled comparison: `data/pooled_summary.json`.
