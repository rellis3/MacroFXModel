# DeepSeek August Review — MacroFXModel repo audit

**Date:** 2026-08-23
**Scope:** Full-repo review of the trading system — backtest engines, live bots, shared baseplate (`pylego/`), data backfill, analysis scripts and the dashboard/backtest HTML. Focused on things that are _wrong_ or _misleading_ for the trading system being built, with a concrete path to fix each. Not an architecture review.

**How to read this:** each finding has a severity, the exact file/line, why it matters for the system, and the fix path. Line numbers refer to the files as they are today.

---

## TL;DR — the five that will actually cost you or mislead you

1. **The live bot's WT1 direction filter is dead code, but the backtest simulates it as alive.** This is the single most dangerous mismatch in the repo: [`bot/main.py`](bot/main.py:544) fetches **30** M5 bars, but [`compute_wt1()`](bot/utils/indicators.py:70) returns `NaN` unless it has **31** (`n1+n2`). So in live trading `bardir` **never blocks anything** (`math.isnan(wt1_5m)` → `score = 2`), while [`bot/backtest.py`](bot/backtest.py:323) fetches **50** bars and _does_ apply the filter. **The backtest results you're reading are for a strategy that the live bot is not actually running.**
2. **`USTECH100M` pip resolves to `0.0001` in the backtest bot** (should be `1.0`). It's in the default `enabledPairs` ([`backtestSystem/config.py`](backtestSystem/config.py:105)). Every price→pip conversion, confluence tolerance and — worst of all — position sizing on the NASDAQ index is off by ~10,000×. If this bot has ever opened a USTECH100M position it was mis-sized.
3. **`regime-backtest.html` infers pip size from price magnitude** — `pipSizeOf(px) => px >= 20 ? 0.01 : 0.0001` ([`regime-backtest.html`](regime-backtest.html:3334)). Gold at ~3000 and NAS at ~22000 both get `0.01`; the canonical pip for both is `1.0`. Transaction costs in that backtest are **understated ~100× for gold and every index** — costs vanish and PnL looks better than reality.
4. **The trade-history backfill buckets by the broker clock, not real UTC** ([`backtestSystem/backfill_all_bots.py`](backtestSystem/backfill_all_bots.py:316) and [`backtestSystem/backfill_trade_history.py`](backtestSystem/backfill_trade_history.py:171)). The live path carefully subtracts the broker offset before the date test ([`backtestSystem/mt5_utils.py`](backtestSystem/mt5_utils.py:285)); the backfill path does not, so any trade closing in the last ~3 hours of a UTC day lands in the _next_ day's history bucket.
5. **The AnalogML "confidence" shown on the live dashboard uses a proxy R, not the real raced outcome.** [`AnalogML/motif_track.py`](AnalogML/motif_track.py:316) scores a `played_out` motif as `+1.5R` and a failed one as `−1.0R` flat, regardless of the actual bar path. A motif that broke the right way but then got stopped at −1R before reaching +1.5R is counted as a **+1.5R win** in the confidence bar. This overstates the live signal's credibility vs. the validated track record.

---

## CRITICAL — will mislead P&L or sizing if not fixed

### C1. Live WT1 filter dead; backtest applies it (live/backtest divergence)

- [`bot/main.py`](bot/main.py:544) → `fetch_bars(pair, count=30)`; [`bot/main.py`](bot/main.py:575) → `compute_wt1(bars_5m)`; [`bot/utils/indicators.py`](bot/utils/indicators.py:70) requires `len(bars) >= n1 + n2` (31).
- Net effect: `wt1_5m` is `NaN` on every live tick, so [`pre_screen`](bot/main.py:579) always returns `score = 2` for the direction leg. The `bardir` config ("on"/"auto") does nothing live.
- [`bot/backtest.py`](bot/backtest.py:170) uses `fetch_bars_at(..., count=50)` → the same WT1 _does_ fire in backtest. So the backtest filters on a signal the live bot never uses.
- **Fix path:** make them identical. Either raise the live fetch to `count=50` in `fetch_bars(pair, count=50)` ([`bot/main.py`](bot/main.py:544)) or lower the WT1 threshold in `compute_wt1` to `len(bars) < n2` (it only truly needs `n2` to compute an EMA; the `n1` requirement is over-strict). Then re-run `bot/backtest.py` and re-validate — the filtered win-rate/lift numbers will change.

### C2. `USTECH100M` pip = 0.0001 in backtestSystem

- [`backtestSystem/mt5_utils.py`](backtestSystem/mt5_utils.py:57) `pip_size()` only knows the keys passed to `pip_sizes_for([... 'NAS100', 'US100'])` (line 39) and does substring matching. `'USTECH100M'` contains neither `'NAS100'` nor `'US100'`, so it falls to `PIP_SIZES.get(mt5_sym, 0.0001)` → **0.0001** (should be 1.0 per [`pylego/instruments.json`](pylego/instruments.json:239)).
- It is in the default pair list ([`backtestSystem/config.py`](backtestSystem/config.py:105)) and `configs/active.json` doesn't override `enabledPairs`, so it's enabled by default.
- Every downstream calc in [`backtestSystem/main.py`](backtestSystem/main.py:181) (`pip = pip_size(pair)`) then scales range/tolerance/SL in units of 0.0001, and `position_size()` ([`backtestSystem/risk.py`](backtestSystem/risk.py:198)) produces a wildly wrong lot size for the index.
- **Fix path:** replace the substring `pip_size` with the canonical resolver, e.g. `from pylego.instruments import pip_size` and map `'USTECH100M'` via the alias (`ustech100m → nq → 1.0`, already in [`pylego/instruments.json`](pylego/instruments.json:404)). Add a test that `pip_size('USTECH100M') == 1.0`.

### C3. `regime-backtest.html` pip inference breaks gold/index costs

- [`regime-backtest.html`](regime-backtest.html:3334) `pipSizeOf(px) => px >= 20 ? 0.01 : 0.0001` is a price-magnitude heuristic. Gold (~$3000) and all indices (~$20k+) get `0.01`; canonical pip for both is `1.0` (see [`pylego/instruments.json`](pylego/instruments.json:230) and :239).
- Used for the cost model at [`regime-backtest.html`](regime-backtest.html:3340) and the hurdle test at :5037. Costs are 100× too small on gold/indices.
- **Fix path:** drive pip size from the instrument registry (or a proper per-symbol table keyed by symbol, not price), mirroring `pylego/instruments.json`. Same class of bug as C2 — one source of truth, never infer from price.

### C4. Backfill bucketing ignores the broker-clock offset

- [`backtestSystem/backfill_all_bots.py`](backtestSystem/backfill_all_bots.py:316) and [`backtestSystem/backfill_trade_history.py`](backtestSystem/backfill_trade_history.py:171) compute the bucket date with `datetime.fromtimestamp(t['time_close'], tz=utc)` where `time_close` is the **broker-stamped** epoch (UTC+3). The live path explicitly subtracts the offset first ([`backtestSystem/mt5_utils.py`](backtestSystem/mt5_utils.py:285)).
- Result: a position closing 21:00–23:59 real UTC is filed under the next day's `trade_hist_*_<date>` bucket — inconsistent with live-pushed history, so daily trade-history totals disagree depending on which path recorded them.
- **Fix path:** in both backfill scripts, subtract the broker offset before the date test (reuse `mt5_utils.tz_offset_sec()` / `pylego.broker.clock`), and ship `tz_offset_sec` alongside so the dashboard renders consistently.

### C5. AnalogML dashboard "confidence" uses a proxy outcome, not the real track record

- [`AnalogML/motif_track.py`](AnalogML/motif_track.py:316) builds `r_values = [1.5 if m.played_out else -1.0 ...]` for the confidence bar / PF shown live.
- `played_out` is the pattern's _textbook direction held_, not "the 30p TP was hit before the 20p SL". The real track record resolves via the shared barrier walker ([`AnalogML/motif_track.py`](AnalogML/motif_track.py:289)). The two disagree — the live confidence is systematically optimistic.
- **Fix path:** compute the category confidence from the _same_ `race_trades` outcomes used to resolve the track record (a played-out-but-stopped motif is −1R, not +1.5R). Label the displayed number as "proxy" until then.

---

## HIGH — skews results / inconsistent math

### H1. Position sizing uses the mid price but fills at ask/bid — real risk > intended risk

- [`bot/main.py`](bot/main.py:1131) sizes off `sl_dist = abs(live_price - sl)` where `live_price` is the **mid**, then [`execute_trade`](bot/main.py:985) fills a LONG at `ask` / SHORT at `bid`. The actual stop distance from fill is `sl_dist + half-spread` → every live trade risks slightly more than `risk_pct`.
- Same pattern in [`backtestSystem/main.py`](backtestSystem/main.py:400) + [`place_order`](backtestSystem/mt5_utils.py:212).
- The repo already has the intended fix brick — [`pylego/costs.expected_fill()`](pylego/costs.py:98) exists precisely for this — but neither bot uses it. **Fix path:** size off `expected_fill(level, is_buy, pair, broker)` instead of the raw mid (or compute SL distance from the ask/bid you'll actually trade).

### H2. `DynAnchorBot` pip VALUES differ from the canonical table (documented, still live)

- [`pylego/point_values.py`](pylego/point_values.py:11) itself notes DynAnchorBot differs (EUR/JPY 9.0 vs 6.5, EUR/GBP 13.0 vs 12.5). That means two live bots size the same cross differently — a real sizing inconsistency the README flags but hasn't resolved.
- **Fix path:** migrate DynAnchor onto `pylego.point_values` behind a risk review (as the README says), and add a test that no bot's inline table disagrees with the canonical one.

### H3. `compute_macd` returns mismatched-length lines (latent)

- [`backtestSystem/indicators.py`](backtestSystem/indicators.py:241) computes the signal line only on `macd_line[slow:]`, so `sig_line` is `slow-1` shorter than `macd_line`. The only caller ([`backtestSystem/engine.py`](backtestSystem/engine.py:405)) uses `[-1]` on both so it works today, but any future element-wise use silently misaligns.
- **Fix path:** compute the signal EMA over the full `macd_line` (standard MACD) or return the shorter line with an explicit contract. Add a length-assertion test.

### H4. `feature_htf_ema` H1 closes are an approximation, not true H1 bars

- [`backtestSystem/engine.py`](backtestSystem/engine.py:196) takes every 12th 5m close starting at index 11. This is only "the H1 close" if the 5m series begins exactly on an hour boundary; otherwise the EMA21/EMA50 reads drift by up to an hour and can mislabel direction at the edges.
- **Fix path:** resample actual H1 bars from the 5m feed (like `AnalogML/pattern_scan.load_bars`) and compute EMAs on those, so the feature matches the dashboard's H1.

### H5. `detect_confluences` tight-distance fixed at 10% while config exposes `tightPct`

- [`backtestSystem/levels.py`](backtestSystem/levels.py:71) hardcodes `tight_dist = normal_dist * 0.10`; [`backtestSystem/configs/active.json`](backtestSystem/configs/active.json:33) sets `tightPct: 50` — the config value is never read. So the `tight_only` signal filter behaves differently than the config implies.
- **Fix path:** wire `tightPct` (as a fraction) into `detect_confluences`.

### H6. `entryProximityATR` default disagrees between config and call-site

- [`backtestSystem/config.py`](backtestSystem/config.py:18) default `0.5`; [`backtestSystem/main.py`](backtestSystem/main.py:236) `.get('entryProximityATR', 0.30)`. Only matters if the key is missing (it isn't, thanks to DEFAULTS), but the two numbers should not be different literals. **Fix path:** single constant.

### H7. `backtestSystem`'s chandelier trail recomputes ATR on a truncated 42-bar slice each poll with the _current_ (incomplete) bar

- [`backtestSystem/main.py`](backtestSystem/main.py:616) `bars_30m[-(atr_period*3):]` with `atr_period=25` (active.json) → 75 bars, fine; but the seed/init in [`bot/utils/indicators.py`](bot/utils/indicators.py:45) seeds with bar[1]'s raw H−L ignoring the prior close, and bar[0] (the live bar) is always included. Minor, but the ATR used for trail width and SL is computed on a moving window that always includes the forming bar. **Fix path:** drop the current bar for ATR estimation, and fix the seed to use the first true TR.

### H8. `feature_vwap_slope` is a TWAP, not a VWAP

- [`backtestSystem/engine.py`](backtestSystem/engine.py:216) computes a time-weighted average of HLC/3 with **no volume** — that is TWAP. The feature key/name is `vwapSlope` and the config label says "TWAP Slope" ([`backtestSystem/config.py`](backtestSystem/config.py:115)). Naming matters for interpretation: a VWAP and TWAP are different signals. **Fix path:** rename the key to `twapSlope` (or feed real volume) so nobody reads it as volume-aware.

---

## MEDIUM — connectivity / dead code / consistency

### M1. `bot-config.html` gold pip = 0.1 vs canonical 1.0

- [`bot-config.html`](bot-config.html:6877) sizes gold with `pipSize = 0.1` while the registry says 1.0 ([`pylego/instruments.json`](pylego/instruments.json:230)). The P&L preview at :6880 then overstates gold "pips" 10×. **Fix path:** pull from the shared registry like the Python bots do.

### M2. `regime_bot` uses static pip VALUES for sizing (known, but stale-prone)

- [`bot/regime_bot.py`](bot/regime_bot.py:85) sizes via `point_values_for(...)` — a static USD-per-pip table. The live-fill-aware `pip_value_per_lot` ([`bot/utils/pip_values.py`](bot/utils/pip_values.py:110)) exists and handles USD-base/JPY correctly but regime_bot doesn't use it. **Fix path:** route regime_bot sizing through `pip_value_per_lot` with the live price (like `backtestSystem/risk.py` does).

### M3. Backtest `bot/backtest.py` WT1 differs from live (see C1) — also `bars_1h` for `bardir='on'`

- Live `bardir='on'` requires 5m **and** 1H agreement ([`bot/main.py`](bot/main.py:600)); the backtest's `simulate_pre_screen` only checks 5m WT1 ([`bot/backtest.py`](bot/backtest.py:341)) — no 1H leg at all. So `bardir='on'` is also simulated differently from live. **Fix path:** replicate the 1H leg in the backtest once C1 is fixed.

### M4. `_regime_veto` pair normalisation mangles index symbols

- [`backtestSystem/main.py`](backtestSystem/main.py:86) builds `f'{pair[:3]}/{pair[3:]}'` → `USTECH100M` becomes `UST/ECH100M`, which will never match the regime cache (harmless today, but silently disables the veto for indices). **Fix path:** use the canonical key resolver (`pylego.instruments.resolve_key`).

### M5. Two copies of "today's closed trades" serialisation with drift risk

- [`backtestSystem/mt5_utils.py`](backtestSystem/mt5_utils.py:240) and [`bot/main.py`](bot/main.py:222) implement the same broker-clock-corrected close serialisation independently. They've already drifted (the bot version has a position-id lookup the backtest version lacks). **Fix path:** one shared brick (natural home: `pylego/broker/mt5.py`).

### M6. `regime_bot`/`main.py` trade window string comparison

- [`bot/regime_bot.py`](bot/regime_bot.py:446) and [`bot/main.py`](bot/main.py:678) compare `'HH:MM'` strings — works only because values are zero-padded; a config like `"7:00"` silently breaks it. **Fix path:** parse to minutes.

---

## LOW — latent / hygiene

- **`compute_hurst`** ([`backtestSystem/indicators.py`](backtestSystem/indicators.py:199)): R/S with only ~4 scales is a coarse estimator; fine as a regime flag but don't read the exact value as meaningful.
- **`OandaClient._parse_candles`** ([`TradingBot/dyn_anchor_bot.py`](TradingBot/dyn_anchor_bot.py:101)) uses `c is not raw[-1]` (identity on dicts) — fragile; use an index comparison.
- **`pattern_scan.py` AUC alignment** ([`AnalogML/pattern_scan.py`](AnalogML/pattern_scan.py:197)): `won` and `margins_for_signal` are only aligned because every query guarantees forward runway; add an explicit length guard rather than relying on `if len(won) == len(margins...)`.
- **`backtestSystem/risk.py`** [`position_size`](backtestSystem/risk.py:216): `sl_pips = sl_dist / pip` uses the same `pip` that `pip_value_per_lot` scales by — consistent, but the 0.01-lot floor means sub-minimum sizing is silently rounded up (fine for the floor, just be aware).
- **`bot/backtest.py` stats mix gross and net**: after `apply_costs`, records it couldn't cost keep their journal-derived `win` flag, so `compute_stats` mixes gross and net rows ([`bot/backtest.py`](bot/backtest.py:436)). Should split them.

---

## Verified OK (so you don't re-hunt these)

- The **AnalogML `shape_match` self-adjacency fix** is real: [`find_analogs`](pylego/shape_match.py:112) seeds the gap-check with `exclude_after` — the README's falsification (k-NN → null) stands.
- **`barrier_race.py`** walker is bar-path-correct and shared everywhere (no duplicate SL/TP walker drift).
- **`pip_value_per_lot`** resolution order (MT5 tick value → quote-computed → static) is sound and correctly handles USD-base pairs like USD/JPY.
- **`server_clock` / London-DST logic** is correct and consistently applied on the _live_ paths.
- **`levels.py` Asia/Monday ranges and `project_fib_levels`** match the Pine convention (body high/low, no wicks).
- **`KillSwitch` restart persistence** and the **`family_confirm_count`** independence gate in `engine.py` are implemented as documented and covered by `test_direction.py`.
- **`decisionBacktest.js` / `cogShadow.js`** are honestly-labelled inference instruments (GEX/wall mapping flagged as uncalibrated) — nothing misleading there.

---

## Suggested fix order

1. **C1 (WT1 live/backtest divergence)** — first: it invalidates the current backtest's meaning for the live system. Re-run backtests after.
2. **C2 (USTECH100M pip)** — one-line resolver swap + test; also grep any other bot/dashboard with an inline pip heuristic (C3, M1, M2) for the same class.
3. **C4 (backfill broker-clock)** — unify on the shared serialiser.
4. **C5 (AnalogML confidence proxy)** — point the live confidence at the real raced outcomes.
5. **H1 (size at real fill)** — use `expected_fill`.
6. Then the H/M items, then hygiene.

If you want, I can implement any of these fixes directly — C1, C2, C3 and C4 are small, high-value, and low-risk.

---

# PART 2 — Extended audit (RegimeV2/V4/V7, GoldV2, MacroEquity, YieldSpread, remaining dashboards)

Second-pass findings over the bot directories and backtest dashboards that Part 1 only sampled. Same severity convention. The headline: **one cross-cutting bug repeats across four bots, and the pip-size inconsistency found in Part 1 is actually a four-page dashboard-wide problem.**

## B1. (HIGH, cross-cutting) The broker-clock closed-trade bug repeats in 4 more bots — and V4 is missing the field entirely

The old buggy serialisation that [`bot/main.py`](bot/main.py:237) and [`backtestSystem/mt5_utils.py`](backtestSystem/mt5_utils.py:265) already fixed still ships, near-verbatim, in:

- [`RegimeV2/regime_bot_v2.py`](RegimeV2/regime_bot_v2.py:786) `_serialize_closed_trades`
- [`RegimeV7/regime_bot_v7.py`](RegimeV7/regime_bot_v7.py:903) `_serialize_closed_trades`
- [`GoldV2/main.py`](GoldV2/main.py:560) `_serialize_closed_trades`
- [`MacroEquityBot/macro_equity_bot.py`](MacroEquityBot/macro_equity_bot.py:456) `_serialize_closed_trades`

Each one calls `history_deals_get(utc_midnight, +1day)` with a **real-UTC window on the broker clock** and never filters closes by their real-UTC date. Trades closing 21:00–23:59 UTC land in the wrong day's history bucket (or are missed), exactly the bug the four call-sites above were fixed against. **RegimeV4** ([`RegimeV4/regime_bot_v4.py`](RegimeV4/regime_bot_v4.py:764)) doesn't send `today_closed_trades` in its status push at all, so V4's closed trades never reach the dashboard history via the live path (only via the backfill script).

**Fix path:** one shared serialiser (the natural home is `pylego/broker/mt5.py`; the MT5-broker brick already does this correctly) and call it from all five bots. Add a regression test that a deal stamped broker+3h at 22:30 UTC lands under today's bucket.

## B2. (HIGH) Dashboard pip-size tables disagree with each other AND with the canonical registry

Part 1 flagged [`regime-backtest.html`](regime-backtest.html:3334). It is not alone — every backtest page rolls its own pip heuristic, and they all get gold (and usually indices) wrong vs the registry ([`pylego/instruments.json`](pylego/instruments.json:230): gold `1.0`, index `1.0`):

| Page                                                       | gold pip         | index pip                         | canonical (gold 1.0, index 1.0)    |
| ---------------------------------------------------------- | ---------------- | --------------------------------- | ---------------------------------- |
| [`claude-backtest.html`](claude-backtest.html:285)         | 0.1              | 0.0001 (not handled → FX default) | 10× / 10,000× too small            |
| [`bot-config.html`](bot-config.html:6877)                  | 0.1              | 1 (correct)                       | 10× too small for gold P&L preview |
| [`regime-backtest.html`](regime-backtest.html:3334)        | 0.01 (price ≥20) | 0.01                              | 100× too small                     |
| [`forecaster-backtest.html`](forecaster-backtest.html:919) | 0.01             | 1                                 | 100× too small for gold            |

Consequence: **cost-per-trade and pip-denominated P&L on gold (and on indices in `claude-backtest.html`) are wrong by 10–100× on those pages** — costs effectively vanish, P&L in pips is inflated, and no two pages agree with each other or with the live bots. This is the same class of bug as C2 (one wrong pip silently scales PnL).

**Fix path:** serve pip size from the registry (or one shared JS module generated from `js/instrumentRegistry.js`) instead of per-page heuristics. At minimum, standardise on gold=1.0 and index=1.0 everywhere.

## B3. (MEDIUM) Regime bots V2/V4/V7 size off static pip VALUES

[`RegimeV2/regime_bot_v2.py`](RegimeV2/regime_bot_v2.py:90), [`RegimeV4/regime_bot_v4.py`](RegimeV4/regime_bot_v4.py:116) and [`RegimeV7/regime_bot_v7.py`](RegimeV7/regime_bot_v7.py:134) each carry a static `_PIP_VALUES` table (JPY crosses pinned at 6.5–9.0 $/pip/lot). The live-fill-aware `pip_value_per_lot` ([`bot/utils/pip_values.py`](bot/utils/pip_values.py:110)) exists and `backtestSystem/risk.py` already uses it. **Fix path:** route all three through `pip_value_per_lot(pair, pip, price=live)` like `backtestSystem/risk.py:213`.

## B4. (MEDIUM) GoldV2 checks live TP1/SL against the MID price

[`GoldV2/main.py`](GoldV2/main.py:1005) decides `TP1_HIT` with `price >= trade.tp1` where `price` is the **mid**; a live long's TP actually fills at the bid. Same for the SL-hit inference at :1038–1044. On gold the spread is a meaningful fraction of the target, so TP1/BE detection can fire before or after the broker would really fill. **Fix path:** use the exit-side executable price (`bid` for a long, `ask` for a short) for live barrier checks — GoldV2's paper path already does this correctly ([`GoldV2/main.py`](GoldV2/main.py:993)).

## B5. (LOW) RegimeV2 labels `100 − confidence` as a "change probability"

[`RegimeV2/regime_bot_v2.py`](RegimeV2/regime_bot_v2.py:1039) `p_change = 100.0 - confidence` is not a change-point probability; it's the confidence complement, shown in alerts as "change prob". Reads as if it were a BOCPD-style signal. **Fix path:** rename to `conf_complement` or drop — the real `bocpd_prob` is computed separately.

## B6. (LOW) RegimeV7 heartbeat default mismatch

[`RegimeV7/regime_bot_v7.py`](RegimeV7/regime_bot_v7.py:1473) renders `exit_regime_bars` with a default of `3` in the heartbeat display while the config default is `4` (line 211). Cosmetic, but it's the exact "two copies of a default drift" pattern the repo's own discipline warns about. **Fix path:** read `cfg.get("exit_regime_bars", 4)`.

## B7. (LOW) MacroEquityBot sizes sells using the ask price

[`MacroEquityBot/macro_equity_bot.py`](MacroEquityBot/macro_equity_bot.py:347) uses `tick.ask` for the notional of both buys and the reduction path; a SELL/trim notional should use the bid. Impact is tiny at monthly-rebalance scale, but it's a mid-vs-fill asymmetry. **Fix path:** use `tick.bid` when `diff_lots < 0`.

## B8. (LOW) `claude-backtest.html` Sharpe assumes 252 trade-days

[`claude-backtest.html`](claude-backtest.html:533) annualises Sharpe with `sqrt(252)` treating every trade as one "day" — for a page that trades ~1×/day that's roughly right, but it's a per-trade Sharpe, not a daily one. Flagged so it isn't misread as a daily-return Sharpe.

## Verified OK in Part 2 (so you don't re-hunt)

- **`YieldSpreadBot` is the exemplar**: sizes off `expected_fill` ([`yield_spread_bot.py`](YieldSpreadBot/yield_spread_bot.py:530)), uses the shared `PaperBroker`/`Mt5Broker`/`RiskGuard`/`position_size` bricks, and its closed-trade serialisation is broker-clock correct. The other bots should be migrated toward this pattern, not reinvented.
- **GoldV2's paper-fill model** is correct and honest — entry at mid±half-spread, exit at the exit-side price, costs on by default ([`GoldV2/main.py`](GoldV2/main.py:110)).
- **RegimeV7's `_ols_slope`** ([`RegimeV7/regime_bot_v7.py`](RegimeV7/regime_bot_v7.py:494)) omits the `−mean(y)` term but is mathematically equivalent (verified: `Σ(i−x̄)·y == Σ(i−x̄)·(y−ȳ)` since `Σ(i−x̄)=0`) — not a bug.
- **`analogml-backtest.html` / `touches-backtest.html`** are pure viewers over the exported JSON — no local pip/PnL math to go wrong.

## Part 2 suggested fix order

1. **B1 (shared closed-trade serialiser)** — four bots + one missing field; highest cross-cutting value, low risk.
2. **B2 (dashboard pip standardisation)** — 4 pages, wrong gold/index pips; re-run those backtests after.
3. **B3 (regime bots live pip value)** — sizing accuracy on JPY crosses.
4. **B4/B5/B6/B7** — small correctness/display fixes.
5. YieldSpreadBot stays as-is; use it as the template for any new bot.

The combined Part 1 + Part 2 list is now the full audit of the live/backtest core, the five regime/gold/macro/yield bots, the shared baseplate, and the backtest dashboards. The main areas still only lightly covered (if you want a third pass): `volatility_bot/engine.py` + `oi_bot/engine.py` internals, `vumanchuLab/`, `VolRangeForecaster/`, and the `portfolioBacktest/` + `macro-regime-conditional/` studies.
