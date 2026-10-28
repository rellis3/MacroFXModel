# daily-open-fib-retest — RESULTS (run 2026-10-28)

Prereg: `forge/DAILY_OPEN_FIB_RETEST_PREREG.md` (amendment A1, pre-results, 2026-10-28: bid/ask fills primary).
Scripts: `scripts/daily-open-fib-retest/` (18 unit checks pass; synthetic random walk NULL, planted edge VALIDATED).
Raw output: `results_ba.json` (primary, bid/ask file), `results.json` (registered mid cell), `trades_<pair>[_ba].csv`.
Seed 20261027, block bootstrap 20 sessions, B = 2000. Lockbox respected: last session scored opens 2026-08-19.

## Verdict: **NULL**

The strategy loses on real fills, and it has no edge in price before costs either. Powered: MDE 0.10R against a
+0.15R pass bar.

## 1. The gate (gold, primary: anchor = opening wick, impulse ≥ 0.10 ADR, target the 0 = 5R, BE at 1R)

| | Bid/ask fills (PRIMARY) | Mid + 0.30 cost, same sessions | Mid + 0.30, registered file |
|---|---|---|---|
| Sessions (2016–2026) | 2,516 (from 2016-10-23) | 2,516 | 2,723 (from 2016-01-17) |
| Trades | 1,252 | 1,654 | 1,796 |
| Mean R per trade | **−0.72 [−0.82, −0.63]** | −0.55 [−0.65, −0.46] net; −0.05 [−0.13, +0.04] gross | −0.56 [−0.65, −0.47] net; −0.05 [−0.12, +0.03] gross |
| Halves | −1.00 / −0.48 | −0.70 / −0.40 | −0.72 / −0.40 |
| Win rate | 3.8% | 10.9% | 10.8% |
| Mid gross vs 28 shifted opens | beats 15 of 28 | — | beats 14 of 28 |
| MDE (pass bar 0.15) | 0.10 | 0.10 | 0.12 |
| Gate legs (CI > 0 / both halves / all shifts) | ✗ / ✗ / ✗ | | ✗ / ✗ / ✗ |

On the 1,220 sessions where both models trade, mid gross is −0.02R and bid/ask is −0.73R: **the spread costs ~0.7R
per trade.** The median spread at the fill is 0.49R (p90 1.09R); in the first 15 minutes after the open it is ~1.0R
and those trades average −1.69R.

**Money view (bid/ask primary):** ~114 trades a year, −906R over 2016-10 → 2026-08, every year negative (2017 −0.96R
per trade … 2026 −0.19R per trade; best year still negative), max drawdown 914R, i.e. the curve only goes down. At
1% risk per trade the account is gone in the first year.

Exits (bid/ask): stop 1,007 · break-even 198 · target 41 · time 6. On mid: stop 944 · BE 530 · target 167 · time 13.
Two bid/ask mechanics drive the gap: the target needs the **ask** at the impulse low (the bid must take the low by a
full spread), and the break-even trigger needs +1R on the ask. On a bid-drawn chart, sells fill on a touch while buys
need the ask down at the bid-drawn low, so 81% of bid/ask trades are sells (mid: 50/50).

## 2. Against chance and other start times

- **Random walk.** The 5:1 trade breaks even at a 1-in-6 win rate; gold's mid race to the 0 before the 1.2 is
  0.151 [0.136, 0.168] against 1/6 = 0.167 and against 0.153 at the shifted opens. The real open behaves like any
  other hour.
- **Shifted opens.** Mid gross −0.05R beats 14 (registered) / 15 (bid/ask file) of 28 pseudo-opens 30–840 minutes
  later: the middle of the pack. With bid/ask fills the real open beats **0 of 28**, because the spread is widest at
  the open (descriptive only; leg 3 of the gate is on mid by A1).

## 3. Variants (36 per model; BH q = 0.10)

No variant on gold, NQ or EURUSD, in either model, has a positive mean that survives BH. On gold:
- least bad with bid/ask: `do | imp 0.30 | target 0 | no BE` −0.21R [−0.46, +0.05] (n 183);
- least bad on mid net: `do | imp 0.30 | 3R | no BE` −0.05R [−0.28, +0.19] (n 209);
- 2R and 3R targets don't rescue it (bid/ask −0.71 / −0.72 at the primary settings vs −0.72 at 5R).
Bigger impulses lose less in R only because the fixed spread is a smaller share of a bigger stop; gross R falls
with impulse size (0.10–0.15 ADR −0.03, > 0.40 ADR −0.18 on mid).

## 4. Which parts hold up (null decomposition, prereg §8)

| Part | Gold | NQ (descriptive) | EURUSD (descriptive) |
|---|---|---|---|
| C1 impulse ≥ 0.10 ADR before 05:00 UK | every session (100%); median 0.15 ADR; median 1R = 0.030 ADR; median cost 0.46R | 98% | 100% |
| C2 price returns to the 1 | 66% vs 72% at shifted opens (range 64–83%): no more than chance | 48% vs 61% | 61% vs 72% |
| C3 sweep beyond the 1 before the 0 | = random walk and shifts at every level (e.g. P(1.618 first) 0.576 vs shift 0.602, inside the band) | **less** than chance at 1.382–1.618 (0.55 vs 0.61 at 1.618) — candidate | **less** at every level (1.618: 0.51 vs 0.60) — candidate |
| C4 depth before the 1.2 | = shifts at every level (0 first: 0.151 vs 0.153) | **less** reach to the 0 (0.127 vs 0.144) — candidate | **more** at 0.618 → 0 (0 first: 0.188 vs 0.159) — candidate |
| C5 break-even | neutral: of BE exits, 16% would have gone on to the 0 (chance ≈ 17%); BE on vs off −0.72 vs −0.73R bid/ask | neutral | neutral |
| C6 slices | negative in every year, regime and impulse bucket on bid/ask; anchor set > 60 min after the open +0.21R gross on mid (n 158, uncorrected, descriptive) | — | — |

**Reusable candidates** (outside the random-walk CI and the shifted-open 5–95% band, same side in both halves, BH
q 0.10): none on gold; on EURUSD, the retest of the opening extreme **holds better than chance** (fewer sweeps
past it, more runs back to the impulse extreme); on NQ, after the retest price **stalls** (fewer sweeps far past it
and fewer runs to the 0). These are listed in `plans/MISC_STUDIES.md` as inputs for later preregs, not results.
EURUSD's version is real in price (+0.09R gross [−0.01, +0.20], beats all 28 shifts) but costs ~0.8R per trade at
this leg size (bid/ask −1.20R).

## 5. The screenshot trade: typical or lucky?

Lucky. The 26 Oct 2026 session is in the lockbox and after the bid/ask file ends (2026-10-20), so it can't be
scored directly, but the type can: on mid, 10% of primary trades reach the 0; with bid/ask fills, 3.3% (41 of
1,252). His target was taken by 3 cents on the bid; a 5R exit on the ask needs the bid a full spread (≈ 0.3–0.5 at
that hour) beyond the low, which that print didn't reach (the unit check reproduces this), and the break-even stop
came within cents of the entry. On real fills that trade was most likely a break-even or a small loss.

## 6. Checks before trusting the output

- Sessions ≈ 257 a year, 2,723 (registered file, starts 2016-01) and 2,516 (bid/ask file, starts 2016-10); fill
  rate 66%, a little under the 70–80% the random walk gave.
- No session after 2026-08-20: last key 2026-08-19 (the 08-20 session is cut by the file end and dropped).
- Spot check: 2022-04-03 sell traced independently from raw M1: fill 00:03 UTC at 1925.24, 0 = 1921.485, 1R =
  0.751, stop touched 00:15 → −1R, exactly as the engine scored it (price then reached the 0 at 02:09, after the stop).
- Code fault ruled out for the null: the same engine recovers a planted edge (+0.21R, VALIDATED) and gives zero on a
  random walk; mid gross on two independent files agrees (−0.05 / −0.05); mid gross by year scatters around zero
  (−0.19 … +0.14), mid net is negative in every year except part-year 2026 (+0.05, Jan–Aug), bid/ask is negative in
  every year; 0 rows dropped as invalid in the bid/ask file.
