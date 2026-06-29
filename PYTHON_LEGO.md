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

1. **`broker/mt5.py`** — connect/login/account-check + `serialize_open_positions`
   (6+ copies). The "connect to MT5" brick.
2. **`broker/orders.py`** — `enter(spec)` / `stop(ticket)` / `modify`. The "enter
   trade" / "stop trade" bricks. A trade is a spec `{symbol, side, lots, sl, tp,
   comment}`, mirroring the JS "one entry primitive, parameterised" rule — not a
   new order function per bot.
3. **`risk_guard.py`** — daily/monthly DD lockout (4 copies + an unwired
   `safety/risk_gate.py`).
4. **`sizing.py`** — conviction → risk% → lots (the `×0.5` decay variants).
5. **`kv.py`** — dashboard KV client + the **config-in / status-out** plumbing
   (`load_config(bot, defaults)`, `push_status(bot, payload)`). This is how a bot
   is configured from the dashboard and how its trades reach the positions tab —
   see §7. Highest-care brick after the broker because the dashboard depends on
   its key names and payload shape.
6. **`broker/mt5.py`** also owns `serialize_open_positions(magic)` /
   `serialize_closed_trades(magic)` — the exact payload the positions tab renders.
7. **`telegram.py`** — alert transport (formatters stay in the strategy).

## 5. Adoption plan — one bot at a time

Each bot is a separate, low-risk PR. A bot "adopts" a brick when its inline copy
is replaced by an import and a golden test proves the brick reproduces the old
values for that bot's instruments.

| Step | Bot | Bricks adopted | Status |
|---|---|---|---|
| 1 | `bot/main.py` | `instruments` (pip size) | ✅ merged (#545) |
| 2 | `bot/regime_bot.py` | `instruments` (pip size), `point_values`, `sizing`, `risk_guard` | 🟡 this PR — the non-live pilot |
| 3 | `bot/regime_bot.py` | `broker/mt5` (connect/enter/stop/serialize) | ⬜ next |
| 4 | `RegimeV2/regime_bot_v2.py` | the full set (pip value behind a sizing review) | ⬜ |
| 5 | `DynAnchorBot`, `RegimeV4/7` | the full set | ⬜ |
| 6 | **`volatility_bot` (NEW)** — first bot built natively on `pylego` | consumes the frozen `volatility_bot_plan` (Category A); stands up the planned Category-B bricks (`broker/mt5`, `orders`, `kv`) as its execution layer | 🟡 Slice 1 (plan contract) built |

### Volatility Bot — slices (§7)

The first bot assembled *natively* on `pylego` (no legacy to preserve). Runs the
locked per-line book (approachVel cells, fade/follow/skip, min-expectancy 0.01,
survivor universe). Each slice is its own PR, golden-tested, smallest diff:

1. **Plan contract (Category A)** — `js/volatilityBotPlan.js` `buildVolatilityPlan`
   assembles the frozen artifact (survivors + policy + per-pair σ/open + band
   fractions via `computeBands`) the bot consumes; `volatility_bot_*` KV keys
   registered in `_worker.js`. ✅ this PR.
2. **Producer route** — server endpoint builds the plan from `getPerLineBook` +
   live `fetchD1` σ/open per survivor and writes KV `volatility_bot_plan`. ⬜
3. **pylego bricks** — `strategy/volatility.py` (the ONLY ported logic:
   approach-velocity bucket + dynamic-HL geometry + triple-barrier, golden-tested
   vs JS vectors) + new Category-B `kv.py`, `broker/mt5.py`, `broker/orders.py`. ⬜
4. **The bot** — `volatility_bot/volatility_bot.py` assembled from the bricks;
   unique magic; paper-first; pushes `volatility_bot_status`. ⬜
5. **UI** — `bot-config.html` "Volatility" tab (credentials + paper/live toggle +
   universe/risk/margin/kill) + one `_POS_BOTS` row so trades show on positions. ⬜

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
