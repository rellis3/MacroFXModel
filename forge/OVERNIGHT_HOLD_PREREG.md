# overnight-hold — does holding NAS100 or gold only 20:00 → 14:30 UK make money net of real costs, and survive prop rules?

**Pre-registered 2026-10-25. Not blind:** `overnight-hold-backtest.html` has been run before with placeholder costs
(page text and an audit said: real gross effect, net slightly negative on both, breakeven ~1.0× the assumed costs;
none of it was banked). An exit-time sweep (14:30 → 16:30) was added after that first result. This prereg fixes the
honest cost model and the verdict rules before this session computes any honest-cost number. Expectation is written
with that history in view.

| | |
|---|---|
| ID / ledger ids | `overnight-hold-nq`, `overnight-hold-gold` (one per scored instrument) |
| Branch | `claude/overnight-hold-dax-ifo-retro` |
| Register row | `plans/RESEARCH_REGISTER.md` → `overnight-hold` |
| Data | OANDA M1 mid (`VolRangeForecaster/data/m1/{nq,gold}_m1.parquet`, what the engine reads) for fills and MAE; OANDA M1 bid/ask (`data/m1_bidask/{nq,gold}_m1.parquet`) for spreads at the fill minute; OANDA financing snapshot 2026-10-20 (`Oanda Parquet Files/Bid and Ask/instrument_meta_log.parquet`) + FRED DFF for the financing history. Window: **2016-10-24 → 2026-08-21** (bid/ask start → lockbox), both instruments. |
| Seed | `20261025` |
| Uncertainty | stationary block bootstrap over the nightly trade series, mean block 20 trades, B = 10,000 |
| Scripts / outputs | `scripts/overnight-hold/run_engine.mjs` (engine as-is), `scripts/overnight-hold/honest.py` (honest costs) → `analysis/output/overnight-hold/` |
| Harness | the repo engine `js/overnightHoldEngine.js` for trade construction; own script for costs and scoring |

## 1. The claim (required)

C.OG, "Overnight Hold vs Buy & Hold" (`education/bank-verbatim/Overnight-Buy-Hold-Task/PAGE_TEXT.md`), verbatim:

> Enter long at **20:00 UK**, exit at **14:30 UK** the following session. Compare that against simply buying and
> holding across exactly the same window. … NAS100: expect something here … The real question is whether it survives
> costs. XAUUSD: expect much less … this leg is a control.

The task's own verdict rule: "If the effect exists gross and dies net, say so." and "If it breaches on historical
data, assume it breaches live."

## 2. Why it is not already settled (required)

No Evidence Book entry. `reversal-hour` (20–22 UTC reverts) and the `stop-risk` overnight row (1.3R) are adjacent but
neither tests the hold. "august analysis.md" says "gross effect, net negative" from the placeholder run, never banked.

## 3. Definitions, fixed in advance (required)

- **Trades.** `buildOvernightTrades` unchanged: entries Sun–Thu at 20:00 UK (Europe/London, DST-exact), exit 14:30 UK
  next day, last-tick-at-or-before fill within 30 min, exceptions logged. Long only, fixed notional, one at a time.
- **Honest costs (the scored version):**
  - **Spread:** long fills at the ask on entry and the bid on exit, from the bid/ask M1 bar at the fill minute:
    cost = (ask_c − mid)/mid at entry + (mid − bid_c)/mid at exit, mid = (ask_c+bid_c)/2. Missing bid/ask minute →
    nearest prior bid/ask bar within 30 min; still missing → trade dropped and counted.
  - **Financing:** annual long rate r(t) = DFF(t) + markup, markup = |snapshot long rate| − DFF(2026-10-20)
    (NAS100 6.39 − 3.88 = 2.51 pp; XAU 5.32 − 3.88 = 1.44 pp), held constant over history (assumption, stated).
    Charged r/365 per financing day for each 17:00 New York rollover held. **Financing days per rollover** from the
    snapshot's `financing_days_wed`: NAS100 Wednesday = 1 (its weekend charge falls on Friday's rollover, which the
    strategy never holds); XAU Wednesday = 3. Every other held rollover = 1.
  - **Slippage:** none in the scored cell (OANDA retail market fills at the quoted price, practice-account data);
    the engine's default slippage added as a sensitivity cell.
- **Buy & hold, like-for-like:** a CFD long held from the first trade's entry to the last trade's exit, one spread
  round trip, paying the same financing model on **every** calendar day (365 a year).
- **Outcome (scored):** mean net return per overnight trade (%), and annualised net return.
- **Prop check (descriptive, but reported per the task):** the engine's generic ruleset (5% daily loss, 10% trailing
  DD, 8% target in 30 trading days, 30% consistency), run twice: (a) the engine's closed-trade P&L; (b) **intraday
  equity**, where each day's low point = previous close equity × (1 + MAE%/100) is tested against the daily-loss and
  trailing-DD lines. Rolling-start pass rate: start a fresh challenge at every 21st trading day, record pass / fail /
  timeout.
- **Sample split:** first and second halves by date.

## 4. Hypotheses, expectation first (required)

| # | Question | Expectation |
|---|---|---|
| NQ | Mean net return per overnight trade > 0? | **Weak yes or null.** The overnight effect in US indices is well documented gross; honest NQ financing is lighter than assumed (no triple), but rates of 5%+ in 2023–24 cost ~2bp a night |
| GOLD | Same | **No / null** (C.OG's own control leg; gold also pays triple Wednesday) |
| — | **THE GATE (VALIDATED, per instrument)** | bootstrap 95% CI of mean net per trade excludes 0 on the positive side, Holm across the two instruments, and positive in both halves |
| — | **THE MIRROR** | the 14:30 → 20:00 intraday leg (gross), reported; overnight + intraday must reconstruct buy & hold gross within 0.5% compounded (integrity) |

**Verdicts per instrument:** VALIDATED as above. **NULL** if the CI lies entirely below +0.01% per trade (≈ 2.5% a
year at ~250 trades; less than that cannot pay for a prop fee or beat holding). **UNDERPOWERED** otherwise.

## 5. Power (required)

Control-sample SD of nightly gross returns ≈ 1.0% (NQ) and 0.7% (gold) (order of magnitude from the M1 data; no setup
outcome). ~2,000 trades per instrument, block design effect ~1.5 → SE ≈ 1.0/√(2000/1.5) ≈ 0.027% (NQ), 0.019% (gold).
MDE (80%, α 0.025) ≈ 0.08% (NQ), 0.06% (gold) per trade, i.e. ~20% and ~15% a year.

| Cell | n | SD | MDE / trade | NULL bar | Verdict |
|---|---|---|---|---|---|
| NQ net | ~2,000 | ~1.0% | ~0.08% | CI below +0.01% | **UNDERPOWERED for a modest real edge** (a 5–10%/yr effect can't be confirmed); NULL only if the estimate is clearly ≤ 0 |
| Gold net | ~2,000 | ~0.7% | ~0.06% | same | same |

This is stated up front: nightly returns are too noisy for ten years to confirm a few-percent-a-year edge. The
breakeven cost multiple and the prop check are therefore the practical read, reported as descriptive.

## 6. Multiplicity (required)

Scored: NQ and gold mean net per trade, Holm at 0.05. Descriptive: engine-as-is run (placeholder costs), gross,
slippage sensitivity, breakeven multiple, buy & hold comparison, exposure-adjusted return, prop checks, weekday split,
combined book. **The exit-time sweep is extra searching:** it is reported only as "3 exits were tried after the first
result" and never as the scored exit.

## 7. What this does NOT test (required)

Direction prediction; any other entry/exit time; leverage or sizing; a named prop firm's real rulebook (the ruleset
is generic); MT5 broker costs (the bid/ask is OANDA practice); slippage on large size.

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry; a forward paper record before any prop attempt; nothing live.
- **NULL** → ledger null; `overnight-hold-backtest.html` gets a "tested, null net of real costs" banner; "august
  analysis.md" line kept as null with numbers.
- **UNDERPOWERED** → ledger underpowered with the breakeven and prop-check numbers; the page says "gross real,
  net not distinguishable from zero; prop rules: <result>".
- Engine fixes (B&H financing, MAE prop check) are added as options, defaults unchanged (side-by-side rule).

## Amendments

*(none)*

## RESULTS

*In `analysis/output/overnight-hold/RESULTS.md`.*
