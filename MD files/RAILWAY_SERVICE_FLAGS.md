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

### The heavy end — MEASURED (first real read, 2026-09-19)

A 7.19-hour window (`uptimeSec` 25,879, HMM already off). These are wall times
inside each job, so they overlap and sum past 100%; they are not CPU. But the
ranking is not in doubt, and **it is not the ranking the code-reading below
predicted** — see the correction after the table.

| Service | Runs | Total | Per run | Busy |
|---|---:|---:|---:|---:|
| `fibAtlasPlan` | 566 | **3h16m** | 20.8s on a **45s** timer | **45.4%** |
| `mveLog` | 28 | **2h58m** | **381s** on a 15-min timer | **41.2%** |
| `volatilityV2Plan` | 565 | **2h08m** | 13.5s on a **45s** timer | **29.6%** |
| `oiBot` | 129 | 24m 30s | 11.4s | 5.7% |
| `levels` | 15 | 6m 53s | 27.6s | 1.6% |
| `sessionResearchLive` | 8 | 3m 54s | 29s | 0.9% |
| everything else (40+ jobs) | — | < 1m 30s each | — | < 0.8% |

**Three jobs are 116% of the service's busy time.** Everything else, including
every job the original code-read called "high cost", is rounding error.

**Where the code-read was wrong, and why.** §4's first version ranked by
*ticks × apparent work per tick* and put `hmm5m`/`hmm5mV2` at the top on
frequency alone. Two corrections the measurement forced:

- **`mveLog` was tiered "med" and is #2 at 41% busy.** One cycle takes **six
  and a half minutes**: 1,400 M1 bars per table instrument from OANDA (the bar
  cache is 55s, so a 15-minute cycle always misses) plus VuManChu state across
  three timeframes, six instruments at a time.
  **And it is not the MVE.** `VM` here is VuManChu; the Market Valuation Engine
  (`js/mve/*`) has no background job at all and is computed per request. The id
  `mveLog` stays because `SVC_MVE_LOG` may already be set, but the registry
  label no longer says "Market-valuation-engine". Reading the id as MVE produced
  a wrong recommendation on 2026-09-19 — that this job feeds a
  declared-null engine and could be thinned freely. It does the opposite: it is
  the forward out-of-sample record for `vumanchuLab`, which
  `CLAUDE.md` §5 calls the platform's real gap. Off ⇒ an evidence series that
  cannot be rebuilt afterwards; a longer `VM_LOG_MIN` ⇒ fewer samples per
  60-minute horizon. Making one cycle cheaper is the better lever than either.
- **The two 45-second plan producers each take 10–20 seconds per tick.** A 45s
  cadence where the work costs 20s is self-defeating: the producer is running
  roughly half of all wall-clock time to refresh a ladder that moves slowly.
- `monitor` (1,200 wake-ups/hour, tiered "high") measured **0.32%**. Wake-up
  count is a bad proxy for cost; time per tick is the thing.

The lesson is the one `INFRASTRUCTURE_COST_ANALYSIS.md` §6 already stated:
read the meter, don't rank from the code. The `cost` field in the registry is
still a code-read estimate and should be treated as the weaker signal wherever
`/api/services` disagrees with it.

### The rest — confirmed cheap

The measurement settled this too: 14 econ pollers at 10-min
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
unregistered id, if `server.js` gates on an id the registry has never heard of,
or if a bare `setInterval` reappears in `server.js` — so an unswitchable job
cannot be added by accident.

**Run the suite before you push.** This repo has no CI, so those guards only
fire when someone remembers, and twice now they have caught a job after it had
already landed on `main`:

| Landed | What was missing | What it cost |
|---|---|---|
| `c17cfee` daily snapshot | bare `setInterval`, no row | an hourly job nobody could switch off |
| `a51bd7e` nowcasts | `svcInterval('nowcast', …)`, no row | **the whole site**, ~2h, until `f207ca0` added the row — see below |

The second one is why `svcEnabled` in `server.js` now FAILS OPEN. The registry
throws on an unknown id deliberately (a typo must never read as "off"), but
`svcInterval` is called at module scope, so that throw killed `server.js` on
boot: every route, every node-scheduled job, and then a Railway crash-loop,
because a job that only wanted a flag had none. Now an unregistered id logs
loudly and runs ungated — the same trade `start.sh`'s `svc_on` already made.
The test is where that mistake is supposed to surface, not production.
