# Confluence Bot — Multi-Instrument Level-Matrix System

A generalisation of `GoldV2/` (which keeps running untouched — versioned, not
overwritten, per the house rule). **Same strategy engine** — wait for price to
come to a high-confluence level, confirm exhaustion on M5 VuManChu, trade it
with a structure-anchored SL and level-to-level TP under aggregate risk caps —
but it runs a **configurable list of instruments at once**, from FX
majors/crosses through gold to indices, instead of gold only.

> **Built ≠ works ≠ has edge.** This is the gold confluence *method* opened up
> to every instrument the platform trades. Whether it has edge on FX or indices
> is an **open question** — S/R + fib + session levels are practitioner
> folklore, not the replicated factors. Run it **paper-first** and judge each
> instrument on its own OOS record (≥30 closed trades, costs on) before
> believing anything. The point of this bot is to find that out honestly.

Runs against KV keys `confluence_bot_config` / `confluence_bot_credentials` /
`confluence_bot_status` / `confluence_bot_zones` / `confluence_bot_trades`,
MT5 magic **20260006**. Config + MT5 credentials are managed from the
**🎯 Confluence tab on bot-config.html**; open positions and closed trades
appear in the Positions tab and Trade History like every other bot.

```
python ConfluenceBot/main.py                          # paper mode (default)
python ConfluenceBot/main.py --live                   # real MT5 orders
python ConfluenceBot/main.py --once                   # single cycle then exit
python ConfluenceBot/main.py --pairs EUR/USD,GOLD,NQ  # override the pair list
python ConfluenceBot/test_smoke.py                    # synthetic unit tests (no network/MT5)
```

---

## How the gold-only bot was opened up

The GoldV2 engine hard-coded `SYMBOL='XAUUSD'`, `PIP=1.0`, a `$0.50` volume
bucket and `$`-denominated tolerances. Three changes generalise it without
touching the strategy logic — and gold stays **byte-identical** to GoldV2:

1. **Per-instrument identity from the shared `pylego` bricks.** Pip size, price
   digits, MT5 symbol and the per-pip cash value (for lot sizing) are resolved
   per instrument from `pylego/instruments` + `pylego/point_values` — the ONE
   source of truth the dashboard also uses, generated from
   `js/instrumentRegistry.js`. A pip can never silently disagree (a wrong pip
   is a 10× PnL bug). Lots come from `pylego/sizing.position_size` — the same
   formula the regime bots use, not a re-inlined copy.

2. **Every distance is expressed in PIPS and scaled by `pip` at run time.**
   `cluster_tolerance`, `proximity_pips`, `min_entry_separation_pips`,
   `max_sl_pips`, `min_sl_pips`, `bucket_pips` — all pip-denominated. Gold
   (pip = 1.0) reproduces the GoldV2 numbers exactly; EUR/USD (pip = 0.0001)
   and indices (pip = 1.0 point) scale automatically through the same code path.
   Prices are rounded to each instrument's digit precision.

3. **One engine per instrument, one orchestrator.** Each instrument gets its
   own `SymbolEngine` (its own zones / HTF bias / volume profile / session
   levels / `TradeManager` state file / journal). The `ConfluenceBot`
   orchestrator shares one MT5 connection, one config and one credentials set;
   enforces **global** portfolio caps across all instruments; and pushes **one
   aggregated** `confluence_bot_status` so every position lands in the
   bot-config Positions tab exactly like GoldV2.

Everything else — the level matrix, HTF bias, VuManChu (WT mandatory, MF
exhaustion-only, fuel veto), the confirmation-swing SL / level-to-level TP with
the σ-forecast range cap, the portfolio manager — is GoldV2's, imported
unchanged apart from the pip/bucket/proximity parameters being threaded in.

The gold-only gates (`gold_macro_gate` → `ai_goldmodel`, `ml_gate` →
`gold_ml_signal`) are **applied to gold only**; other instruments ignore them.

---

## Config reference (KV `confluence_bot_config`)

All editable on the Confluence tab. Names match `DEFAULT_CFG` in `main.py`.

| Group | Keys |
|---|---|
| Control | `enabled`, `paper_mode`, `trade_window_start/end` |
| Universe | `pairs` (default: 12 FX + GOLD + 4 indices), `broker_overrides` (`{key: brokerSymbol}` for brokers whose symbol differs, e.g. DAX→GER40) |
| Matrix (pips) | `zone_tfs`, `cluster_tolerance`, `min_zone_score`, `min_distinct_legs`, `proximity_pips`, `max_armed_zones`, `include_retests`, `bucket_pips` |
| Confirmation | `vu_min_components`, `vu_require_wt`, `mf_fuel_veto` |
| Exits (pips) | `max_sl_pips`, `min_sl_pips`, `sl_buffer_atr`, `tp1_r_min`, `tp2_r_min`, `tp2_r_max`, `range_cap_mult`, `be_after_tp1`, `allow_overnight_htf_aligned` |
| Risk — per instrument | `risk_pct`, `max_lot`, `max_trades_per_day`, `max_concurrent_trades`, `max_open_risk_pct`, `max_per_direction`, `min_entry_separation_pips`, `cooldown_minutes`, `global_cooldown_minutes` |
| Risk — global (all instruments) | `max_total_open_trades`, `max_total_open_risk_pct`, `max_total_per_direction` |
| Gates | `gold_macro_gate`, `ml_gate` (gold only), `htf_block`, `htf_block_confidence`, `use_vol_forecast`, `use_oi` |
| Data | `m1_lookback_bars` (per instrument, for the nPOC stack) |

> **Cost note.** State refresh fetches D1/H4/H1/M30/M15 + ~18.5k M1 bars **per
> instrument**. With the full default list that's a lot of bars every refresh.
> MT5 serves these from its local cache, but if the refresh gets slow, trim
> `pairs` or lower `m1_lookback_bars`.

MT5 credentials: KV `confluence_bot_credentials`
(`mt5_account/mt5_password/mt5_server/mt5_path`, saved from the config page;
env vars `MT5_ACCOUNT/...` are the fallback). Its own magic (20260006) means it
can share an account with the other bots without touching their positions.

## Files

```
ConfluenceBot/
├── main.py                Orchestrator + per-instrument SymbolEngine
├── journal.py             Per-instrument event log + CSV (pip-normalised P&L)
├── test_smoke.py          Synthetic unit tests — run before committing changes
├── modules/
│   ├── htf_bias.py        Structure-first Daily/4H bias (instrument-agnostic)
│   ├── level_matrix.py    Valid extremes → fib matrix → clusters → scored zones
│   │                        (score_zones takes a per-instrument `proximity`)
│   ├── exits.py           Confirmation-swing SL, level TPs, σ cap (pip/digits aware)
│   ├── vumanchu.py        WT-mandatory Cipher B + fuel veto (normalised, no pip)
│   ├── trade_manager.py   Multi-trade portfolio state (per instrument) + `symbol`
│   ├── volume_profile.py  POC/VAH/VAL/HVN + nPOC stack (per-instrument `bucket`)
│   ├── session_engine.py  (copy of V1) sessions, pivots, VWAP anchors
│   └── trendline_engine.py(copy of V1) H4/H1 structural trendlines
└── logs/                  confluence_<key>_journal.jsonl / _trades.csv / _state.json
```

## Options-OI confluence (`use_oi`, default on)

The bot can fold your **morning OI paste** into the zone scoring. You already
update Open Interest per pair in the OI analyser (which writes KV `oi_store`:
max pain, put/call walls, gamma flip, HVL). With `use_oi` on, each state refresh
the bot pulls those levels from `GET /api/oi-levels` (the shared JS
`oiConfluence.oiStoreToLevels` brick — one source of truth, no Python re-port)
and `score_zones` **adds a credit to any zone sitting on one**: a wall / max
pain / HVL is a dealer-hedging *magnet* (`oi_magnet`, weight 1.5, in-family with
POC / daily-open); the gamma-flip strike is a regime *boundary*, not a magnet,
so it earns a smaller, separately-tagged credit (`oi_gamma_flip`, 0.8). Multiple
OI strikes near one zone score **once** at the strongest type. An OI hit that
lands on a round number is tagged `@rn` in the zone composition so it can be
sliced out later (OI strikes cluster on round numbers).

**No "refresh zones" button is needed.** The bot rebuilds and re-scores every
zone across the fleet automatically every `state_interval` (default 120 s), so a
fresh 8am paste flows into the scores on the next cycle — the only button you
press is the one you already use to compute the OI analyser.

> **Honest caveat (the FX vs index asymmetry).** The analyser pulls **CME**
> options OI, so for the USD FX pairs (6E/6B/6J/6A/6C/6S) and gold (GC) the OI is
> *real exchange data*, not a guess — the "no OI exists for FX" framing is too
> strong for these specific pairs. The catch is **coverage**: CME-listed FX
> futures options are a small slice of an FX options market that is overwhelmingly
> **OTC**, so the visible walls are a *partial, possibly unrepresentative* view of
> the dealer gamma that actually hedges into spot — the pin/magnet effect is
> correspondingly weak, and it still **can't be backtested** (that's why the
> platform forward-tests it). On the **equity indices** (NQ/ES/DAX) the effect is
> *stronger*, not "the same": there the listed options book is essentially the
> whole market, OI is fully consolidated, and dealer-gamma hedging genuinely moves
> spot near big strikes / OpEx. Net: real-but-partial on the CME FX pairs (weak),
> real-and-near-complete on the indices (genuine). Keep the FX side paper until
> its own journal (≥30 closed trades, costs on) says otherwise; `use_oi: false`
> turns it off per run.

## A/B discipline

GoldV2 stays the incumbent on gold. This bot runs **paper across the fleet**
until each instrument's journal shows it beats doing nothing on the same
period — then flip `paper_mode` off from the config page. Don't tune on fewer
than ~30 closed trades per instrument (house rule: OOS evidence or it didn't
happen).
