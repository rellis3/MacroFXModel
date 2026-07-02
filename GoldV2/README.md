# Gold Bot V2 — XAU/USD Level-Matrix Confluence System

V2 of the Gold bot (`Gold/` is V1 and keeps running untouched — versioned, not
overwritten, per the house rule). Same core thesis — wait for price to come to
a high-confluence level, confirm exhaustion on M5 VuManChu, trade it with
strict risk discipline — but every layer that the V1 live record showed to be
weak has been reworked.

Runs against KV keys `gold_v2_config` / `gold_v2_credentials` /
`gold_v2_status` / `gold_v2_zones`, MT5 magic **20260005**. Config + MT5
credentials are managed from the **⚡ Gold V2 tab on bot-config.html**; open
positions and closed trades appear in the Positions tab and Trade History like
every other bot.

```
python GoldV2/main.py                 # paper mode (default)
python GoldV2/main.py --live          # real MT5 orders
python GoldV2/main.py --once          # single cycle then exit
python GoldV2/test_smoke.py           # synthetic unit tests (no network/MT5)
```

---

## What changed vs V1, and why

The V1 demo record (May–Jul 2026: net positive, but ~95% BUY trades through a
falling market, stops pinned at the 40-pip cap, half the paper trades
expiring) diagnosed four specific weaknesses. Each maps to a V2 module:

### 1. HTF bias — `modules/htf_bias.py`
V1 used the Daily EMA21/50 cross, which stays "bullish" for weeks after a top;
combined with the counter-trend block this made the bot long-only through a
~12% decline. V2:

* **H4 market structure** (HH/HL vs LH/LL from confirmed swing pivots) is the
  fastest input — flips in days, not weeks. EMA fallback when a one-way move
  leaves too few pivots.
* Daily trend requires **price** to agree (close > EMA21 > EMA50), not just
  the EMAs' relationship.
* **Daily/4H disagreement → NEUTRAL** (stand down). V1 scored "Daily bullish |
  4H bearish" as BULL 50% — the falling-knife configuration.

### 2. Zones — `modules/level_matrix.py`
V1 generated 5 zone variants from every pivot pair and let them score each
other; near-duplicate legs inflated scores (one trade scored 51.8, mostly from
copies of the same `.886`). V2 implements the trader's actual model:

* **Valid extremes**: a high is invalidated the moment a later bar trades
  above it (mirror for lows) — superseded legs never enter the matrix
  (the "redraw to the new high" rule).
* **Fib matrix**: every valid low × every later valid high (and vice versa)
  emits `.382/.5/.786/.886` as level **lines**; the **golden pocket
  (.618–.650) is a BAND** — a zone, not a line — and anything inside it gets
  a confluence bonus.
* **Clustering**: same-direction lines within `cluster_tolerance` collapse
  into one zone; overlapping GP bands merge and seed zones.
* **Scoring counts DISTINCT legs** (once each, TF-weighted, capped) plus the
  non-fib confluences (nPOC age-weighted, VWAP anchors, POC/HVN/VAH/VAL,
  daily open, prev-day + session H/L, pivots, aligned trendlines, HTF
  alignment, σ-forecast exhaustion lines). Redundancy can no longer
  masquerade as evidence.

### 3. Exits — `modules/exits.py`
V1's "structural" SL was almost always wider than the 40-pip cap, so the cap
silently became the stop; fixed 3R targets expired half the trades. V2:

* **SL = M5 confirmation swing** (the low/high that made the VuManChu signal)
  ± ATR buffer; zone-edge fallback. If it exceeds `max_sl_pips` the trade is
  **skipped** — never truncated into no-man's land.
* **TP = level-to-level**: TP1 is the nearest mapped obstacle ≥ `tp1_r_min` R
  (opposing zones, nPOCs, VWAP anchors, pivots, prev-day H/L, impulse end);
  TP2 the next major obstacle, clamped to the `[tp2_r_min, tp2_r_max]` R
  window.
* **σ-forecast range cap**: expected day range from `/api/vol-forecast`
  (GOLD `hl_median`, midnight-anchored; daily-ATR fallback) bounds intraday
  targets, and the `oc_75` line is a hard exhaustion cap. No room → no trade.
* HTF-aligned trades may run overnight (configurable); others expire at the
  window end.

### 4. Confirmation — `modules/vumanchu.py`
Per `MD files/vumanchu_reference.md`: **WT is mandatory** (V1 could enter on
MF+VWAP alone), Money Flow counts **exhaustion patterns only** (V1's "MF>20 =
bullish" credited a long with evidence for the other side), and the **fuel
veto** blocks entries while MF still drives hard against the zone ("no spike =
fuel remaining = price goes through the level"). The confirmation swing is
exposed for SL anchoring.

### 5. Portfolio — `modules/trade_manager.py`
V1 was one zone / one trade / max 2 per day, and `trades_today` never reset
(masked by process restarts). V2:

* several **armed zones** at once (`max_armed_zones`), several **concurrent
  trades** under **aggregate** caps — `max_open_risk_pct` (sum of open risk),
  `max_per_direction`, `min_entry_separation_pips` (no stacking one shelf) —
  because gold positions are ~100% correlated, risk is capped as a sum, not a
  count.
* configurable `max_trades_per_day`, **resets on UTC rollover**.
* per-zone cooldowns + a short global entry spacing.
* **state persistence** (`gold_v2_state.json`) + **MT5 position adoption** on
  restart — no orphaned live positions, no lost paper trades.
* paper mode simulates the live management (SL→BE after TP1, `BE_STOP`
  outcome) so journal labels match live behaviour, and **MFE/MAE** are logged
  per trade for exit tuning.

Unchanged (copied from V1, still sound): `volume_profile.py`,
`session_engine.py`, `trendline_engine.py`.

---

## Config reference (KV `gold_v2_config`)

All editable on the Gold V2 tab. Names match `DEFAULT_CFG` in `main.py`:

| Group | Keys |
|---|---|
| Control | `enabled`, `paper_mode`, `trade_window_start/end` |
| Matrix | `zone_tfs` (default `['H4','M30']`), `cluster_tolerance`, `min_zone_score`, `min_distinct_legs`, `proximity_pips`, `max_armed_zones`, `include_retests` |
| Confirmation | `vu_min_components`, `vu_require_wt`, `mf_fuel_veto` |
| Exits | `max_sl_pips` (skip filter), `min_sl_pips`, `sl_buffer_atr`, `tp1_r_min`, `tp2_r_min`, `tp2_r_max`, `range_cap_mult`, `be_after_tp1`, `allow_overnight_htf_aligned` |
| Portfolio | `risk_pct`, `max_trades_per_day`, `max_concurrent_trades`, `max_open_risk_pct`, `max_per_direction`, `min_entry_separation_pips`, `cooldown_minutes`, `global_cooldown_minutes` |
| Gates | `gold_macro_gate`, `ml_gate` (own flag now, default **off**), `htf_block`, `htf_block_confidence`, `use_vol_forecast` |

MT5 credentials: KV `gold_v2_credentials`
(`mt5_account/mt5_password/mt5_server/mt5_path`, saved from the config page;
env vars `MT5_ACCOUNT/...` are the fallback).

## Files

```
GoldV2/
├── main.py                Orchestrator (two-speed loop, gates, KV push)
├── journal.py             Event log + CSV (trade_id keyed, MFE/MAE, skip reasons)
├── test_smoke.py          Synthetic unit tests — run before committing changes
├── modules/
│   ├── htf_bias.py        Structure-first Daily/4H bias
│   ├── level_matrix.py    Valid extremes → fib matrix → clusters → scored zones
│   ├── exits.py           Confirmation-swing SL, level TPs, σ range cap
│   ├── vumanchu.py        WT-mandatory Cipher B + fuel veto + confirm swing
│   ├── trade_manager.py   Multi-trade portfolio state + persistence + adoption
│   ├── volume_profile.py  (copy of V1) POC/VAH/VAL/HVN + nPOC stack
│   ├── session_engine.py  (copy of V1) sessions, pivots, VWAP anchors
│   └── trendline_engine.py(copy of V1) H4/H1 structural trendlines
└── logs/                  journal / CSV / state (git-ignored content)
```

## A/B discipline

V1 keeps trading its demo account as the incumbent. V2 runs paper alongside
until its journal shows it beats V1 on the same period — then flip
`paper_mode` off from the config page. Don't tune V2 parameters on fewer than
~30 closed trades (house rule: OOS evidence or it didn't happen).
