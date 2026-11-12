# Max Cole: "fundamentals with confluence" gold strategy (Wayon "Strategies" episode)

| | |
|---|---|
| Lane / source | informational / colez-trades (elevated pass: Colez Trades educator, not C.OG) |
| Speaker(s) | MAX = Max Cole (gold trader, Colez Trades educator); HOST = Wayon interviewer |
| URL | unknown (owner pasted the transcript; YouTube episode on the Wayon channel) |
| ReelScribe id | none (pasted text; full text kept in the session transcript 2f58d0fd, not committed) |
| Recorded | unknown; the trade shown is from 20 April (year not stated) |
| Processed | 2026-11-12 |

**Same Max as the repo's "Max/Jay/Craig" gold method.** `MD files/GOLD_CHART_STRATEGY.md` (VA/POC, naked POCs, GP/.786/.886,
hidden divergence, TP1 at 1R + breakeven), `MD files/max copier strategy.md` (impulse → LTF consolidation → VAL →
hidden divergence → 3–5 entries) and `MD files/jay_pivot_method.md` (Jay) already write the method down; ConfluenceBot and
`vmcResearch/` already tested it. This clip adds the fundamentals step, the nested-fib stacking, "divergence on the
approach", the management (partials, trail, adding to winners) and his reasons. Most of it is ON FILE.

## Lesson
Pair a higher-timeframe or fundamental bias with a simple entry model. For gold, read the two sides separately (gold
itself, and the dollar), e.g. "gold neutral, dollar strong → sells". Then on M15/M30 find an impulse followed by a range,
draw a fixed-range volume profile over the range, and enter in the impulse's direction at the value-area edge (buy below
VAL after an up-impulse, sell above VAH after a down-impulse). The exact entry is the value-area edge plus a cluster of other
levels: 0.618 of the big swing, 0.786 of a mid swing and 0.886 of a small swing landing together, daily open, high-volume
nodes, naked POCs, trend lines. Resting limit orders, set in advance. A VuManChu momentum divergence must form *while price
approaches* the level, not after it. Stop beyond prior structure plus ATR; no fixed TP; take 20–40% off at 1–1.5R at a left-side
level, trail below the last M15/M30 swing, and add to the position when it's winning.

## Approach
- **Question**: which direction today (fundamentals + HTF), then where does price get to "value" inside a fresh range.
- **Evidence**: discretionary chart reading; "tons of back testing and forward testing" claimed but not shown; one
  hand-picked trade (20 April, gold, bearish pennant + golden pocket + VAH + prior highs, entry 31 / stop 82) as the illustration.
- **Kill rule**: none stated for the method. Per trade: the structural stop; going flat on the setup if it's not met ("no position does not mean no activity" is in the copier doc).
- **Habits** (worth keeping): plan in writing before price gets there ("if this happens do this"), resting limits instead of
  reacting; judge drawdown before profit ("big people… asked me about my draw down"); name each level on the chart.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "XAUUSD… is actually two things… research one side of the pair and the other side" (MAX) | mechanism | **ON FILE** as display: `MD files/FOUR_GOLDS.md` (rates / dollar / reserve / fear gold); the desk reads `real → gold` and `$ → gold` daily as chain links. As a *forward* direction bias: `yield-asset-coupling` (memory) forward NULL, same-bar only; direction bar Phase 0: no direction cell has forward evidence |
| 2 | "Gold neutral but the dollar strong, so gold will come down" (MAX) | call | Dated call, undated clip: not scored (owner rule 2026-10-02) |
| 3 | Price above VAH / below VAL is "a statistical anomaly… chances are we revert to the mean" (MAX) | trading | **ON FILE** NULL: `analysis/output/rangebook/CONFLUENCE_RESULTS.md` value area high/low at the vol lines −0.9pp [−2.8, +1.1] vs placebo; naked POC +1.9pp [−0.8, +4.5] (not real); previous-day POC +1.4pp (not real). Differs: those are session value areas at our vol lines, not a fixed-range VP over a fresh range after an impulse |
| 4 | Stacked fibs (big-swing .618 + mid .786 + small .886 together) make "a nice level"; .886 "a crazy level" (MAX) | trading | **ON FILE** NULL: `vol-asia-fib-confluence` (fib adds nothing at the line), golden pocket +0.5pp [−1.0, +1.9] (CONFLUENCE_RESULTS), `daily-open-fib-retest` (gold −0.72R net, components = shifted opens), ConfluenceBot zone engine (123k trades, H4 ≈ 0R, M30 −0.013R; memory `confluencebot-zone-verdict`, it already scores cross-fib .886). Nested-swing stacking as such: PARTLY (cross-fib only) |
| 5 | "Confirmations… confirm that a level is *going to be* strong": divergence must form as price approaches, not after the touch; waiting for a MACD cross means "the move's already happened" (MAX) | trading | **ON FILE**: `live-range-confluence-book` NULL (momentum into the line, WT and WT divergence among the features, 198k passes); `delta-at-line` regular divergence NULL; `vmc-nq-cipher-direction` NULL; vmcResearch: divergence ~1–2pp tiebreaker only, below cost. **Agrees with us on one point**: waiting for the WT cross *after* the level cut the M15 edge +1.79pp → +1.15pp (vmcResearch), and the live ConfluenceBot *with* M5 VuManChu confirmation lost 335 pips over 152 trades while the zones alone backtest ≈ flat (152 trades can't prove it) |
| 6 | Impulse → range → enter at the value-area edge in the impulse direction (MAX) | trading | **PARTLY**: `value-migration-nq-poc` CONTEXT (+0.02σ continuation, too small at NQ cost); range edges cancel continuation, they don't create reversal (`range-edge-limit-fade` NULL −0.11R on real bid/ask). The exact impulse+fresh-range+VAL continuation entry (the copier doc's flow) has not been run as its own prereg on gold |
| 7 | Resting limit orders at the level (MAX) | execution | **ON FILE**: limits are adversely selected on our levels (`line-touch-limit-unseen` NULL; `range-edge-limit-fade` real edges −0.02R *worse* than placebo as a trade) |
| 8 | Partials 20–40% at 1–1.5R, trail below the last M15/M30 swing, no TP; "profitable prop-firm traders… average risk-to-reward under 1.5" (MAX) | management | Management on zero-edge entries changes the shape (win rate vs payoff), not the mean. ON FILE in practice: `daily-open-fib-retest` BE on/off and 2/3/5R targets all fail; `range-edge-limit-fade` 1:1 and 2:1 both negative; line-touch adaptive stops. The prop-firm statistic is survivorship (method lesson #27/Disagree) |
| 9 | Add to winning positions: "you're not risking anything… you're risking unrealised gains" (MAX) | management | UNTESTED as a rule here. Unrealised profit is money: an add is new risk at the current price. On an entry with no drift it is zero-EV like any other management; on a book with drift (trend) it *is* trend following. Not carded (see ideas) |
| 10 | Max DD 3% over 8 months on a funded account; "seven figures funded" (MAX/HOST) | self-report | Unverifiable; not evidence |
| 11 | "Peace talks fail → inflation → Fed hikes → gold down" (MAX) | mechanism | The rates leg is the desk's `real → gold` link. The geopolitics → Fed step is a story, and "fear gold" (FOUR_GOLDS) would push the other way in the first days |

## What we could learn
- **Plan the trade in writing before price arrives, then rest orders.** ALREADY DO for research (prereg; forecast ledger)
  and for the paper records; it's the same habit as QG's "judge ex ante". Nothing to add.
- **Drawdown first, profit second.** ALREADY DO (stop-risk map, vol-matched DD comparisons).
- **Test any management rule on random entries first** (claims 8–9): it must come out at ~0R, because stops,
  partials, trails and adds can't make money on an entry with no edge; only the distribution moves. DO WORSE: we've
  shown it study by study but never wrote it down as a rule → `RESEARCH_METHOD_LESSONS.md` #27 (WATCH).
- **Survivorship in "what profitable traders do"** (prop-firm RR stat, "big people asked about drawdown"): → Disagree table.
- Max's own point that a confirmation *after* the level is late matches our VuManChu result. Worth telling the owner: it's
  a rare place where an educator's rule and our data agree, though the earlier "on the approach" version still has no edge.

## Research ideas
- **Impulse + fresh range + value-area-edge continuation on gold** (claim 6, the only untested core piece): variable =
  entry at the fixed-range VAL (up-impulse) / VAH (down-impulse) after an M15/M30 impulse ≥ k·ATR and a range of n bars;
  condition = impulse size tercile, with/without the `$ → gold` chain link agreeing; horizons = 1/2/4 h and to the range's
  opposite edge; noise = same-time placebo entries at a shifted level inside the range; benchmark = `value-migration-nq-poc`
  continuation and the `range-edge-limit-fade` real-bid/ask fills; would change: whether the copier method has anything
  before cost. **Not carded**: the priors are heavy (claims 3–5, 7 all NULL on nearby constructs, limits adversely
  selected); offer it only if the owner wants the copier strategy itself tested. If so, it goes to research-protocol with
  `MD files/max copier strategy.md` as the frozen rule text.
- **Add-to-winners overlay**: not carded. Known answer (zero on random entries) makes it a positive control, not a study;
  on the trend book it is already the trend rule.
- **Display nugget**: none new. The "which side of XAUUSD moved" read already exists (FOUR_GOLDS chain links).

## Quotes
- "Most full-time traders… pair some type of higher time frame bias or some type of fundamental bias with a simple entry model."
- "It's XAU, it's gold, and it's the US dollar… research a one side of the pair and b the other side."
- "I want to try and confirm to myself that a level is going to be strong… Anyone can [confirm it was]."
- "If this happens do this… you're planning in advance… you're being methodical."
- "They never asked me about my profits, they just asked me about my draw down."
