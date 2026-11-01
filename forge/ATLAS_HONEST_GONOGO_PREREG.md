# atlas-honest-gonogo — With the known leaks removed, real bid/ask fills and the production settings, do the Vote Atlas and Fib Atlas fade/follow votes make money, and do they beat the same trades with the decisions shuffled?

**Pre-registered 2026-11-01, before any outcome was computed.** No real-data script has been run. The only runs
before registration are the synthetic positive control (§5) and the random-walk guard (`js/atlasNullCheck.test.mjs`),
neither of which reads real prices.

| | |
|---|---|
| ID / ledger id | `atlas-honest-gonogo-vote`, `atlas-honest-gonogo-asia`, `atlas-honest-gonogo-monday` (one per system) |
| Branch | `ccr-1bb57402-3qmrb8` |
| Register row | `plans/RESEARCH_REGISTER.md` → `atlas-honest-gonogo` |
| Data | OANDA bid/ask M1 (`data/m1_bidask/<key>_m1.parquet`, practice pricing, spread-only account), via `scripts/atlas-honest-gonogo/extract.py`, which cuts every row on or after **2026-08-21 00:00 UTC** (lockbox). Window: each file's start (2016-10) → 2026-08-20. Engines walk the file's mid OHLC and tick volume, the same series production uses (`BIDASK_QUALITY.md`: mid = research mid on 100% of minutes) |
| Seed | `20261101` (bootstraps and permutations). The positive control's synthetic price walks use data seeds 1–4 |
| Uncertainty | session-date moving-block bootstrap, every instrument of a date resampled together, block = 21 sessions, B = 2000 |
| Scripts / outputs | `scripts/atlas-honest-gonogo/` → `analysis/output/atlas-honest-gonogo/` |
| Harness | own script (`run.mjs`). It reuses the production engines, books, votes and mid pricing unedited, plus `js/bidAskFill.js` for fills. `js/harness/runStudy.mjs` scores daily signals, not intraday bracket fills |

## 1. The claim

Vote Atlas (`volatility_bot_v2/v3`: a volatility-forecast ladder) and Fib Atlas (`fib_atlas_bot(_v2)`: Asia and
Monday range-extension ladders) each decide, at every touch of a ladder line, whether to **fade** it (bet on a return
to the inner line) or **follow** it (bet on a run to the next line out). They decide by a vote over context buckets
in a "book" built from past touches. The bots trade those decisions with fixed target/stop brackets at the next lines.

The earlier backtests behind both bots reported large edges: Fib Atlas 85.7% wins at about 1:1 and Sharpe 18.4. A
blind audit on 2026-11-01 found those results came from look-ahead, not the market. The audit read the code with
comments removed and tested it on random-walk prices:
- the same-day "previous outcome" vote input read results that had not happened yet;
- vote inputs were picked on the same period they were scored on.

On data with no edge, the old code reported 60–80% win rates. Both leaks are fixed in the current code. Four biased
opt-in exits and filters were fixed on 2026-11-01, and a CI guard now checks every path on random prices.

**No one has measured the honest system on real prices with real fills.** This study does that once per system:
1. Does the vote, as production runs it, make money per trade after bid/ask fills?
2. Does it choose better than a shuffle of its own decisions at the same touches?

## 2. Why it is not already settled

Nearest Evidence Book entries (`js/deskEvidence.js`):
- **`range-ladder-placebo`** (UNDERPOWERED) and **`range-ladder-placebo-confirm`** (VALIDATED, relative). The race at
  the Asia/Monday ladder lines is near a coin flip at real and shifted ladders alike, with a ~3-point reversion tilt
  at the range edges. These score the **lines**, with no vote, on mid prices.
- **`range-edge-limit-fade`** (NULL): always-fade at the Asia range edges with a resting limit, on bid/ask, loses
  about −0.11R. That is **one rule at two lines**, with no vote.
- **`direction-vote-at-lines`** (CONTEXT): a vote over macro direction tilts at vol-forecast lines. That is a
  different vote, not the Atlas book.
- **`line-touch-limit-unseen`** (NULL): a different touch selector (fresh extremes).

None of these tests the Atlas **book vote** (fade vs follow per touch, chosen from in-sample buckets) with the leaks
removed and real fills. The Vote Atlas v4 tests (PR #1498) scored the export lines, not this book. Every earlier
Vote/Fib Atlas backtest number came from the leaky code or from mid fills. This is not a re-run of a banked null.

**The out-of-sample window is not fresh.** It is the production 60/40 split of 2016–2026 touches (roughly 2022/23 →
2026-08), and earlier sessions looked at it under the leaky code and mid fills. That is why §6 promotes nothing to
live trading on this study alone, and why the lockbox (sessions after 2026-08-21) is kept for a confirmation.

## 3. Definitions, fixed in advance

- **Systems and production settings** (from `server.js`, 2026-11-01):
  - **vote**: Vote Atlas, the 17 default instruments `eurusd gbpusd usdjpy audusd usdchf euraud eurchf audjpy cadjpy
    chfjpy gold nq spx dow us2000 de30 uk100` (de30 is file key `dax`), vote margin **≥ 3**, rungs p50/p75 (p90
    excluded as in production).
  - **asia** and **monday**: Fib Atlas on each ladder, the 16 default pairs `eurusd gbpusd usdjpy audusd nzdusd
    usdcad usdchf eurgbp euraud gbpaud audjpy audnzd audcad cadjpy nzdjpy gold`, vote margin **≥ 2**.
  - All three use re-arm 0.3.
- **The setup.**
  - Each instrument's M1 mid is walked with the production engine and arguments: `atlasWalk`, `asiaFibAtlasWalk`,
    `mondayFibAtlasWalk`.
  - The real split is `splitAt(touches)` (60/40 by touch date). The book is built from touches dated before the
    split only (`buildAtlasBook` / `buildAsiaFibAtlasBook`), as the production routes now do.
  - Every touch on or after the split gets the production `voteDecision`. A trade is taken when the margin reaches
    the system's production margin.
  - Fib Atlas is walked without the IV and macro-event inputs. They feed only non-voting dimensions (its vote uses
    `prevOutcomeSameDay` and `sessionHandoff` only), so decisions are unchanged.
- **Knowable when? Vote Atlas session-volatility inputs.**
  - `asiaVol`, `londonVol` and `prevSessionVol` are set to null when the session they read had not finished at the
    touch time (Asia 22:00→07:00 UTC, London 07–13, NY 13–22).
  - Verified 2026-11-01 on synthetic data: as built, `asiaVol` reads the Asia session that **starts** at 22:00 on
    the touch's own date for every London/NY touch (2,850 of 2,850 values). `prevSessionVol` reads the same day's NY
    session for Asia touches before 07:00 (265 of 2,981).
  - The live bot cannot see those sessions, so blanking them is the causal version. The engine as-is is reported
    alongside, as description.
  - Fixing the engine itself is in the live decision path and is left to the owner.
- **The fills** (`js/bidAskFill.js`, conventions fixed in its header and tests):
  - **Fade:** a resting limit at the line, filled only when the far side of the quote trades through it.
  - **Follow:** a stop entry at the line, filled at the gap price.
  - **Brackets:** stop and target are fixed from the line at the production distances. A fade's target is the inner
    line and its stop the outer line; a follow is the reverse.
  - **Exits:** longs exit on the bid and shorts on the ask. The stop wins a bar that reaches both. The target is not
    credited on the fill bar. An open trade is flattened at the session's last bar.
  - No commission (spread-only account).
  - An unfilled fade is no trade, and the fill rate is reported.
- **The outcome.** R = (exit − entry) × direction ÷ stop distance, per trade, net of the spread.
- **Instruments.** Fixed lists above. Pooled per system, with per-instrument results reported as disaggregation.
- **The controls.**
  1. **Decision placebo.** The vote's decisions are shuffled among the same traded touches, within each instrument
     (keeping its fade/follow mix). There are 2,000 permutations, and each re-priced decision uses its own bid/ask
     fill. The real mean R is placed in that distribution, per the 2026-10-21 lesson: a percentile in a shuffle
     distribution, not a single shifted run.
  2. **Always-fade and always-follow** on the same touches (description).
  3. **The same trades priced on mid**, as the old backtests did (description: the execution gap).
- **De-clustering.** None. Touches are kept as production trades them. Clustering is handled by the date-block
  bootstrap, which resamples all of a date's trades together.
- **Sample.** The OOS window above, split at its median trade date into two halves for the stability gate.

## 4. Hypotheses, expectation first

The expectations are guesses, written down so the result can't be re-narrated afterwards. They are not verdicts.

| # | Question | Pre-registered expectation |
|---|---|---|
| a | vote: mean net R per trade > 0 | **No.** The decision inputs are context buckets that survived an in-sample/OOS sign check. On random prices the honest pipeline gives about 0, so any edge has to come from the market, and costs take about 0.05–0.15R |
| b | asia: mean net R per trade > 0 | **No.** Fib stops are small (median about 8 pips), so spread is a large share of R |
| c | monday: mean net R per trade > 0 | **No**, same reason; fewer trades |
| d | Each system's vote beats its shuffled decisions (percentile ≥ 0.95) | **Unsure.** The book is a real in-sample ranking. Whether it carries out of sample is what this tests |
| — | **THE GATE**, per system | VALIDATED needs all three: (1) mean net R > 0 with Holm-adjusted one-sided p < 0.05 across the three systems; (2) real mean R at or above the 95th percentile of its decision placebo; (3) mean net R > 0 in both halves of the OOS window |
| — | **THE MIRROR** | The opposite decision at the same touches. It is in the placebo and in the always-fade/always-follow rows; no separate cell |

## 5. Power — what this design can and cannot find

**Pass bar: +0.05R net per trade.** Below that, an extra 0.05R of real-world slippage, commission or a wider spread
than OANDA's practice feed would erase it.

**Positive control, run 2026-11-01 on synthetic data only.** Three years of random-walk M1 per seed, 4 seeds, a 1-pip
spread, the Asia pipeline end to end, 38,637 filled candidates. A planted decision rule picks the better of fade and
follow with probability q:

| Planted q | Mean net R [95% CI] | Shuffle 95th pct | Real percentile |
|---|---|---|---|
| 0.50 (no skill) | −0.106 [−0.119, −0.092] | −0.099 | 0.53 |
| 0.55 | −0.020 [−0.035, −0.007] | −0.098 | 1.00 |
| 0.60 | +0.076 [+0.060, +0.094] | −0.098 | 1.00 |

- The shuffle control stays quiet without skill and sees a small planted skill.
- On these spreads a decision must be right about 58% of the time before the absolute test can pass. That is the
  cost, not a flaw in the machinery.

**Power table: filled in amendment A1 from `run.mjs --mode count` before any `--mode score` run.** Count mode prints,
per system:
- the number of traded touches at the production margin;
- the SD of net R over the control sample (every OOS touch priced as both fade and follow, no vote);
- the design effect from the date-block bootstrap SE against the naive SE;
- the MDE (`mdeMeanDiff`, one-sided α = 0.05/3, 80% power).

It never prints a mean.

| Cell | Planned n | Outcome SD (control) | Design effect | **MDE** | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| vote | A1 | A1 | A1 | A1 | +0.05R | A1 |
| asia | A1 | A1 | A1 | A1 | +0.05R | A1 |
| monday | A1 | A1 | A1 | A1 | +0.05R | A1 |

**Rule.** A system whose MDE exceeds +0.05R is UNDERPOWERED by design: it is still run, but only as description,
and cannot be VALIDATED or NULL from this sample. Monday trades about once per pair per week and is the likeliest
to land here.

## 6. Multiplicity — how many cells, and the corrected bar

- **Scored cells:** three, one per system: mean net R at the production margin, with the gate in §4. Holm at
  α = 0.05 across the three one-sided bootstrap p-values (share of bootstrap means ≤ 0). The placebo and both-halves
  conditions are conjunctive on top.
- **Verdict words.**
  - **VALIDATED:** the §4 gate passes.
  - **NULL:** the gate fails and the bootstrap 95% upper bound is below +0.05R, so the data rule out a material
    edge.
  - **UNDERPOWERED:** anything else (including MDE > bar).
- **Disaggregation (descriptive):**
  - per instrument, with BH q = 0.10 within each system and `chanceBaseline`;
  - per year, and per decision (fade vs follow);
  - Fib Atlas with the production gap filter (≤ 30 min Asia, ≤ 180 min Monday);
  - Vote Atlas with the engine as-is (session-vol inputs not blanked);
  - the cost map: median spread ÷ stop by instrument × UTC hour;
  - fade fill rate, and the same trades on mid fills.

  A slice that survives BH is a candidate for its own prereg, never a result.
- **Promotion bar.** Nothing here sizes or switches on a live position. Even a VALIDATED system needs |t| ≥ 3, plus
  the lockbox check or a forward record, because this OOS window has been looked at before (§2).
- **Variants: none.**
  - One configuration per system, the production one.
  - The production cost-ratio filter, stop tightening and chandelier exit are **not** modelled. They were tuned on
    the leaky backtests and are out of scope (§7).

## 7. What this does NOT test

- **The full production stack.** That includes the cost-ratio filter, stop tightening, the chandelier exit, the
  concurrency cap, portfolio weights, drawdown throttles and the currency gate. A pass is about the vote's trades
  alone.
- **The lines themselves against shifted lines.** That is the `range-ladder-placebo` family. Here the lines are
  fixed and only the decision is tested.
- **The MT5 broker's real fills.** OANDA practice bid/ask stands in, and broker spreads may differ. The live
  trade-history comparison (`MD files/FIB_ATLAS_BACKTEST_VS_LIVE.md`) is the place for that.
- **The lockbox, sessions after 2026-08-21.** It is kept for a confirmation.
- **Cause.** A pass says the vote's choices paid in this window, not why.

## 8. What each verdict changes

- **VALIDATED** (per system): a ledger entry at research level. Next comes a lockbox or forward-record prereg of the
  same frozen configuration before any live change. The bot pages may say "vote has an out-of-sample edge on
  bid/ask in 2022–26, unconfirmed forward".
- **NULL** (per system): a ledger entry. The bot pages stop implying that the vote picks direction. Per the project
  rule, a code-bug audit comes first, before banking:
  - the random-walk guard;
  - a check that the production routes and this script give the same decisions on one instrument;
  - a look at the dropped and unfilled counts.

  Then the system is presented as a range/level map, not a direction signal. A structural alternative (the levels
  for stop and target placement under a separate direction source) gets its own prereg rather than a retune of this
  vote.
- **UNDERPOWERED**: say which data would make it testable (the lockbox at ≥ 60 sessions, a forward record), and do
  not describe the system as either working or not working.

## Amendments

## RESULTS — not run
