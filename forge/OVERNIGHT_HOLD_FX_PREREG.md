# overnight-hold-fx — does the same overnight hold (long 20:00 → 14:30 UK) make money on GBPUSD and USDJPY net of real costs?

**Pre-registered 2026-11-08, before any FX outcome was computed.** Not blind to the rule: the rule was banked on NAS100
and gold (`overnight-hold-nq`, `overnight-hold-gold`, both UNDERPOWERED, net +6.0% / +4.0% a year, below buy & hold).
No overnight-hold number has ever been computed on any FX pair in this repo (Evidence Book and register checked
2026-11-08). The owner asked for the two FX pairs shown in C.OG's Data Terminal demo book (GBPUSD, USDJPY) to sit
beside NAS100 and gold: same rule, same costs, same page, judged on their own.

| | |
|---|---|
| ID / ledger ids | `overnight-hold-gbpusd`, `overnight-hold-usdjpy` (one per scored pair) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `overnight-hold-fx` |
| Data | OANDA M1 mid (`VolRangeForecaster/data/m1/{gbpusd,usdjpy}_m1.parquet`, what the engine reads) for fills and MAE; OANDA M1 bid/ask (`data/m1_bidask/{gbpusd,usdjpy}_m1.parquet`, from 2016-10-21) for spreads; OANDA financing snapshot 2026-10-20 (`Oanda Parquet Files/Bid and Ask/instrument_meta_log.parquet`); overnight rates: FRED DFF (`analysis/output/overnight-hold/dff.csv`), SONIA (`analysis/output/xccy-basis/rates/IUDSOIA.json`), BoJ TONA (`analysis/output/xccy-basis/rates/BOJ_STRDCLUCON.csv`). Window **2016-10-24 → 2026-08-21** (same as the banked legs: bid/ask start → lockbox). |
| Seed | `20261108` |
| Uncertainty | stationary block bootstrap over the nightly trade series, mean block 20 trades, B = 10,000 (as banked) |
| Scripts / outputs | `scripts/overnight-hold-fx/` → `analysis/output/overnight-hold-fx/` |
| Harness | the repo engine `js/overnightHoldEngine.js` for trades (unchanged); own script for costs and scoring, a copy of `scripts/overnight-hold/honest.py` with the FX financing model |

## 1. The claim (required)

C.OG's task (`education/bank-verbatim/Overnight-Buy-Hold-Task/PAGE_TEXT.md`) names NAS100 and XAUUSD only. The FX
legs are ours: the owner noticed GBPUSD and USDJPY in the scope tabs of C.OG's Data Terminal demo book (illustrative
data) and wants all four buy-and-hold books together. The claim tested is the task's claim carried to two more
markets: long 20:00 → 14:30 UK beats nothing (net > 0), and is compared with buy & hold on the same footing.

## 2. Why it is not already settled (required)

Nearest entries: `overnight-hold-nq` / `-gold` (the same rule, other markets), `overnight-vol-regime` (conditioning,
NQ/gold), `trend-following` (FX direction null, a different rule), `reversal-hour` (20–22 UTC reverts; adjacent hour,
not the hold). None scores the hold on FX. This is a new market, not a re-cut of a banked null.

## 3. Definitions, fixed in advance (required)

- **Trades.** `buildOvernightTrades` unchanged: entries at 20:00 UK (Europe/London, DST-exact), exit 14:30 UK next
  session, last-tick-at-or-before fill within 30 min, no Friday entry, exceptions logged. **Long the pair as quoted**
  (long GBP vs USD; long USD vs JPY), fixed notional, one at a time. The run uses NQ's M1 as the overlap partner so the
  window is the banked one.
- **Spread:** long buys the ask at entry and sells the bid at exit at the fill minute; nearest prior bid/ask bar within
  30 min; still missing → trade dropped and counted. (Identical to the banked legs.)
- **Financing (FX, OANDA convention):** annual long rate r_long(t) = base(t) − quote(t) − m, where base/quote are the
  overnight rates (GBP = SONIA, USD = DFF, JPY = TONA, each forward-filled) and the markup m is fixed from the snapshot:
  m = base(2026-10-20) − quote(2026-10-20) − financing_long_rate. Held constant over history (assumption, as banked).
  Per rollover held: r_long/365 × days, days = 3 on Wednesday (snapshot `financing_days_wed` = 3 for both), else 1.
  Positive r_long is a **credit** (cost < 0), which the banked index/metal legs never had.
- **Buy & hold, like-for-like:** a CFD long from the first trade's entry to the last trade's exit, one spread round
  trip, the same financing model on every calendar day.
- **Outcome (scored):** mean net return per overnight trade (%). Annualised net, CAGR, Sharpe, max DD reported.
- **Decomposition (descriptive):** net = price return (gross) − spread + financing credit/cost, each reported, so a
  positive net that is all carry is labelled carry, not an overnight effect.
- **Prop check (descriptive):** the banked rolling-start intraday-equity check at 1×.
- **Mirror (descriptive):** short at the same times, gross and net with the short financing rate (snapshot short rate,
  same construction), to show how much of the long result is the pair's trend over the decade.
- **Halves:** first and second halves by date.

## 4. Hypotheses, expectation first (required)

| # | Question | Expectation |
|---|---|---|
| GBPUSD | Mean net per overnight trade > 0? | **Null.** No risk premium in a currency pair; the pair fell over the decade; GBP–USD carry near zero to slightly negative; spread at 20:00 UK is wider than in London |
| USDJPY | Same | **Positive estimate, mostly carry**, not confirmed: USD–JPY differential paid ~2–5% a year 2017–19 and 2022–26; overnight price drift itself expected ~0 |
| — | **THE GATE (VALIDATED, per pair)** | bootstrap 95% CI of mean net per trade excludes 0 on the positive side, Holm across the two pairs, positive in both halves |
| — | **THE MIRROR** | integrity: overnight legs × every exit→next-entry leg reconstructs buy & hold gross (as banked A1); plus the short leg above |

**Verdicts per pair:** VALIDATED as above; **NULL** if the CI lies entirely below +0.01% per trade; **UNDERPOWERED**
otherwise. (The banked rule, unchanged.)

## 5. Power (required)

Nightly SD of FX overnight returns ≈ 0.35–0.5% (order of magnitude; no outcome computed). ~1,950 trades per pair,
design effect ~1.5 → SE ≈ 0.45/√1,300 ≈ 0.012%; MDE (80%, α 0.025) ≈ 0.035% per trade ≈ 9% a year. A modest edge
(a few % a year) cannot be confirmed; NULL is reachable only if the estimate is clearly ≤ 0. Stated up front.

| Cell | n | SD | MDE / trade | NULL bar | Verdict reachable |
|---|---|---|---|---|---|
| GBPUSD net | ~1,950 | ~0.45% | ~0.035% | CI below +0.01% | NULL if mean ≲ −0.015%; VALIDATED only for ≳ 9%/yr |
| USDJPY net | ~1,950 | ~0.45% | ~0.035% | same | same |

## 6. Multiplicity (required)

Scored: GBPUSD and USDJPY mean net per trade, Holm at 0.05 across the two. NAS100 and gold are **not** re-scored
(banked). Descriptive: engine-as-is run, gross, decomposition, mirror short, buy & hold, prop check, weekday split,
combined books (NQ+gold as banked; all four, quarter each). No exit-time, entry-time or filter variants are run on FX.

## 7. What this does NOT test (required)

Any other FX pair; short-only or direction choice by carry (a carry strategy is a different question); other
entry/exit times; the vol-regime filter on FX (not scored; the page's filter is shown on FX only as description);
the owner's account costs on FX (cost-verification measured NAS100/gold only); MT5 spreads.

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry; forward paper record before anything live.
- **NULL / UNDERPOWERED** → ledger entry with the decomposition; the real-costs page shows the pair beside NAS100 and
  gold with its verdict. Nothing live changes either way.
- Display (owner 2026-11-08): `overnight-hold-real-costs.html` shows all four books together (same tables, buy & hold,
  exports), each with its own verdict; NAS100/gold numbers are unchanged.

## Amendments

## RESULTS

*In `analysis/output/overnight-hold-fx/RESULTS.md`.*
