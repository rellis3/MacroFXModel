# Python Lego — extending the brick architecture to the bots

> Companion to `LEGO_MODULES.md` (the JS brick registry) and `CLAUDE.md` (the
> Lego Principle). This doc is the plan for giving the **Python trading bots** the
> same plug-in-able, import-never-copy structure the dashboard already has — so a
> bot is *assembled* from shared bricks ("connect to MT5", "enter trade", "stop
> trade", "pip size", "frozen policy") instead of being a bespoke 1,500-line
> island that silently disagrees with the backtest that blessed it.

Last updated: 2026-06-29.

---

## 0. TL;DR

There are **two kinds of brick**, and they need **opposite** treatment. Getting
this wrong recreates the exact "bit-identical port" drift bug the JS registry
exists to kill.

| | **Category A — math / contract bricks** | **Category B — execution / plumbing bricks** |
|---|---|---|
| Examples | vol math, `ASSET_PARAMS`, GARCH, pip size, indicator core, regime score, cost model, forecast & level math | connect to MT5, enter trade, stop/close trade, position serialization, RiskGuard, sizing→lots, KV client, Telegram transport |
| Already exists as… | a **canonical JS brick** + drifted Python copies (`LEGO_MODULES.md §2 P0`, §3) | **6+ copies *within* Python**, no JS counterpart (MT5's API is Python-only) |
| Right move | **Do NOT port JS→Python** (that mints copy #7). One **serialized source of truth** both languages read — JSON for data, one canonical impl + a golden test for logic. | **Build a small shared Python package** (`pylego/`) and consolidate the existing copies behind one contract. This is genuinely new and currently missing. |
| Why | A second hand-written copy of vol math = the drift bug. The data is the same in both languages; only the *consumer* differs. | These are inherently Python and not duplicated across languages — they're duplicated across **bots**. Lego applies, but it's a Python-internal consolidation, not a translation. |

**Data flow rule (Category A):** bots should **consume the frozen artifact** the
JS offline learner produces — they should *not* call the live dashboard's HTTP
endpoints inside the trading loop. This is already the proven pattern in
`levelsV2` (JS `levelsV2Learn.learnAndFreeze` → frozen policy → `levelsV2Engine`
live producer applies it). Keep the brain where it already lives; ship it a file.

---

## 1. Where we are today

- **~120 Python files across 14+ bot/research dirs** (`bot/`, `RegimeV2/4/7`,
  `Gold/`, `DynAnchorBot`, `TradingBot`, `VolRangeForecaster`,
  `GlobalLiquidity`, …). Each has its **own** `requirements.txt` and its **own**
  copy of MT5 utils / indicators / sizing.
- **No shared Python core package.** Every bot is an island. The duplication is
  already catalogued in `LEGO_MODULES.md §2` (P0 #1–7, the Python-bot table) and
  the drifts in §3.
- Concrete evidence of live drift (found while writing this doc):
  - `_PIP_SIZES` is redefined in `bot/main.py`, `bot/regime_bot.py`,
    `RegimeV2/regime_bot_v2.py`, … (the values agree, but the dict is copied N×
    and each is a future divergence).
  - `_PIP_VALUES` (cash per pip per lot) has **already drifted**:
    EUR/JPY `6.5` (regime_bot) vs `9.0` (DynAnchorBot); EUR/GBP `12.5` vs `13.0`;
    AUD/JPY `6.5` vs `9.0`. It's account-currency/broker dependent, so it is a
    **sizing** input — unifying it changes live position size and must go behind
    a risk review, not a silent merge.
  - Broker MT5 symbols disagree on purpose: Python bots map `DE30_USD→DAX`,
    `UK100_GBP→FTSE100`; the JS registry uses `GER40`, `UK100`. These are
    **broker config**, not instrument identity — they must stay overridable
    per-bot (see §3).

## 2. The target shape

```
pylego/                         # repo-root shared Python baseplate (NEW)
  __init__.py
  instruments.py                # pip size / digits / asset class / aliases  ← reads instruments.json
  instruments.json              # GENERATED from js/instrumentRegistry.js (never hand-edited)
  instruments_test.py           # synthetic + golden tests (no network)
  broker/                       # Category B — execution bricks (later slices)
    mt5.py                      #   connect / login / account check / serialize positions
    orders.py                   #   enter(spec) / stop(ticket) / modify — one contract
  risk_guard.py                 #   daily/monthly DD lockout (consolidate 4 copies)
  sizing.py                     #   conviction → risk% → lots
  kv.py                         #   dashboard KV get/put/status push
  telegram.py                   #   alert transport (formatters stay in the strategy)

scripts/
  gen_instruments_json.mjs      # JS → JSON generator (the cross-language bridge)
```

**Contract conventions (mirror the JS bricks):**
- **Pure where possible, fail loud.** `instrument("ZZZ")` raises, exactly like the
  JS `instrument()` — never silently default a pip size (a wrong pip = 10× PnL).
- **One source of truth per fact.** Data bricks load a generated JSON; the JSON's
  only author is the JS registry. Regenerate, don't edit.
- **Synthetic-testable, no network.** Every brick ships a `*_test.py` that runs
  offline (the bots can't reach MT5/OANDA in CI anyway).
- **Don't rewrite live bots wholesale.** Adopt **one bot at a time**, smallest
  possible diff, behavior-preserving, each behind its own validation.

## 3. Category A — the cross-language bridge (data: generate, don't port)

The mechanism: `scripts/gen_instruments_json.mjs` imports `js/instrumentRegistry.js`
(the canonical table) and writes `pylego/instruments.json`. `pylego/instruments.py`
loads that JSON and exposes the **same accessor names** as the JS module
(`pip_size`, `price_digits`, `asset_class`, `mt5_symbol`, `resolve_key`,
`instrument`). One registry, two readers, zero hand-copied data.

What the bridge carries now (slice 1): pip size, digits, asset class, venue
symbols, and the full alias map (so Python resolves `"EUR/USD"`, `"EUR_USD"`,
`"EURUSD"` identically to JS).

What it deliberately does **not** carry:
- **`pointValue` / pip value** — account-currency dependent, so it is NOT
  instrument identity and stays OUT of the JS price registry (which feeds the vol
  math). It lives instead in a **Python-owned** brick `pylego/point_values.py` +
  `point_values.json` (canonical set = the identical regime_bot/RegimeV2 table).
  Only the **non-live** `bot/regime_bot.py` adopts it so far; the live bots keep
  their inline values until a sizing review, because **DynAnchorBot's values
  differ** (EUR/JPY 9.0 vs 6.5, EUR/GBP 13.0 vs 12.5).
- **Broker symbol overrides** — `instruments.json` carries the registry's `mt5`
  field as a *reference* default, but a bot keeps its own small broker-override
  map (`DAX` vs `GER40`). Instrument identity is shared; broker routing is local
  config. The loader exposes `mt5_symbol()` for the default and lets the caller
  override.

Future Category-A bridges, same pattern (each behind an OOS re-run per
`SYSTEM_ASSESSMENT.md` P0): `asset_params.json` (`ASSET_PARAMS` + BM/HN
constants), GARCH (α,β), regime/BOCPD score, the cost/friction model.

## 4. Category B — the Python execution bricks (consolidate, don't translate)

These have no JS source; they're duplicated across bots. Build them new in
`pylego/`, give each a clean contract, and migrate one bot at a time. Priority
order (by drift risk × reuse, from `LEGO_MODULES.md §2` Python table):

1. **`broker/mt5.py`** — the `Mt5Broker` class: connect/login/account-check,
   price/ATR/balance, `serialize_open_positions` / `serialize_closed_trades`
   (the positions-tab payload), and order `enter` / `stop`. ✅ **built** (#this
   PR). One class rather than a separate `orders.py` because entry/exit need the
   same connection, magic, symbol resolver and filling-mode — `enter` takes a
   trade-spec-style call (`pair, direction, sl, tp, lots, …`), mirroring the JS
   "one entry primitive, parameterised" rule. Magic / symbol-resolver /
   pip-resolver / MT5 module are all injected, so it's reusable and offline-testable.
2. **`risk_guard.py`** — daily/monthly DD lockout (4 copies + an unwired
   `safety/risk_gate.py`). ✅ built (#546). Batch 5 (sizing & risk integrity):
   now also wired into the **volatility_bot + range_line_bot** loops (ddlimit
   3% / monthlydd 5% defaults in both bot configs; gates NEW entries only —
   trailing/EOD/barrier exits always run; balance fed per tick, so the moving
   PaperBroker balance rehearses the lockout in paper). Adds
   `log_block_transition` (once-per-state-change block logging, never per
   tick), and `force_unlock` now PRESERVES the day-start baseline — resetting
   it to the drawn-down balance let the daily-DD limit ratchet down (same fix
   applied to bot/main.py's dashboard force-unlock).
3. **`sizing.py`** — conviction → risk% → lots (the `×0.5` decay variants).
   ✅ built (#546).
4. **`kv.py`** — dashboard KV client + the **config-in / status-out** plumbing
   (`load_config(bot, defaults)`, `push_status(bot, payload)`). This is how a bot
   is configured from the dashboard and how its trades reach the positions tab —
   see §7. ⬜ next. Highest-care brick after the broker because the dashboard
   depends on its key names and payload shape. (The positions payload itself is
   already emitted by `Mt5Broker.serialize_*`.)
5. **`telegram.py`** — alert transport (formatters stay in the strategy). ⬜
6. **`costs.py`** — the paper execution-cost model + entry-slip audit. ✅ built
   (paper-measurement fix). One table of per-asset-class default paper spreads
   (`DEFAULT_SPREAD_PIPS`: majors 0.8p / JPY 1.0p / gold $0.30 / indices 2pt,
   consistent with volatility_bot's per-class spread caps) declared in pip units
   and converted via the canonical pip table; plus `entry_slip_pct` /
   `realized_fill` — the signed realized-fill-vs-modeled-level audit (favourable
   = negative, % of session open) both bots stamp per fill, the falsifier for
   the books' flat 0.012%/0.006% modeled costs. Consumers: `broker/paper.py`,
   volatility_bot, range_line_bot. Batch 5 additions: `max_spread(pair, cfg)`
   (the per-asset-class entry spread CAPS, lifted from volatility_bot's
   private `_max_spread` — both bots now import it; range_line_bot's 1e9
   "no cap" default replaced), `spread_for(pair, broker)` (broker's live/paper
   spread → class default) and `expected_fill(entry, is_buy, pair, broker)` —
   the spread-adjusted expected fill both bots now SIZE off (a market order
   cannot be sized after it fills, so lots are computed from entry ±
   half-spread; the realized fill is still audited separately).
   Related but bot-local (macrofx1 hasn't adopted pylego sizing):
   `bot/utils/pip_values.py` — live $/pip/lot (MT5 `trade_tick_value` scaled
   by `pip/tick_size` → quote-computed for USD-base/USD-quote pairs → static
   table with a warning). ONE copy imported by `bot/utils/sl_tp_engine.py`,
   `bot/hedge_bot.py` and `backtestSystem/risk.py`; candidate for promotion
   into pylego alongside `point_values.py` when the regime bots adopt it
   (their `_PIP_VALUES` copies remain — RegimeV2/V4/V7, DynAnchorBot,
   position_hedge_bot). Also `bot/utils/exposure.py` — signed per-currency
   USD-risk netting behind bot/main.py's `max_usd_exposure_pct` guard.
7. **`quotes.py`** — `QuoteFeed`, the paper-mode market feed. ✅ built (paper-
   measurement fix). Pulls `GET /api/quote` off the dashboard (the same MT5-less
   path the regime bots use), cached per pair (`min_interval`) with a staleness
   gate (`stale_after` → returns None so the loop skips the pair) and once-per-
   state-change logging. Injected http + clock, offline-testable
   (`quotes_test.py`). Consumers: volatility_bot, range_line_bot paper loops.
8. **`ohlc_feed.py`** — `KvOhlcFeed`, the paper-mode SESSION-BAR feed. ✅ built.
   QuoteFeed covers live prices/trailing only; a paper bot still had no bar
   history, so it could never build fresh Asia/Monday ladders. This brick reads
   the dashboard's KV OHLC cache (`ohlc5m_{SYMKEY}_{sessionDay}` via
   `/api/kv/get` — OANDA M5, ~1500 candles ≈ 5 trading days; SYMKEY = registry
   display symbol without the slash, matching js/config.js PAIRS) and converts
   it to the `Mt5Broker.session_bars` bar shape. `window_bars(pair, start,
   secs)` returns a range window ONLY when the payload fully covers it — a
   partial window would build a wrong ladder, so it returns None and logs
   what's missing once per state change (never fakes bars). Known limits
   (documented in the module): the key only exists for pairs the dashboard
   tracks AND has loaded that session day; history reach is ~5 days. Injected
   http + clock, offline-testable (`ohlc_feed_test.py`). Consumers:
   range_line_bot paper ladder builds (`_session_window_bars`).

Note (paper-measurement fix): `broker/paper.py` now honours the measurement
contract — P&L in account currency ((Δprice/pip) × pip_value × lots via the
same pip/point-value resolution `position_size` uses), a balance that MOVES on
every close (sizing compounds, drawdown logic can rehearse), and fills that
cross half the spread each way (round trip = one full spread, defaults from
`costs.py`, per-pair override via `set_spread` / each bot's
`paper_spread_pips` config). Serializer field names are unchanged (§7).

## 5. Adoption plan — one bot at a time

Each bot is a separate, low-risk PR. A bot "adopts" a brick when its inline copy
is replaced by an import and a golden test proves the brick reproduces the old
values for that bot's instruments.

| Step | Bot | Bricks adopted | Status |
|---|---|---|---|
| 1 | `bot/main.py` | `instruments` (pip size) | ✅ merged (#545) |
| 2 | `bot/regime_bot.py` | `instruments` (pip size), `point_values`, `sizing`, `risk_guard` | ✅ merged (#546) |
| 3 | `bot/regime_bot.py` | `broker/mt5` (connect/enter/stop/serialize) | 🟡 this PR |
| 4 | `RegimeV2/regime_bot_v2.py` | the full set (pip value behind a sizing review) | ⬜ |
| 5 | `DynAnchorBot`, `RegimeV4/7` | the full set | ⬜ |
| 6 | **`volatility_bot` (NEW)** — first bot built natively on `pylego` | consumes the frozen `volatility_bot_plan` (Category A); stands up the planned Category-B bricks (`broker/mt5`, `orders`, `kv`) as its execution layer | 🟡 Slice 1 (plan contract) built |
| 7 | **`ConfluenceBot` (NEW)** — GoldV2 strategy opened up to every instrument | `instruments` (pip/digits/mt5 symbol), `point_values`, `sizing` — resolved per instrument so one engine runs FX/gold/indices. All distances pip-denominated ×`pip_size`, so gold stays byte-identical to GoldV2. | 🟡 this PR |

### Volatility Bot — slices (§7)

The first bot assembled *natively* on `pylego` (no legacy to preserve). Runs the
locked per-line book (approachVel cells, fade/follow/skip, min-expectancy 0.01,
survivor universe). Each slice is its own PR, golden-tested, smallest diff:

1. **Plan contract (Category A)** — `js/volatilityBotPlan.js` `buildVolatilityPlan`
   assembles the frozen artifact (survivors + policy + per-pair σ/open + band
   fractions via `computeBands`) the bot consumes; `volatility_bot_*` KV keys
   registered in `_worker.js`. ✅ this PR.
2. **Producer route** — `js/volatilityBotProducer.js` builds the plan from
   `getPerLineBook` + live `fetchD1`/`volSigmaSeries` σ/open per survivor and
   writes KV `volatility_bot_plan`; `server.js` exposes `POST/GET
   /api/volatility-bot/{refresh-plan,plan}` + a daily scheduler. ✅
3. **Strategy port (Category-A logic)** — `pylego/strategy/volatility.py`: the
   ONLY ported strategy math — `approach_velocity` (cell-key bucket,
   **golden-tested** vs `scripts/gen_volatility_vectors.mjs` → JSON), `line_levels`
   (OC static / HL dynamic), `neighbours` (inner/outer), `trade_spec`
   (fade/follow triple-barrier). ✅
4. **Execution bricks + the bot** — Category-B `pylego/kv.py` + `pylego/broker/{paper,mt5}.py`
   (one broker surface; `PaperBroker` offline-tested incl. triple-barrier,
   `MT5Broker` extracted from `regime_bot`) + the decision engine
   `volatility_bot/engine.py` (pure, offline-tested) + `volatility_bot/volatility_bot.py`
   (magic 20260099, paper-first, pushes `volatility_bot_status`). ✅ paper path
   fully tested; ⚠ live MT5 connect/order needs a paper-terminal verify.
5. **UI** — `bot-config.html` "📐 Volatility" tab (MT5 credentials + paper/live
   toggle + risk/max-lot/max-open/max-spread/cadences/pairs-override, saving
   `volatility_bot_config` + `volatility_bot_credentials` via the shared
   `kvSet`/`_saveCreds`) + live-status panel + one `_POS_BOTS` row so trades show
   on the positions table. Also corrected `pylego/kv.py` to the real worker
   contract (`/api/kv/set {key,data,timestamp}`, `/api/kv/get → data`) and the
   bot's credential keys (`mt5_account`/`mt5_password`/`mt5_server`/`mt5_path`). ✅
   **The Volatility Bot is complete — paper-runnable end to end.**

8. **A/B variant — the `ride` exit (validated candidate).** `volatility_bot.py`
   is now variant-aware (`--variant book|ride`, `VARIANTS` table): both run off the
   SAME `volatility_bot_plan` but with their own identity so they A/B in paper.
   `book` = the incumbent (full 0.01 book, fixed triple-barrier exit, magic 20260099,
   `volatility_bot_*` keys). `ride` = the exit study's cost-robust winner — a
   **strict entry gate** (`decide(min_expectancy=0.05)` filters the plan's cells at
   runtime, reproducing `buildPolicy(marginPct=0.05)`) + a **no-TP chandelier trailing
   exit** (`engine.ride_trail_stop`, ratchet-only) + a **22:00-London force-close**
   (`_manage_ride`), magic 20260098, `volatility_ride_*` keys. Registered in
   `_worker.js` `STATUS_KEYS` + a `Vol-Ride` `_POS_BOTS` row so its paper trades show
   in the Positions tab + Trade History alongside `book`. Rationale + OOS evidence:
   the exit study's gate sweep + `runRideRigor` (walk-forward 2.88, IS→OOS 1.37×,
   30/31 pairs positive). Offline-tested: `engine_test.py` (gate + trail) +
   `ride_smoke_test.py` (trail→exit→EOD on the PaperBroker). **Paper only — measuring
   realised slippage vs the modelled exit-slip before any live capital.**

**Why `bot/regime_bot.py` is the pilot:** it's no longer traded, so it's the
safe sandbox to extract the *full* execution surface (sizing, risk, and next the
MT5 broker bricks) without any risk of changing live behaviour — and the bricks
it yields are the shared ones the live V2/V4/V7 adopt later, behind review.

**Rules for each adoption (from `CLAUDE.md`):**
- Smallest behavior-preserving diff; keep broker-specific overrides local.
- Golden test the brick against the bot's *old* literal values before deleting it.
- `python -m py_compile` the bot + run the brick tests (offline).
- Don't change strategy/sizing numbers in an adoption PR — that's a separate,
  reviewed change.
- Update `LEGO_MODULES.md` (and this table) — the registry is part of "done".

## 6. Slice 1 (merged, #545) — `instruments` brick + first bot

- `scripts/gen_instruments_json.mjs` → generates `pylego/instruments.json` from
  `js/instrumentRegistry.js`.
- `pylego/instruments.py` — JSON loader with the JS-parity accessor API,
  fail-loud on unknown symbols.
- `pylego/instruments_test.py` — synthetic checks + a **golden test** that the
  shared brick reproduces `bot/main.py`'s old `_PIP_SIZES` for every pair it
  trades.
- `bot/main.py` — `_PIP_SIZES` is now **built from** `pylego.instruments` (one
  import + a comprehension) instead of an inline literal. All call sites
  (`_PIP_SIZES.get(pair, 0.0001)`) are untouched, so behavior is preserved; the
  data now has a single source.

This validates the whole cross-language approach on the highest-value,
lowest-risk brick before committing to the broker/execution layer.

## 7. Dashboard contract — config in, positions out (NON-NEGOTIABLE)

Every Python bot (existing or new, brick-built or not) is wired to the dashboard
through **two KV keys**, and the brick work must preserve this exactly — it's how
the user configures bots and tracks per-bot trade history.

**Config IN — `<bot>_config`.** The bot reads its settings from a KV key edited on
the dashboard's bot config page (`bot-config.html` / `js/bot-config.js`). e.g.
`regime_bot` reads `regime_bot_config` via `load_config()`. A bot must never
hard-code what the dashboard is meant to own; it reads `<bot>_config` each cycle
so live edits take effect.

**Status + positions OUT — `<bot>_status`.** Each cycle the bot pushes a status
payload to its `<bot>_status` KV key; the dashboard reads it to render the bot's
card **and the positions tab under bots** (open + closed trades per bot). The
payload shape the dashboard expects (from `regime_bot` / `bot/main.py`):

```
{ enabled, paper_mode, cycle, balance, pairs,
  positions:            { <pair>: {...per-pair live state...} },
  mt5_positions:        [ <serialize_open_positions(MAGIC)> ],   # live open trades
  today_closed_trades:  [ <serialize_closed_trades(MAGIC)> ] }   # today's closed trades
```

`mt5_positions` / `today_closed_trades` are the per-bot trade history the
positions tab shows — keyed off the bot's unique `MAGIC` so each bot only reports
its own trades. Field names (`ticket`, `symbol`, `direction`, `lots`,
`open_price`, `close_price`, `profit`, `swap`, `commission`, `time_open`,
`time_close`, `comment`) are part of the contract — the dashboard reads them by
name.

**Brick implications (for the upcoming `kv` + `broker/mt5` slices):**
- `kv.py` must keep the `<bot>_config` / `<bot>_status` naming and the
  `load_config` / `push_status` semantics — these bricks are a *refactor*, not a
  redesign of the wire format. Golden-test the pushed payload shape.
- `broker/mt5.serialize_open_positions` / `serialize_closed_trades` must emit the
  **exact field set above**, magic-filtered, so the positions tab keeps working
  unchanged.

**New-bot checklist (when a bot is assembled from bricks, not just refactored):**
1. Pick a unique `MAGIC` and a `<bot>` slug.
2. Read `<bot>_config`; push `<bot>_status` with the payload above every cycle.
3. Register the bot on `bot-config.html` (config form + the monitored-bots /
   positions list in `js/bot-config.js`) so its config is editable and its trades
   show in the positions tab.

Until a bot does all three, it is **not** "done" — an unconfigurable bot whose
trades don't reach the positions tab fails this contract regardless of how clean
its internal bricks are.

## 8. SL/TP Distribution — Layer 2 (signal-conditioned barrier race)

Companion to `VolRangeForecaster/sltp_distribution.py` ("Layer 1" — mechanical,
signal-agnostic entries, every 4h, both directions, no costs; see its own
docstring). Layer 2 asks the same question — for a fixed SL/TP grid, which
barrier gets touched first on the real M1 path — but conditioned on each bot's
**actual entry signal**, single direction, with real costs. The point: none of
the 6 live bots below have enough *live* trade history to clear the ≥30-OOS-trade
floor (Gold 15, GoldV2 1, Confluence ~59 fragmented across 17 symbols, the rest
0 logged) — replaying the real signal over years of M1 gets past that for free.

**✅ Built — `pylego/barrier_race.py`** (+ `barrier_race_test.py`, 7 synthetic
cases, offline). The ONE shared barrier walker: given `bars` + a list of
`Entry(idx, direction, entry_price=None)` + an SL/TP grid, walks the real
forward path and returns win/SL/timeout rate + avg R, full precision (rounding
is a caller/display concern, not the core's — round once, at the edge). Pulled
out of Layer 1's `run_window()` so a bot's signal replay shares the exact same
walker instead of copying it (the bit-identical-port drift bug this whole doc
exists to prevent). `cost_price` param takes a round-trip spread in price units,
dragging every outcome by `cost_price / sl` R.

**✅ Adopted — Layer 1** (`VolRangeForecaster/sltp_distribution.py`). Refactored
to build `Entry` objects (both directions, same bar) and call `race_grid`
instead of its own inline walker. Regression-verified **bit-identical** to the
pre-refactor `sltp_gold_6m.csv` (300/300 rows, `df.equals()` true) before this
was trusted.

**Per-bot Layer 2 status — each has a genuinely different blocker, not just "no
adapter yet":**

| Bot | Blocker | What it'd take |
|---|---|---|
| **Gold** (`Gold/main.py`) | Entry logic (`_scan_zones`/`_check_vumanchu`, line 806-955) calls **live HTTP gates** — `_macro_allows` and `_ml_allows` hit the dashboard at runtime. A historical replay either needs those gates' historical answers (may not exist) or must run gate-free, which tests a *looser* signal than the live bot actually trades — a real methodology change, not just data plumbing. | Decide explicitly: replay gate-free (label the caveat loudly) or reconstruct historical macro/ML answers if logged anywhere. |
| **GoldV2** | Same zone architecture/gate issue as Gold, plus only 1 live trade to sanity-check a replay against. | Same decision as Gold, lower priority until it accrues live data to cross-check. |
| **Confluence** | Same architecture family as Gold (shares the gate dependency), across 17 symbols. | Same gate decision, then pool by asset class (not raw-pool 17 instruments). |
| **volatility_bot** | ✅ **Adopted, full universe run** — `VolRangeForecaster/data/volatility_bot_plan_snapshot.json` (pulled live from `GET /api/volatility-bot/plan` on Railway, since `getPerLineBook()` reads R2 and isn't reachable from this sandbox) + `volatility_bot/layer2_sltp_replay.py`. Replays the REAL `engine.decide()` tick-by-tick through a `SessionTracker` over years of M1, using a locally-computed **causal rolling realized-vol proxy** (`_sigma_proxy`, 20-session close-to-close log-return std) scaled by the snapshot's own `frac/sigma` ratio — NOT the platform's exact YZ-30/GARCH σ, a documented approximation. Two caveats stated loudly in the script's own docstring: (1) "today's learned policy, replayed on historical prices" ≠ "what the bot actually decided historically" (policy is periodically relearned); (2) the σ proxy is an approximation. Exit is deliberately NOT replayed — real entries feed the shared `pylego.barrier_race` grid, a genuinely different question ("what UNIFORM SL/TP would work best") from the bot's own adaptive fade/follow inner/outer exit. **Data-quality fix applied**: entries where the σ proxy produced a near-zero SL distance (level geometry collapsed) are dropped before aggregation — one such entry can carry a `cost/sl` drag in the thousands of R and silently wreck the average (caught on eurchf: 140/2626 entries had `sl_dist` down to 2.3e-8; gold's own headline number moved from ‑0.40R to ‑0.20R once its own 37 degenerate entries were dropped). Visualized on `sltp-distribution.html`'s Layer 2 section. | **Full universe (25 of 28 plan pairs with local M1; de30/uk100/us2000 lack a cached parquet), 2016/2021→2026, ~76 min runtime**: **25/25 pairs show a negative own-exit avg R** (range ‑0.02R to ‑0.31R; median ≈‑0.16R), cost-adjusted, all comfortably past the ≥30-trade floor (762–2,486 entries/pair). Only `audnzd` is near breakeven (‑0.02R own exit) and is the ONLY pair where the swept grid finds a positive cell (+0.03R). The swept uniform-grid alternative (mostly `sl_mult=2.0, tp_r=1.0`) is better than the bot's own adaptive exit on every pair but still negative except audnzd. This is now a broad, consistent, high-sample result — not a gold-specific artifact — but the two caveats above (current-policy-on-history, σ-proxy approximation) are still unresolved, so read it as "today's policy doesn't clear its own real triggers, historically, under a fixed-cost/no-slippage model" rather than "the live bot is broken." Next: chase which caveat (if either) is driving this, ideally by getting a real historical per-day policy/σ series instead of the current single-snapshot approximation. |
| **oi_bot** | SL/TP1/TP2 are genuinely fixed (good fit for the grid) but pre-computed by **JS** (`js/oiZones.js`) — a Python replay needs that zone math ported or called cross-language. | Same "generate, don't port" tension as Category A — needs a decision on which language owns the replay. |
| **range_line_bot** | No take-profit at all — chandelier-trailed stop only; entry-firing is inlined in the live `run()` loop (`range_line_bot.py:368-620`), not a pure function. | (a) Extract `should_enter()`-style pure logic from `run()`; (b) this bot needs a **fixed-SL × trail-multiplier** grid, not fixed-SL/TP — a different `race_grid` isn't the right tool unmodified. |
| **YieldSpreadBot** | Pure `direction_from_z(z, inverted)` (`yield_spread_bot.py:196`) — closest to a clean signal — but **no cost model exists at all** for this bot, and no TP in code (z-revert/time exit, not barrier). | Build the cost model first (this bot has nothing to extend), then the same trail-vs-grid question as range_line_bot for its exit. |

**Bottom line:** every bot needs a real decision (gate-replay policy, plan-
reconstruction vs. current-policy-on-history, cross-language zone replay, or an
extraction/cost-model prerequisite) before its Layer 2 adapter is honest to
build — none is a "just wire it up" afternoon task. Pick one blocker to resolve
next rather than building a fragile approximation across all six at once.
