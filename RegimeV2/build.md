# RegimeV2 — Build Plan

> Blueprint for all phases of the Regime Bot V2.
> Mark tasks `[x]` as completed. V1 (`bot/regime_bot.py`) is never modified.

---

## What We Are Building

A fully independent regime-aware trading bot that runs alongside V1 on its own MT5 account.
V2 adds:
- **Confidence slope / velocity exit rules** — exits 2-3 bars before V1 even sees the flip
- **BOCPD change-point detection** — probabilistic early-warning layer on top of HMM
- **1h HMM alignment** — higher-timeframe confirmation before entry
- **Cross-pair consensus scoring** — confirms macro move vs pair-specific noise
- **Rich Telegram messages** — regime change alerts + periodic heartbeat with actionable guidance
- **Macro overlay** — VIX term structure, FOMC window flagging, session awareness
- **Separate MT5 account + independent RiskGuard** — isolated drawdown, own force-unlock
- **30-second poll cadence** — server HMM refresh halved from 60s to 30s

---

## File Map (files to be created)

```
RegimeV2/
  build.md                  ← this file
  README.md                 ← installation + run guide
  regime_bot_v2.py          ← main bot (Phase 1+)
  bocpd.py                  ← Bayesian Online Change-Point Detection (Phase 2)
  macro_overlay.py          ← VIX / FOMC / CME CVOL fetcher (Phase 3)
  formatter.py              ← Telegram rich message builder (Phase 1)

server.js changes (minimal):
  + /api/hmm1h-v2           ← 1h HMM endpoint (Phase 2)
  + HMM5M_REFRESH_MS        ← 60000 → 30000 (Phase 2)
  + /api/oanda-book          ← position book proxy if OANDA reinstates (Phase 4, optional)

bot-config.html changes:
  + RegimeV2 config card    ← separate MT5 account, DD limits, force unlock (Phase 1)

js/bot-config.js changes:
  + RGV2_DEFAULTS           ← V2 config defaults and KV read/write (Phase 1)
```

---

## Entry Rules

All must pass before an order is placed.

| # | Rule | Default | Notes |
|---|------|---------|-------|
| E1 | `regime ∈ {BULL, BEAR}` | — | Hard gate |
| E2 | `confidence ≥ entry_conf` | 70% | Configurable |
| E3 | Confidence RISING across last 2 polls | — | Not a one-bar spike |
| E4 | `vol_z ≤ vol_z_max` | 2.5 | No spike entries |
| E5 | `candle_hold` consecutive agreeing polls | 2 | Debounce |
| E6 | `decay_score < entry_decay_max` | 0.25 | Existing decay gate |
| E7 | **[V2 Phase 2]** 1h regime is not OPPOSED | — | BULL entry blocked if 1h = BEAR |
| E8 | **[V2 Phase 1]** Cross-pair consensus ≥ threshold | 2 pairs | At least N other pairs same direction |
| E9 | **[V2 Phase 3]** Not inside FOMC window | 48h | Widen or skip near Fed meetings |
| E10 | **[V2 Phase 3]** VIX term structure not in backwardation | VIX3M/VIX < 0.95 | Risk-off macro filter |
| E11 | **[V2 Phase 3]** Not inside high-impact news window | 10 min before / 5 min after | Forex Factory calendar |
| E12 | **[V2 Phase 2]** Volume exhaustion score below threshold | < 0.8 | Trend ending even if regime intact |
| E13 | **[V2 Phase 3]** Session multiplier × confidence ≥ entry_conf | Multiplier 0.7–1.0 by session | Asian session raises effective threshold |

---

## Hold Rules

Stay in trade while ALL hold:

- `regime == entry_regime`
- `confidence ≥ hold_conf` (default 55%, lower than entry)
- No exit trigger fires

---

## Exit Rules

Any single trigger fires → close position immediately.

| # | Trigger | Threshold | Type |
|---|---------|-----------|------|
| X1 | Regime flipped away from entry regime | Any change | Hard — immediate |
| X2 | Confidence below floor | < 45% | Hard — immediate |
| X3 | Confidence slope deteriorating | < −5%/bar for 3 consecutive bars | Soft — early warning |
| X4 | Single-bar confidence drop | > 15% drop in one poll | Hard — sudden break |
| X5 | SL hit by price | ATR-based SL | Hard — price |
| X6 | **[V2 Phase 2]** BOCPD change-point prob | > 70% for 2 consecutive polls | Predictive |
| X7 | **[V2 Phase 2]** 1h regime opposed | 1h flips to opposing regime | Structural |
| X8 | **[V2 Phase 1]** Cross-pair consensus collapsed | Dropped below entry threshold | Macro |
| X9 | **[V2 Phase 3]** VIX term structure flips to backwardation mid-trade | VIX3M/VIX < 0.95 | Macro |
| X10 | **[V2 Phase 2]** Volume exhaustion confirmed mid-trade | score > 0.8 for 2 polls | Warning only — tighten stop, no immediate exit |

---

## Telegram Message Format

### Regime Change Alert (fires on every BULL/BEAR transition)

```
🟢 EURUSD Regime Change
  Range → Bull
  Confidence : 99.1%
  Price      : 1.0847
  Volume z   : -0.71 σ
  Chg-pt prob: 0.3%  (run 33 bars)
  Regime (1h): confirming / at risk 40%
  Range lasted: 23m
  Pairs BULL  : 3/5  (EURUSD GBPUSD AUDUSD)
  Time       : 2026-05-25 20:28 UTC
```

### Heartbeat (fires every N minutes while regime is BULL or BEAR)

```
🟢 EURUSD — Bull  (98.9%)
  Bull active for : 12m
  Momentum        : unbroken 47m (across 1 transition)
  Conf slope      : rising (+4.2%/bar)
  Chg-pt prob     : 1.1%  — stable
  Regime (1h)     : confirming Bull
  Volume          : -1.6σ — thin

Bull trend is clean and well-established.
Confidence rising — regime strengthening.
Volume thin — reduce position size.
→ Hold longs. No new entries until vol normalises.
```

### Commentary Logic (rule-based)

| Condition | Commentary line |
|-----------|----------------|
| `run_length > 20` AND `conf > 85%` | "Bull trend is clean and well-established." |
| `run_length < 5` | "Still establishing — wait for confirmation." |
| `conf_slope > 0` | "Confidence rising — regime strengthening." |
| `conf_slope < -3%` for 2 bars | "Confidence fading — consider tightening stops." |
| `change_prob > 50%` | "Model warns Bull likely changing within the hour (X% change prob)." |
| `vol_z < -1.5` | "Volume Xσ — thin market, reduce size." |
| `vol_z > 1.5` | "Volume Xσ — elevated activity, widen stops." |
| `momentum_mins > 60` | "Momentum unbroken for Xm across Y transitions." |
| `cross_pair_consensus < entry_threshold` | "Pair consensus weakening — macro move may be stalling." |

### Action Line Logic

| State | Action line |
|-------|-------------|
| Open position, conf strong, slope rising | `→ Hold longs. Regime strong.` |
| Open position, vol thin | `→ Hold longs. Avoid new entries until vol normalises.` |
| Open position, conf fading | `→ Tighten stop. Regime may be fragmenting.` |
| Open position, change_prob > 50% | `→ Trail stop aggressively. Exit risk elevated.` |
| No position, regime just started | `→ Entry window open. Waiting for candle_hold confirmation.` |

---

## Config Spec (RegimeV2 section in bot-config)

### MT5 Account (separate from V1)

| Field | ID | Default | Notes |
|-------|----|---------|-------|
| MT5 Account Number | `rgv2_account` | — | Separate account from V1 |
| MT5 Server | `rgv2_server` | — | e.g. AdmiralMarkets-Live |
| MT5 Login | `rgv2_login` | — | Stored in KV, not plain text |
| MT5 Password | `rgv2_password` | — | Stored encrypted in KV |

### Execution

| Field | ID | Default |
|-------|----|---------|
| Enabled | `rgv2_enabled` | false |
| Paper mode | `rgv2_paper` | true |
| Pairs | `rgv2_pairs` | EUR/USD, GBP/USD, USD/JPY |
| Poll interval (s) | `rgv2_interval` | 30 |
| Entry confidence % | `rgv2_entry_conf` | 70 |
| Hold confidence % | `rgv2_hold_conf` | 55 |
| Candle hold | `rgv2_candle_hold` | 2 |
| Vol z max | `rgv2_vol_z_max` | 2.5 |
| SL ATR mult | `rgv2_sl_atr_mult` | 1.8 |
| Risk % per trade | `rgv2_risk_pct` | 1.0 |
| Max lot | `rgv2_max_lot` | 5.0 |
| Trade window start | `rgv2_window_start` | 07:00 |
| Trade window end | `rgv2_window_end` | 20:00 |

### Exit Rules Config

| Field | ID | Default |
|-------|----|---------|
| Conf floor (hard exit) % | `rgv2_conf_floor` | 45 |
| Conf slope threshold %/bar | `rgv2_slope_thresh` | -5 |
| Conf slope bars | `rgv2_slope_bars` | 3 |
| Single-bar drop threshold % | `rgv2_drop_thresh` | 15 |
| BOCPD exit threshold % | `rgv2_bocpd_thresh` | 70 |

### RiskGuard (independent from V1)

| Field | ID | Default |
|-------|----|---------|
| Daily DD limit % | `rgv2_ddlimit` | 3.0 |
| Monthly DD limit % | `rgv2_monthlydd` | 5.0 |
| Lockout hours | `rgv2_lockout` | 3 |
| Cooldown (s/pair) | `rgv2_cooldown` | 240 |
| **Force Unlock button** | — | Writes `rgv2_force_unlock: true` to KV |

### V2 Enhancements Config

| Field | ID | Default |
|-------|----|---------|
| Cross-pair min consensus | `rgv2_consensus_min` | 2 |
| Telegram heartbeat interval (min) | `rgv2_heartbeat_min` | 120 |
| 1h alignment enabled | `rgv2_use_1h` | true |
| BOCPD enabled | `rgv2_use_bocpd` | true |
| VIX overlay enabled | `rgv2_use_vix` | true |
| FOMC window hours | `rgv2_fomc_window` | 48 |

### Live Status Panel (bot-config page — RegimeV2 section)

Per-pair status is pushed to KV (`regime_bot_v2_status`) every 30s by the bot.
The bot-config page polls this key every 30s and renders a live table.
**This replaces frequent Telegram heartbeats** — dashboard shows everything live,
Telegram fires only on significant events (regime change, entry, exit, lockout).

**Status table columns (one row per pair):**

| Column | Source | Notes |
|--------|--------|-------|
| Pair | config | e.g. EUR/USD |
| Regime | HMM | colour dot: 🟢 BULL 🔴 BEAR 🟡 RANGE ⚪ CHOP |
| Confidence | HMM | e.g. 98.9% |
| Slope | computed | e.g. +3.2%/bar ↑ or −4.1%/bar ↓ |
| Vol z | HMM | e.g. −0.71σ |
| Active for | regime_start_times | e.g. 14m |
| Momentum | momentum_start_times | e.g. 47m unbroken |
| BOCPD | bocpd.py | e.g. 2.1% (Phase 2) |
| 1h regime | /api/hmm1h-v2 | e.g. ✅ Bull / ⚠️ Range (Phase 2) |
| Exhaustion | volz_history | e.g. 0.12 normal / 0.84 ⚠️ (Phase 2) |
| Position | open_pos | LONG 12m +8.2p / flat |
| Status | computed | Watching / Entry pending / Blocked: vol / Locked: DD |

**Telegram events (fires to chat — event-driven only):**
- Regime change (Range → Bull etc.) — always fires
- Entry opened — always fires
- Exit closed with reason and P&L — always fires
- RiskGuard locked — fires once on lockout
- Heartbeat — configurable long interval (default 2h), can be disabled

---

## Data Sources

| Source | Data | Endpoint / URL | Frequency | Phase |
|--------|------|---------------|-----------|-------|
| Dashboard `/api/hmm5m-v2` | All pair regimes, confidence, volZ, probs | Internal | 30s | 1 |
| Dashboard `/api/quote` | Live price | Internal | Per poll | 1 |
| MT5 (direct) | Price, ATR, tick | MT5 Python API | Per poll | 1 |
| Dashboard `/api/hmm1h-v2` | 1h regime per pair | Internal (new endpoint) | 30s | 2 |
| Yahoo Finance | `^VIX`, `^VIX3M` term structure | `yfinance` | Hourly | 3 |
| Federal Reserve / hardcoded | FOMC meeting dates | Public calendar | Daily | 3 |
| Forex Factory JSON | High-impact news events | `nfs.faireconomy.media/ff_calendar_thisweek.json` — free, no key | Daily cache | 3 |
| `sessionLabel` in HMM API | Session window (CALM/CAUTION/STRESS) | Already in `/api/hmm5m-v2` | Per poll | 3 |
| `volZ` buffer (existing) | Volume exhaustion pattern | Already tracked in decay detector | Per poll | 2 |
| CME Group | CVOL snapshot (FX, Gold, Equity, Rates) | cmegroup.com scrape | Daily | 4 |
| MyFXBook | Retail sentiment (if session token configured) | `/api/sentiment` | 30 min | 4 |

---

## Phase 1 — Foundation, Rich Messages, Core Exit Rules ✅

> Target: bot runs, sends good Telegram messages, exits smarter than V1

- [x] Create `RegimeV2/` folder and files skeleton
- [x] `RegimeV2/regime_bot_v2.py` — main loop scaffold (mirrors V1 structure)
- [x] Separate KV config key: `regime_bot_v2_config`
- [x] Separate KV status key: `regime_bot_v2_status`
- [x] `regime_start_times[pair]` — track when current regime started
- [x] `momentum_start_times[pair]` — unbroken directional momentum (resets on BEAR, not RANGE)
- [x] `conf_history[pair]` — rolling 5-bar confidence buffer per pair
- [x] `conf_slope(pair)` — compute slope over last N bars
- [x] Confidence velocity exit (X3: slope < −5%/bar × 3 bars)
- [x] Single-bar drop exit (X4: single drop > 15%)
- [x] Cross-pair consensus scoring — count pairs in same regime each loop
- [x] Entry rule E8 — block entry if consensus below threshold
- [x] Exit rule X8 — exit if consensus collapses mid-trade
- [x] `RegimeV2/formatter.py` — regime change message builder
- [x] `RegimeV2/formatter.py` — heartbeat message builder
- [x] Rule-based commentary generator
- [x] Action line generator
- [x] RiskGuard V2 class (independent from V1) + `rgv2_force_unlock` KV check
- [x] `bot-config.html` — RegimeV2 config card (MT5 account, execution, exit rules, RiskGuard)
- [x] `js/bot-config.js` — RGV2_DEFAULTS, readRgV2Form(), renderRgV2Form(), saveRgV2Config()
- [x] Force Unlock button for V2 in bot-config (writes `rgv2_force_unlock: true` to KV)
- [x] **Live status panel in bot-config** (replaces frequent Telegram heartbeats)
  - Bot pushes `regime_bot_v2_status` to KV every 30s (per-pair data object)
  - Bot-config page polls KV every 30s and renders live table
  - One row per pair: regime dot, confidence, slope arrow, vol_z, active duration, position, 1h HTF
  - "Last updated Xs ago" indicator — goes amber if stale > 60s (bot may be down)
- [x] Telegram event-only messages: regime change, entry, exit, lockout (heartbeat default 2h / optional)

---

## Phase 2 — Predictive Signals + 1h Alignment + Volume Exhaustion ✅

> Target: BOCPD fires before regime flip, 1h timeframe confirms entry, volume exhaustion catches trend end

- [x] `RegimeV2/bocpd.py` — Gaussian BOCPD implementation
  - Prior: mean=75 (confidence scale), std=15, hazard rate=1/150 (regime lasts ~150 bars avg)
  - Input: per-pair confidence stream from `/api/hmm5m-v2`
  - Output: `P(change point at this bar)` as 0–100%
- [x] Feed per-pair confidence stream into BOCPD each loop
- [x] Exit rule X6 — BOCPD > 70% for 2 consecutive polls → exit
- [x] Add `Chg-pt prob` field to regime change Telegram message (BOCPD output)
- [x] `server.js` — add `/api/hmm1h-v2` endpoint (H1 bars → same `computeHMM5mV2`, no retraining)
- [x] `server.js` — change `HMM5M_REFRESH_MS` from 60000 → 30000
- [x] V2 bot — fetch 1h regime from `/api/hmm1h-v2` each loop
- [x] Entry rule E7 — block entry if 1h is directly opposed (1m BULL + 1h BEAR = no entry)
- [x] Note: 1m BULL + 1h RANGE = allowed but lower conviction (flag in message)
- [x] Exit rule X7 — exit if 1h flips to opposing regime mid-trade
- [x] Add `Regime (1h): confirming / at risk X%` to Telegram messages
- [x] **Volume exhaustion detector** (uses existing `volZ` buffer — no new data)
  - Pattern: `vol_z` was elevated (> 0.5) → has been declining across last N bars → now ≤ 0 while regime still BULL/BEAR
  - Track rolling 8-bar volZ buffer in `VolExhaustionDetector` class
  - Output: `vol_exhaustion_score` 0.0–1.0 per pair
  - Use in heartbeat: score > 0.5 → warning line; score > 0.75 → trend may be ending
  - Use in entry: score > 0.8 → block new entry (E12)
  - X10: warning in heartbeat when exhaustion > 0.75 (no immediate exit — let slope/BOCPD govern)

---

## Phase 3 — Macro Overlay + Session Awareness + Economic Calendar ✅

> Target: VIX + FOMC + news events + session timing filter bad macro conditions

- [x] `RegimeV2/macro_overlay.py` — MacroOverlay class (VIXFetcher + FOMCCalendar + NewsFetcher)
- [x] VIX fetch: `yfinance` for `^VIX` and `^VIX3M`, hourly refresh with stale-data fallback
- [x] VIX term structure ratio: `VIX3M / VIX` — backwardation = risk-off
- [x] Entry rule E10 — block entries when VIX3M/VIX < 0.95 (backwardation)
- [x] Exit rule X9 — exit if VIX flips to backwardation mid-trade
- [x] FOMC calendar — 2026 dates hardcoded, 48h window check
- [x] Entry rule E9 — block entries within 48h of FOMC
- [x] Warn in Telegram message when inside FOMC window
- [x] **Session-aware transition multipliers** (uses `sessionLabel` from `/api/hmm5m-v2`)
  - CALM (Asian) → 0.75 multiplier on effective confidence threshold
  - CAUTION (transitional) → 0.90 multiplier
  - STRESS (London/NY) → 1.0 multiplier (full weight)
  - `effective_conf = confidence × session_multiplier` — used in entry gate E13
  - Session label in heartbeat commentary for context
- [x] **Economic calendar overlay** — high-impact news blocks entries
  - Source: `https://nfs.faireconomy.media/ff_calendar_thisweek.json` — free, no API key
  - 6h cache, filtered to "High" impact events for pair currencies
  - Block new entries within 10 min BEFORE and 5 min AFTER a high-impact event (E11)
  - Existing positions NOT closed on news — let SL and regime rules govern exits
  - `next_event_for_pair()` returns upcoming event within 60 min — shown in heartbeat
- [x] Add macro context line to heartbeat message (VIX level, FOMC proximity, next news event)

---

## Phase 4 — CME CVOL + Advanced Signals

> Target: cross-asset coherence check from volatility diagnostic framework

- [ ] `RegimeV2/macro_overlay.py` — add CME CVOL daily scrape
- [ ] Parse FX CVOL, Gold CVOL, Equity CVOL, Rates CVOL from cmegroup.com
- [ ] Cross-asset coherence check (from `cross_asset_volatility_diagnostic.md` framework)
  - FX CVOL rising + Gold CVOL rising + Equity CVOL flat = risk-off regime
  - Rates CVOL elevated without FX CVOL = policy-path event only, not systemic
- [ ] Add CVOL context to Telegram messages when divergence detected
- [ ] MyFXBook sentiment integration (if `MYFXBOOK_SESSION` env var present)
- [ ] Sentiment extreme contrarian signal — retail > 80% long = bearish bias
- [ ] COT data integration (CFTC, weekly) — commercial vs speculative positioning

---

## Testing Checklist (run before live)

- [ ] Paper mode runs clean — no MT5 orders placed
- [ ] Regime change Telegram messages fire on transitions
- [ ] Heartbeat fires every N minutes while in BULL/BEAR
- [ ] Heartbeat does not fire during RANGE/CHOP
- [ ] X3 (slope exit) fires before X1 (regime flip) in a deteriorating run
- [ ] X4 (velocity exit) fires on sudden confidence drops
- [ ] Force unlock KV key clears lockout within one loop cycle
- [ ] Cross-pair consensus blocks entry when only 1 pair is BULL
- [ ] V1 regime_bot.py unmodified — diff shows zero changes
- [ ] V2 uses its own MT5 account number, not V1's
- [ ] V2 uses `regime_bot_v2_config` KV key, not `regime_bot_config`
- [ ] Drawdown lockout on V2 does not affect V1 and vice versa

---

## Key Decisions / Notes

- **30s poll cadence**: server HMM refresh set to 30s; bot polls at 30s. Below 30s gains little because M1 bars close every 60s — partial-bar HMM noise dominates.
- **BOCPD model**: Gaussian BOCPD on the confidence stream (0–100 scale). Prior: mean=80, std=15. Hazard rate: 1/200 (expect regime to last ~200 bars on average). Tunable.
- **Momentum tracker**: `momentum_start_times[pair]` resets only when regime flips to the OPPOSING direction (BULL → BEAR or BEAR → BULL). A BULL → RANGE → BULL sequence does NOT reset it — momentum is considered unbroken.
- **Cross-pair consensus**: uses all pairs currently in `regime_bot_v2_config.pairs`. A pair with an open V2 position counts toward consensus even if it would now score below entry threshold.
- **1h HMM**: uses same `computeHMM5mV2` function, just on H1 candles (200 bars). Added as `/api/hmm1h-v2` on server — no new model, no Baum-Welch retraining required.
- **RiskGuard independence**: V2 RiskGuard reads `rgv2_ddlimit`, `rgv2_monthlydd`, `rgv2_lockout` from its own KV namespace. A lockout in V1 does not block V2 and vice versa.
- **Volume exhaustion**: distinguishes between vol_z low at the START of a trend (compression = good entry) vs vol_z declining AFTER being elevated (exhaustion = trend ending). V1 only uses vol_z as an entry gate. V2 tracks the vol_z trajectory over a rolling 5-bar window to detect exhaustion mid-trade. No new data — the volZ field already comes from the API every poll.
- **Session-aware multipliers**: regime changes cluster at London open (07:00–08:00 UTC), NY open (13:00–14:00 UTC), and London/NY overlap (12:00–17:00 UTC). A BULL that starts at 08:00 UTC is 3–4× more likely to run than one at 02:00 UTC. V2 applies a session multiplier (0.7–1.0) to the effective confidence threshold rather than hard-blocking trades — Asian session trades are still allowed but require higher raw confidence to compensate.
- **Economic calendar**: Forex Factory JSON endpoint is free, requires no API key, updates weekly. V2 fetches it once per day and caches locally. Only "High" impact events for currencies that match the traded pair are considered. The block is entry-only — existing positions are NOT closed on news (that creates its own slippage risk; let SL and regime rules govern exits).
- **V1 guarantee**: `bot/regime_bot.py` is never modified during V2 build. The only server.js changes are additive (new endpoints, refresh interval change — no existing routes modified).
