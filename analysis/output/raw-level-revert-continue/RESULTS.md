# raw-level-revert-continue: what raw lines do when price touches them

**Status: exploratory, not pre-registered (owner request 2026-11-15).** Register row `raw-level-revert-continue`.
Seed 20261115. Data ends 2026-08-21 (lockbox respected). Full tables: `RESULTS_TABLES.md`; numbers: `results.json`;
every touch: `trades.csv.gz` (8 MB, gitignored; `run.py` rebuilds it in under a minute). Code: `scripts/raw-level-revert-continue/run.py`, `analyse.py`.

## The question

Take out the vol forecast and the Vol Atlas. Build each day's lines **only from the instrument's own past sessions**:
the trailing 250-session p50, p75 and p90 of how far price went from the open. Then, every time price first reaches a
line, ask:

- **Revert**: fade it. Target the line one rung back toward the open; stop at the line one rung further out.
- **Continue**: follow it. This is the exact mirror: target one rung out, stop one rung back.
- **Hold to close**: fade or follow from the touch to 22:00 London, with no stop and no target.

Three line families, each with p50/p75/p90 on both sides of the open:

| Family | Upper line | Lower line |
|---|---|---|
| EXT (excursion) | open + p(OH) | open − p(OL) |
| HL (range centred on the open) | open + p(HL)/2 | open − p(HL)/2 |
| OC (open to close) | open + p(\|OC\|) | open − p(\|OC\|) |

Ladder on each side: open → p50 → p75 → p90 → p90x, where p90x = p90 + (p90 − p75) gives the p90 trade a rung to aim at.

**12 instruments**: EURUSD, GBPUSD, AUDUSD, USDJPY, USDCAD, USDCHF, gold, silver, NQ, SPX, DAX, Brent.
2019-01 → 2026-08-21, about 1,900 scored sessions each. **113,508 line touches.** Session = London date,
00:00–22:00 London, weekdays.

**The benchmark (placebo).** A line only matters if price behaves differently there than anywhere else. For every
real touch we placed 20 copies of the same trade (same % distance to target and stop, same time of day) at a random
point in another session of the same instrument within ±60 sessions. *Edge = real trade − placebo.* Without this, the
geometry alone (the outer rung is usually nearer than the inner one) makes "continue" look like it wins more often.

## The answer

**The lines don't do anything.** At every rung in every family, the revert/continue result at a raw line is the same as
at a random point with the same distances. Both rules lose after costs, because the spread (≈2.3 bp a trade) is
bigger than any gross edge.

Pooled across all 12 instruments (gross edge = real fade minus placebo, bp of price, date-clustered 95% CI):

| Family | Rung | Touches | Reverted first | Continued first | Neither by close | Fade edge vs placebo | Fade net | Follow net |
|---|---|---|---|---|---|---|---|---|
| EXT | p50 | 22,836 | 29.1% | 45.4% | 25.5% | −0.06 [−0.93, +0.82] | −2.36 bp | −2.13 bp |
| EXT | p75 | 11,702 | 28.7% | 36.7% | 34.6% | −0.72 [−2.21, +0.77] | −3.05 bp | −1.54 bp |
| EXT | p90 | 4,856 | 22.3% | 38.8% | 38.9% | −1.29 [−3.26, +0.74] | −3.31 bp | −1.29 bp |
| HL | p50 | 18,184 | 18.1% | 64.3% | 17.6% | −0.36 [−1.09, +0.43] | −2.66 bp | −1.80 bp |
| HL | p75 | 13,196 | 38.0% | 49.4% | 12.6% | −0.38 [−1.26, +0.56] | −2.67 bp | −1.87 bp |
| HL | p90 | 8,238 | 31.1% | 51.3% | 17.5% | −0.78 [−1.88, +0.41] | −3.04 bp | −1.48 bp |
| OC | p50 | 20,267 | 24.5% | 44.7% | 30.8% | −0.03 [−0.91, +0.95] | −2.23 bp | −2.30 bp |
| OC | p75 | 10,068 | 27.4% | 36.7% | 35.9% | −1.18 [−2.83, +0.37] | −3.49 bp | −1.14 bp |
| OC | p90 | 4,161 | 21.1% | 39.2% | 39.7% | **−3.36 [−5.70, −0.87]** | −5.59 bp | **+0.88 bp** |

Placebo reverted-first rates sit 1–5 points below the real ones and placebo continued-first rates 1–7 points below too:
real touches happen on days that are already moving, so *both* rungs get hit more often. The net P&L difference is zero.

In R (stop distance floored at a quarter of the target-to-stop span so a near-zero stop can't blow up the average):
fading every EXT line loses −0.08 to −0.10 R a trade net; following loses −0.03 to −0.04 R.

### What leans, and how much

- **One cell passes BH q = 0.10: OC p90, toward continuation.** Fading the far open-to-close line loses 3.4 bp more than
  the placebo. Following it is +0.9 bp net [−1.3, +3.0] a trade, about +0.002 R. Real, perhaps, but too small to trade
  on 15-minute closes.
- **Hold to close leans continuation everywhere.** Following a touched line to the session close beats the placebo by
  2–4 bp in every cell (EXT p50 2.1 bp [0.6, 3.9], OC p50 2.3 bp [0.7, 4.2], OC p75 3.0 bp [0.1, 6.1]). That is about one
  spread. It points the same way as the repo's NQ noise-area momentum candidate ("band breach held to close").
- **By instrument (EXT)**: USDJPY p50, gold p50 and DAX p50 lean continuation (fade edge −1.7, −2.8, −3.9 bp, all past
  BH). Following them nets +0.01 to +0.04 R. Nothing leans toward reversion.
- **"Why" splits (time of day, yesterday's range, 5-day trend, year, side)**: reversion is far more common in Asia hours
  (40% revert-first) than late in the day (7%), and on busy days (34%) than calm ones (24%). **But the placebo does
  exactly the same** (37% and 31%). That comes from the clock and the volatility, not the line. Only one split passes BH
  ("normal" vol, p75: continuation, −3.3 bp).

### Your friend's NAS100 test, read against this

Their summary: P50/P75 Atlas lines, fade, 2,045 trades, **517 unresolved left out**, +18.79% at 1% risk **before costs**,
conclusion "no consistent edge". Our raw-line version agrees with the conclusion:

- +18.79% over 2,045 trades is **+0.009 R a trade**, inside the noise. On NQ the spread alone costs about 0.03 R a trade at
  our stop sizes, three times that edge, which on its own turns the result into a loss.
- **Leaving unresolved trades out changes the answer.** In our NQ p50+p75 fade sample (2019–25, 2,566 touches), 757
  (30%) reach neither rung by the close. Resolved trades only: −0.054 R a trade gross. All trades: −0.020 R. The
  unresolved ones average +0.06 R. Which way the bias runs depends on the stop and target rules, but you can't know at
  entry whether a trade will resolve, so they must stay in. The repo found the same bias in the old HL-touch build
  (`js/hlSignalCore.js` header, 2026-09-09).
- Their 2024 drawdown (−9% then +28% in 2025) is the swing you'd expect from a zero-edge strategy taking ~350 trades a
  year at 1% risk.

## Caveats (read before using any number)

1. **15-minute closes, not M1 high/low.** The research M1 cache isn't in the cloud session. A line counts as "touched"
   only when a 15-minute bar *closes* beyond it, and stops and targets are judged on closes too. This misses wick touches
   that a resting limit order would fill: those are the touches most likely to bounce. A fader with limit orders could
   do better than shown. A stop trader also gets worse fills than a close. **Re-run on M1 with bid/ask before trusting any
   cell.** The earlier M1 NQ studies (`nq-line-touch-hold-to-close`, `nq-lines-as-exhaustion`, `v3-p50-follow-pre2020`)
   found the same picture with forecast lines: fade loses, follow is its mirror, no edge.
2. Open = close of the first 15-minute bar of the London session. Session highs and lows from closes understate the true
   range a little, the same way for the lines and the outcomes.
3. Costs: one median OANDA spread per round trip by instrument and year (`analysis/output/costs/spread_profile_hist.json`).
   Silver (0.08%) and Brent (0.04%) are flat **assumptions**; they have no profile. No slippage and no financing.
4. Touches whose entry close already sat beyond the next rung are left out of **both** rules (6,868, listed in
   `results.json` → `meta.gapped`). Every other touch is kept, resolved or not.
5. These are exploratory looks across 9 family×rung cells, 36 instrument cells and 60 conditioner cells. BH is applied
   within each table. Nothing here is `VALIDATED`.

## What this means / next

- Raw percentile lines from history alone carry no revert-or-continue information on 15-minute closes. Whatever the
  six-layer analysis is meant to add, the lines alone give a strategy nothing to start from. Any edge has to come from
  something else: a condition that tells you *which* touches revert.
- The one consistent lean is **continuation held to the close**, worth about one spread. It overlaps the NQ
  noise-area-momentum candidate. If pursued, it needs a pre-registration, M1 bid/ask fills and post-lockbox data.
- Before acting on a "why" split, re-run it on M1. The wick-touch population that 15-minute closes can't see is the
  open question.
