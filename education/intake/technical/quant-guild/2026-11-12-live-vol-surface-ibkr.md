# How to Build a Live Volatility Surface in Python (Interactive Brokers)

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | https://www.youtube.com/watch?v=5JEeAsQqlro |
| ReelScribe id | j577xa28bv6cjhwgdhgrzfv16d8j2e6k · 73 min (~55k chars) |
| Notebook | `2026 Video Lectures/84. How to Build a Live Volatility Surface in Python (Interactive Brokers)/` (`quant_guild_live_iVol_source_code.py`, `video_code.py`; no notebook) |
| Recorded | unknown (2026 lecture series) |
| Processed | 2026-11-12 |

## Lesson
A "quant build": a live SPY implied-vol surface (strike × expiry, 3D) plus the front-expiry smile, streamed from IBKR
(TWS, raw `ibapi`). QG resolves the chain from the live spot rather than hard-coding it, picks the nearest six expiries
and strikes within ±2% of spot, streams IBKR's own model IV (generic tick 106, read from tick type 13) for the
out-of-the-money side (calls at or above spot, puts below), pivots to an expiry × strike table, fills gaps with linear
interpolation plus back/forward fill, and redraws every 0.5 s. He says plainly that the hard parts are left out:
illiquid wings ("a separate problem and project in itself"), imputation, and calendar and butterfly no-arbitrage.

## Approach
- **Question / framing**: description, not prediction. It's a viewer and a calibration input ("calibrate our stochastic
  models"), not a signal. (QG)
- **Model choice and why**: uses IBKR's Black-Scholes model IV out of the box; suggests backing IV out yourself from the
  option price as an exercise: "They should be the same." (QG) No own inversion in the code.
- **Validation**: none. No check that IBKR's IV matches an own inversion, no quote-quality filter, no staleness check,
  no arbitrage check. He names these as out of scope.
- **Habit (engineering)**: "think about what it is you need to produce the final result from an architectural standpoint"
  first (feed, chain, grid, display); never hard-code strikes/expiries ("the lazy man approach"), because tomorrow the 0DTE
  expiry is gone and spot has moved. Units check: make sure IBKR vol units are annualised, not daily, or "you are going
  to be getting some massive massive volatilities". (QG)
- **Failure modes he names**: deep OTM liquidity and missing quotes give "really funky looking plots" once the strike
  band widens (try 0.5–1.5); back-fill is "not going to be appropriate in some cases"; in production, error handling is
  where you protect against "stale quotes". (QG)
- **Costs / capacity**: not discussed.
- **Industry context**: real-time use means no plot at all: "everything would be done computationally... you don't
  visualize your calibration"; you judge the fit in research by the vol-point error of the calibrated model. (QG)

## What the code actually does
- `tickPrice` sets spot from tick type 4 (last) **or 9 (prior close)**: before the open, spot can be yesterday's close.
- Spot is read once at start. The strike grid and the call/put split are never re-centred while it runs.
- Strike band is a flat ±2% for every expiry. Six expiries for SPY run from 0DTE to about a week; a 1-week ±2% band is
  roughly ±1σ, a 0DTE ±2% band is many σ. No √T scaling.
- Strikes come from the union of all SMART strikes (`reqSecDefOptParams`), so some (expiry, strike) pairs don't exist.
  Those requests error and the cell is later filled by interpolation, so the gap looks like data.
- `pivot.interpolate(method='linear', axis=0)` interpolates **along the expiry axis by row position** (not across
  strikes, not in time), then `bfill().ffill()` gives flat extrapolation. The y-axis is the expiry index (0,1,2…),
  not time to expiry.
- `iv_dict[reqId]` keeps the last IV ever received, with no timestamp, so a contract that stops updating stays on the
  surface beside fresh ones.
- Only tick type 13 (live model IV) is read. On a delayed-data account (`reqMarketDataType(3)`) IBKR sends the delayed
  tick types (80–83; 83 = delayed model option), so this code would show an empty surface on our paper account.
- About 27 SPY strikes × 6 expiries ≈ 160 streaming lines, above IBKR's default 100 market-data lines. Not mentioned.
- Market-data lines are never cancelled.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Downside is priced higher (skew); "this is the smile that our stochastic models are trying to fit" (QG) | mechanism | ON FILE (context): rr25/bf25 on the desk (`options_skew_v1`, `14_iv_surface.py`); shape adds nothing at the touch: `skew-fade` FAIL, butterfly null (Surface Lab memory) |
| 2 | Your own Black-Scholes inversion should match IBKR's model IV (QG) | method | UNTESTED for IBKR model IV and Cboe `iv`. Own inversion exists only for CME settlements (`14_iv_surface.py`, NQ iv30 vs VXN corr 0.977) |
| 3 | Wide strike bands break the surface through liquidity and imputation (QG) | engineering | PARTLY: we use σ-scaled windows and no extrapolation (`forge/options_skew.py`); no bid/ask filter |
| 4 | Real-time use is computational; plots are for research (QG) | habit | ALREADY DO: production reads KV numbers, pages are views |

## What we could learn
- **Resolve the chain from live spot every run, never hard-code**: ALREADY DO, and better. `forge/options_skew.py`
  `pick_expiries` (nearest listed expiry to 7/30/91 days, rejects ones too far from the tenor) and `strike_window`
  (±2.5σ scaled by √days, spread evenly so the 25-delta wings are reached).
- **Back out IV yourself and compare with the vendor's**: DO WORSE. `scripts/rates_line/refresh_options_skew.py` takes
  IBKR `modelGreeks` as given (delayed, model unknown, underlying IBKR used unknown); `js/cboeChain.js` takes Cboe's `iv`
  as given. Only the CME settlement pipeline inverts (`oi_research_book/scripts/14_iv_surface.py`). Card below.
- **Units check (annualised vs daily)**: ALREADY DO in practice (QQQ IBKR IV history stored raw at ~0.21:
  `analysis/output/rates-vol-gap/ibkr_iv/QQQ_OPTION_IMPLIED_VOLATILITY.csv`), but no written rule. QG's own dashboard
  (video 41) breaks it. See the dashboard note.
- **Stale quotes are an error-handling job**: DO WORSE. We label the data type per row (`live/delayed/frozen`) and Cboe
  overlays carry `stale`, but no per-quote age is stored and no IV is dropped for age.
- **No-arbitrage checks on a surface (calendar, butterfly)**: DON'T DO. Nothing checks total variance rising with T or
  call prices convex in strike. Low priority: the desk reads ATM, rr25, bf25, not a full surface.

## Engineering lessons for our pipeline
1. **Delayed tick types.** Raw-`ibapi` code that reads only tick 13 gets nothing on our delayed paper account. Our
   `ib_insync` path maps 13 and 83 to `modelGreeks`, so `refresh_options_skew.py` is fine. Any new raw-`ibapi` script
   (`scripts/footprint/ib_footprint.py` style) must handle 80–83 and call `reqMarketDataType(3)`.
2. **Spot source.** QG falls back to tick 9 (prior close) silently. Our `last_price` falls back to the daily close and
   labels it `'close'`, but `row['data']` is set from the last tenor only and doesn't say "price was yesterday's close".
   Worth one field: the underlying's own data type per tenor.
3. **Interpolate in the right coordinates and never extrapolate.** ALREADY DO: delta-space for 25Δ, log-moneyness for ATM,
   total variance (σ²T) across expiries for constant maturity (`14_iv_surface.py` `cm`), `interp` returns None outside
   the range (`forge/options_skew.py`). His version (row-index interpolation and flat fill) is the anti-pattern.
4. **Quote quality.** Neither of us filters on bid/ask. `14_iv_surface.py` filters premiums below intrinsic, above the
   no-arb cap and below a tick-rounding floor (settlements have no spread). For IBKR/Cboe live quotes a cheap filter
   is: drop zero bid, drop (ask−bid)/mid above a cap, and drop IV whose vega-scaled half-spread is above ~1 vol point.
   `parseCboeChain` drops only contracts with neither OI nor volume.
5. **Line budget and cleanup.** IBKR's default is 100 simultaneous lines. Our `greeks()` requests one tenor (~20
   options), waits 8 s and cancels everything. Keep it that way; don't copy a stream-everything design.
6. **What we lack.** A live strike × expiry view. We already have the raw input: the Cboe 15-min intraday log
   (`js/cboeIntraday.js`, SPX/NDX/SPY/QQQ, ±8%, ≤45 days, with `iv`) and per-expiry smiles in `cboeChain.js` (3 nearest
   expiries). A surface view would be a page over existing data, not a new feed. Cboe free delayed data is a better
   source than delayed IBKR streams for US index options. Note: "Surface Lab" (`surface-lab.html`) is not an options
   surface. It holds COG-principle 3D fields (absorption, persistence, vol time, rates), so the names could confuse.

## Research ideas
- **IBKR model IV vs own inversion (audit)** · variable: IBKR `modelGreeks.impliedVol` minus own Black-76 IV from the
  delayed mid (same F, same T to the minute), per option · condition: ATM vs 25Δ wings; tenor 1w/1m/3m; delayed vs
  close-fallback F · horizons: one snapshot per day for 10 days · noise threshold: half the bid-ask spread in vol points
  (spread ÷ vega) · benchmark: CME settlement IV the same day (QuikStrike `iv_term_daily.csv` ATM; `14_iv_surface.py`
  method) · what it changes: whether the Desk Terminal's rr25/bf25 (`options_skew_v1`) can be read as market skew or
  carry a model/staleness bias, and whether to switch to own inversion. Screen: `evidence_map` "IV" (27 hits) and
  "vol surface" (0): no audit of IBKR or Cboe IV on file. Agenda: `model-audits.md` (proposed; not added).

## Quotes
- "We can't just hardcode them. That's the lazy man approach." (QG)
- "If you are scaling annual units twice you are going to be getting some massive massive volatilities." (QG)
- "This can turn into a very interesting data imputation problem very quickly." (QG)
- "If you did need real-time updates, then you wouldn't be visualizing this. Everything would be done computationally." (QG)
- "You can try to produce the implied volatility on your own. They should be the same." (QG)
