# raw-line-touch-clock: results

**Pre-registered** (`forge/RAW_LINE_TOUCH_CLOCK_PREREG.md`, prereg commit 7c67841, A1 power 64c5c0e, both pushed
before scoring). Run 2026-11-16, seed 20261116. Scored once.

**Verdicts: H1 `raw-line-touch-clock-range` NULL; H2 `raw-line-touch-clock-hour` NULL.**

Data: 15-minute closes. Discovery: 12 instruments, 2019-01 → 2026-08-21, 139,507 line touches. Confirm: NQ and EURUSD,
2010-07 → 2018-12, 25,373 touches (never used by the two exploratory parent studies). Full tables: `RESULTS_TABLES.md`.
Cells: `h2_cells.csv`. Numbers: `results.json`.

## H1: does a line touch mean more range to come, beyond the clock and the range already used?

**No.** The outcome is the range from the touch to 22:00 London, compared with every ordinary moment of the same
instrument at the same clock hour and the same range-used decile.

| Cell | Discovery | Confirm (2010–18) |
|---|---|---|
| **EXT p75 + p90 (primary)** | **−0.2% [−2.3, +1.8]**, 17,043 touches | **+1.3% [−1.6, +4.2]**, 3,043 |
| p50 lines (EXT/HL/OC) | +2.4 to +2.7% (BH pass) | +2.2 to +2.5% (BH pass) |
| p90 lines (EXT/OC) | −4.7% / −4.3% (BH pass) | −2.0% / +3.2% (n.s.) |
| Yesterday's high | −2.2% (BH pass) | −3.8% (BH pass) |
| Yesterday's low | +2.8% (BH pass) | +4.3% (BH pass) |

The pass bar was +5% in both periods, and A1 showed the design could see 1.9% (discovery) and 2.6% (confirm). Every
cell sits inside ±5%. The small, repeatable pattern (a bit more after a p50 touch or yesterday's low, a bit less after
a p90 touch or yesterday's high) is real enough to pass BH but too small to matter. The clock and the range already
used explain the rest of the day; the line adds nothing material. This matches `live-range-clock`, where price action
added 1–1.5% beyond the clock.

## H2: does the hour of the touch decide whether fading or following wins?

**No.** Each touch got a 1:1 bracket (0.2 U stop, 0.2 U target), fade and follow, priced under both stop-fill models,
against the same trade at the same bar in 10 nearby random sessions. 220 line × 2-hour block × direction cells have
at least 200 touches.

- Edge vs placebo passing BH: 4 cells with kind fills, 22 with harsh, 3 under both. **None is net positive after the
  spread under both**, so no cell reached the confirm check.
- **Kind fills:** fade and follow are exact mirror images in every block, within ±0.011 U. The line carries no
  direction at any hour.
- **Harsh fills:** both lose to the placebo in most blocks. The bars right after a touch move more than ordinary bars,
  so a stop filled at the 15-minute close slips further. That is a cost effect, not a direction.
- **Win rates by hour** (all lines pooled): fade 48.5–53.8%, follow the complement. Nothing is far from a coin flip.

**Post-hoc, describe only:** fading EXT p75 between 10:00 and 11:59 London won 56% (edge +0.026 U vs placebo). In
2010–18 it won 55%, but with n = 192 and a net loss after spread with harsh fills (−0.027 U). It is a pointer for an
M1 look, nothing more.

## What the hour does change: size

All lines pooled, discovery, in U (one typical day's range):

| London block | MFE p50 | MAE p50 | Placebo p50 | Unresolved at 22:00 |
|---|---|---|---|---|
| 00–01 | 0.62 | 0.62 | 0.62 | 0.3% |
| 02–03 | 0.54 | 0.53 | 0.59 | 0.2% |
| 04–05 | 0.49 | 0.49 | 0.56 | 0.4% |
| 06–07 | 0.46 | 0.46 | 0.53 | 0.3% |
| 08–09 | 0.37 | 0.42 | 0.48 | 0.8% |
| 10–11 | 0.36 | 0.34 | 0.43 | 1.3% |
| 12–13 | 0.32 | 0.31 | 0.38 | 2.5% |
| 14–15 | 0.22 | 0.24 | 0.29 | 8.3% |
| 16–17 | 0.16 | 0.16 | 0.20 | 23.2% |
| 18–19 | 0.11 | 0.11 | 0.12 | 40.0% |
| 20–21 | 0.05 | 0.03 | 0.06 | 72.0% |

How far price runs for and against you shrinks steadily through the day, and MFE and MAE stay equal at every hour.
A touch after 16:00 rarely has room for a 0.2 U bracket to finish. Size targets and stops to the hour.

## Caveats

15-minute closes (no wicks; stop fills bracketed by two models). Costs are median OANDA spreads; years before 2016
use 2016. Silver and Brent spreads are assumptions. Only a 1:1 bracket at 0.2 U was scored for H2.
