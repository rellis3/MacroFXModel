# Gold Bot — XAU/USD Confluence Trading System

Max-style top-down confluence bot for gold only. Paper mode by default — logs every zone, every signal, and every outcome so you can watch and evaluate before going live.

---

## Strategy Overview

The bot mirrors the way Max approaches a gold chart: start with the big picture, identify the most important price levels, wait for price to come to those levels, then confirm on a lower timeframe before entering. No chasing. No random breakouts.

```
Daily / 4H
  └─ Determine trend direction and bias (EMA structure + BOS)
        ↓
  Fib Zones (default H4 + M30, configurable via zone_tfs)
  └─ Find valid impulse legs on trading timeframes (H4 for structural swings, M30 for precision)
  └─ Draw traditional Fibonacci retracement levels
  └─ Create THREE zones per impulse (no contradicting long/short from mixed TFs):
       A zone — GP (.618–.650)  ← tightest, highest probability
       B zone — .786 (±1.6% R)  ← deep retrace, wider stop
       B zone — .886 (±1.6% R)  ← near structure, widest stop
  (D1 / H4 / H1 bars still fetched for HTF bias, session levels, trendlines)
        ↓
  Confluence Scoring (each zone scored independently at its own price)
  └─ nPOC stack (12-day, age-weighted), POC, HVN, VAH/VAL
  └─ VWAP anchor levels (session right-angle prices, age-weighted)
  └─ Daily open, session H/L (Asia/London/NY), floor pivots
  └─ HTF alignment, trendlines (direction-matched only)
  └─ Cross-impulse fib alignment (.786/.886/.382 of a different leg)
  └─ C-class: zone with no cross-fib items in composition
        ↓
  Wait — price must come TO the zone
        ↓
  30m / 5m Confirmation — VuManChu Cipher B
  └─ WT1/WT2 momentum (divergence at zone = fuel running out)
  └─ Money Flow (gold-specific: spike into zone = exhaustion/reversal)
  └─ VWAP slope exhaustion (momentum driving price INTO zone now fading)
  └─ Minimum 2 of 3 components must agree with expected direction
        ↓
  Paper Entry logged → Journal updated → TP1/TP2/SL tracked
```

---

## Architecture

```
Gold/
├── main.py                   Two-speed orchestrator (entry point)
├── journal.py                Event log + CSV output + console display
├── modules/
│   ├── htf_bias.py           Daily/4H EMA + BOS → BULL / BEAR / NEUTRAL
│   ├── fib_engine.py         Multi-TF impulse detection + Fib zone map
│   ├── volume_profile.py     POC, VAH, VAL, HVN, LVN, 12-day nPOC stack
│   ├── session_engine.py     Daily open, session H/L, pivots, VWAP anchor levels
│   ├── confluence_scorer.py  Weighted zone scoring (age-weighted nPOC + anchors)
│   ├── vumanchu.py           VuManChu Cipher B (WT + Money Flow + VWAP slope)
│   └── trade_state.py        State machine (WAITING → ARMED → MANAGING)
├── .env.example
├── requirements.txt
└── README.md                 (this file)
```

**Shared from `../bot/utils/` (no copying):**

- `sl_tp_engine.py` — SL/TP calculation, ladder exits
- `indicators.py` — ATR, WaveTrend
- `state_reader.py` — KV fetch, dashboard quote fallback
- `persistence.py` — State save/load

---

## Module Detail

### HTF Bias (`htf_bias.py`)

Reads Daily and 4H bars from MT5. Computes EMA(21) vs EMA(50) direction and slope on both timeframes, then checks for a recent Break of Structure on the Daily.

Votes:

- Daily EMA bullish/bearish → ±2
- 4H EMA bullish/bearish → ±1
- Daily BOS → ±1

Output: `BULL`, `BEAR`, or `NEUTRAL` with a 0–1 confidence score. A `BULL` bias means the bot only takes long fib zones and blocks short ones (unless you override).

---

### Fib Engine (`fib_engine.py`)

Traditional Fibonacci retracement — completely separate from the dashboard's standard-deviation range extensions.

**Levels computed per impulse:**

```
0.382  — shallow retrace
0.618  — golden pocket floor
0.650  — golden pocket ceiling
0.786  — deep retrace
0.886  — extreme retrace (last line of defence / near structure origin)
```

**Three zone objects are created from every valid impulse leg:**

| Zone variant | Entry window | Zone ID suffix |
| ------------ | ------------ | -------------- |
| `gp`         | .618 to .650 (the golden pocket range) | _(none)_ |
| `786`        | .786 level ± 1.6% of impulse size | `_786` |
| `886`        | .886 level ± 1.6% of impulse size | `_886` |

All three variants share the same underlying swing data (same levels, same origin/end) but have different entry windows — so each is scored independently by the confluence scorer at its own price centre. A `.786` zone near an nPOC scores that nPOC at the `.786` price, not at the GP price.

**Impulse detection per timeframe:**

| TF  | Min impulse size | Pivot confirmation bars |
| --- | ---------------- | ----------------------- |
| D1  | 2.0 × ATR(14)    | 3 bars each side        |
| H4  | 1.8 × ATR(14)    | 4 bars each side        |
| H1  | 1.5 × ATR(14)    | 4 bars each side        |
| M30 | 1.2 × ATR(14)    | 4 bars each side        |
| M15 | 1.0 × ATR(14)    | 3 bars each side        |

Up to 9 active zones are kept per configured trading timeframe (3 impulses × 3 variants). Default is M30 only — no contradicting long/short zones from different timeframes. D1 and H4 are always used for HTF bias and confluence scoring context only, never for entry zone generation. A zone expires when price closes two consecutive bars beyond the swing origin.

**Direction:**

- `long` — impulse was UP (low→high). Fib retraces downward. Bot looks to BUY at the zone.
- `short` — impulse was DOWN (high→low). Fib retraces upward. Bot looks to SELL at the zone.

---

### Volume Profile (`volume_profile.py`)

Built from MT5 M1 bars using a $0.50 bucket size. Tracks today's session and a 12-day Naked POC stack.

- **POC** — price level with the highest volume today
- **VAH / VAL** — boundaries of the 70% value area around the POC
- **HVN** — High Volume Nodes (local histogram peaks, act as support/resistance)
- **LVN** — Low Volume Nodes (price tends to move through these quickly)
- **nPOC Stack (12-day)** — All session POCs from the past 12 trading days that today's price action has not traded through. Sorted oldest-first: an untouched POC from 10 days ago is a stronger institutional magnet than yesterday's. Each nPOC's age feeds directly into the confluence score weight (see Confluence Scorer).

The 12-day nPOC stack requires approximately 18,500 M1 bars — the bot fetches these on each state refresh. MT5 stores M1 history for years; this quantity is well within what brokers retain.

---

### Session Engine (`session_engine.py`)

All times UTC.

| Session | UTC Window  |
| ------- | ----------- |
| Asia    | 22:00–07:00 |
| London  | 07:00–13:00 |
| NY      | 13:00–20:00 |

Tracks: daily open (midnight UTC), session highs and lows, London open price, floor pivots (R1/R2/R3, S1/S2/S3) from previous day's H/L/C, and cumulative VWAP from midnight with slope and standard deviation.

**VWAP Anchor Levels**

At London (07:00 UTC) and NY (13:00 UTC) opens, if the market makes a strong directional drive in the first 15 minutes (drive range > 1.2 × day's ATR), the price at the session open becomes a VWAP anchor level.

This is not a directional signal. The VWAP itself is irrelevant — what matters is the _price level_ at which the sharp right-angle move originated. That level represents an institutional price decision point: the market agreed at that price and then drove aggressively away from it. Any untouched version of that level (one that today's session hasn't traded back through) is a high-conviction confluence zone.

A fib golden pocket that aligns with an anchor from 3–8 days ago is a particularly strong location because:

1. Many participants anchored positions at that price level
2. The level has been untouched since (unfilled orders still sitting there)
3. Now price is returning to that exact decision point for the first time

Each anchor includes: price, session (LONDON/NY), direction of the drive (UP/DOWN), age in days, and the drive size in dollars.

---

### Confluence Scorer (`confluence_scorer.py`)

For each zone, the scorer checks how many level types cluster near the zone's entry window centre (within ±$3 by default). The score is purely additive — every qualifying confluence adds its weight. Zones are sorted highest-first.

**Level types and weights:**

| Level type | Weight | Notes |
| ---------- | ------ | ----- |
| nPOC (age-weighted) | 2.0 base + 0.1/day, cap 3.0 | Naked POC from a prior session that today hasn't traded through |
| VWAP anchor (age-weighted) | 1.8 base + 0.05/day, cap 2.5 | Session right-angle price level (see Session Engine) |
| HTF bias aligned | 1.5 | Zone direction matches Daily/4H trend |
| Daily open | 1.5 | Today's midnight-UTC open price |
| POC (today) | 1.5 | Current session's highest-volume price |
| Cross-impulse fib cluster | 1.5 | A different impulse's entry window aligns within ±$6 |
| Cross-impulse .886 level | 1.5 | A different impulse's .886 level aligns within ±$4.50 |
| Trendline 3+ touch | 1.8 | Aligned direction only |
| Trendline 2 touch | 1.2 | Aligned direction only |
| Previous day H/L | 1.2 | Yesterday's session high or low |
| HVN | 1.2 | High Volume Node from today's profile |
| Cross-impulse .786 level | 1.2 | A different impulse's .786 level aligns within ±$4.50 |
| VAH or VAL | 1.0 | Value Area High / Low boundary |
| Session H/L | 1.0 | Asia, London, or NY session extreme |
| Floor pivot | 0.8 | Classic Pivot, R1/R2, S1/S2 |
| Cross-impulse .382 level | 0.8 | A different impulse's .382 level aligns within ±$4.50 |

**Cross-impulse fib alignment** is a particularly strong signal: it fires when this zone's entry centre coincides with a significant Fibonacci level from a *different* impulse leg. For example, your H4 long GP sitting at the exact .786 of a D1 impulse is two independent Fibonacci relationships pointing at the same price — that is the confluence that Wyckoff and harmonic traders look for. Variants from the same impulse (GP/.786/.886 siblings) are explicitly excluded from this check to prevent self-scoring.

**Age-weighting explained:** An nPOC untouched for 8 days scores 2.8 (2.0 + 0.8), capped at 3.0 at 10 days. A VWAP anchor from 5 days ago scores 2.05 (1.8 + 0.25). Age weighting reflects the reality that older untouched institutional reference levels carry more unfilled order flow.

A zone scoring **3.0+** is eligible to be armed. A zone scoring **6.0+** with HTF alignment is a prime setup. The bot logs these scores and the full composition list in the console output so you can see exactly what is making each zone significant.

---

### Zone Classification (A / B / C)

Every zone that makes it into the scored list is a legitimate Fibonacci level. The classification exists to give you a fast read on conviction without parsing the full composition list.

| Class | Zone type | What it means |
| ----- | --------- | ------------- |
| **A** | `gp` (.618–.650) | Golden pocket — the tightest, most historically reliable reversal range. Institutions reference the GP more than any single level. If it has any additional confluence, it is a serious setup. |
| **B** | `786` or `886` | Deep retrace — valid in its own right, not a fallback. A .786 or .886 with a naked POC and a pivot aligned is a strong entry location. The stop is wider (further from structure origin) and the retrace was larger, which means the setup requires slightly better VuManChu confirmation than an A zone. |
| **C** | Any variant | The zone's composition contains **no fib-related items** — no cross-impulse cluster, no .786/.886/.382 from another impulse. The only things scoring it are volume and session levels (NPOC, VWAP anchor, pivot, daily open, etc.). Still tradeable if the score is high enough, but weaker conviction because no independent Fibonacci structure is agreeing with it. |

**Practical reading:**

- `A zone, score 7+, HTF aligned` → highest priority. Wait for VuManChu 2/3 minimum.
- `B zone, score 6+, NPOC + cross-fib` → strong setup. Consider requiring 3/3 VuManChu given the wider stop.
- `C zone, score 5+` → take note, keep watching, but do not rush the VuManChu entry. The fib level is there by construction; what is missing is independent confirmation from another impulse.
- Any zone, score < 3 → below arming threshold. The bot ignores it.

The zone ticker in `gold.html` shows a coloured badge for each variant: **GP** (amber), **.786** (purple), **.886** (rose). The class is not stored explicitly — it is derived at read time from `zone_variant` and the composition list.

---

### VuManChu Cipher B (`vumanchu.py`)

Confirmation uses three components evaluated on 5m bars once price is in proximity of a zone. The rule is: **zone first, VuManChu second, entry only if the flow supports what you already expect.**

**Component 1 — WaveTrend (WT1/WT2):**

- Algorithm matches the dashboard's `divergence.js` (HLC3 → EMA(10) → channel index → EMA(21))
- Looking for: divergence between price and WT at the zone (price makes new extreme but WT does not → momentum running out), or WT crossing from overbought/oversold territory

**Component 2 — Money Flow:**

- Volume-weighted directional pressure per bar: `(close − open) / (high − low) × volume`, smoothed with EMA(14)
- **Gold-specific behaviour:** a money flow spike INTO a zone signals exhaustion, not continuation. If sellers (for a long zone) have pushed hard and MF is now rolling over, the selling fuel is running out.

**Component 3 — VWAP Slope Exhaustion:**

- Measures whether the momentum that pushed price INTO the zone is running out of energy — not VWAP position above/below price (that is not the signal).
- The cumulative VWAP series from bar[0] is built, then slope is compared across two windows: early half vs late half of the last 20 bars.
- For a **LONG zone** (expecting price to bounce from support): if the VWAP slope was falling (bearish move into the zone) but is now flattening or turning positive, the sellers are tiring.
- For a **SHORT zone** (expecting price to reject from resistance): if the VWAP slope was rising (bullish move into the zone) but is now flattening or turning negative, the buyers are tiring.
- Returns `EXHAUSTION` (slope fading by 55%+) or `REVERSAL` (slope has actively turned). Both count as aligned — either means the fuel driving price into the zone is running out.

**Entry rules:**

| Components aligned | Result                                            |
| ------------------ | ------------------------------------------------- |
| 3 of 3             | HIGH confidence — entry fires                     |
| 2 of 3             | MEDIUM confidence — entry fires (default minimum) |
| 1 or 0             | LOW — no trade, keep watching                     |

You can raise the minimum to 3 of 3 via `vu_min_components: 3` in config.

---

### Trade State Machine (`trade_state.py`)

```
WAITING   ── no zones armed, scanning price every 3s
    │
    ├─ price enters proximity of scored zone
    ▼
ARMED     ── watching for VuManChu confirmation on 5m
    │
    ├─ VuManChu confirmed (2+ components)
    ▼
TRIGGERED ── paper entry logged (or real order if --live)
    │
    ▼
MANAGING  ── tracking TP1 / TP2 / SL on every price tick
    │
    ├─ TP1 hit → partial close logged, continue managing for TP2
    ├─ TP2 hit → full close, WIN logged
    └─ SL hit  → full close, LOSS logged
    │
    ▼
COOLDOWN  ── 30 min pause before next trade (configurable)
    │
    └─── WAITING
```

One trade at a time. The cooldown prevents revenge entries after a loss.

---

### Journal System (`journal.py`)

Two output files written to `--log-dir` (default: current directory):

**`gold_journal.jsonl`** — one JSON object per line, every event:

```
ZONE_MAP         full zone snapshot on each state refresh
ZONE_APPROACHED  price entered proximity of a zone
ENTRY_SIGNAL     VuManChu confirmed, paper trade opened
TP1_HIT          first partial target reached
TP2_HIT          final target reached
SL_HIT           stop loss hit
ZONE_INVALIDATED zone expired (price closed beyond origin)
SESSION_SUMMARY  end-of-session statistics
```

**`gold_trades.csv`** — one row per completed trade:

```
date, time, zone_id, tf, direction, score, entry, sl, tp1, tp2,
sl_pips, tp1_pips, tp2_pips, rr, close_reason, close_price,
pnl_pips, result, vu_components, vu_confidence, composition
```

**Console output** — formatted zone map on each refresh:

```
──────────────────────────────────────────────────────────────────────
ZONE MAP  09:35 UTC  | HTF BULL (75%)  | LONDON  | VWAP 2308.5
  Vol: POC 2305.5  VAH 2312.0  VAL 2298.5  nPOC stack: 2287.0 (8d) 2274.5 (6d) 2291.0 (3d)
  VWAP anchors: 2306.1 (NY 5d UP) 2319.4 (LON 2d DOWN)
  Daily open 2303.2  Asia 2299.0–2307.5  Pivot 2304.1
  SCORE  TF   DIR    GP ZONE            COMPOSITION
    8.2  H4   LONG   2304.5–2308.0  H4 long GP, nPOC 2306.0 (8d), VWAP anchor 2306.1 (5d), HTF BULL *
    5.1  H1   SHORT  2318.0–2320.5  H1 short GP, VAH, Session H/L
    3.4  M15  LONG   2295.0–2297.0  M15 long GP, Pivot
──────────────────────────────────────────────────────────────────────
[ARMED]  H4_long_2285_2340 score=8.2  price=2305.1  (2.6 pips from GP 2304.5–2308.0)
[ENTRY]  ▲ LONG @ 2305.1  SL 2297.5 (−7.6p)  TP1 2312.7 (+7.6p)  TP2 2320.3 (+15.2p)  R:R 1:2.0  VuManChu 3/3 [HIGH] WT DIVERGENCE_BULL · MF BULLISH_EXHAUSTION · VWAP slope EXHAUSTION
[TP1]    H4_long_2285_2340 @ 2312.7  +7.6 pips (partial close)
[CLOSE]  ✓ H4_long_2285_2340  TP2_HIT  +15.2 pips  → WIN
```

---

## KV Integration

The bot reads from and writes to the dashboard's KV store:

| Key               | Direction | Purpose                                                                                                                                 |
| ----------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ai_goldmodel`    | Read      | Gold macro model (TIPS/BEI/DXY signal). Dashboard pushes this on each FRED refresh. Soft-blocks entries that strongly oppose the model. |
| `gold_bot_config` | Read      | Bot configuration (overrides defaults). Edit via dashboard or direct KV write.                                                          |
| `gold_bot_status` | Write     | Heartbeat: current state, HTF bias, active zones, trades today.                                                                         |

The gold macro gate is a soft block only: it will prevent entry if the macro model is **STRONG** in the opposite direction. A MODERATE or NEUTRAL signal lets the technical setup decide.

---

## Installation

### Prerequisites

- Python 3.11+
- MetaTrader 5 desktop terminal installed and logged in (Windows/Wine)
- Dashboard deployed and accessible (for KV reads and price fallback)

### Step 1 — Install dependencies

From the project root:

```bash
pip install -r Gold/requirements.txt
```

If you already have the main bot's dependencies installed (`bot/requirements.txt`), only `python-dotenv` and `requests` are new — MetaTrader5 is shared.

### Step 2 — Create your `.env`

```bash
cp Gold/.env.example Gold/.env
```

Edit `Gold/.env`:

```env
MT5_ACCOUNT=123456
MT5_PASSWORD=your_password_here
MT5_SERVER=ICMarkets-Demo01
# MT5_PATH=C:\Program Files\MetaTrader 5\terminal64.exe  # only needed if MT5 can't be found automatically

# Leave blank to use the default Railway deployment
# DASHBOARD_URL=https://macrofxmodel-production.up.railway.app
```

### Step 3 — Verify MT5 is connected

In the MT5 terminal: confirm XAUUSD is in your Market Watch and you have historical data downloaded for M1 through D1. If bars are missing the bot will log a warning and skip that timeframe.

The nPOC stack and VWAP anchor detection require ~13 days of M1 bars (~18,500 bars). MT5 downloads these on first run and caches them locally — the initial data fetch may take 30–60 seconds if the history hasn't been accessed recently.

### Step 4 — Verify the dashboard is live

The bot reads the gold macro model from KV. Open `gold.html` in your browser — this triggers a FRED refresh and pushes `ai_goldmodel` to KV. You only need to do this once per session; it refreshes every 30 minutes automatically while the page is open.

---

## Running the Bot

All commands run from the project root (`MacroFXModel/`).

### Watch mode (paper — no real trades)

```bash
python Gold/main.py
```

Logs to the current directory. State refreshes every 120s, price checks every 3s.

### Watch mode with dedicated log folder

```bash
python Gold/main.py --log-dir Gold/logs
```

Creates `Gold/logs/gold_journal.jsonl` and `Gold/logs/gold_trades.csv`.

### Faster state refresh (useful when first watching)

```bash
python Gold/main.py --log-dir Gold/logs --state-interval 60
```

### Single cycle (test that everything connects)

```bash
python Gold/main.py --once --log-dir Gold/logs
```

Runs one state refresh and one price tick then exits. Good for confirming MT5 connection and zone detection.

### Live mode (real MT5 orders — when ready)

```bash
python Gold/main.py --live --log-dir Gold/logs
```

Uses magic number `20260003`. Paper and live never conflict — each bot family has its own magic number.

---

## Configuration

All settings can be overridden at runtime by writing a JSON object to the KV key `gold_bot_config` (via the dashboard's bot-config page or direct KV API). The bot reloads config on every state refresh (every 120s by default).

| Setting              | Default | Description                                            |
| -------------------- | ------- | ------------------------------------------------------ |
| `enabled`            | `true`  | Master kill switch                                     |
| `paper_mode`         | `true`  | No real orders when true                               |
| `zone_tfs`           | `["H4","M30"]` | Timeframes that generate entry zones. H4 finds structural swing anchors (buy zones below price from major lows); M30 adds precision. D1 remains HTF bias only. E.g. `["H4","M30"]`, `["H1","M30"]` |
| `min_zone_score`     | `3.0`   | Minimum confluence score before a zone is armed        |
| `proximity_pips`     | `5.0`   | Price must be within this many $ of the GP zone to arm |
| `vu_min_components`  | `2`     | VuManChu components required for entry (2 or 3)        |
| `risk_pct`           | `0.5`   | % of account balance risked per trade                  |
| `tp1_r`              | `1.0`   | TP1 as a multiple of SL distance (1R)                  |
| `tp2_r`              | `2.0`   | TP2 as a multiple of SL distance (2R)                  |
| `sl_atr_mult`        | `1.5`   | SL = ATR(14) × this if no structural level available   |
| `max_sl_pips`        | `40`    | Hard cap on SL distance                                |
| `max_trades_per_day` | `2`     | Daily trade limit                                      |
| `trade_window_start` | `07:00` | UTC — no entries before this                           |
| `trade_window_end`   | `20:00` | UTC — no entries after this                            |
| `cooldown_minutes`   | `30`    | Pause after each trade close                           |
| `gold_macro_gate`    | `true`  | Block entries opposing the TIPS/BEI/DXY macro model    |

---

## Reading the Logs

### Watching zones form during the day

The zone map prints on every state refresh (default every 2 minutes). Zones are sorted by score, highest first. The `*` marker on a zone means it is aligned with the HTF bias.

```
[8.2★]  H4  LONG   GP 2304.5–2308.0   H4 long GP, nPOC 2306.0 (8d), VWAP anchor 2306.1 (5d NY UP), HTF BULL *
[5.1★]  H1  SHORT  GP 2318.0–2320.5   H1 short GP, VAH, Session H/L
```

**Zone ID format:** `{TF}_{direction}_{swing_low_rounded}_{swing_high_rounded}[_{variant}]`  
Examples:
- `H4_long_2285_2340` — 4H bullish impulse GP zone (.618–.650)
- `H4_long_2285_2340_786` — same impulse, .786 entry window
- `H4_long_2285_2340_886` — same impulse, .886 entry window

The composition list shows exactly what elevated the score. An nPOC label includes its age in parentheses:

- `nPOC 2306.0 (8d)` — this POC has been naked for 8 days and scores 2.8
- `VWAP anchor 2306.1 (5d NY UP)` — NY session drive from 5 days ago, price drove UP from this level

### Understanding the entry log

```
[ENTRY]  ▲ LONG @ 2305.1  SL 2297.5 (−7.6p)  TP1 2312.7 (+7.6p)  TP2 2320.3 (+15.2p)  R:R 1:2.0
         VuManChu 3/3 [HIGH] WT DIVERGENCE_BULL · MF BULLISH_EXHAUSTION · VWAP slope EXHAUSTION
```

- `3/3 [HIGH]` — all three VuManChu components aligned
- `WT DIVERGENCE_BULL` — price was making lower lows but WT turned up (buyers stepping in)
- `MF BULLISH_EXHAUSTION` — the negative money flow spike has rolled over (sellers ran out)
- `VWAP slope EXHAUSTION` — VWAP slope was bearish (falling into the zone) and has now flattened significantly — the selling pressure that drove price down to this level is fading

### End-of-day summary

The bot prints a summary on exit (Ctrl+C) or at the end of a `--once` run:

```
══════════════════════════════════════════════════════════════════════
GOLD BOT — SESSION SUMMARY  2026-05-24
══════════════════════════════════════════════════════════════════════
  Zones detected  : 7
  Zones hit       : 3
  Trades          : 2
  Wins            : 1
  Losses          : 1
  Net pips        : +7.6
  Win rate        : 50%
══════════════════════════════════════════════════════════════════════
```

The same data is written as a `SESSION_SUMMARY` event in `gold_journal.jsonl`.

### Analysing the CSV

`gold_trades.csv` can be opened in Excel or any spreadsheet. Each row is one closed trade. Key columns for evaluating the strategy:

- `score` — was the zone high-scoring? Do high-score trades win more?
- `vu_components` — does requiring 3/3 vs 2/3 improve win rate?
- `tf` — which timeframe's fibs are most predictive?
- `composition` — which level combinations work best?

---

## What to Watch For (First Few Days)

1. **Zone accuracy** — are the zones forming at levels that price actually reacts to? The `ZONE_APPROACHED` events tell you which zones get hit. If high-score zones are being approached and reacted, the zone detection is working.

2. **False arms** — does price enter the zone and then immediately continue through it without reversing? If so, consider raising `min_zone_score` or `vu_min_components`.

3. **VuManChu timing** — is the entry signal firing at the right point (at the zone, on the rejection candle) or too early/late? Check `vu_components` in the entry log. If it's always 2/3 and the missing component is always the VWAP slope, it may mean the slope window is too wide — or the move into the zone is still strong and the bot is correctly holding off.

4. **HTF alignment** — compare win rates for `htf_aligned: true` vs `false` trades in the CSV. If aligned trades significantly outperform, raise `min_zone_score` for counter-HTF zones.

5. **Session timing** — filter the CSV by `time` column. London (07:00–13:00 UTC) and the NY open (13:00–15:00 UTC) tend to produce the cleanest moves on gold.

6. **nPOC and VWAP anchor hits** — note in the journal when a zone's composition includes an aged nPOC or anchor. These tend to be the highest-conviction reversals because there is real trapped order flow at the level.

---

## Magic Numbers

Each bot uses a unique MT5 magic number to avoid order conflicts:

| Bot                                  | Magic    |
| ------------------------------------ | -------- |
| `bot/main.py` (main confluence bot)  | 20260001 |
| `bot/regime_bot.py` (HMM regime bot) | 20260002 |
| `Gold/main.py` (this bot)            | 20260003 |

---

## Trendline Confluence (`modules/trendline_engine.py`)

Detects ascending and descending structural trendlines on H4 and H1 bars by fitting lines through confirmed swing pivot points. A valid line requires at minimum 2 pivot touches.

Each trendline is projected forward to the current bar to get its live price level. If that level falls within ±$6 of a Fibonacci zone's golden pocket centre, it adds to the zone's confluence score — but only when the trendline direction matches the zone's expected trade:

- Ascending trendline at a LONG zone → structural rising support agrees with fib support → +score
- Descending trendline at a SHORT zone → structural falling resistance agrees with fib resistance → +score
- Misaligned trendlines (descending at long, ascending at short) → ignored

| Touches | Score weight |
| ------- | ------------ |
| 2       | 1.2          |
| 3+      | 1.8          |

---

## Adaptive Min Score

The bot compares the current 14-bar M15 ATR to the 100-bar baseline ATR. The ratio (ATR squeeze) detects when gold is in a compression phase — tighter than its recent norm, often preceding a sharp expansion. In compression, the scoring threshold is raised automatically so only the most confluent zones are armed:

| Squeeze ratio | Action                    |
| ------------- | ------------------------- |
| < 0.65        | min score raised by +1.5  |
| 0.65–0.75     | min score raised by +0.75 |
| > 0.75        | normal threshold          |

The squeeze ratio is logged on each state refresh and included in the `gold_bot_status` KV write.

---

## KV Zone Push (`gold_bot_zones`)

On every state refresh the bot pushes a full snapshot to the KV key `gold_bot_zones`. This is the data the dashboard needs to overlay the bot's view on the chart:

```json
{
  "timestamp": "2026-05-24T09:35:00Z",
  "htf_bias": "BULL",
  "htf_confidence": 0.75,
  "session": "LONDON",
  "vwap": 2308.5,
  "bot_state": "ARMED",
  "armed_zone": "H4_long_2285_2340",
  "squeeze_ratio": 0.82,
  "zones": [{ "zone_id": "...", "tf": "H4", "direction": "long",
              "gp_low": 2304.5, "gp_high": 2308.0, "score": 8.2,
              "htf_aligned": true, "composition": [...] }],
  "npoc_stack": [{ "price": 2306.0, "age_days": 8, "date": "2026-05-16" }],
  "vwap_anchors": [{ "price": 2306.1, "session": "NY", "age_days": 5,
                     "direction": "UP", "drive_size": 8.3 }],
  "trendlines": [{ "tf": "H4", "kind": "ascending", "touches": 3,
                   "projected": 2305.2, "slope": 0.12 }]
}
```

---

## Trade Replay (`replay.py`)

Analyses the `gold_journal.jsonl` file to reconstruct performance statistics without needing MT5. Works entirely from the events the bot logged during live observation.

```bash
python Gold/replay.py                                          # uses ./gold_journal.jsonl
python Gold/replay.py --journal Gold/logs/gold_journal.jsonl  # specify path
python Gold/replay.py --date 2026-05-24                       # single day
python Gold/replay.py --csv-out Gold/logs/replay.csv          # export CSV
```

Output includes:

- Per-session table: zones detected, hit rate, entry rate, win rate, net-R
- By-TF breakdown: which timeframe zones perform best
- Composition analysis: which level combinations have highest win rates (min 3 appearances)

The win-rate and R columns let you evaluate whether the zone scoring threshold, VuManChu minimum, or HTF alignment filter should be tightened.

---

## Phase 3 — Planned(done)

- **Structural fib from dashboard levels** — allow user-drawn fibs on the dashboard to push their levels into the zone map alongside auto-detected ones
- **Dashboard chart overlay** — read `gold_bot_zones` KV in `gold.html` and draw active zones, nPOC levels, VWAP anchors, and trendlines directly on the chart

---

## Phase 4 — Future(done)

- **Gold ML Model** — train a binary classifier on the 5Y Gold Lab dataset. Features: regime, TIPS/BEI/DXY z-scores, vol_z, run_length, decay score, OI wall distance, confluence score, VuManChu components. Label: TP hit within 5 days. Deploy as a daily signal that replaces (or gates) the current rule-based direction. The Gold Lab historical reconstruction is the data pipeline for this.

- **Adaptive Parameter Optimiser** — a nightly process that backtests the last 30 days of live data and pushes updated parameters (SL multiplier, min confidence, hold bars, zone score threshold) to KV. Bots pick up the new values on their next config reload cycle and self-tune without a restart.

- **Live Performance Dashboard** — P&L tracking per bot, per pair, per regime, per zone TF. Live win rate vs Gold Lab historical estimate side-by-side. Alerts when live performance diverges from backtest beyond a threshold — early warning of model degradation or regime change that the models haven't adapted to yet.

## Phase 5 — Future

- **Cross-bot Portfolio Layer** — a supervisor process that sees all bots' open positions and enforces portfolio-level constraints. Prevents correlated exposure (regime bot SHORT EUR/USD vs main bot LONG EUR/USD). Unified daily drawdown ceiling across all accounts. Kills the weakest signal when two bots disagree on the same instrument.
