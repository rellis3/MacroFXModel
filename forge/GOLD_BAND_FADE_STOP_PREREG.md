# gold-band-fade-stop: does the "arm, then retest" stop-order fade of gold's forecast bands make money?

**Pre-registered 2026-11-27, before any trade of this mechanism has been simulated.**

| | |
|---|---|
| ID / ledger id | `gold-band-fade-stop` |
| Branch | `jvphone` (pushed to main through the sparse worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `gold-band-fade-stop` |
| Source | **Owner, 2026-11-27:** a 4-page PDF, "ForecastBandFade.cs — entry mechanism", describing a NinjaTrader strategy on gold (GC). The owner has no `.cs` file: "you have to build the logic to match the document". Every rule below comes from the document. Where it is silent, the gap-fill is marked **(assumed)** |
| Lines | Gold's forecast HIGH and LOW from the ladder: HIGH = open × (1 + OH width), LOW = open × (1 − OL width), at P75 and P90. Widths are walk-forward (each test year fitted on earlier years only, `hits_and_gap` in `scripts/gold-calc-upgrades/score.py`). Two calcs: the **export** calc (live QLIKE export: futures HARCJ; CFD R15 on OH, HARCJ on OL) and the **shadow** calc (N7_ALL, `gold-calc-upgrades`) |
| Data | GC futures 1-minute bars, unadjusted (NT8, `ladder.load_m1("GOLD","F","unadj")`) = primary. OANDA XAU_USD M1 (`"C"`) = replication. Session 00:00–22:00 London. Test 2020 → 2026-08-21 (lockbox respected) |
| Seed | `20261127` |
| Uncertainty | 63-session block bootstrap of the per-session net R, B = 2000, 90% CI |
| Scripts / outputs | `scripts/gold-band-fade-stop/` → `analysis/output/gold-band-fade-stop/` |
| Live impact | **None.** Research only; no bot, order or export changes |

## 1. The mechanism (from the document)

Short side shown; the long side is the mirror image at the forecast LOW.

1. **Touch and arm.** Price trades above a forecast HIGH by at least the *arm margin* = 10% of the stop distance
   (document: $0.75 past $3,600). A sell-stop order is then armed at the line. Nothing is filled yet.
2. **Retest and fill.** Price trades back down to the line: the sell-stop fills short at the line.
3. **Stop and target.** The stop is the line + the stop distance (document: $7.50). The target is **the session open**
   (assumed from the document: both the short from the P90 HIGH at $3,600 and the long from the P90 LOW at $3,560 target
   $3,580, the midpoint of the two bands, which is the open the bands are built from).
4. **Cancel.** If, while armed and unfilled, price runs past the line + 1.2 × the stop distance (document: $9.00), the
   order is withdrawn. No trade.
5. **Chase.** If, while armed at the P75 line, price touches the P90 line on the same side with the arm margin, the P75
   order is cancelled and a fresh sell-stop is armed at P90.

**Gap-fills (assumed; the document says nothing):**
- Flat at the session's last bar (22:00 London) at that bar's close.
- One position at a time. When an order fills, every other armed order is cancelled.
- Each line can arm at most once per session (a cancelled, chased-away or traded line is spent for the day).
- No arming while a position is open.
- If a bar opens beyond the stop, the stop fills at that bar's open.

## 2. Arms

| Arm | Stop distance | Lines |
|---|---|---|
| **A1 FIXED·export** | $7.50 (as the document) | export calc |
| **A2 FIXED·shadow** | $7.50 | shadow calc (N7) |
| **A3 SCALED·export** | 0.375 × the distance from the open to that side's P90 line (the document's own ratio: $7.50 / $20) | export calc |
| **A4 SCALED·shadow** | as A3 | shadow calc |

In every arm, the arm margin = 0.10 × stop and the cancel = 1.2 × stop beyond the line.

## 3. Fills inside a 1-minute bar

The arm margin is $0.75. One minute bar often holds the touch, the arm and the retest, so the order inside the bar is
unknown. Two bounds are run:
- **PESSIMISTIC (primary):**
  - inside any bar, the adverse event comes first;
  - a fill in the same bar as the arm is allowed;
  - in the fill bar, the stop is hit if the bar reaches it;
  - when the stop and the target are in the same bar, the stop wins;
  - when the cancel and the fill are in the same bar, the order is filled and then stopped.
- **OPTIMISTIC (upper bound, descriptive):** the favourable event comes first:
  - the target wins over the stop;
  - the cancel wins over the fill (no trade);
  - in the fill bar, the stop counts only if the bar closes beyond it.

## 4. Costs

- **Futures**, per round trip in price terms (1 MGC):
  - 1 tick ($0.10) of slippage on the stop-order entry;
  - 1 tick on a stop-loss or time exit;
  - $0.12 of commission ($1.20 per MGC).
- **CFD:** $0.40 per round trip (OANDA spread plus slippage).
- **Result unit:** net R = (P&L − cost) / stop distance.

## 5. Hypotheses and gates

**Primary metric**, per arm: mean net R per trade, futures, pessimistic fills, 2020 → 2026-08-21.

- **H1–H4** (one per arm): mean net R > 0.
- **VALIDATED** if, for that arm:
  1. the 90% CI is entirely above 0;
  2. it survives BH q = 0.10 over the 4 arms (one-sided bootstrap p);
  3. both halves (2020–22, 2023–26) are > 0;
  4. it beats the shuffled-lines placebo PL1 (above PL1's 95th percentile);
  5. the CFD point estimate (pessimistic) is > 0.
- **NULL** if the CI's upper end is below +0.05 R (a useful edge is ruled out).
- Otherwise **UNDERPOWERED**.

**Placebos and controls:**
- **PL1 shuffled lines:** each test day gets the band widths (% of open) of another test day in the same year (random
  permutation within year), same mechanism, 200 permutations. It asks whether the forecast lines matter, or any lines
  this far from the open would do.
- **PL2 raw fade:** a limit order at the line, filled on first touch (no arm, no retest, no cancel, no chase), with the
  same stop and target. It asks whether the arm-and-retest filter itself adds anything.

**Descriptive (no verdict):**
- the optimistic bound;
- per level (P75 / P90) and per side;
- the outcome counts: armed, filled, cancelled, chased, target, stop, time exit;
- win rate, average win and loss in R, net $ per MGC per year;
- by year;
- a variant with a fixed $20 target in place of the open;
- the P50 lines added.

## 6. Power

Gold touches a P75 line on roughly 25–30% of days per side (`gold-calc-upgrades` hit rates), so this gives about
600–900 armed setups over 2020–26. With R-outcomes of SD ≈ 1.2, the 90% CI half-width is about ±0.08 R. An edge
of 0.1 R per trade or more is detectable; smaller ones will be UNDERPOWERED.

## 7. What each verdict changes

- **VALIDATED:** a forward paper record on post-lockbox data before anything else. No live change without the owner.
- **NULL / UNDERPOWERED:** recorded with graded weight. The parts (arm filter, stop size, target) are reported
  separately per the decomposition rule, so whatever works is kept as an input.

## Amendments

(none)
