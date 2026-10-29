# fiscal-event-reaction — results

**Run 2026-10-28.** Prereg: `forge/FISCAL_EVENT_REACTION_PREREG.md` (registered in c59fae96; A1, pre-results, in 9cab7e08, before any price was fetched). Seed 20261028, iid bootstrap over events, B = 2000. Numbers: `results.json`. Site data: `backfill/fiscal_history.json`.

Data: OANDA mid M1.
- UK: 32 scheduled events, 2010-06-22 → 2026-03-03, in a window from 5 min before the statement to 180 min after.
- US: 75 refunding statements, 2008-01-30 → 2026-08-05, from 08:25 to 10:00 New York.
- Each event is compared with the same clock window on 8 preceding same-weekday non-event days.
- The 2026-10-28 Budget is past the lockbox, so it is shown and not scored. The gilt closed the window exactly where it opened it, with a normal-sized range (0.95×).

## Scored cells (Holm over 4)

| Cell | n | Estimate | 95% CI | Holm p | MDE | Verdict |
|---|---|---|---|---|---|---|
| S1 UK 10y gilt, size ratio (net move) | 32 | 1.19× | [0.72, 1.76] | 1 | 1.48× | **UNDERPOWERED** |
| S2 US 10y, size ratio (net move) | 75 | 0.94× | [0.72, 1.21] | 1 | 1.30× | **NULL** |
| D1 UK gilt revision vs 10y bp (Spearman) | 13 | +0.42 | [−0.31, +0.91] | not scored | ρ 0.55 | **UNDERPOWERED** (below the 15-row floor, A1) |
| D2 US coupon change vs 10y bp (Spearman) | 75 | −0.04 | [−0.30, +0.24] | 1 | ρ 0.32 | **NULL** |

What these mean:
- **S1:** the gilt's net move over the three hours is not reliably bigger than an ordinary day's. Three events carry the point estimate: Budget 2025 (7.9×), Budget 2020 (7.7×) and Budget 2021 (7.0×). Without them the ratio is 0.98×. The interval still reaches the 1.48× the design could detect, so the verdict is underpowered, not null.
- **S2:** a refunding statement does not move the 10y more than an ordinary 08:30 Wednesday. The interval excludes the 1.30× the design could detect.
- **D2:** announcing bigger or smaller coupon auctions does not set the 10y's direction in the 90 minutes after 08:30.

## Described, not scored

- **The range tells a different story from the net move.** The high-to-low range in the UK window is **1.63× an ordinary day [1.36, 1.97]**, and in the US window 1.13× [1.03, 1.24]. Budgets make gilts swing more while the statement is read, but the net change by the end of the window is no bigger. This was registered only as a described cell, so it is a candidate for its own prereg, not a result.
- Net-move ratios (BH q in brackets):

  | Cell | Ratio | 95% CI | n | BH q |
  |---|---|---|---|---|
  | GBP/USD | 0.78× | [0.48, 1.21] | 32 | 0.44 |
  | FTSE 100 | 1.02× | [0.71, 1.47] | 32 | 0.90 |
  | Gilt incl. the 2022 Growth Plan and the 17 Oct statement | 1.29× | [0.82, 2.03] | 34 | 0.44 |
  | US 2y | 0.87× | [0.61, 1.20] | 49 | 0.49 |
  | US 30y | 1.18× | [0.93, 1.45] | 75 | 0.44 |
  | US 10y, coupon-change statements | 1.32× | [0.83, 2.08] | 23 | 0.44 |
  | US 10y, no-change statements | 0.81× | [0.60, 1.04] | 52 | 0.44 |

  The US 2y has gaps in OANDA's history between 2012 and 2021 (26 events dropped). None of these survives BH.
- **Spot checks against the record:**
  - Growth Plan, 23 Sep 2022: gilt yields +30bp in the window, 26× an ordinary day.
  - Autumn Budget 2024: +15bp.
  - Budget 2025: −6.6bp after the early OBR release.
  - November 2023 refunding: the 30y fell 6.4bp, the "smaller increase than feared" rally.
  - August 2023 refunding: the 30y rose 3.9bp.
- **The UK revision rows (D1, description only):** 13 in-year revisions from −£57.8bn (Oct 2021) to +£19.2bn (Oct 2024). ρ is positive but the interval is wide.

## Audit before calling it null

Time zones checked: 12:30 London is 11:30 UTC in BST and 12:30 UTC in GMT; 08:30 New York is 12:30 UTC in EDT and 13:30 UTC in EST. No windows failed to fetch (2,970 of 2,970). Control days on both sides of a clock change keep the local clock. An event needs at least 4 control days; only the US 2y dropped events. The exact-zero gilt move on 2026-10-28 was checked by hand (85.228 at 12:24 and at 15:29).

## What this changes (prereg §8)

- The Fiscal Events page and the event page say that these events widen the swing while the statement is read but have not left a bigger net move by the end of the window, and that supply news has not set direction.
- The supply chip stays a description of the documents, with no "more supply = higher yields" wording.
- The read stays context.
