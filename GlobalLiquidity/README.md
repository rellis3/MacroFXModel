# GlobalLiquidity — a liquidity-driven macro FX system

A clean-sheet implementation of the framework synthesised from Michael Howell
(Global Liquidity), Raoul Pal (the liquidity cycle), CrossBorder Capital
(liquidity models) and Macro Alf (risk-regime models).

The thesis in one line: **all four describe one variable — the price and
quantity of money — at different resolutions.** The edge is not "liquidity up →
buy"; it is (a) *leading* the published data, (b) knowing which *regime* you are
in so you trade the right instrument the right way, and (c) *sizing to the
regime* instead of a fixed risk %.

So this is not a signal. It is a **money-conditions nowcast → regime classifier
→ expression engine**, kept as separate, individually-inspectable modules rather
than blended into one score (a score throws away the information that makes the
structure tradable).

---

## Architecture

```
 data.py    Dataset        FRED (live) or seeded synthetic (offline)
   │
 gli.py     GLIResult      Global Liquidity Index nowcast
   │                        • CB balance sheets, FX-translated to USD
   │                        • shadow/private liquidity tilt (Howell's >85%)
   │                        • headline LEVEL, IMPULSE (13w RoC), cycle position
   │                        • per-currency impulse
   │
 regime.py  RegimeResult   4-state classifier (impulse × growth)
   │                        + Macro Alf RISK GATE (credit/vol → cut gross)
   │
 ranker.py  RankerResult   cross-sectional FX book:
   │                        spread = impulse(base ccy) − impulse(quote ccy)
   │                        long top-N / short bottom-N, hysteresis throttle
   │
 sizer.py   SizedBook      vol-target the portfolio, scale by conviction,
   │                        apply the risk-gate multiplier, cap leverage
   │
 backtest.py               equity curve, stats, walk-forward (IS/OOS, WFE)
```

### Layer 1 — Global Liquidity nowcast (`gli.py`)
Howell's point is that base money is ~15% of global liquidity. So the index is
**global** (Fed + ECB + BoJ + BoE + PBoC, each FX-translated to USD) and carries
a **shadow-liquidity tilt** from repo stress (SOFR−IORB), credit (HY OAS) and
the broad dollar — the refinancing capacity that base money misses. Markets
trade the **impulse** (13-week rate-of-change), not the level, so that is the
headline timing signal. A causal phase estimate places you in the ~65-month
cycle (Pal/Howell's clock).

### Layer 2 — Regime classifier + risk gate (`regime.py`)
Liquidity is the fuel; the regime is which engine. Four states from the 2×2 of
liquidity-impulse × growth-direction: **REFLATION, RECOVERY, GOLDILOCKS_LATE,
DEFLATION**. Over the top sits the **Macro Alf risk gate**: when credit spreads
blow out or vol spikes, gross is cut regardless of how bullish liquidity looks.
That overlay is what survives 2008 / 2020 / 2022.

### Layer 3 — Expression (`ranker.py` + `sizer.py`)
FX is the cleanest expression of liquidity *divergence* — you trade one
country's money conditions against another's. Pairs are ranked by the
cross-sectional liquidity-impulse spread; the book goes long the top and short
the bottom with a hysteresis buffer that throttles turnover. The regime
`risk_tilt` adds a directional lean (net-long risk currencies in REFLATION,
net-long funders/USD in DEFLATION). **Sizing is the alpha:** vol-target the
book, scale gross by conviction, and cut on the gate.

---

## Run it

Offline (no keys — seeded synthetic data, verifies the whole pipeline):

```bash
python -m GlobalLiquidity.run --synthetic --wf
python -m GlobalLiquidity.test_smoke
```

Live (set a FRED key; supply FX weekly returns from your own price cache, e.g.
the project's TwelveData/parquet data):

```bash
export FRED_API_KEY=...
python -c "from GlobalLiquidity import data, backtest; \
           ds = data.load_live(); \
           ds = data.attach_fx_returns(ds, my_weekly_returns); \
           print(backtest.run_backtest(ds)[0])"
```

`--json` emits machine-readable output for wiring into the dashboard/server.

---

## What "profitable" means here

- **Low frequency by design.** Inputs update weekly at best; the system
  rebalances weekly and most weeks does little. Expect **~1–3 trades/week**,
  very lumpy (regime flips re-express the whole book at once). If it ever
  generates 20+/week, price noise has leaked into a money-conditions model.
- **Two stacked, decorrelated alpha sources.** A low-Sharpe directional macro
  call plus a higher-Sharpe cross-sectional FX ranking — together smooth enough
  to lever responsibly to a vol target.
- **Lead, don't confirm.** The money is in the weeks between the liquidity turn
  and the price confirmation. Nowcasting the slow-printing blocks (PBoC/BoJ/TGA)
  is the highest-value extension.

## Honesty notes / limitations

- The **synthetic** generator exists so the architecture is runnable and
  testable offline. Its backtest numbers validate the **pipeline (no lookahead,
  correct wiring, gate behaviour, low turnover)** — they are **not** evidence of
  real-world edge. The generator plants a deliberately *modest*, causally-led
  liquidity→FX relationship; the resulting ~0.5 in-sample Sharpe is a sanity
  check that the machine extracts structure that is actually there.
- Several FRED ids for non-US central banks (BoE, PBoC) are proxies and flagged
  `proxy=True` in `config.py`. Real deployment should replace them with cleaner
  vendor series and add proper FX-reserve / CNH-fixing nowcasts.
- Causality: every transform in `mathx.py` is strictly trailing, and
  publication lags are applied per source in `config.PUB_LAG_WEEKS`. The
  `test_no_lookahead_in_z` smoke test guards this.

All parameters (series, weights, thresholds, sizing) live in `config.py` — one
place to audit exactly what the model reads and how it decides.
