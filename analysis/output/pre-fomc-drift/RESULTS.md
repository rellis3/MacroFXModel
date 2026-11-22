# pre-fomc-drift — results

Prereg: `forge/PRE_FOMC_DRIFT_PREREG.md` (committed in `dd8e7ff`, 2026-10-26). Run 2026-10-26, seed 20261026,
B = 2000 (placebo 10,000). Branch `ccr-42a42ec1-xka4ex`. Ledger id: `pre-fomc-drift-nq`.
Script `scripts/cb-meeting-drift/pre_fomc.py`.

## Verdict: UNDERPOWERED

NQ from 14:00 ET the day before a scheduled FOMC statement to 13:45 ET on the day, 99 meetings 2014–2026: the event
mean is +21.9 bp against +7.7 bp on matched control days. Event minus control is **+14.2 bp [−4.1, +31.5]** (t 1.56).
The placebo puts it at the 87.8th percentile, and the halves are −6.3 / +33.5 bp. None of the three gates holds. The
interval still includes the +20 bp line, so this is **UNDERPOWERED**, not NULL. Lucca and Moench's 49 bp lies
outside the interval: **the drift at the paper's size is gone in this market since 2014.**

## Scored cells

| Cell | n | Estimate | 95% CI | MDE | Pass bar | p | Cell verdict |
|---|---|---|---|---|---|---|---|
| H1 NQ pre-FOMC 24h | 99 vs 2,715 control | +14.2 bp | [−4.1, +31.5] | 34.9 bp | CI > 0, placebo > 95th, both halves | 0.12 | UNDERPOWERED |

## Controls and concentration

- Placebo percentile 87.8%. Win rate 56.6% against 56.2% on control days: the mean is carried by a few large
  meetings, not by more frequent up-moves.
- Without the 3 largest meetings: +6.9 bp.
- By year (mean event return): 2014 −24, 2015 −10, 2016 −16, 2017 +12, 2018 +37, 2019 +9, 2020 +74, 2021 −12,
  **2022 +139**, 2023 +29, 2024 +39, 2025 +7, 2026 −9 bp. 2022, the hiking year, carries most of it.

## Deviations from the prereg

None.

## Descriptive (not part of the verdict)

- SPX 2018–2026 (67 meetings): +14.5 bp [−2.9, +31.9], win 65.7% against 54.9%.
- The day before that (14:00 ET D−2 → 13:45 ET D−1): +14.6 bp [−7.3, +37.1]. The lead-in looks like a two-day
  drift, not a 24-hour one.
- After the statement (14:00 → 16:00 ET): −9.3 bp, n.s.
- Net of a 1-point round trip: +13.2 bp.

## What this changes

- Pages shouldn't cite Lucca and Moench as a live 50 bp effect. If anything is left, it's a +10–15 bp lean, mostly
  from 2018–2024 and dominated by 2022.
- What would reopen it: the 1994–2013 FOMC dates (Fed website) on longer NQ history, scored as a confirmation of the
  2014–2026 size. A two-day pre-FOMC window would need its own prereg; it was looked at descriptively here.
