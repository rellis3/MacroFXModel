# Trading Safety Layer (Layer A) — Spec & Worries

> The first, bounded step toward "the dashboard trades and I watch it." A central
> **risk gate + kill switch + live cockpit** that wraps the bots you **already
> run** — no strategy rewrite, no parallel-run correlation, nothing destroyed.
>
> Companion to `CODEBASE_OVERVIEW.md`, `SYSTEM_ASSESSMENT.md`,
> `TRADABILITY_REVIEW.md`. This doc touches no running code; it is a design to
> think against.

---

## 0. The core idea in one paragraph

You do **not** need to rebuild the strategy engine to get a safe, watchable,
automated system. The strategies are not the problem — the *plumbing around
them* is. Layer A puts one **account-aware safety gate** in front of all order
placement and one **operator cockpit** on top, leaving each bot's logic exactly
as written. It's weeks of bounded work, runs in paper/shadow from day one, and
delivers ~80% of the "automated while I watch" goal. The full engine rewrite
(Layer B) is deferred and may never be needed.

---

## 1. What already exists (and why it isn't enough)

Each live bot has grown its **own** safety machinery, independently. They work,
but they don't agree and there is no account-wide view.

| Capability | Level bot (`bot/`) | RegimeV2 | Gold |
|---|---|---|---|
| Kill switch | ✅ `config.kill_switch`, checked every tick (`main.py:1355`) | ❌ none | ❌ none |
| Risk guard | ✅ `RiskGuard` — DD 3%, per-pair cooldown, **persisted across restarts** | ✅ `RiskGuardV2` — *"completely separate from V1"* (`regime_bot_v2.py:475`) | ❌ only `max_trades_per_day` / `cooldown_minutes` |
| Trade window | ✅ `within_trade_window()` | partial | partial |
| Staleness gate | ✅ `check_staleness()` → refresh | partial | partial |
| Dashboard override | ✅ `bot_override.force_unlock` | ✅ own `force_unlock` | ❌ |
| Orphan reconciliation | ✅ bootstraps trail from existing SL by magic (`position_manager.py:84`) | partial | partial |
| Config source | KV `bot_config` | own KV key | KV `gold_bot_config` |
| Paper-mode default | ✅ | ✅ | ✅ |
| **Account-level risk** | ❌ tracks only its own DD baseline | ❌ own baseline | ❌ |

**The pattern that matters:** the Level bot already proves the mechanism we need
— a KV flag (`kill_switch`) polled every tick that halts trading in <30s, plus a
dashboard `force_unlock` round-trip. Layer A is mostly **generalizing what the
Level bot already does** to all three bots and lifting risk to the **account**
level.

---

## 2. The worries (the real risk in the current setup)

These are concrete gaps, grounded in the code above.

### W1 — There is no global "stop everything" button
Halting all trading today means editing **three different KV keys**, and **two
of the three bots have no kill switch at all**. In a fast market or a bug, you
cannot stop the system in one action. *This is the single most important gap.*

### W2 — Risk is per-bot, so the account is unprotected
Each `RiskGuard` measures drawdown from **its own** baseline. Three bots on one
MT5 account can each sit happily inside their individual 3% DD limit while the
**account bleeds ~9%** — and nothing is watching the total. There is no
account-wide daily-loss limit, no total-exposure cap, and no correlation cap
(carry/momentum/gold/FX are largely the same risk-on bet — see
`SYSTEM_ASSESSMENT.md` §2.4).

### W3 — Coverage is inconsistent
Gold has no drawdown lockout. RegimeV2 has no kill switch. "The safety net"
has holes that depend on which bot you're looking at, and you have to remember
which.

### W4 — Order idempotency across restarts is unproven
Orders go out via `mt5.order_send` with a `magic` + `comment` but **no unique
client order id / dedup key**. A crash mid-entry, then the bash supervisor's
30s restart (`start.sh`), could in principle re-submit. `position_manager`
reconciles *open* positions by magic on restart (good, partial), but the
*entry* path has no idempotency guard.

### W5 — Reconciliation is per-bot, not account-wide
On restart each bot only sees positions matching **its own magic**. Nothing
reconciles the whole account (e.g. a manual trade, a position from a retired
bot, or a fill that landed during downtime).

### W6 — No single source of truth for "what is the system doing right now"
State is scattered: per-bot KV configs, `push_bot_status` to `/api/bot/status`,
log files, MT5 itself. There is no one screen that answers *"what's open, why,
how much risk am I using, and can I stop it?"* — which is precisely the
"watch it trade" capability you want.

### W7 — The browser is (still) partly in the live path
`state_reader.py` pulls `ai_goldmodel` and per-pair ARIMA that are *"pushed by
browser on each alert tick."* A bot can run on stale model data if no tab is
open. Layer A doesn't fix this (that's Layer B), but the **staleness gate** must
treat browser-sourced inputs as expirable so the gate blocks rather than trades
on stale data. *Tracked, not solved, by Layer A.*

---

## 3. Layer A design

Three components. None rewrites a strategy.

```
                 ┌─────────────────────────────────────────┐
   bots          │   RegimeV2      Level bot      Gold       │
 (unchanged) ───►│   strategy      strategy       strategy   │  produce OrderIntent
                 └───────────────────┬─────────────────────┘
                                     ▼
                 ┌─────────────────────────────────────────┐
   Layer A       │   RISK GATE  (account-aware, one impl)    │  ◄── global kill switch
  (new, small)   │   • global kill switch                    │      (one KV flag)
                 │   • account daily-loss + max-DD lockout   │
                 │   • total exposure + correlation cap      │
                 │   • idempotency (client order id dedup)   │
                 │   • news/window blackout                  │
                 └───────────────────┬─────────────────────┘
                                     ▼ (paper OR live — one flag)
                                 mt5.order_send
                                     │
                 ┌───────────────────┴─────────────────────┐
   Cockpit       │  read-only over MT5 + gate state:         │
 (new screen)    │  open positions · P&L · risk budget ·     │
                 │  per-trade "why" · kill switch · paper/live│
                 └─────────────────────────────────────────┘
```

### 3.1 The Risk Gate (the heart of Layer A)

A single module (`safety/risk_gate.py`) that **every** order placement calls
before `mt5.order_send`. It is the one place that can say no.

Pre-trade checks (in order, fail-closed):
1. **Global kill switch** — one KV key `global_kill`. If true → reject all.
2. **Account daily-loss limit** — measured from the **account** equity at the
   UTC day boundary, across *all* magics. Breach → lock all trading until reset.
3. **Account max-DD lockout** — peak-to-trough on account equity.
4. **Total exposure cap** — sum of notional / margin across all bots ≤ ceiling.
5. **Correlation / effective-bets cap** — reject a new position that pushes
   net directional risk (e.g. total "long risk-on") past a limit. Start crude
   (sum of signed risk by bucket: USD, risk-on, gold) and refine later.
6. **News / trade-window blackout** — one shared calendar, not per-bot.
7. **Idempotency** — every intent carries a `client_order_id`
   (`f"{magic}:{symbol}:{bar_time}:{side}"`); the gate refuses a duplicate
   within a TTL. Kills the W4 double-submit risk.

Post-fill:
8. **Account-wide reconciliation on startup** — read *all* MT5 positions,
   compare to expected state, log/alert on mismatch (fixes W5).

Design notes:
- **Fail-closed:** if the gate can't evaluate (stale data, KV unreachable), it
  **rejects**, it doesn't pass.
- **Paper/live is one flag on the gate**, not three flags in three bots. In
  paper mode the gate logs the would-be order and never calls `order_send` —
  this is exactly how you shadow-run safely.
- **One implementation.** The three bots' `RiskGuard` / `RiskGuardV2` /
  Gold-cooldown logic gets *thin-shimmed* to call the shared gate. Per-bot
  guards can stay as a first line; the gate is the account-level backstop they
  never had.

### 3.2 The global kill switch — how it reaches a running bot

No new infrastructure required; generalize the Level bot's proven pattern:
- Dashboard writes KV `global_kill = true` (one button, one key).
- Every bot already polls KV each loop. Add the same `if global_kill: halt`
  check the Level bot has at `main.py:1355` to RegimeV2 and Gold (~10 lines
  each). Effect within one tick (≤30s; faster if we also drop the price-tick
  interval check).
- **Hard stop option:** kill switch can additionally flatten — gate issues
  close orders for every open position across all magics, then locks. (Make
  this a separate "flatten & halt" button vs. "halt new entries only.")
- **Out-of-band backstop:** because all bots share one MT5 account, a manual
  "close all + disable algo" at the broker is always the ultimate kill. Document
  it; the software switch is for speed and automation, not the only line.

### 3.3 The cockpit (the "watch it" screen)

One focused operator view (new, or a dedicated tab in `index.html`), reading
from MT5 + gate state — **read-only except the two controls**:

- **Open positions** — symbol, side, size, entry, live P&L, SL/TP, which bot
  (magic), age.
- **Account risk budget** — daily P&L vs. daily-loss limit, current DD vs.
  max-DD, total exposure vs. cap, net directional risk by bucket. Bars that go
  red as you approach a limit.
- **Per-trade "why"** — the signal provenance for each open trade
  ("regime=BULL conf 0.72 × session 1.1, macro tier +6, confluence ⭐⭐⭐").
  Bots already compute this; surface it instead of burying it in logs.
- **Pending intents / recent gate rejections** — "Gold LONG XAU rejected:
  exposure cap" so you can see the gate working.
- **Controls (the only writes):** the global kill switch (halt / flatten+halt)
  and the paper⇄live toggle.

---

## 4. Build order (each step is risk-free on its own)

| Step | What | Risk | Effort |
|---|---|---|---|
| A1 | `safety/risk_gate.py` skeleton + **global kill switch** wired into all 3 bots | none (paper) | small |
| A2 | Account-level daily-loss + max-DD lockout (reads account equity across magics) | none (paper) | small |
| A3 | Idempotency (client order id dedup) + startup account-wide reconciliation | none | small |
| A4 | Total-exposure + crude correlation/net-risk cap | none (paper) | medium |
| A5 | Cockpit screen (read-only + the two controls) | none (read-only) | medium |
| A6 | Route all 3 bots' entry path through the gate (shim per-bot guards) | low — paper first, then live with min size | medium |

Everything before A6 is observe-only; nothing changes what trades. A6 flips
the gate from "watching" to "in the path," and even then paper-first → min-size
live. No cutover cliff, nothing deleted.

---

## 5. What Layer A deliberately does NOT do

- It does **not** rewrite or merge the strategy engines (that's Layer B).
- It does **not** remove the per-bot guards — it backstops them at the account
  level. Defense in depth.
- It does **not** fix the browser-in-the-loop data path (W7) — it only makes
  the gate **fail-closed** on stale browser-sourced inputs so you don't trade
  on them.

The point: get a single stop button, an account-wide risk backstop, and a
screen to watch it on — **without betting the working system on a rewrite.**

---

*Grounded in a direct read of `bot/main.py`, `bot/position_manager.py`,
`bot/utils/state_reader.py`, `RegimeV2/regime_bot_v2.py`, `Gold/main.py`, and
`start.sh`. Line references are to the state of the repo at the time of writing.*
