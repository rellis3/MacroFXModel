# bias-day-trade — Opened at London midnight on the bias engine's side, does the trade close in profit after costs, and which assets move with or against the bias? Does the bias side rescue the line trades?

**Pre-registered 2026-11-24, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `bias-day-trade-fx` (M1), `bias-day-trade-gold` (M2), `bias-day-trade-idx` (M3), `bias-day-trade-fx-24h` (M4), `bias-day-trade-gold-24h` (M5), `bias-day-trade-idx-24h` (M6), `bias-day-trade-lines` (L1–L3, one entry) |
| Branch | `main` (owner rule: push to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `bias-day-trade` |
| Signal | The live V1 engine (`js/biasEngine.js`, imported, not ported) replayed point in time by `scripts/bias-engine-backtest/run_engine.mjs` with the **issue time moved to 00:00 Europe/London** (prices: only bars closed by 00:00; macro inputs unchanged, they are all dated before the previous business day). Primary label = the banked study's history-adjusted label (`dir_adj`, `forge/BIAS_ENGINE_BACKTEST_PREREG.md` §3.1). V2 has no history and is not tested here (it is on the forward scoreboard from 2026-11-23). |
| Fills | OANDA bid/ask M1 (`data/m1_bidask/<key>_m1.parquet`), London sessions 2016-10-24 → 2026-08-20 (cache end; lockbox 2026-08-21 respected) |
| Seed | `20261124` |
| Uncertainty | date-block bootstrap, block 21 London dates shared by all markets, B 2000 |
| Scripts / outputs | `scripts/bias-day-trade/` → `analysis/output/bias-day-trade/` |

## 1. The claim

Owner, 2026-11-24: "Is it possible to backtest the bias of the day, so say midnight London open a trade based on bias
and see if certain assets move with bias or against bias and close in profit after costs? Is the bias analysis
backtestable?" And (same day, "yeah") the line-entry filter: do the line trades that lose net
(`trade-at-lines`) make money when only the bias side is taken?

## 2. Why it is not already settled

- `bias-engine-backtest-sameday` (UNDERPOWERED): the same engine, entered at **07:00**, exit 21:00; FX net −0.036 R,
  gold +4.0 pp hit (lone cell), indices +0.2 pp. Never: the 00:00 entry (the Asia session is inside the trade here),
  the full 24-hour hold, a per-asset with / against table, or a random-side placebo that keeps each market's long/short
  mix (so drift is not counted as skill).
- `trade-at-lines` (NULL): all 18 cells net negative, **without** any side filter.
- `asia-day-bias` (NULL): Asia direction does not call 07:00–21:00, so a 00:00 entry is not expected to gain from Asia.

## 3. Definitions, fixed in advance

- **Clock.** Europe/London. A session is a London weekday date D.
- **Signal.** For each market and D: side = +1 BULLISH / −1 BEARISH / 0 NEUTRAL from the 00:00-issue replay. Neutral
  = no trade. Markets: the 27 FX pairs with a bid/ask file (the 28 crosses minus NZDCHF), GOLD, and the six indices
  NQ, SPX500, US30, US2000, DE30, UK100 (bid/ask keys nq, spx, dow, us2000, dax, uk100).
- **Entry.** At the ask (long) / bid (short) of the open of the first M1 bar starting in [00:00, 00:15) on D.
- **Exits.** E21: the bid (long) / ask (short) at the close of the last bar starting in [20:30, 21:00) on D.
  E24: the close of the last bar starting in [23:30, 24:00) on D (Friday: the last bar before the weekly close). A
  session missing the entry or the exit bar is unresolved and counted per market. No stop, no target (the question is
  the bias itself; stops are the line part's job).
- **Units.** σ = SD of the previous 60 NY-close (17:00 New York) daily log returns built from M1 mid, ending before
  00:00 London on D (≥ 40). Gross R = side × ln(mid_exit / mid_entry) / σ. Net R = side × ln(fill_exit / fill_entry)
  / σ (the real half-spreads at entry and exit included). "Against" = the opposite side, filled on its own bid/ask.
- **Groups (fixed):** fx = 27 pairs; gold; idx = 6 indices. Group value = mean over called market-days with equal
  weight per **market** (mean of the per-market means), so one market cannot carry a group.
- **Random-side placebo.** Within each market, the called sides are shuffled across that market's called dates
  (keeps how many days it is long vs short, so drift stays in the placebo); 500 shuffles. Skill = real value above
  the placebo's 97.5th percentile.

### Line part (L1–L3)

- **Trades.** The banked `trade-at-lines` trade list (`analysis/output/trade-at-lines/trades.parquet`): NQ, GOLD,
  EURUSD; real lines only (`pos` = 0), variant ALL (the odds variant was in-sample there); rules FADE-L (L1), FADE-Z
  (L2), FOLLOW (L3), rungs p50/75/90 pooled. Trade direction: FADE at an OH line and FOLLOW at an OL line are short;
  FADE at OL and FOLLOW at OH are long.
- **With bias / against.** A trade is WITH when its direction equals the 00:00 bias side for that market and date,
  AGAINST when opposite, NEUTRAL when the bias is Neutral. Window: the trade-at-lines dates inside 2016-10-24 →
  2026-08-20 (it starts 2018).
- **Statistic.** Mean net R of WITH trades; and WITH − ALL (the gain from the filter), date-block bootstrap.

## 4. Hypotheses, expectation first

| # | Question | Expectation |
|---|---|---|
| M1 | fx, 00:00 → 21:00: net R per call on the bias side | **Negative** (the spread; banked 07:00 entry −0.036 R) |
| M2 | gold, 00:00 → 21:00 | Small positive gross, not clearing the bar |
| M3 | idx, 00:00 → 21:00 | About drift; no skill over the random-side placebo |
| M4–M6 | the same, 00:00 → 24:00 | As M1–M3 |
| L1–L3 | line trades with the bias side: net R > 0, and WITH − ALL > 0 | Still negative net; the filter gains < 0.05 R |
| | **THE GATE (M cells)**: the *with* side VALIDATED if net R ≥ +0.04 R (E21) / +0.05 R (E24) with the 95% CI excluding 0, both halves (split at the median date) positive, real gross above the random-side placebo's 97.5th percentile, and Holm α 0.05 over M1–M6. The *against* side passes the same gate on its own net R (the mirror: a bias that is reliably wrong is tradable by fading it). | |
| | **THE GATE (L cells)**: WITH net R > 0 with CI excluding 0, both halves, WITH − ALL ≥ +0.05 R with CI excluding 0, Holm over L1–L3. | |

## 5. Power

MDE = 2.8 × the random-side placebo's SD of the cell value (signals only, no real pairing of side and outcome; 80%
power, two-sided 5%). A cell whose MDE exceeds its bar is UNDERPOWERED and cannot be NULL. Plant control before any
real cell is read: zD' = gross + 0.06 × side on a copy; the M1 pipeline must recover ≥ 80% of the lift in ≥ 80% of
200 bootstrap draws. Expected: fx ~27 × 2,400 sessions × call rate ~19% → MDE ~0.02 R; gold ~800 calls → ~0.06 R
(may be UNDERPOWERED); idx ~6 × 1,200 → ~0.03 R.

## 6. Multiplicity

M1–M6 Holm at α 0.05, with and against each counted (12 tests). L1–L3 Holm at α 0.05 (own family). Per-market with /
against tables (34 markets × 2 exits), by year, and by strength (3–4 / 5–6 / 7+) are disaggregation: BH q 0.10 with
a chance baseline; a survivor is a candidate for its own prereg on the lockbox, never a result.

## 7. What this does NOT test

V2 (no history), the bias drivers that cannot be rebuilt (data momentum; EUR/CHF real yield: same limits as the banked
backtest), financing / swap on the 24-hour hold, intraday stops, position sizing, event days separately, and any
entry time other than 00:00.

## 8. What each verdict changes

- **Validated (with):** a "bias trade" paper record per validated group on the bias scoreboard; nothing live until a
  forward pass.
- **Validated (against):** the engine's side for that group is shown as a contrarian marker, research only.
- **Null:** the engine's daily side is not a trade from 00:00 for that group; the bias stays context.
- **Line part validated:** the bias becomes the side filter for the intraday system design (bias picks side, lines
  place entries); otherwise lines stay context and the intraday system needs another source of side.
- **Underpowered:** say which group and what sample would resolve it.

## Amendments

### A1 — 2026-11-24 — PRE-RESULTS

No outcome had been computed (the replay was still building; the scorer had only been run on the EURUSD session-cut
audit, which reads prices, not sides). Owner: "Is that v1 vs v2 vs the 4 hour trend backtest?"

- **Added arm `h4-trend`** (the bias scoreboard's competitor, `js/biasForecasters.js` `h4Slope`, rule in
  `forge/BIAS_SCOREBOARD_PREREG.md` A1), issued at 00:00 London: H1 mid bars built from the bid/ask M1 mid (last M1
  close in each UTC hour, bar open t), only bars with t + 1 h ≤ 00:00 London on D, the last 320; 4h closes = the last
  H1 close in each 4h bucket (floor(t / 4h), UTC); EMA20 seeded with the first value; slope = EMA20(all) − EMA20(all
  but the last 3); side = its sign; no view with fewer than 24 4h closes. The Python port is checked against the JS
  `h4Slope` on synthetic series before use.
- **Cells M7–M12**: the same six group × exit cells, gate, placebo and power rule as M1–M6, with h4-trend's side. Own
  Holm family (12 tests: with and against). Ledger ids `bias-day-trade-h4-<group>[-24h]` (one entry per group).
- **Head-to-head (descriptive):** V1 − h4-trend net R on market-days where both speak, and V1's net R split by
  agreeing / disagreeing with h4-trend, date-block bootstrap. Line part: the same WITH split by h4-trend (descriptive).
- **V2 is not added:** its new inputs (futures policy path, data momentum, stance) have no point-in-time history
  (`plans/BIAS_ENGINE_V2_SPEC.md` §7); a proxy replay would mostly be V1. V2 stays forward-only.

### A2 — 2026-11-24 — PRE-RESULTS

Found in the replay's coverage check, before the scorer ran: with the 00:00 issue the risk driver was present on 2,657 of
4,340 days (07:00 replay: 4,340). Cause: the replay stamps VIX / VIX3M at 23:59 UTC on their date, and 00:00 London in
BST is 23:00 UTC, so the engine's own rule ("published after the issue time") rejected the previous day's close. VIX
closes at 16:15 New York, before 00:00 London all year. Fix: with `BEB_ISSUE_HHMM` set, VIX / VIX3M are stamped at the
CBOE close (16:15 New York) of their date (`build_inputs.py` `vix_stamp`); the 07:00 replay is unchanged. Inputs and
engine rebuilt; coverage re-checked against the 07:00 replay before scoring.
