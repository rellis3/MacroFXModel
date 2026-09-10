# Live ↔ Backtest Alignment Contract

> **Foundations doc — written 2026-09-10, before any code changed.** The trigger
> was wanting a COG-style audit terminal ("is the live book meeting its expected
> distribution?"). That question turned out to be unanswerable with what we
> currently store, and the reason is structural, not cosmetic. This lays out what
> has to be true before that terminal can exist.
>
> Companions:
> - `PYTHON_LEGO.md` §7 — the wire contract this extends (config in, status out).
> - `LEGO_MODULES.md` §3 — the live≠backtest drift register. This doc is the
>   general rule; drift #8 (`CONFLUENCE_LIVE_VS_BACKTEST.md`) is the worked
>   instance that proves the shape works.
> - `REFERENCE_ENGINE_PLAYBOOK.md` — how to build the reference layer *underneath*
>   a strategy. That doc deliberately stops before anything trade-shaped; this
>   one starts there.

---

## 1. The one-sentence version

**Every closed trade — live or simulated — must be expressible as the same record
in the same unit with the same costs applied; and every backtest must freeze the
return distribution it expects, so the live book can be ranked *inside* that
distribution rather than merely plotted next to it.**

Everything below is what currently prevents that.

---

## 2. Why this isn't already true

Evidence inline. Nothing here is speculative — each claim has a file:line.

### 2.1 The unit gap: money vs risk

| | **LIVE** | **BACKTEST** |
|---|---|---|
| Producer | `pylego/broker/mt5.py:378-402` | `pylego/portfolio_sim.py:8-13` |
| Record | `{position_id, symbol, direction, lots, open_price, close_price, profit, swap, commission, time_open, time_close, tz_offset_sec, comment, mfe_pips, mae_pips, reason}` | `{pair, entry_date, exit_date, r}` (+ optional `size_mult`) |
| Unit | account currency | R-multiples on fractional equity |
| Costs | real (broker-charged) | modelled, or absent |
| Risk taken | **not recorded** | the denominator |

The live record has money and no risk. The backtest record has risk and no money.
**Neither converts into the other.** Every metric we would want to compare —
expectancy, Sharpe, Calmar, the whole `js/backtestStats.js` battery — is defined
on one unit or the other, so today the two books cannot be put on the same axis
at all. This is the root problem; §2.2–§2.4 are its consequences.

### 2.2 The blocking field: stop distance is never stored

`serialize_open_positions` (`pylego/broker/mt5.py:288-315`) and
`serialize_closed_trades` (`:378-402`) both omit `sl` and `tp`. MT5's own
position object carries `p.sl` / `p.tp` and we drop them on the floor.

Without the stop at entry there is no denominator, so **no live trade can be
expressed in R**, so no live trade can be compared to any backtest we have ever
run.

⚠ **This is not a one-line fix, and assuming otherwise will cost a day.** MT5
*deals* (what `history_deals_get` returns, and what the closed-trade serializer
walks) carry no `sl`/`tp` at all — only *orders* and *live positions* do. So the
stop must be captured at OPEN time and carried forward onto the close record, or
reconstructed via `history_orders_get`. Decide which before writing code: the
capture-at-open path is more robust but needs somewhere to persist across a bot
restart, and per `project_bot_config` several of these bots restart often.

### 2.3 No capital base, and no history of one

- **14 of 18 bots push `balance`** in their status payload (`bot/main.py:1798`,
  `RegimeV2/regime_bot_v2.py:870`, `volatility_bot_v2`, `fib_atlas_bot`,
  `oi_bot`, …). **Gold, GoldV2, ConfluenceBot and backtestSystem do not.**
- But `<bot>_status` is **overwritten every push and written with a 48h TTL**
  (`_worker.js:1057`). So `balance` is a snapshot with a two-day half-life.
  Verified: there is **no balance/equity time series anywhere in the repo**.
- `DrawdownThrottle` persists a *scalar* whole-life peak
  (`pylego/drawdown_throttle.py:70-78`) — the drawdown magnitude, never the curve.
- **Even a perfect series would not be a per-bot denominator.** MacroFX, RegimeV1
  and RegimeV2 all trade account 10011001704. Account balance is a *shared*
  quantity; per-bot return % needs a **declared notional allocation**, which is a
  config field that does not currently exist.

So: yes, the bots already report balance — the gap is that nothing keeps it, and
what they report is not attributable to one bot anyway.

### 2.4 Costs we already pay for and never read

`commission` is in the §7 contract, *is* emitted by the serializer, and *is*
persisted by `mergeTradeHistory` (`_worker.js:84-105`) — and is read by nothing.
Zero occurrences in `bot-config.html` or `js/bot-config.js`. Every "Net" on the
dashboard is `profit + swap` (`bot-config.html:8977`, `:8998`).

Same story for `mfe_pips`, `mae_pips` and `reason` (sl/tp/manual): emitted by
`pylego/broker/mt5.py:395-402`, stored in KV, rendered nowhere.

**Consequence for this project specifically:** any live-vs-backtest comparison
run today would put a *gross-ish* live number against a *modelled-cost* backtest
number and read the difference as edge decay. It would be measuring our own
bookkeeping.

### 2.5 The contract is behind the code

`PYTHON_LEGO.md` §7 is marked NON-NEGOTIABLE but predates `mfe_pips`, `mae_pips`
and `reason`. A contract the code has quietly outgrown has stopped being a
contract. Whatever we add below goes into §7 *in the same commit as the code*, or
we are just adding the next three undocumented fields.

---

## 3. The target: one record, two producers

The bridge field is **`r`**, and it must be computed by **one shared brick** used
by both producers — never once in Python and once in JS
(`REFERENCE_ENGINE_PLAYBOOK.md` §3.4: two engines computing the same formula two
ways is worse than one engine not having it).

| Field | Live fills from | Backtest fills from | Why it is needed |
|---|---|---|---|
| `symbol` `direction` `time_open` `time_close` | MT5 | sim | join key / calendar |
| `entry` `exit` | fill prices | modelled fill | price truth |
| `sl_at_entry` | **NEW** — `p.sl` at open | the stop the rule set | the R denominator |
| `tp_at_entry` | **NEW** — `p.tp` at open | the target the rule set | did we take the same trade? |
| `r` | derived, shared brick | native | **the common unit** |
| `profit` `swap` `commission` | MT5 | cost model | net truth, both sides |
| `risk_amount` | **NEW** — currency at risk at entry | `risk_pct` × equity | the money ↔ R bridge |
| `mfe_pips` `mae_pips` | already emitted | already computable | stop/target calibration |
| `reason` | already emitted | barrier that hit | exit-mix comparison |
| `tz_offset_sec` | already emitted | `0` | see T6 |

Three new live fields. Everything else already exists on one side or both.

---

## 4. The three artifacts

### 4.1 The extended trade record
As §3. Lives in `pylego/broker/mt5.py` — one place, since every bot but four
routes through it — and lands in `PYTHON_LEGO.md` §7 in the same commit.

### 4.2 The equity series — `equity_<bot>_<YYYY-MM>` (new, permanent)
One append-only row per bot per day: `{date, balance, equity, allocation,
open_risk, peak}`.

Must be on the permanent list in **both** gates — `kv.js` `_CF_EXACT` **and**
`_worker.js` `PERMANENT_KEYS`/`PERMANENT_PREFIXES` — or it silently inherits the
48h TTL and the curve is lost with no error and no 403 (see
`feedback_kv_second_ttl_gate`; this is precisely the failure that rule exists
for). Monthly bucketing, not daily: `/api/trade-history`'s
one-read-per-(bot × date) shape already caps at 90 days and will not carry a
multi-year curve.

`allocation` is the declared per-bot notional from §2.3, stored **on the row**
rather than looked up at render time, so a later re-allocation cannot
retroactively rewrite history.

### 4.3 The expectation snapshot — `expect_<bot>` (new, permanent, **frozen**)

What the backtest said *before* the bot went live:

```
{ bot, engine_version, frozen_at, sample: {from, to, n_trades},
  oos_split, cost_model: {...what was charged...},
  r_series: [...],                     # the raw stream, so it can be re-bootstrapped
  expected: { sharpe: {p1,p5,p25,p50,p75,p95,p99}, ... maxDD, PF, winRate } }
```

`js/backtestStats.js` already produces every number in `expected` — bootstrap CIs
on return and Sharpe, MC drawdown percentiles, probabilistic and deflated Sharpe.
This artifact is not new maths. It is **freezing and versioning** maths we already
run.

---

## 5. What changes on the backtest side

Less than it sounds, and there is precedent. `LEGO_MODULES.md` §3 drift #8 steps
1–3 already made the Asia-range backtest record `live_stars` /
`live_signal_score` / `live_grade` per trade via the *same* shared code the live
path uses. That is exactly this shape, done once, for one engine.

Generalise it symmetrically:

- **The backtest records what the live bot would have said** (grade, size, gates
  hit) — already the drift-#8 pattern.
- **The live book records what the backtest would have measured** (`r`,
  `sl_at_entry`, `risk_amount`) — the new half.

Then every backtest that will back a live bot emits `{r, entry_date, exit_date,
sl, tp, cost_applied}` per trade, and freezes an `expect_<bot>` on the run that
authorised deployment.

---

## 6. Adoption order

Each step is independently useful; stop anywhere.

1. **Read the costs we already store.** Add `commission` to Net across the
   dashboard. Corrects numbers we are currently making decisions on. No new
   plumbing.
2. **Surface `mfe_pips` / `mae_pips` / `reason`.** Already in KV. Gives the
   stop/target calibration panel for free.
3. **Capture `sl_at_entry` / `tp_at_entry` / `risk_amount`** in
   `pylego/broker/mt5.py` (plus the four non-pylego bots). Update §7 in the same
   commit. From here on, live trades have an R.
4. **Add the allocation config field and the daily `equity_<bot>_<YYYY-MM>`
   writer.** Unlocks return %, drawdown-from-peak, monthly heatmap, real
   Sharpe/Calmar.
5. **Freeze `expect_<bot>` for one bot** — the one with the most live trades —
   and build the percentile-rank panel against it. This is the step that turns a
   tearsheet into an audit terminal.
6. Backfill R for historical trades **only where the stop is genuinely
   recoverable** from `history_orders_get`. Where it is not, leave it null and say
   so — see T3.

Steps 1–2 are hours. Step 3 is the real work. Steps 4–5 are small once 3 lands.

---

## 7. Traps to design against from day one

**T1 — Regenerating the expectation after seeing live results.** If a bot
underperforms and we re-run the backtest and re-freeze `expect_<bot>`, the test is
destroyed. It is the *same* error as training on the full sample — the penalty
taker already knows which way you dived. `frozen_at` + `engine_version` exist to
make a re-freeze visible; a re-freeze is allowed, but it starts a **new
expectation with a new start date**, never a silent overwrite of the old one.

**T2 — Comparing gross to net.** Costs must be applied on the same side of the
comparison at the same granularity. Until step 1 lands, every comparison is
measuring our bookkeeping (§2.4). The `cost_model` block on the snapshot exists so
a later reader can tell what was charged.

**T3 — Population, not output.** When R is backfilled, some trades will have a
recoverable stop and some will not. If the ones that do not are silently dropped,
the survivors are biased toward whatever kind of trade keeps clean order history —
and a long-lived position whose stop was trailed is exactly the kind that goes
missing. Report the drop rate at every filter, not just the surviving stats. Same
trap as `REFERENCE_ENGINE_PLAYBOOK.md` §6.7, and the reason that section exists.

**T4 — Sample size.** A Sharpe on 42 trades has a confidence interval wide enough
to be uninformative. Show `n` beside every metric and suppress, or visibly
qualify, anything below threshold. The percentile-rank framing of §4.3 is the
right primary display *precisely because* it refuses to treat the live number as a
point estimate.

**T5 — The shared-account trap.** Never divide by account balance to get a per-bot
return; three bots share 10011001704 (§2.3). Always the declared allocation,
always read off the row.

**T6 — Broker clock.** Already solved once, via `tz_offset_sec` +
`pylego/broker/clock.py`. Do not solve it a second way for the equity series or
the R backfill — MT5 range queries need `ServerClock.to_server()` too, and
`project_broker_clock_offset` lists what is still open.

**T7 — Two R formulas.** `r` must come from one shared brick called by both
producers. The moment Python and JS each compute their own, they will disagree on
partial fills, multi-leg exits and trailed stops, and nobody will know which
number to trust.

---

## 8. Checklist for a new bot (extends `PYTHON_LEGO.md` §7)

A bot is not "done" until, in addition to §7's three:

4. Its closed-trade records carry `sl_at_entry`, `risk_amount` and a computed `r`.
5. It writes a daily row to `equity_<bot>_<YYYY-MM>` with its declared allocation.
6. The backtest that authorised it has a frozen `expect_<bot>`, with the cost
   model that was applied recorded on it.

Without 4–6 a bot can be watched, but it cannot be **audited** — we would be able
to say it lost money, never whether losing that much was within what it was
supposed to do.
