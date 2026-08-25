# Pullback-continuation trade — evidence-driven follow-up (2026-08-23)

Follow-up to [RESULTS.md](RESULTS.md) and [FADE_EXTENSION_TRADE.md](FADE_EXTENSION_TRADE.md).
Real Discord screenshots of actual trades ("Jordan", posted in the group's
Member-Analysis channel, real dates/prices) were checked against this
repo's real M1 archive rather than guessed at. Two things came out of that
check that neither of the previously-tested trades captured:

1. **The 0.6 min body/range ratio filter was silently excluding real,
   large impulse candles.** Checked directly: the NAS100 2026-08-13 12:00
   UTC candle (453.9-point range, 2.88× ATR — genuinely huge) has a body
   ratio of 0.547, just under the 0.6 floor, because of a large wick. The
   real trade's entry sat inside that exact candle. This run uses
   **minBodyRatio=0.3** instead, and re-detects impulses fresh rather than
   reusing the 0.6-threshold `data/*.impulses.json` — 33–37% more impulses
   turn up per instrument as a result (e.g. gold 317 → 423).
2. **Entries didn't match the extension ladder at all** — checked against
   real spot prices at the real trade times (including reverse-engineering
   a ~+56 MGC1!-futures-vs-spot-XAUUSD basis from two independent
   screenshots, which came out consistent to within a point). What DID
   match, for the one example with a clean read (NAS100), was a classic
   **38.2–61.8% Fibonacci retracement back INTO the impulse** before
   continuing in its own direction — not a deep extension, not the ladder.

## The rule, exactly as pinned

Same pinned-and-named-judgment-call approach as the other two trade tests.
See `simulateRetracementContinuationTrade` in
[`js/impulse4hRangeLevelsEngine.js`](../../js/impulse4hRangeLevelsEngine.js).

| Element | Mechanised as |
|---|---|
| Impulse detection | Same as elsewhere in this study, but **minBodyRatio=0.3** (not the Pine default 0.6) — evidence-driven, see above |
| Retracement zone | fib ∈ [0.382, 0.618] — direction-symmetric in this engine's coordinates (impulse low=0, high=1), no mirroring needed |
| Entry | Resting limit at the **shallow/first-reached edge** of that zone (fib=0.618 bullish price / fib=0.382 bearish — same `1-fib` mirror convention used throughout this file), no confirmation candle |
| Direction | **Continuation** — same direction as the impulse, not a fade |
| Stop | Beyond the **far edge** of the retracement zone (fib=0.382 bullish / 0.618 bearish) — "if it retraces deeper than the classic zone, this pullback read is wrong" |
| Target | Same `fib=2.0` rung (mirrored `1-2.0` bearish) as `simulateContinuationTrade`'s pinned target in RESULTS.md §4 — kept identical on purpose, to isolate ONE variable (entry timing/quality via the pullback) against the already-tested immediate-entry version, not several at once |

## Result — null, on every instrument, same as everything else tested here

85–89% of impulses eventually retrace into the zone and trigger the entry.
Full-sample, honestly split 60/40 IS/OOS by date:

| Instrument | Triggered | Full Sharpe | Full win% | PF | IS Sharpe (n) | OOS Sharpe (n) |
|---|--:|--:|--:|--:|--:|--:|
| Gold | 362/423 (85.6%) | −0.188 | 17.4 | 0.908 | +0.091 (217) | **−0.528** (145) |
| NAS100 | 341/410 (83.2%) | 0.067 | 17.0 | 1.036 | +0.254 (204) | **−0.218** (137) |
| EURUSD | 374/421 (88.8%) | −0.518 | 16.3 | 0.786 | −1.010 (224) | +0.018 (150) |
| GBPUSD | 386/435 (88.7%) | 0.019 | 18.9 | 1.009 | −0.037 (231) | +0.108 (155) |
| USDJPY | 364/436 (83.5%) | −0.221 | 16.2 | 0.887 | +0.140 (218) | **−0.750** (146) |
| AUDUSD | 384/431 (89.1%) | −0.404 | 13.5 | 0.815 | −0.224 (230) | **−0.665** (154) |
| USDCAD | 357/414 (86.2%) | −1.263 | 12.9 | 0.555 | −1.222 (214) | **−1.348** (143) |

**Reading it straight:** no instrument shows both a genuine in-sample edge
AND a positive out-of-sample result. Five of seven are clearly negative
OOS (gold, NAS100, USDJPY, AUDUSD, USDCAD); the two that aren't (EURUSD,
GBPUSD) are essentially flat (+0.018, +0.108), not an edge — and both of
those had a *negative* in-sample Sharpe, so there was nothing to genuinely
select on even before checking OOS. Win rates sit at 13–19% everywhere
(expected for a wide fib=2.0 target, but profit factor is still under 1 on
5 of 7 — the payoff isn't compensating enough).

## Where this leaves the whole investigation

Four distinct, honestly-pinned formalisations of "trade off the 4H impulse
candle" have now been tested against 10+ years of real data on 7
instruments:

1. Immediate continuation entry, ladder target (RESULTS.md §4) — breakeven.
2. Fade at fib≥2, target the median (FADE_EXTENSION_TRADE.md) — null, and a stop-distance grid made it actively worse on 3/7 when honestly selected.
3. The same fade, gated by VWAP distance — null, worse on 3/7.
4. Pullback into the classic 38.2–61.8% retracement zone, then continue (this file) — null on every instrument.

None of the four produce a real, out-of-sample-robust edge. The two
genuinely real findings from the whole study remain purely descriptive
correlations (RESULTS.md §2 and §5), not yet turned into anything that
survives being traded. Given the real screenshots checked against real
data increasingly point toward the group's own existing tools (H-L
range/median session tool, confirmed unambiguously on one EURUSD example)
rather than either the extension ladder or a generic pullback rule, the
honest conclusion is that this specific line of research — "mechanise the
single-4H-impulse-candle ladder idea from video 17" — has not turned up a
tradeable rule, independent of whether the ladder idea itself has any
merit in a form not yet tried here.

## Reproduce

```
node scripts/retracement_continuation_trade.mjs <pairKey> ../data
```
Re-detects impulses fresh at minBodyRatio=0.3 (does not reuse the saved
0.6-threshold `data/*.impulses.json`).
