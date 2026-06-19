# P8 — VIX Vol-Carry Strategy
## VXX (Short) — Direct VIX Exposure, Not a Filter

**Type:** Portfolio-level, daily signal
**Status:** Claude Code built — backtest ready to run (needs live data + walk-forward review); standalone read-only dashboard viewer added
**Back to index:** [STRATEGY_INDEX.md](STRATEGY_INDEX.md)

---

## Hypothesis

VIX futures spend most of history in contango. A continuously-rolled long-VIX-futures exposure (and
the ETNs that track it, like VXX) bleeds value to that roll cost every day the curve stays in contango.
Shorting that decay captures the volatility risk premium — the same trade that has been profitable for
most of the post-2009 era, and the same trade that destroyed 95% of XIV's value in one session on
2018-02-05 when the regime flipped without warning.

**Why it should persist:** Volatility selling is a genuine risk premium — someone has to be paid to
hold tail risk, and that payment flows to the short side most of the time. The premium is real and
persistent. **Why it's dangerous, and why every other strategy in this repo only ever uses VIX as a
filter for something else:** the premium is collected in small daily increments and can be wiped out in
a single session. This strategy is the repo's first attempt to trade that premium directly, with the
explicit goal of surviving the regimes that bankrupt naive short-vol books.

---

## Signal Construction — Five-Lens Framework

Reference: `MD files/cross_asset_volatility_diagnostic.md`. This strategy operationalizes two of the
five lenses directly (the other three — open interest, CVOL aggregate, skew decomposition — require
options-chain data this repo does not yet pull and are noted as future extensions).

### Lens 4 — Vol Cone

```
vix_pct = rolling_percentile_rank(VIX, window=252)   # causal, today's value vs trailing 1yr
```
Read VIX in percentile terms, not absolute level — "70 vol points is meaningless without context," per
the diagnostic doc. VIX at 18 is rich in a year that ranged 12–16, cheap in a year that ranged 15–35.

### Lens 3 — Term Structure

```
term_ratio = VIX3M / VIX
contango   = term_ratio > 1.0
```
Contango (the default state) is carry-friendly. Backwardation (front vol above the 3-month view) is
the textbook stress signature — it preceded Aug 2015, Feb 2018, Mar 2020, and 2022's worst stretches.
Treated as a hard FLAT trigger independent of where the vol cone sits.

### Circuit Breaker — single-day spike (Volmageddon protection)

```
spike            = 1-day VIX % change > +20%   -> force flat immediately
calm day         = |1-day VIX % change| < 5%
re-entry allowed = 5 consecutive calm days after a spike
```

---

## Trade Rules

**Rebalance:** Daily close. Regime computed at today's close drives tomorrow's position (one-day lag,
no lookahead — this is daily-frequency data so no weekly Friday/Monday convention is needed here).

| Regime | Condition | Position |
|---|---|---|
| CALM | vol_pct < 50th, contango | SHORT VXX, 100% size |
| ELEVATED | vol_pct 50th–80th, contango | SHORT VXX, 50% size |
| STRESSED | vol_pct ≥ 80th | FLAT |
| BACKWARDATION | term_ratio < 1.0 | FLAT |
| CIRCUIT_BREAKER | active (per above) | FLAT |

**Direction:** Short-only — never goes long VIX/VXX. A long-vol crash-hedge overlay during STRESSED
regimes is the natural extension once this short side clears validation (same staged-build philosophy
already used for the macro-equity model's long/flat-only first cut).

**Costs:** 0.10% commission + 0.05% slippage per position change, plus a 1.5%/year short-borrow drag
applied daily on gross exposure (frequently omitted in naive short-vol-ETN backtests, which overstates
edge).

---

## Performance Targets (Pre-Deployment Thresholds)

Same validation funnel as every other strategy in this repo (`STRATEGY_INDEX.md`), plus one VIX-specific
addition:

| Metric | Minimum | Target |
|--------|---------|--------|
| OOS Sharpe | > 0.5 | > 1.0 |
| Walk-Forward Efficiency | > 0.5 | > 0.7 |
| Max Drawdown | < -20% | < -15% |
| Beats Naive Always-Short Sharpe & DD | Yes | Significantly |
| **Worst single-day loss, Feb 2018 / Mar 2020 / 2022 windows** | **> -50%** | **> -20%** |

The last row exists because a strategy that clears every standard metric but would have suffered an
XIV-style overnight wipeout in Volmageddon has not solved the problem this strategy exists to solve.

---

## Walk-Forward — Note on Methodology

Unlike the macro-equity model, the vol-cone percentile rank and term-structure ratio used here are
already point-in-time causal — there is no parameter fit from a training sample to leak. The regime
thresholds (50th/80th percentile, contango > 1.0, 20% spike, 5 calm days) are fixed structural risk
limits chosen for economic meaning, not optimised against history. The walk-forward therefore tests
**regime stability** (does this fixed rule keep working across different vol eras) rather than
parameter-overfit risk — see `vix-vol-carry/README.md` for the full reasoning.

---

## Instruments

Primary: **VXX** (iPath Series B S&P 500 VIX Short-Term Futures ETN) — shorted directly. Inception
2009-01-30, giving a ~17-year backtest window that covers Volmageddon, the COVID crash, and the 2022
bear market.

Alternative (deferred — execution venue decision, "backtest first, sort execution later"): **SVXY**
long (inverse exposure without needing a short-sale-eligible account, though its leverage was cut from
-1x to -0.5x after Feb 2018 — complicates a single clean backtest series), or **/VX futures** directly
(cleanest mechanics, requires futures account and margin).

---

## Data Sources

All via **yfinance** — no FRED/OANDA key required:

| Ticker | Role |
|---|---|
| `^VIX` | Spot CBOE VIX — vol-cone signal |
| `^VIX3M` (fallback `^VXV`) | 3-month constant-maturity VIX — term-structure signal |
| `VXX` | Tradable execution proxy |

A user-supplied Google Drive dataset of historical "VIX" OHLCV data back to 2009 was evaluated as a
possible primary source. A clean decoded sample showed values inflated 6–10x against real CBOE VIX
levels for the same dates — consistent with a back-adjusted continuous VIX-futures roll series rather
than raw spot VIX. That's potentially *more* useful for a futures-based execution model later, but
wasn't usable in this build pass (file size limits in this session's tooling, no general internet access
to independently verify). yfinance sidesteps the ambiguity for this first validation pass.

---

## Implementation

Built: `vix-vol-carry/vix_vol_carry_backtest.py` (single-file, mirrors the conventions established in
`macro-regime-conditional/macro_equity_backtest.py` — dependency bootstrap, dark-themed 4-panel charts,
vectorised backtest core, expanding walk-forward, regime breakdown, pass/fail verdict). See
`vix-vol-carry/README.md` for the full design writeup and how to run it.

```bash
cd vix-vol-carry
python vix_vol_carry_backtest.py

# Push a results snapshot to the dashboard so it's checkable from a phone:
python vix_vol_carry_backtest.py --base-url http://localhost:3000
```

**Dashboard viewer:** `vix-vol-carry-backtest.html` (linked from the index dashboard's Backtests menu)
is a **read-only** viewer — there is no "Run" button and no server-side engine for P8. The Python script
pushes a single precomputed JSON snapshot (metrics, equity/drawdown curves, regime breakdown, named
stress windows, walk-forward table, pass/fail verdict) to two simple `server.js` store endpoints
(`/api/vix-vol-carry-backtest/{trades,results}`, GET+POST); the page only ever reads it back. This is
deliberately the *lighter* of the two dashboard patterns in this repo — unlike the macro-equity model
(P1), P8 has no JS engine port, no `/run` job queue, no live OANDA/FRED calls, and no bot-config.html
tab. P8 stays fully standalone and disconnected from the live bot's execution machine; the dashboard
page exists only so a manually-run backtest's results are viewable from anywhere, including a phone,
after the fact. See "Dashboard Integration" in `vix-vol-carry/README.md` for the full comparison table.

---

## Risk Notes

- **The circuit breaker cannot prevent day-one loss.** No signal computed from a spike day's own data
  can retroactively reduce exposure that was already sized the day before. It only prevents a second
  hit during the unwind and blocks premature re-entry — this is the same limitation that let Feb 5,
  2018's after-hours futures move destroy XIV before any next-day signal could react. Position sizing
  (never more than 100% notional; automatic de-risking once vol is already statistically rich) is the
  actual defense against day-one catastrophic loss.
- **Short-borrow fees spike exactly when you need the position most** — during a vol squeeze, stock-loan
  rates on heavily-shorted vol ETNs can run far above the flat 1.5%/yr assumed here. Real-world drag in
  a crisis would be worse than backtested.
- **VXX has been reverse-split twice (2010, 2016)** — `auto_adjust=True` in yfinance handles this for
  return calculations, but real execution needs to track contract specs at the time.
- **This is the first strategy in this repo to trade VIX directly rather than use it as a regime gate**
  (compare `bot/modules/vol_gate.py`, which only ever sizes/blocks other assets). Treat it with
  correspondingly more skepticism through the validation funnel before any live capital — the downside
  asymmetry of short-vol-carry strategies is exactly why they are the textbook example of "picking up
  nickels in front of a steamroller."
- Validate the named historical stress windows specifically (Feb 2018, Mar 2020, 2022) — these are the
  hardest test cases and the entire point of building this as a regime-aware system instead of a naive
  always-short position.
