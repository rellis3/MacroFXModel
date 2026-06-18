# VIX Vol-Carry Strategy (P8)

A standalone backtesting system that trades **VIX exposure directly** — not as a regime filter for
another asset (that's what `bot/modules/vol_gate.py` and the P1 macro-equity model already do), but
as the traded instrument itself. The question this answers: *can a regime-aware short-vol-carry book
earn the volatility risk premium without blowing up the way XIV did in February 2018?*

---

## The Core Idea

VIX futures (and the ETNs that track them, like VXX) spend most of history in **contango** — later
months priced above the front month, because option sellers demand a premium for uncertainty further
out. A continuously-rolled long VIX-futures position bleeds value to that roll cost every single day
the curve is in contango. Shorting that decay is the same trade equity index-options sellers and
VIX ETP issuers (ProShares SVXY, etc.) have run profitably for over a decade — and the same trade that
wiped out 95% of XIV's value in one session when the regime flipped without warning.

This system's hypothesis: a regime classifier built on the same **Five-Lens Framework** used elsewhere
in this repo (`MD files/cross_asset_volatility_diagnostic.md`) — specifically the **Vol Cone** (Lens 4)
and **Term Structure** (Lens 3) lenses — can capture most of the roll-decay return while sidestepping
the tail risk that makes naive short-vol carry a blow-up-prone strategy.

---

## What Gets Measured

### Lens 4 — Vol Cone (vol_pct)

Today's spot VIX is ranked as a **percentile (0–100%) of its own trailing 252-day distribution** —
not read as an absolute level. VIX at 18 means something very different in a year where it has ranged
12–16 (rich) versus a year where it has ranged 15–35 (cheap/mid). This is exactly the vol-cone logic
described in the diagnostic doc: *"A raw vol number is meaningless without context... the cone converts
absolute levels into percentile ranks, which answer: is it worth owning or selling?"*

### Lens 3 — Term Structure (term_ratio)

`term_ratio = VIX3M / VIX` (3-month constant-maturity vol over spot vol).

- **> 1.0 → contango** — the default, carry-friendly state.
- **< 1.0 → backwardation** — the stress signature. Front-month fear has detached from the longer-dated
  view. This is the single most reliable warning sign ahead of major vol events (Aug 2015, Feb 2018,
  Mar 2020, 2022) and is treated as a hard FLAT trigger regardless of where the vol cone sits.

### Circuit Breaker — single-day VIX spike

If VIX rises **>20% in one session**, the system force-flattens immediately and will not re-enter
until **5 consecutive calm days** (|VIX daily change| < 5%) have accumulated. This is the Volmageddon
defense — modeled directly on the mechanism that destroyed XIV on 2018-02-05.

**Honest limitation:** the circuit breaker cannot prevent the mark-to-close loss on the spike day
itself — no signal computed from that day's own data can retroactively reduce exposure that was already
sized the day before. It only prevents a second hit on the way down/during the unwind and blocks
premature re-entry. The position-sizing tiers (never more than 100% notional, automatic de-risking once
vol is already statistically rich) are the primary defense against day-one catastrophic loss; the
circuit breaker's job is the *aftermath*.

---

## Trade Rules

| Regime | Condition | Position |
|---|---|---|
| **CALM** | vol_pct < 50th AND contango | Short VXX, 100% size |
| **ELEVATED** | vol_pct 50th–80th AND contango | Short VXX, 50% size |
| **STRESSED** | vol_pct ≥ 80th (regardless of term structure) | Flat |
| **BACKWARDATION** | term_ratio < 1.0 (regardless of vol_pct) | Flat |
| **CIRCUIT_BREAKER** | 1-day VIX spike > +20%, until 5 calm days pass | Flat |

- **Direction**: short-only. This system never goes long VIX/VXX. (Going long during STRESSED regimes
  as a crash-hedge overlay is the natural next step once this short-side PoC is validated — not
  included here, same reasoning as the P1 macro-equity model's long/flat-only first cut.)
- **Rebalance**: daily close. Signal computed at today's close drives tomorrow's position (one-day
  lag, no lookahead).
- **Costs**: 0.10% commission + 0.05% slippage per position change, **plus** a 1.5%/year short-borrow
  drag applied daily on gross exposure — naive short-vol-ETN backtests routinely ignore borrow cost and
  overstate edge.

---

## Data Sources

All via **yfinance** — no FRED or OANDA dependency, no API key required:

| Ticker | Role |
|---|---|
| `^VIX` | Spot CBOE VIX — drives the vol-cone signal |
| `^VIX3M` (falls back to `^VXV`) | 3-month constant-maturity VIX — drives the term-structure signal |
| `VXX` | iPath Series B S&P 500 VIX Short-Term Futures ETN — the tradable execution proxy. Inception 2009-01-30, so that's the practical start of the backtest. Fetched with `auto_adjust=True` so VXX's 2010/2016 reverse splits don't appear as fake price jumps. |

VIX/VIX3M are fetched from 2007 onward purely to pre-fill the 252-day vol-cone rolling window before
the backtest's actual start date (2009-02-02) — consistent with the no-lookahead principle: the very
first reported day of the backtest already has a full year of trailing history behind its percentile
rank.

### A note on the user-supplied historical VIX CSV data

A separate Google Drive folder of "VIX" OHLCV data going back to 2009 was investigated as a possible
primary data source for this backtest. Decoding a clean sample (75 monthly rows, 2009-06 → 2015-08)
showed values inflated 6–10x against known real CBOE VIX levels for the same dates — not a fixed
unit-conversion error, but the classic signature of a **back-adjusted continuous VIX-futures roll
series** (cumulative roll-cost adjustment anchored to zero offset at the most recent bar, which inflates
older bars most where contango was steepest — 2009-2012 was the steepest VIX-futures contango period on
record). That actually makes the dataset *more* relevant to a real tradable vol-carry strategy than raw
spot VIX would be, since real exposure is only ever available via futures/ETPs. It just wasn't usable
in this build pass: the files are too large to reliably relay through this session's tooling, and this
sandbox has no general internet access to cross-validate them independently. yfinance's `^VIX` + `VXX`
sidesteps the ambiguity entirely for now. If those larger files are available locally, they're a strong
candidate for a follow-up intraday-resolution validation pass.

---

## Walk-Forward — why it's structured differently here

The macro-equity model (`macro-regime-conditional/macro_equity_backtest.py`) re-fits z-score parameters
on a training window and applies them to an unseen test window, because its signal weights and
normalisation stats are genuinely fit from data. This model's vol-cone percentile rank and term-structure
ratio are **already point-in-time causal** — there is no parameter being estimated from a training
sample. The regime thresholds (50th/80th percentile, contango > 1.0, 20% spike, 5 calm days) are fixed
structural risk limits, chosen for their economic meaning, not optimised against history.

So the walk-forward here re-segments the already-computed daily strategy returns into the same rolling
2yr-train/3mo-test/1mo-step windows and reports OOS Sharpe — it is testing **regime stability**, not
parameter overfitting. WFE (OOS Sharpe / IS Sharpe) is still the headline number, and still has the same
target (≥ 0.5), but the thing it's certifying is slightly different: "does this fixed rule keep working
across very different vol regimes," not "did we overfit weights to history."

---

## Running the Backtester

```bash
pip install pandas numpy matplotlib yfinance   # auto-installed on first run if missing
cd vix-vol-carry
python vix_vol_carry_backtest.py

# With dashboard integration:
python vix_vol_carry_backtest.py --base-url http://localhost:3000
```

No API keys needed. Runtime is dominated by the three yfinance downloads (a few seconds each).

### Output

- Console: regime day counts, full metrics table (strategy vs naive always-short VXX), walk-forward
  window table, regime breakdown, **named historical tail-risk window table** (Volmageddon Feb 2018,
  COVID crash Feb–Apr 2020, 2022 bear market), and a pass/fail verdict.
- Chart: `vix_vol_carry.png` — 4 panels: equity curve (strategy vs naive short vs buy-and-hold long VXX,
  log scale), drawdown, VIX with regime-shaded background and circuit-breaker trigger markers, and the
  stitched walk-forward OOS equity curve.

---

## Pass / Fail Verdict

In addition to the standard OOS Sharpe ≥ 0.5 / WFE ≥ 0.5 / lower-drawdown-than-naive checks, this
script adds a check that matters specifically for a short-vol-carry book: **worst single-day return
during each named historical stress window must be better than -50%**. A short-vol strategy that
"passes" on Sharpe but would have suffered an XIV-style overnight wipeout during Volmageddon has not
actually solved the problem this system exists to solve.

---

## Limitations & Known Constraints

- **Short/flat only** — no long-vol crash-hedge leg yet. Natural next step once this side is validated.
- **Daily VXX close-to-close execution** — does not model the intraday path of a genuine Volmageddon-style
  event (VIX futures settlement that triggers ETN termination clauses happens after the cash close).
  The circuit breaker reduces — it does not eliminate — day-one tail risk.
- **Borrow cost assumption (1.5%/yr) is a constant** — real stock-loan fees on heavily-shorted vol ETNs
  spike hard exactly when you need the position most (during a squeeze), which this model does not
  capture.
- **VXX itself decays structurally over multi-year holds due to its own roll mechanics** — the long
  buy-and-hold benchmark is included mainly as an illustrative contrast, not a fair comparison, since
  it's long where the strategy is short.
- **Survivorship/instrument risk** — VXX has been reverse-split twice in its history (2010, 2016).
  `auto_adjust=True` handles this for return calculations but real-world execution would need to track
  contract specs at the time.

---

## Extending to Live Trading

Not implemented yet — per the validation funnel in `MD files/STRATEGY_INDEX.md`, this must clear
in-sample backtest, OOS test, and walk-forward before paper trading. Execution venue (shorting VXX
directly, buying SVXY as a long-only proxy, or trading /VX futures directly) is an open decision,
deliberately deferred until the backtest results justify it.
