# How Hedge Funds Trade (5 shorts)

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci |
| URL | instagram.com/p/ DfVJ-TTjo-7 · DfXu__DABEw · DfaTt8LjjxP · Dfc40GGgYXi · Dffcq6rDs5R |
| ReelScribe id | j57dnmd9…, j5752t5n…, j57dqyvs…, j570gjxf…, j577namz… · 25–52 s each |
| Recorded | posted 2026-11-04 to 11-08; clips of the YouTube video "How Hedge Funds Trade" (**not in the library**; worth 1 credit, see below) |
| Processed | 2026-11-12 |

## Lesson
A backtest that makes money is doing one of two things: **forecasting better than the price** (skill, like the best
home-run picker) or **harvesting a systematic mispricing** (a structural edge with an economic reason, which can get
crowded out). Both are uncertain going forward, but for different reasons, so you need to know which one you've got.
A fund is built from several such bets that are uncorrelated *in a crisis*, and it rebalances between them. That
rebalancing can lift the geometric mean even when individual legs are flat or underperform (Shannon's demon). The
goal is "survive, gain exposure to desirable risk, and survive".

## Approach
- **Question**: before trusting a backtest, ask where the P&L comes from: forecasting skill or a harvested mispricing. A mispricing needs an economic story and a crowding risk; skill needs evidence it persists.
- **Evidence**: portfolio legs are judged by behaviour in the stress windows (the 2025 tariff shock, 2022), not by average correlation.
- **Kill rule**: implied. A mispricing dies when crowded out; skill dies when it doesn't persist (the "tennis player next month" problem).
- **Habit**: equal-weight the alpha legs and rebalance; think in geometric (compounded) return, not arithmetic.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Backtest P&L is either "accurately forecasting… relative to the pricing" or "a systematic mispricing… I'm effectively harvesting" (QG) | method | PARTLY. Our studies ask "is there an edge" and "does it survive costs" (research-protocol, execution feasibility gate), but the prereg template (`MD files/PREREG_TEMPLATE.md` §1–8) never asks *which kind* of edge or what would crowd it out |
| 2 | Diversification comes from "strategies with orthogonal capacities", uncorrelated *in a crisis*, not from more assets (QG) | method | PARTLY. Factor blend (trend+yield corr 0.06 halves drawdown) and Portfolio Book measured average correlation; crisis-window correlation not checked as its own test |
| 3 | "Negative correlation and underperformance can actually improve your geometric mean. This is Shannon's demon" (QG) | mechanism | UNTESTED here. The evidence map has 0 entries on rebalancing; `js/entropyCore.js` "Shannon" is entropy, unrelated |
| 4 | "Our objective is to survive, gain exposure to desirable risk, and survive" (QG) | method | ALREADY DO in spirit: stop-risk map, weekend p99, DD-first reading of books |

## What we could learn
- **DON'T DO**: tag every result with its *edge source*: skill vs structural mispricing, plus the crowding/decay risk. Proposed: a line in prereg §1 "The claim": "Edge source: forecasting skill / structural mispricing (who is on the other side and why) / risk premium". It also helps the direction hunt: most of our direction nulls are "skill" claims; the range/vol results that held are closer to structural.
- **DO WORSE**: judge diversification in stress windows, not just full-sample correlation. Portfolio Book reports a full-sample blend.
- **DON'T DO**: measure the rebalancing (geometric-mean) effect when combining books.

## Research ideas
- **Crisis correlation of our books.** Variable: pairwise correlation of the forward/paper books (rule A, residual-fx8, rich-vol paper, trend, yield) · condition: stress windows (VIX top decile, 2020-03, 2022, 2025-04 tariff shock) vs calm · horizons: daily, weekly · noise threshold: bootstrap CI on the correlation difference · benchmark: full-sample correlation · changes: whether the Portfolio Book's diversification claim survives stress. Agenda: **new `portfolio-construction.md`**. Screened: Portfolio Book + factor blend on file (full-sample only).
- **Rebalancing premium.** Variable: geometric return of an equal-weight, periodically rebalanced blend minus the buy-and-hold blend of the same books · horizons: monthly, quarterly rebalance · benchmark: no-rebalance blend · noise: block bootstrap · changes: whether combining near-zero legs adds anything after costs. Same agenda. Screened: nothing on file.

## Quotes
- "Are you harvesting a mispricing that can get crowded out? … And the other one is entirely performance driven." (DfXu__DABEw, 0:10)
- "When there is a crisis, you'll have that leg of the portfolio remain indifferent." (Dfc40GGgYXi, 0:18)
- "Our objective is to survive, gain exposure to desirable risk, and survive." (Dffcq6rDs5R, 0:20)

**Follow-up:** the full YouTube "How Hedge Funds Trade" isn't in the ReelScribe library. These five shorts are its
best clips; the long video would give the full portfolio construction (1 credit if the owner finds the link).
