# Railway Service Flags — what runs 24/7, and how to switch any of it off

**Added:** 2026-09-15 · **Registry:** [`js/serviceFlags.js`](../js/serviceFlags.js) ·
**Live state:** `GET /api/services` · **Related:**
[`INFRASTRUCTURE_COST_ANALYSIS.md`](INFRASTRUCTURE_COST_ANALYSIS.md) (the memory/cache audit)

---

## 1. The problem this solves

The Railway service is **one container**. `start.sh` supervises eight bot
processes and then `exec`s `node server.js`, which arms **75 background timers**
of its own (48 distinct jobs). Every one of them ran unconditionally: the only way to stop
a job was to edit `server.js` and redeploy a different build. A handful of jobs
had grown their own ad-hoc opt-out var (`VOLATILITY_V2_PLAN_REFRESH`,
`FIB_ATLAS_PLAN_REFRESH`, `CONE_FWD_AUTO`, `SURPRISE_ALERT_AUTO`,
`VM_LOG_ENABLED`, `VM_HEARTBEAT`) with no index anywhere of what existed.

Now every background job is registered in `js/serviceFlags.js`, started through
`svcInterval`/`svcEnabled` in `server.js` or `start_bot` in `start.sh`, and can
be switched off **from the Railway env alone**.

Every legacy var above still works (it is kept as an alias), so nothing already
set in Railway changed meaning.

> **2026-09-16 — the five HMM jobs now default OFF** (`hmm5m`, `hmm5mV2`,
> `hmm1h`, `hmm30m`, `hmm2h`), at the owner's request, after the consumer
> analysis in §5. Every other service still defaults to what it always did.
> A default-off row carries a dated `note` in `js/serviceFlags.js` saying what
> stops working, and `js/serviceFlags.test.mjs` fails if the default-off list
> changes without being updated there. **The live `regime_bot_v2.py` does not
> trade while `hmm5mV2` is off** — see §5.1. `SVC_HMM5M=1` (etc.) brings any of
> them back from the Railway env without a deploy.

---

## 2. How to switch something off

In Railway → the service → **Variables**. Any of these work; the first match wins.

| What you want | Set |
|---|---|
| Turn one thing off | `SVC_SESSION_RESEARCH_FULL=0` |
| Turn several off | `SERVICES_OFF=sessionResearchFull,nasdaqMacroLead,cogShadow` |
| Run the trading/site core only | `SERVICE_PROFILE=lean` |
| Keep one thing despite `lean` | `SERVICE_PROFILE=lean` + `SVC_SESSION_RESEARCH_LIVE=1` |

Accepted values: `0/false/off/no` and `1/true/on/yes`. Anything else is ignored
(treated as "not set") rather than guessed at.

The env var name is always `SVC_` + the service id in upper-snake:
`hmm5mV2` → `SVC_HMM5M_V2`, `botAnalogMotif` → `SVC_BOT_ANALOG_MOTIF`.

Railway restarts the service when you save a variable — check the deploy log:

```
Background jobs  38/56 on — OFF: sessionResearchFull, nasdaqMacroLead, …  ·  see /api/services
```

and for a bot:

```
[supervisor] analogml-motif-track NOT started — service 'botAnalogMotif' is switched off
```

---

## 3. Measure before you cut — `/api/services`

Every gated job is **timed**, and since 2026-09-16 the numbers **survive a
redeploy**. Read the `today` column and cut from the top:

```
curl -s https://macrofxmodel-production.up.railway.app/api/services | jq \
  '.services[] | select(.today.totalMs > 0) | {id, cost, today, window}' | head -40
```

| Field | Means |
|---|---|
| `today` | UTC-day totals (`runs`/`errors`/`totalMs`), persisted to R2 — **this is the one to cut from** |
| `window` | the same, summed over the last 7 stored days |
| `sinceBoot` | this process only, plus `lastMs`/`lastAt`/`busyPct` |
| `jobs`, `intervalsMs` | how many timers the service registers, and each one's period |
| `observable` | `false` for a `start.sh` bot — it runs in its own process, so `started` is `null`, not `false` |
| `persistence` | backend, last flush, days stored, and whether this process is **writing** |

**Why persistence.** The first version kept the counters in the process, and
Railway redeploys on every push to `main` — so on a repo with several pushes a
day the meter reset before it ever measured a day. The first real read after
shipping it showed `uptimeSec: 17` and every row zero. Now the counters flush to
R2 (`ops/service-stats.json`) every `SVC_STATS_FLUSH_MS` (15 min) **and once
more on SIGTERM**, so a deploy costs at most the last few minutes rather than
the whole day. `js/serviceStats.js` owns the merge and is unit-tested, including
the full kill-and-reboot cycle.

**Writes only happen on Railway.** R2 credentials exist in dev sandboxes too, so
the flush is gated on `RAILWAY_ENVIRONMENT`/`RAILWAY_SERVICE_ID`/
`RAILWAY_PROJECT_ID` — absent those it reads but never writes (this is not
hypothetical; a sandbox boot test merged its own numbers into production's
history once while this was being built). `SVC_STATS_PERSIST=1` forces writing
on anywhere, `=0` off, and the boot log says which mode is live. Check it after
a deploy:

```
[service-stats] loaded 3 day bucket(s) from R2 (last update 2026-09-16T19:45:25.254Z)
```

If you instead see `read-only here (not a Railway deploy)`, Railway is not
injecting those vars — set `SVC_STATS_PERSIST=1` and redeploy.

**What it still does not measure.** `busyPct` is wall time, not CPU — a job
awaiting an OANDA response is idle, and the numbers can sum past 100% because
jobs overlap. It covers the scheduled half of `server.js` only: not the eight
`start.sh` bot processes (flag state only), not request-time work from page
loads. Railway's Metrics tab remains the source of truth for total CPU/RAM.

---

## 4. What actually runs 24/7

`cost` below is a **relative ranking of work per hour** read off the code
(ticks/hour × what one tick does: OANDA calls, python spawns, model fits). No £
figure is attached to any row, because none has been measured — see §3. The
registry in `js/serviceFlags.js` carries the same table with the consumer of
each output, which is the thing to check before switching one off.

### The heavy end (where the money plausibly goes)

| Service | Cadence | What one tick does |
|---|---|---|
| `hmm5m` + `hmm5mV2` | **every 30s, each** | 500-bar OANDA fetch **per pair** + an HMM fit, ×2 engines. With 26 pairs that is ~5,000 fetch-and-fit operations an hour, continuously. |
| `sessionResearchFull` | daily | 26 × `python -m SessionResearch.run_study`, each allowed up to **10 minutes**, plus a predict and a report per pair. The single largest scheduled job in the service. |
| `sessionResearchLive` | hourly | 26 python spawns + an export, serially. |
| `volatilityV2Plan`, `fibAtlasPlan` | **every 45s, each** | Rebuild a paper bot's ladder plan off the live cache — 80 wake-ups/hour each. |
| `corrHistory` | every 6h | 5y of H4 bars for every pair; ~3 minutes of solid work per build. |
| `levels` | every 30 min | Full OANDA recompute for every pair, v1 + v2 + a daily HMM fit per pair. |
| `monitor` | every 3s | 1,200 wake-ups/hour. Cheap per tick and early-returns unless alerts are on — but it never sleeps. |
| `tde` | 5 min | Per-pair refresh pulling macro + credit + OI context. |
| 8 bot processes | continuous | Whole Python/Node processes, RAM resident, restarted forever by the supervisor. |

### The rest

Everything else is a clock-watcher or a slow refresh: 14 econ pollers at 10-min
(for series that print once a day), 5 central-bank sentiment engines at 30-min
(each run parses PDFs **and calls the Anthropic API** — that is `ANT_KEY` spend
too), history recorders, Telegram alert scans, QMR gate monitors. Individually
small; collectively ~40 timers.

Full list with consumers: `js/serviceFlags.js`, or `/api/services`.

---

## 5. What to consider switching off

This is a judgement list, not a recommendation to act blindly — only you know
which of these you still look at or trade. Each entry says what you lose.

**Almost certainly safe, meaningful saving**

| Set | You lose |
|---|---|
| `SVC_SESSION_RESEARCH_FULL=0` | The daily full-study rerun. The panel keeps working off the last study and the hourly live refit. The 10-year findings underneath do not move day to day — this is the biggest single cut available. |
| `SVC_NASDAQ_MACRO_LEAD=0` | `nasdaq-macro-lead.html` stops updating. It is self-described "RESEARCH TOOL, NOT A TRADING BOT". |
| `SVC_COG_SHADOW=0` | The COG shadow Telegram calls. Explicitly "Shadow only — no orders placed". |
| `SVC_REGIME_STUDY=0` | A daily rebuild the code itself calls "a cheap keep-warm rather than a schedule anything depends on". |
| `SVC_MVE_HEARTBEAT=0` | One Telegram heartbeat a day. |

**Worth checking first — off only if you are not running the consumer**

| Set | Check |
|---|---|
| ~~`SVC_HMM5M_V2=0`~~ | **Done — now the default.** See §5.1. |
| ~~`SVC_HMM30M=0`, `SVC_HMM2H=0`~~ | **Done — now the default.** Feed `regime_bot_v7.py` only, which `start.sh` does not start. |
| `SVC_VOLATILITY_V2_PLAN=0`, `SVC_FIB_ATLAS_PLAN=0` | Two 45-second loops. Off ⇒ Vote Atlas / Fib Atlas paper bots trade a stale plan. Only off if those paper bots are parked. |
| `SVC_BOT_ANALOG_MOTIF=0` | Its own loop script notes the signal is "no longer surfaced live on the dashboard" — it survives for the Telegram alert and the log. |
| `SVC_CB_SENTIMENT=0` | Five 30-minute pollers **and** the Anthropic calls behind them. Off ⇒ the FOMC/ECB/BoE/BoJ/Beige Book pages stop refreshing after a meeting. |
| `SVC_ECON_POLLERS=0` | 14 timers for daily-at-best data. Off ⇒ the econ pages serve whatever is in KV. (Raising the cadence instead is a code change, not a flag.) |

**Do not switch off while anything is trading**

`eventGate` (the NFP/CPI/FOMC blackout the bots read), `monitor`, `levels`,
`hmm5m`, the live bot processes, and `atlasSnapshots` — that last one exists so
a redeploy gap-fills instead of paying a full multi-year parquet cold start, so
turning it off makes restarts *more* expensive, not less. `tradeLogs` is
similar: off ⇒ the paper bots keep trading but their closed trades stop being
recorded, and that record cannot be reconstructed afterwards.

### 5.1 The HMM five — switched off 2026-09-16, and what it cost

All five default off now. Three of them were load-bearing, and two fail
*silently*, so this is written down rather than left to be rediscovered:

| Job | What stopped |
|---|---|
| `hmm5mV2` | **`regime_bot_v2.py` no longer trades.** It is started by `start.sh` and is live money. `/api/hmm5m-v2` serves `{}` — a 200, not an error — so every pair reads as no-regime, fails `regime not in TRADEABLE`, and sits in `watching`. Nothing alerts. Consider `SVC_BOT_REGIME_V2=0` as well: the process still runs, polls and logs while being unable to act. |
| `hmm1h` | Its E7 "1h opposed" gate is guarded by `if … && h1_regime`, so an empty feed **skips the check** rather than blocking the trade — fail-open. Moot while `hmm5mV2` is also off (the bot never reaches the gates), but re-enabling `hmm5mV2` *without* `hmm1h` restores trading minus one safety gate. **Re-enable the two together.** |
| `hmm5m` | Two things in the live level alerts stop quietly: the polarity-flip direction override (`detectPolarityFlip` reads `state.hmm5mBars`, which only this job fills — a broken-and-retested level keeps its old direction) and the VuManChu M5 reads in the alert text/chart. |
| `hmm30m`, `hmm2h` | Nothing in this container consumes them. Only `regime_bot_v7.py` on the MT5 box would notice. |

Two things this did **not** switch off, worth knowing:

- **`levels` still fits an HMM** — one per pair on daily closes, every 30 min,
  inside the level refresh. It is not separately switchable and must stay on.
- **`regimeHistory`** still runs on its 5-min/hourly flush, but with the HMM
  loops off it has nothing new to persist. Harmless; `SVC_REGIME_HISTORY=0`
  if you want the timer gone too.

### The one-liner

```
SERVICE_PROFILE=lean
```

keeps the live bots, the price monitor, levels, the v1 5m HMM, the event gate,
the macro/FRED caches and the daily vol forecast — and stops the other 40
services. It is the blunt instrument; the table above is the scalpel.

---

## 6. Beyond the flags

Two other things affect the bill that no flag covers:

1. **The image is large.** `COPY . .` puts ~544 MB of tracked files into every
   build — `analysis/` (235 MB), `education/` (64 MB), `AnalogML/` (64 MB) and
   `RegimeOptimizer/` (44 MB) are the bulk, and none of it is needed to *run*
   the service. `.dockerignore` already excludes `VolRangeForecaster/data`; the
   same treatment for the research-output directories would cut build time and
   image storage on every deploy. Left alone here because deciding what is
   safely excludable is a per-directory call, not a mechanical one.
   *(`playwright` — declared in `package.json`, imported by nothing — was
   removed in this change: ~18 MB of `node_modules` and its install time out of
   every build.)*
2. **The caches still leak.** `INFRASTRUCTURE_COST_ANALYSIS.md` §2 documents 25
   TTL caches that never free, which shows up as RAM climbing between deploys.
   Flags do not touch that; `capMap` is the fix already chosen there.

---

## 7. Adding a new background job

Register it in `js/serviceFlags.js` (id, label, cadence, cost, lean, feeds),
then start it with `svcInterval('yourId', fn, ms)` in `server.js` or
`start_bot yourId "label" cmd…` in `start.sh`. `node js/serviceFlags.test.mjs`
fails if a registered service is gated nowhere, if a `start_bot` line names an
unregistered id, or if a bare `setInterval` reappears in `server.js` — so an
unswitchable job cannot be added by accident.
