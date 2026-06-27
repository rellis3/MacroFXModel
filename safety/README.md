# safety — Trading Safety Layer (Layer A), step A1

The account-aware **risk gate** + global **kill switch** from
`TRADING_SAFETY_LAYER.md`. This is step **A1**: the module, fully tested in
isolation, with **nothing wired into the live bots yet**.

> ### Impact on the running system: none.
> This package is purely additive. It does not import MetaTrader5, does not call
> the dashboard, and is not referenced by any bot, backtester, `server.js`,
> `_worker.js`, or HTML file. The three live bots (RegimeV2, Level, Gold) run
> exactly as before. Wiring it in is a separate, opt-in step you approve later
> (see "Wiring it into a bot", below) — until you do that, this code just sits
> here.

## What's here

| File | Role |
|---|---|
| `kill_switch.py` | Global stop button. File-backed (durable across restarts), **fail-closed** (unreadable state = halted). Modes: `halt` (block new entries) / `flatten` (also signal close). |
| `risk_gate.py` | The one checkpoint every order passes through. Account-level checks: kill switch → stale data → daily-loss → max-DD → idempotency → total-exposure → bucket cap. **Never raises** (errors → deny). |
| `providers.py` | How the gate learns account state. Ships `FakeAccountProvider`; documents the thin MT5 adapter a bot supplies later. |
| `test_risk_gate.py` | Stdlib tests — no pytest/MT5/network needed. |
| `demo.py` | CLI to watch it work with a fake account. |

## Try it (safe — fake account, no broker)

```bash
python -m safety.test_risk_gate      # run the tests
python -m safety.demo simulate       # watch orders get allowed / denied
python -m safety.demo on             # engage the kill switch
python -m safety.demo simulate       # ... now everything is denied
python -m safety.demo off            # release it
python -m safety.demo status         # show kill state + a risk summary
```

State is written under `safety/state/` (gitignored), so running the demo leaves
no trace in the repo and touches nothing else.

## Why this exists

Each live bot grew its own safety logic and they don't agree: the Level bot has
a kill switch + `RiskGuard`; RegimeV2 has a separate `RiskGuardV2` and **no**
kill switch; Gold has **neither**. Worse, every guard measures drawdown from its
**own** baseline — so three bots can each sit inside their individual 3% limit
while the **account** bleeds ~9%, with nothing watching the total.

The RiskGate is the **account-level backstop** those per-bot guards never had,
and the kill switch is the single stop button that today does not exist.

## Wiring it into a bot (opt-in, later — do NOT do this as part of A1)

When you're ready, integration is mechanical and small. In a bot's main loop,
just before it sends an order:

```python
from safety import RiskGate, RiskLimits, KillSwitch, OrderIntent

# once, at startup:
gate = RiskGate(RiskLimits(daily_loss_pct=3.0, max_dd_pct=8.0), KillSwitch())

# before each mt5.order_send(...):
intent = OrderIntent(magic=MAGIC, symbol=sym, side=side, volume=lot,
                     notional=lot * price, bar_time=bar_iso)
decision = gate.check(intent, provider.snapshot())   # provider wraps mt5.account_info / positions_get
if not decision.allowed:
    log.warning("risk gate blocked %s: %s (%s)", sym, decision.reason, decision.code)
    return                                            # skip the send
# ... existing mt5.order_send(...) unchanged ...
```

The bot keeps its own guards; the gate is an extra, account-wide line of
defense in front of them. Recommended rollout per bot: **paper first**, confirm
the gate's allow/deny log matches expectations, then enable on live with minimum
size. Start with the kill-switch check alone (smallest possible change), add the
risk limits once that's trusted.

A future cockpit button flips the same `KillSwitch` (point it at a shared
backend — e.g. the dashboard KV — instead of the local file) so one click halts
every bot at once.

## Deliberately NOT in A1

- No edits to any existing file.
- No MT5 adapter implementation (documented shape only — the bot owns MT5).
- No automatic position flattening (the gate *signals* `flatten`; closing is the
  bot's job, wired later).
- No dashboard/cockpit UI (that's a later Layer A step).
