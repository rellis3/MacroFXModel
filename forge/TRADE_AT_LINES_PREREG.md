# trade-at-lines — do the v2 lines + exhaustion odds make money as fade / follow rules after real spreads?

**Pre-registered 2026-11-19, before any trade outcome was computed.**

| | |
|---|---|
| ID / ledger id | `trade-at-lines` (one verdict per cell; family verdict = any cell VALIDATED) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `trade-at-lines` |
| Instruments | NQ, GOLD, EURUSD, OANDA CFD; fills on OANDA bid/ask M1 (`data/m1_bidask/<key>_m1.parquet`; mid = research mid) |
| Lines | the walk-forward `ladder-v2-*` ladders (chosen arm), `test_C.parquet`; OH/OL p50/75/90 off the London-midnight mid open |
| Zones / odds | `reversal-zones` per-instrument run-past (median z50, 75th z75, σ units); exhaustion next-line odds by London bucket (`scripts/ladder-v2/export_exhaustion.py` tables). Both are fitted on the same 2018–2026 window, so **the odds filter is in-sample**; reported, and judged only together with the unfiltered cell |
| Window | London sessions 2018 → 2026-08-21; flat by 22:00 London |
| Seed / uncertainty | `20261119`; session block bootstrap within instrument, block 63, B = 2000 |
| Scripts / outputs | `scripts/trade-at-lines/` → `analysis/output/trade-at-lines/` |

## 1. Why

The owner asked whether the new levels are useful **as trades**, answered on history now rather than by a forward
record. Prior art on older lines: `raw-level-mfe-mae` (0 of 1,008 stop × target cells net positive),
`line-touch-wide-scan` (gross +0.19R, fails net), `range-edge-limit-fade` (−0.11R net), `nq-line-touch-hold-to-close`
(drift only). New here: the regime-correct v2 lines, zone-sized stops, and the exhaustion time filter.

## 2. Rules (one trade per line per session, first touch only; short at OH lines, long at OL lines mirrored)

σO = the session's σ × open. Every entry, stop and target is filled on bid/ask (sell at bid, buy at ask).
- **Stop before target:** if a bar reaches both, it counts as a stop.
- **Gaps:** a stop that gaps fills at the bar's open, if that is worse.
- **Limits:** a limit fills only if price trades through it by one tick-equivalent (1e-5 of price).

| Rule | Entry | Stop | Target |
|---|---|---|---|
| **FADE-L** | Limit at the line (sell OH / buy OL) | Line + z75·σO + 0.05σO | Line − z75·σO (1R) |
| **FADE-Z** | Limit at line + z50·σO (inside the run-past) | Line + z75·σO + 0.10σO | The line |
| **FOLLOW** | Market on the first touch (buy OH / sell OL at the bar close) | 0.25σO back | Next rung (p90: +0.25σO) |

Each rule runs on rungs p50 / p75 / p90, in two variants:
- **ALL:** every first touch.
- **ODDS:** fades only when the line's next-line odds for the touch's London bucket are ≤ 35%; follows only when
  they are ≥ 55%.

That makes 3 rules × 3 rungs × 2 variants = **18 cells**.

**R** = the entry-to-stop distance including the entry spread. The outcome is net R, so costs are always included.
A trade with no stop or target by 22:00 exits at the 22:00 bar's bid/ask close.

## 3. Pass rules

Per cell, pooled over the 3 instruments, a cell is **VALIDATED** only if all of these hold:
1. Mean net R > 0 with a 90% CI excluding 0.
2. That holds in both halves (2018–22 and 2023–26).
3. It beats the same rule on the line moved ±0.15σ and ±0.30σ (the mean of the four copies) by more than 0, with
   the CI excluding 0. This shows the line itself matters.
4. Benjamini–Hochberg q = 0.10 over the 18 cells.
5. For an ODDS cell: its ALL cell must also be net positive. Otherwise it is VALIDATED-IN-SAMPLE only, and reported as
   CONTEXT.

**NULL** if the CI of mean net R excludes +0.05R. **UNDERPOWERED** otherwise.

Reported: gross R (mid fills), win rate, trades per year, per instrument, per bucket, and spread cost in R.

## 4. What each verdict changes

- **VALIDATED:** the rule goes on the exhaustion export as a marked setup, with a forward paper record.
- **NULL:** the lines stay context: how far today goes and how likely the next line is. No trade rule is attached.

## Variant log

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | 18 cells above | 2026-11-19 | registered |

## Amendments

(none)
