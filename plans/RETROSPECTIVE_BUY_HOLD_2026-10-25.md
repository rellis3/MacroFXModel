# Retrospective: the buy & hold comparisons (DAX IFO system, C.OG's Overnight Hold task)

Written 2026-10-25, after both were re-run with honest timing and real costs and banked. Numbers are in
`analysis/output/dax-ifo-lookahead/RESULTS.md` and `analysis/output/overnight-hold/RESULTS.md`; Evidence Book ids
`dax-ifo-lookahead` (null), `overnight-hold-nq` and `overnight-hold-gold` (both underpowered).

## What we built, and when

| When | What | Where |
|---|---|---|
| 2026-07-20 | DAX IFO system: long the DAX when IFO rises month on month, short when it falls; 4 scripts (prep, strategy, "professional" backtest with Monte Carlo, OLS) | `Dax Base IFO System/System/` |
| 2026-08-11 | C.OG's task notes, then the overnight-hold engine and page: 20:00 → 14:30 UK on NAS100 and gold, buy & hold benchmark, mirror test, MAE, costs, CSV export, prop-rule check | `education/buy-and-hold-notes.md`, `js/overnightHoldEngine.js`, `overnight-hold-backtest.html`, `/api/overnight-hold-v1` |
| 2026-08-11/12 | Follow-ups on the page: cost sweep, IS/OOS split (retracted the "combined beats both" claim), weekday breakdown ("Wednesday is the lever"), skip-Wednesday rule, exit-time sweeps later and earlier than 14:30 | same |
| 2026-08/09 | Labelled in `august analysis.md`: "overnight hold (gross effect, net negative)", "Dax IFO (decayed 2020+)". Neither was ever banked | `august analysis.md` |
| 2026-10-25 | This re-run: committed checks, real costs, banked verdicts | `forge/*_PREREG.md`, `scripts/{dax-ifo-lookahead,overnight-hold}/` |

## What we found

**DAX IFO: lookahead, never tradable.** The 9.42% CAGR reproduces exactly, but it comes from giving each month the IFO
reading for that same month, which is published around the 25th, and crediting it with the whole month's return.
Using only a published reading the rule loses money: −5.3% CAGR (next month) and −7.0% (from the release day), with
70–82% drawdowns, negative in every half and at every release-date assumption. "Decayed 2020+" was wrong: it never
worked.

**Overnight hold: a real but small effect, not a strategy.**

- Gross, the overnight window carries a lot of both markets' moves (gold: +212% overnight vs +13% for all other time).
- Net of real costs it is positive: NQ +6.0% a year, gold +4.0%. The earlier "net negative" was an artefact of
  placeholder costs 2.5–4× too high, plus a triple-Wednesday financing charge NQ doesn't pay at OANDA.
- It isn't statistically confirmed (NQ t 2.0, Holm p 0.085; gold t 1.4), and NQ's edge is fading (second half ~2.5% a
  year, 2025 negative).
- Like-for-like CFD buy & hold still wins on return and Sharpe (NQ +14.3% / 0.73 vs +6.0% / 0.53). The overnight hold
  does have half the drawdown with 42% time in market.
- The prop check, measured on intraday equity, passes 2–3% of rolling starts at 1×. At 3× it gets to target more often
  but mostly fails the daily-loss limit (13–16% pass).

## How we approached it

- **DAX:** built straight from the claim to a polished backtest (equity curves, heatmaps, Monte Carlo, regression)
  before anyone asked *when the IFO number is known*. Every robustness check reused the same alignment.
- **Overnight hold:** followed C.OG's seven gated stages closely: timezone gate on NFP Fridays, clock-change handling,
  exceptions log, mirror test, minute-by-minute MAE, gross and net side by side, the four prop rules, toolkit CSVs.
  Then a run of follow-ups the same week.

## What worked

- C.OG's gates. The NFP timezone check passed and the exceptions log explained the trade-count gap (Sundays).
- The IS/OOS split caught that "combined beats both legs" was a compounding artefact, and that was retracted.
- Gross and net side by side, as the task insists, which is what made the cost question visible at all.
- Reproducing the original numbers exactly before changing anything (both studies), so the fixes are clearly the cause.
- Real bid/ask data (bought in October) settled the cost question in an afternoon.

## What failed

1. **Timing was never checked on the DAX system.** The README even says "released around the 25th, allowing
   same-month positioning", which is the mistake written down as a feature.
2. **Placeholder costs were treated as findings.** The engine's comments said "illustrative, calibrate before trusting",
   but the conclusion "net negative" was recorded anyway, and the page's breakeven of ~1.0× was read as "knife-edge"
   rather than "depends entirely on numbers we made up".
3. **The benchmark wasn't like-for-like.** Buy & hold was gross while the strategy paid financing, which flatters
   buy & hold.
4. **The prop check used closed trades only,** although the engine already computed MAE. On intraday equity the 3×
   pass rate drops from 37% to 13%.
5. **Searching after the first result.** Weekday split, skip-Wednesday, three later exits and six earlier ones were all
   tried after seeing the first run, without a prereg, and none were counted as extra tests.
6. **Nothing was banked.** Both conclusions lived in a review file and in page text, so "net negative" and "decayed
   2020+" stood uncorrected for two months.
7. **The mirror test was specified wrong** (by us, in this round's prereg too): the 14:30→20:00 leg skips weekends, so
   "overnight + intraday = buy & hold" can't hold without the weekend legs.

## What to do differently

- Ask "when is this number known?" before building anything on a macro release. Put the publication lag in the prereg.
- Never record a net verdict on placeholder costs. Use the bid/ask files and the financing snapshot, or say "net
  unknown".
- Benchmarks pay the same costs as the strategy.
- Prop checks run on intraday equity (MAE), and test sizing up front, since the task is really a sizing question.
- Write follow-up variants into a prereg before running them, or label them as extra searching when reported.
- Bank every verdict in the Evidence Book the day it is reached, nulls and underpowered included.
- Fix the engine defaults (real spreads, per-instrument triple day, financed buy & hold, MAE prop check) before the page
  is used again. Not done in this round.

## Where it stands

- DAX IFO: closed. An IFO *surprise vs consensus* on release day is the only untested question left there.
- Overnight hold: parked, not dead. The honest next step is a forward paper record at the 14:30 exit from 2026-08-22
  on, with real costs, judged against buy & hold. Not a prop attempt: at 1× it doesn't reach target and sized up it
  breaks the daily-loss rule.
