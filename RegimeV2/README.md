# RegimeV2 — Installation & Operations Guide

> This document is a living guide. Sections marked `[ TO COMPLETE ]` will be filled in as each phase is built.

---

## What Is RegimeV2?

RegimeV2 is an independent regime-aware trading bot that runs alongside the original `bot/regime_bot.py` (V1) **without modifying it**. It trades on a **separate MT5 account** with its own drawdown limits, config, and Telegram messages.

Key differences from V1:

| Feature | V1 | V2 |
|---------|----|----|
| Poll cadence | 60s | 30s |
| Exit logic | Regime flip only | Confidence slope + velocity + BOCPD |
| Entry gate | Confidence threshold | Threshold + rising slope + 1h alignment + cross-pair consensus |
| Telegram messages | Basic change notice | Rich change alert + periodic heartbeat |
| Macro overlay | None | VIX term structure + FOMC window |
| MT5 account | Shared with main bot | Dedicated separate account |
| Drawdown lockout | Shared | Independent — own force-unlock button |

---

## Architecture Overview

```
RegimeV2/
  regime_bot_v2.py     ← main process (run this on Railway)
  bocpd.py             ← change-point detection module
  macro_overlay.py     ← VIX / FOMC / CME CVOL fetcher
  formatter.py         ← Telegram message builder

Dashboard (server.js):
  /api/hmm5m-v2        ← 1m HMM regimes (30s refresh after Phase 2)
  /api/hmm1h-v2        ← 1h HMM regimes (added in Phase 2)

KV keys used:
  regime_bot_v2_config     ← bot config (read on each loop)
  regime_bot_v2_status     ← status push (written each loop)
  regime_bot_v2_credentials← MT5 account credentials
  rgv2_force_unlock        ← set true to clear drawdown lockout
```

---

## Prerequisites

### Python packages

```bash
pip install requests yfinance
# On the Windows machine running MT5:
pip install MetaTrader5
```

| Package | Used for |
|---------|----------|
| `requests` | Dashboard API calls, Forex Factory news calendar |
| `MetaTrader5` | Direct MT5 order placement (Windows only) |
| `yfinance` | VIX + VIX3M term structure (optional — falls back gracefully) |

Note: BOCPD is implemented natively in `bocpd.py` — no external dependency required.

### Environment / KV setup

| Key | Where | Notes |
|-----|-------|-------|
| `DASHBOARD_URL` | Railway env var | e.g. `https://macrofxmodel-production.up.railway.app` |
| `OANDA_KEY` | Already set | Used by server.js for HMM bars |
| MT5 credentials | KV: `regime_bot_v2_credentials` | Set via bot-config page, not env vars |

---

## Installation

### Step 1 — Deploy to Railway

`[ TO COMPLETE — fill in once Phase 1 is built ]`

1. Add `RegimeV2/regime_bot_v2.py` as a new Railway service
2. Set `DASHBOARD_URL` environment variable to point at the MacroFX server
3. Confirm it appears in Railway dashboard

### Step 2 — Configure MT5 Account

`[ TO COMPLETE ]`

1. Open bot-config page → scroll to **Regime Bot V2** section
2. Enter MT5 account number, server name, login, password
3. Click Save — credentials stored in KV as `regime_bot_v2_credentials`
4. V2 bot picks up credentials on next loop start

### Step 3 — Set Trading Parameters

`[ TO COMPLETE ]`

Open bot-config → Regime Bot V2 section:

- Set **Entry confidence** (recommended: 70%)
- Set **Hold confidence** (recommended: 55%)
- Set **Daily DD limit** (recommended: 3%)
- Set **Lockout hours** (recommended: 3)
- Set **Pairs** to trade
- Keep **Paper mode ON** until testing is complete

### Step 4 — Telegram

`[ TO COMPLETE ]`

V2 uses the same Telegram bot token and chat ID as V1 (read from the shared `tg_config` KV key). No separate Telegram setup needed. V2 messages are prefixed with `[V2]` to distinguish them from V1 alerts.

### Step 5 — Test in Paper Mode

`[ TO COMPLETE ]`

1. Start V2 with `paper_mode: true`
2. Watch logs for `[RGV2]` prefix
3. Confirm Telegram messages arrive on regime changes
4. Confirm heartbeat arrives every 15 min during BULL/BEAR
5. Confirm no MT5 orders placed
6. Run for at least 1 full trading day before switching to live

---

## Configuration Reference

Full config spec is in [build.md](build.md). Quick reference:

### Most important settings

| Setting | What it does | Start here |
|---------|-------------|------------|
| `rgv2_entry_conf` | Min confidence to enter a trade | 70% |
| `rgv2_hold_conf` | Min confidence to stay in a trade | 55% |
| `rgv2_slope_thresh` | Confidence slope that triggers early exit | -5%/bar |
| `rgv2_slope_bars` | How many bars of deterioration before exit | 3 |
| `rgv2_drop_thresh` | Single-bar drop that triggers immediate exit | 15% |
| `rgv2_ddlimit` | Daily drawdown % before lockout | 3.0% |
| `rgv2_lockout` | Hours locked out after DD breach | 3 |
| `rgv2_consensus_min` | Min pairs in same regime to allow entry | 2 |
| `rgv2_heartbeat_min` | Heartbeat Telegram interval during BULL/BEAR | 15 min |

---

## Running the Bot

### Start

```bash
python RegimeV2/regime_bot_v2.py --dashboard-url https://macrofxmodel-production.up.railway.app
```

### Stop

Railway: stop the service via the Railway dashboard or CLI.

Local: Ctrl+C — the bot closes any open positions before exiting (clean shutdown).

### Logs

```
[RGV2] [EURUSD] regime=BULL  conf=98.9%  slope=+3.2%  rl=12  bocpd=0.02
[RGV2] [EURUSD] ENTRY LONG  conf=98.9%  consensus=3/5  vol_z=-0.71  lots=0.10
[RGV2] [EURUSD] EXIT X3 — conf slope -5.4%/bar × 3 bars  (conf now 87.1%)
[RGV2] [EURUSD] Telegram heartbeat sent
```

Log prefix `[RGV2]` on every line — easy to filter from V1 logs in Railway.

---

## Drawdown Lockout

### How it works

If daily drawdown reaches `rgv2_ddlimit` %, all V2 trading halts for `rgv2_lockout` hours. V1 is completely unaffected.

### Clearing the lockout

**Automatic:** clears after lockout hours expire.

**Manual:** bot-config page → Regime Bot V2 section → click **Unlock V2 RiskGuard** button.
This writes `rgv2_force_unlock: true` to KV. The bot clears the lockout on its next loop (within 30 seconds).

### Signs you are locked out

Telegram message:
```
🔒 [V2] EURUSD blocked — RiskGuard locked (2h 14m remaining)
```

Log line:
```
[RGV2] RiskGuard: Daily DD 3.2% ≥ 3.0% — locked 3h
```

---

## Live Status Panel (bot-config page)

The bot pushes a full per-pair status snapshot to KV (`regime_bot_v2_status`) every 30 seconds.
The bot-config page reads this and renders a live table in the RegimeV2 section — **no Telegram spam needed**.

```
┌─────────┬────────┬─────────┬──────────┬────────┬──────────┬──────────┬───────────────────┐
│ Pair    │ Regime │ Conf    │ Slope    │ Vol z  │ Active   │ Momentum │ Position          │
├─────────┼────────┼─────────┼──────────┼────────┼──────────┼──────────┼───────────────────┤
│ EUR/USD │ 🟢 BULL│ 98.9%   │ +3.2↑   │ -0.71σ │ 14m      │ 47m      │ LONG 12m  +8.2p  │
│ GBP/USD │ 🟡 RNG │ 84.2%   │ -1.1↓   │ -0.22σ │ 23m      │ —        │ flat              │
│ USD/JPY │ 🟢 BULL│ 71.5%   │ +0.4↑   │ +0.31σ │ 4m       │ 4m       │ Watching (hold 1/2)│
└─────────┴────────┴─────────┴──────────┴────────┴──────────┴──────────┴───────────────────┘
Last updated: 8s ago
```

Row colours: green = BULL position open, red = BEAR position open, yellow = watching, grey = blocked/flat.
If "Last updated" goes > 60s the panel shows amber — the bot may have stopped.

---

## Telegram Messages

Telegram fires on **events only** — not on a timer. The dashboard panel covers live monitoring.

### Regime Change Alert

Fires every time any pair transitions into BULL or BEAR.

```
🟢 EURUSD Regime Change
  Range → Bull
  Confidence : 99.1%
  Price      : 1.0847
  Volume z   : -0.71 σ
  Chg-pt prob: 0.3%  (run 33 bars)
  Regime (1h): confirming
  Range lasted: 23m
  Pairs BULL  : 3/5
  Time       : 2026-05-25 20:28 UTC
```

### Heartbeat (optional — default every 2h while BULL/BEAR, can be disabled)

The dashboard panel replaces the need for frequent heartbeats. This fires as a low-frequency summary
for when you're away from the dashboard entirely. Set `rgv2_heartbeat_min` to 0 to disable.

```
🟢 EURUSD — Bull  (98.9%)
  Bull active for : 12m
  Momentum        : unbroken 47m
  Conf slope      : rising +3.2%/bar
  Chg-pt prob     : 1.1%  — stable

Bull trend is clean and well-established.
→ Hold longs.
```

### Exit Alert

Fires when a position is closed.

```
🔴 [V2] EURUSD — CLOSED LONG
  Exit reason : Confidence slope deteriorating
  Conf at exit: 87.1%  (was 99.6%)
  Regime      : still Bull — pre-emptive exit
  P&L         : +14.2 pips
  Duration    : 18m
```

---

## Understanding the Signals

### Confidence slope (the core V2 edge)

V1 exits when the regime flips. V2 watches confidence **direction of travel**. A BULL regime at 99% → 94% → 88% → 83% is still labelled BULL by the HMM — but the slope says it is fragmenting. V2 exits at 88% (3-bar slope threshold), V1 exits at the flip. Typical head start: 2–4 minutes.

### BOCPD change-point probability

A Bayesian model that asks at every bar: "is this bar the start of a new regime?" It gives a probability (0–100%). When it exceeds 70% for 2 consecutive bars, V2 exits regardless of what the HMM says. This catches regime breaks that are sudden rather than gradual.

### Cross-pair consensus

V2 checks how many of the configured pairs are in the same regime. If only EUR/USD is BULL while GBP/USD, AUD/USD, USD/JPY are all RANGE, the EUR/USD move is pair-specific (likely EUR news, not USD weakness). V2 requires at least `consensus_min` other pairs in the same direction before entering.

### 1h regime alignment (Phase 2)

The 1h HMM tells you the higher-timeframe context. A BULL on 1m with RANGE on 1h = counter-trend scalp, lower conviction. A BULL on 1m with BULL on 1h = trend-aligned, full conviction. V2 blocks entries when 1h is directly opposed.

### VIX term structure (Phase 3)

`VIX3M / VIX` ratio:
- > 1.0 (contango) = calm, normal — trading allowed
- < 1.0 (backwardation) = stress, front-month fear elevated — V2 pauses entries

### CBOE FX Implied Volatility (Phase 4)

CBOE publishes daily settlement implied vol indices for the major FX pairs and Gold. These are fetched free via yfinance — no API key, no scraping.

| CBOE Symbol | Pair | What it measures |
|-------------|------|-----------------|
| `^EUVIX` | EUR/USD | 1-month implied vol derived from EUR/USD options |
| `^BPVIX` | GBP/USD | 1-month implied vol derived from GBP/USD options |
| `^JYVIX` | USD/JPY | 1-month implied vol derived from JPY options |
| `^GVZ`   | XAU/USD | CBOE Gold ETF Volatility Index (GLD options) |

Pairs without a dedicated index (AUD/USD, NZD/USD, USD/CAD, USD/CHF, GBP/JPY) use `^EUVIX` as the nearest available FX vol proxy.

**What V2 does with this data:**

- **52-week percentile** — each index level is ranked against the past year. This tells you not just the raw number but whether it is historically elevated.
- **Entry block at 85th+ percentile** — when a pair's implied vol is in the top 15% of its past year, the market expects large moves. HMM regime signals become noisy (big candles flick the model between states faster than real regime changes). V2 blocks new entries.
- **Warning at 65th+ percentile** — shown in the heartbeat message. No entry block, but stop-widening is recommended.
- **Vol coherence flag** — when `^EUVIX`, `^BPVIX`, and `^JYVIX` are all simultaneously above their 50th percentile, V2 flags systemic risk-off. This means: the elevated vol is not pair-specific (like a single central bank event), it is macro-wide (credit stress, geopolitical shock, etc.). This context appears in heartbeat commentary.

**Refresh cadence:** every 6 hours. These are end-of-day settlement values — intraday CBOE vol index updates are not available via yfinance.

---

## Known Limitations

- **HMM is confirmatory, not predictive.** By the time BULL is confirmed, price has already moved. V2 catches it faster (BOCPD) and exits faster (slope), but does not predict regimes before they start. The SR3/CVOL options framework (Phase 4) is the closest to true prediction.
- **30s poll still limited by M1 bar cadence.** The HMM recomputes every 30s but M1 bars only close every 60s. The mid-bar recompute adds some signal but also some noise. Filter this by requiring 2 consecutive agreeing polls before acting.
- **Cross-pair consensus requires ≥ 2 pairs in same direction.** During Asian session, fewer pairs trend simultaneously. Consider lowering `consensus_min` to 1 during 00:00–06:00 UTC or disabling the gate.

---

## Troubleshooting

`[ TO COMPLETE — fill in as issues arise during build and testing ]`

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| No Telegram messages | Telegram token/chat ID not in shared KV | Check `tg_config` KV key |
| "Locked out" immediately on start | Previous session hit DD limit | Click Unlock V2 RiskGuard in bot-config |
| Bot not polling — silent | Dashboard URL wrong or Railway service stopped | Check `DASHBOARD_URL` env var |
| `hmm1h-v2` endpoint 404 | Phase 2 server.js change not deployed | Deploy Phase 2 server changes |
| All pairs showing RANGE | Market outside trade window | Check `rgv2_window_start` / `rgv2_window_end` |

---

## Changelog

| Date | Version | Notes |
|------|---------|-------|
| 2026-05-25 | v2.0.0-plan | Blueprint created, no code yet |
| 2026-05-25 | v2.1.0 | Full build — all Phase 1-3 complete: formatter.py, bocpd.py, macro_overlay.py, regime_bot_v2.py, server.js /api/hmm1h-v2, bot-config.html V2 panel, bot-config.js V2 JS |

---

*V1 (`bot/regime_bot.py`) is never modified by this build. All V2 changes are additive.*
