# Infrastructure Cost & Technical Debt — Verified Audit

**Original draft:** 2026-08-01 (AI-generated, largely unverified)
**Corrected:** 2026-08-02 — every claim below re-checked against the code
**Scope:** what actually runs in production, and what actually grows without bound

---

## ⚠️ Status of the original version of this document

The 2026-08-01 draft of this file was generated without reading the files it
cited. Most of its headline claims were wrong, and its line references pointed
at code that does not exist. It has been replaced wholesale.

**Do not cite the original figures.** The retracted claims are listed in §5 so
that anyone who acted on them can unwind it.

---

## 1. What actually runs 24/7

This is the axis the original draft never established, and it determines
everything about cost. Per [`start.sh`](../start.sh), the Railway service runs
**four** processes:

| Process | Type |
|---|---|
| `node server.js` | web server + ~40 `setInterval` schedulers, single long-lived process |
| `RegimeV2/regime_bot_v2.py` | supervised, auto-restart |
| `bot/main.py` | supervised, auto-restart |
| `Gold/main.py` | supervised, auto-restart |

**Everything else in this repo is a manually-run script or an unwired fork.**
`bot/regime_bot.py`, `YieldSpreadBot/`, `ConfluenceBot/`, `bot/hedge_bot.py`,
`backtestSystem/`, `portfolioBacktest/`, `oi_recon/`, `archive/`,
`vumanchuLab/`, `volatility_bot/layer2_*` — none of these are started by the
Railway service. Optimising them saves **zero** infrastructure cost. (Some bots
run on the separate MT5 box; that is not this service's bill.)

**`server.js` is the cost centre.** It is a ~22,000-line single process holding
all caches, all job state, and ~40 timers. Any real memory issue lives there.

---

## 2. Confirmed issue: caches that check TTL on read but never delete

**This is the one genuine memory leak, and the original draft missed it.**

30 top-level `Map`/`Set` caches exist in `server.js`. **25 of them never call
`.delete()` or `.clear()`.** They check `Date.now() - hit.ts < TTL` on read, so
stale entries are *ignored* — but never *freed*. Memory grows monotonically for
the life of the process.

The severity depends on key cardinality. Three tiers:

### 2a. Keyed by user-supplied query parameters — effectively unbounded

Each value holds a full backtest/analysis result. The key space is not bounded
by anything the system controls; it is bounded by what a user types into a URL.

| Cache | Key | Location |
|---|---|---|
| `_trendCache` | `tb_${lookback}_${rebalDays}_${targetVol}_${costBps}` — two floats | [`server.js:5722`](../server.js#L5722) |
| `_econTrendCache` | `et_${rebalDays}_${targetVol}_${costBps}_${placebos}` | [`server.js:5798`](../server.js#L5798) |
| `_carryCache` | `carry_${rebalDays}_${targetVol}_${costBps}_${signalMode}` | [`server.js:5949`](../server.js#L5949) |
| `_yieldCoupCache` | `yc_${symbol}_${gran}_${count}_${corrWindow}_${maxLag}_${days}` | [`server.js:5426`](../server.js#L5426) |
| `_m5SrvCache` | `range_…_${from}_${to}` / `btrange_…_${from}_${to}` — date-range keyed | [`server.js:5168`](../server.js#L5168), [`5247`](../server.js#L5247) |
| `_trendBtCache` | `${costBp}\|${longShort}\|${volTargetPort}` — float | [`server.js:8265`](../server.js#L8265) |
| `_trendV2Cache` | `${costBp}\|${longShort}\|${volTargetPort}` — float | [`server.js:8495`](../server.js#L8495) |
| `_csiCache` | `csi_${zWindow}` — int 60-504, so ≤445 entries | [`server.js:5845`](../server.js#L5845) |

`targetVol` is a clamped float in [0.02, 0.40]. Dragging a slider on the
dashboard mints a distinct permanent entry per position.

### 2b. Keyed by date — grows with wall-clock time

| Cache | Key | Location |
|---|---|---|
| `liqGateBarCache` | `${instrument}:${fromDate}` — holds bar arrays | [`server.js:7913`](../server.js#L7913) |

Adds N entries per day, forever, each holding OHLC bars.

### 2c. Monotonic dedupe `Set`s

| Set | Contents | Location |
|---|---|---|
| `_tdeShadowSeen` | one entry per `position_id` ever booked | [`server.js:19586`](../server.js#L19586) |
| `_tdePosShadowSeen` | one entry per ticket ever shadow-logged | [`server.js:19518`](../server.js#L19518) |

Small per entry, but never pruned. **These are correctness guards, not caches** —
evicting a key can cause a double-book. They need a bounded structure sized well
above realistic position count, not a blind cap.

### 2d. Bounded already — no action needed

`_fpSummaryCache`, `_fpReachBars`, `nqQmrBarCache`, `_volReversionCache`,
`_mveCache` (`sym|useSSM|regime`), `_ycRealCache` (tenor), `_ycCtxCache`
(symbol), `_gliFxCache` (stem), `_mveValCache` / `_mveValMechCache` (sym),
`_fpIvCache` (sid), `_fpTrendDirCache` (name), `_tdeSynthCache` (pair) and
`_blendCache` (`momrev|horizon`) are keyed by instrument/pair/enum. Their key
space is the instrument list. They hold bars, but they do not grow.

### The fix already exists in this repo

[`server.js:4815`](../server.js#L4815) already does the right thing:

```js
if (_vmChartCache.size > 120) _vmChartCache.delete(_vmChartCache.keys().next().value);
```

`m1CandleCache` does the same via `M1_CACHE_MAX`. Five caches already follow this
FIFO-cap pattern. The remaining 25 should use the same pattern, ideally lifted
into one shared `capMap(map, n)` helper.

**Why this is behaviour-preserving:** an evicted entry becomes a cache *miss*,
which recomputes exactly the value it would have returned. Outputs are
unchanged; only recompute frequency rises. §2c is the sole exception.

---

## 3. Confirmed issue: duplicated indicator math

Not a cost issue — a **correctness** issue, and a direct violation of Lego
Principle 1 in `CLAUDE.md` ("one shared core, imported — never copied"). This is
exactly the silent-drift failure mode that doc warns about.

### JavaScript — `js/indicatorCore.js` is the declared single source of truth, and is bypassed 5×

| `ema` copy | |
|---|---|
| [`js/indicatorCore.js:24`](../js/indicatorCore.js#L24) | **canonical** |
| [`js/utils.js:239`](../js/utils.js#L239) | copy |
| [`js/backtest-engine.js:46`](../js/backtest-engine.js#L46) | copy |
| [`js/nasdaqTransforms.js:70`](../js/nasdaqTransforms.js#L70) | copy |
| [`js/rangeBiasCore.js:82`](../js/rangeBiasCore.js#L82) | copy |
| [`js/vumanchuCore.js:31`](../js/vumanchuCore.js#L31) | copy |

`sma` is duplicated 4×, `trueRange` 2×, and ATR exists in three named variants
across `indicatorCore.atrWilder`, `barUtils.calcATR` and `nasdaqTransforms.atr`.

### Python — 8 `_ema` copies, 3 `_atr` copies

`Gold/`, `GoldV2/` and `ConfluenceBot/` are near-identical forks that each carry
their own copy:

- `_ema`: [`bot/utils/indicators.py:15`](../bot/utils/indicators.py#L15),
  `ConfluenceBot/modules/htf_bias.py:37`, `ConfluenceBot/modules/vumanchu.py:54`,
  `Gold/modules/htf_bias.py:25`, `Gold/modules/vumanchu.py:68`,
  `GoldV2/modules/htf_bias.py:37`, `GoldV2/modules/vumanchu.py:54`,
  `RegimeV2/beta_regime_table.py:213`
- `_atr`: `ConfluenceBot/modules/session_engine.py:102`,
  `Gold/modules/session_engine.py:102`, `GoldV2/modules/session_engine.py:102`
- Also `scripts/build_corr_history.py:200`, `volatilityExhaustion/mtf_divergence.py:40`

`pylego/indicators/vumanchu.py` already exists as the intended destination
(see `PYTHON_LEGO.md`).

**Mandatory constraint:** the copies may have already drifted. Consolidating a
drifted copy onto the canonical one would silently change a live bot's output.
Any consolidation must be gated on a numerical-equivalence harness first, and
only bit-identical copies may be merged. Non-identical copies are a separate
decision, not a refactor.

---

## 4. Minor confirmed issues

| Issue | Detail | Location |
|---|---|---|
| One job Map never purges | 64 of 65 job Maps have a `_purgeStale*Jobs` function. `tdeBackfillJobs` does not. | [`server.js:19859`](../server.js#L19859) |
| Unbounded log file | `beta_history.jsonl` gains ~1,440 records/day, each holding all beta estimates. No rotation. Masked so far because Railway disk is ephemeral and resets on deploy. | [`bot/main.py:426`](../bot/main.py#L426) |
| `.iterrows()` — 16 real instances | In `regime_classifier_mtf.py` (3), `volatility_bot/layer2_*` (7), `vumanchuLab/` (2), `bot/scripts/train_gold_model.py` (2), `Gold/mfe_mae_analysis.py` (1), `archive/` (1). **None run 24/7** — this is analysis-script ergonomics, not infrastructure cost. | — |

---

## 5. Retracted claims from the 2026-08-01 draft

Listed so anyone who acted on the original can unwind it.

| Original claim | Finding |
|---|---|
| "6+ continuous polling loops running 24/7" | 3 Python bots + node. Four of the six named bots are not started by the service. |
| "`.iterrows()` found in **33 locations**" | 27 matches exist, **11 of them inside MD files including this one**. 16 real. |
| "Example: `analysis/trade_analyzer.py:210` — `for _, row in lookup.iterrows()`" | `trade_analyzer.py` contains **zero** `.iterrows()`. The snippet was invented. Same for `analysis/bot_giveback.py`. |
| "§7.1 `trade_analyzer.py` lines 145-1365: multiple `.iterrows()` loops" | Same fabrication. |
| "List append in loops — found in **300+ locations**" | Unsubstantiated; `list.append` in a loop is normal Python, not a defect. |
| "`pd.concat()` in loops" | **No instance found.** Every multi-concat is the correct collect-then-concat-once form. The draft's own example is a single call and it concedes "OK if once". |
| "Unbounded history buffer, `bot/regime_bot.py:307`" | Line 301 is `deque(maxlen=window)`. Bounded by construction. |
| "`_cycle_states` / `_cycle_events` never cleared, `bot/main.py:599-600`" | Wrong file — they are in `regime_bot.py`, and they **are** reset at the top of every cycle (L528-529). |
| "Caches without eviction: `_candleCache`, `ohlcCache`" | `_candleCache` is **browser-side** in `oi-dashboard.html` (per-tab, keyed `symbol\|tf`). `ohlcCache` is keyed by instrument name and bounded by `INSTRUMENTS.length`. Neither leaks. The 25 caches that *do* leak went unmentioned. |
| "O(n²) nested loops in `archive/asia_range_backtest.py`, `portfolioBacktest/`, `oi_recon/`" | All manually-run scripts. Zero infrastructure cost. |
| "**$440-640/month savings**, 70-95% CPU / 70-115% memory reduction" | No basis was given for any figure. A "70-115% memory reduction" is not a coherent quantity. **No cost estimate in the original document should be relied on.** |

No load, memory or CPU measurement was taken for either the original document or
this correction. **No claim about actual spend is made here.** Establishing real
numbers requires measurement (§6), not another static read.

---

## 6. What would need measuring before any cost claim

Nothing in this repo currently records resource use, so cost attribution is
guesswork either way. Before optimising for spend rather than correctness:

1. Railway per-service memory and CPU over a week — is `server.js` RSS actually
   climbing between deploys? That is the direct test of §2.
2. Which endpoints in §2a are actually being hit, and with how many distinct
   parameter combinations.
3. Whether the bill is compute-driven at all, or driven by egress/build minutes.

§2 and §3 are worth fixing on **correctness and hygiene** grounds regardless of
what the measurement says. That is the honest justification for them — not a
dollar figure.

---

## 7. Prioritised remediation

Full sequencing, risk classification and per-item verification steps live in
[`TECH_DEBT_REMEDIATION_PLAN.md`](TECH_DEBT_REMEDIATION_PLAN.md).

Summary of order:

1. **Cache eviction** (§2a, §2b) + `tdeBackfillJobs` (§4) — provably no
   behavioural change; a miss recomputes the same value.
2. **Dedupe `Set`s** (§2c) — separate phase; wrong cap causes a double-book.
3. **Indicator consolidation** (§3) — gated on an equivalence harness; only
   bit-identical copies merge.
4. **Housekeeping** — `beta_history.jsonl` rotation; `.iterrows()` opportunistically.

**Out of scope by owner decision:** all polling and scheduler interval changes.
