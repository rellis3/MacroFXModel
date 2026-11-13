# noise-area-momentum — results

Prereg: `forge/NOISE_AREA_MOMENTUM_PREREG.md` (committed in `debecee9`, 2026-11-13; amendment A1 pre-results in
`e78c64a5`). Run 2026-11-13, seed 20261113, B = 2,000 (week-clustered), permutation null 200 draws (ES, NQ) / 100
(YM, RTY). Branch `main`. Ledger ids: `noise-area-momentum`, `noise-area-momentum-book`, `noise-area-momentum-stop`.
Page: `noise-area-momentum.html` (standard backtest view; any cost, period and variant).

## Verdict: UNDERPOWERED (all three questions), with a strong Nasdaq cell

The paper's band + VWAP rule (V2, 1x, net of 1 tick each side + $4.50) **passes every part of the gate on NQ** and
misses it narrowly on ES, so P1, which needs both, is UNDERPOWERED:

- **NQ:** net Sharpe **1.23** [0.78, 1.69], mean 4.2 bp/day [2.5, 6.0], above all 200 shuffled-minute histories (null
  mean 0.35, 97.5th pct 0.70), halves 1.14 / 1.32, futures-only days 1.24. The paper's FAQ reports 1.23 for Nasdaq futures.
- **ES:** net Sharpe **0.47** [−0.04, 0.98], mean CI [−0.05, +2.6] bp/day touches zero, above all 200 shuffled draws
  (null mean −0.80, 97.5th 0.40), halves 0.21 / 0.75. Gross it is 1.03; costs take 1.5 bp/day. Not a null (CI top 0.98 >
  0.62).
- **P2 book** (V3 vol-targeted, ES+NQ+YM+RTY equal weight): Sharpe 0.39 [−0.19, 0.89], beats 100% of shuffled books,
  halves 0.27 / 0.51. YM (−0.02) and RTY (−0.79 at 1x) drag it down. UNDERPOWERED.
- **P3 stop** (V2 − V1, ES+NQ, 1x): −0.23 bp/day [−1.45, +0.99], halves +0.23 / −0.68. The tighter stop does **not** add
  return; it adds Sharpe on ES and NQ by cutting volatility and drawdown (NQ MDD 19% → 11%), not by earning more.
  UNDERPOWERED.

**The build is faithful:** our ES V3 monthly returns correlate **0.94** with the paper's published SPY table over 116
months (2016-01 → 2025-08). The positive control passed (random walk −0.86 bp/day, t −0.79; planted day trend Sharpe 1.55).

## Scored cells

| Cell | n (days) | Estimate | 95% CI | MDE | Pass bar | Null pct | Cell verdict |
|---|---|---|---|---|---|---|---|
| P1 NQ V2 net Sharpe | 2,670 | 1.23 | [0.78, 1.69] | ~0.92 | > 97.5th pct, mean CI > 0, both halves > 0 | 100.0 | passes |
| P1 ES V2 net Sharpe | 2,670 | 0.47 | [−0.04, 0.98] | ~0.92 | same | 100.0 | fails (mean CI lower −0.05 bp) |
| P2 book V3 net Sharpe | 2,671 | 0.39 | [−0.19, 0.89] | ~0.7 | same; NULL if top < 0.66 | 100.0 | underpowered |
| P3 V2 − V1 mean (bp/day) | 2,670 | −0.23 | [−1.45, +0.99] | — | CI > 0, halves > 0; NULL if top < 0.35 | — | underpowered |

## Controls

- **Permutation null** (each day's minute returns shuffled; open, close, gap, daily range scale kept; whole history
  rebuilt). Real Sharpe beats: ES V1/V2/V3 100/100/100%, NQ 100/100/100%, YM 97/99/100%, RTY 35/65/99%. The null is
  not zero: on NQ it averages +0.35 because a big day's move still breaches the band in any order. The real NQ edge is the
  *ordering* above that.
- **Mechanics vs paper:** monthly ρ 0.94 (0.94 to the paper's Apr 2024 cut-off). Yearly ES V3 vs paper SPY: 2016 −34% vs
  −13%, 2017 −25% vs −7%, 2018 +43% vs +61%, 2020 +23% vs +27%, 2023 +27% vs +37%, 2024 +26% vs +32%, 2025 (to Aug)
  −4% vs +1%. Same shape, lower level: our futures costs are ~4× the paper's (1.5 bp vs ~0.4 bp round trip) on ~0.9
  round trips a day at ~2.7x leverage.
- **Futures-only days** (drop the 277 CFD-filled ES days): ES V2 0.66, NQ 1.24, so the fill is not the story.

## Decomposition (prereg rule; first V2 entry each day, gross, 1x)

| Part | ES bp (halves) | ES null pct | NQ bp (halves) | NQ null pct |
|---|---|---|---|---|
| Entry → next 30 min | +1.10 (0.75 / 1.44) | 96.5 | +1.05 (0.52 / 1.57) | 75.5 |
| Entry held to 16:00, no stop | **+3.44** (3.76 / 3.13) | 99.5 | **+7.26** (5.98 / 8.51) | 99.5 |
| What the band + VWAP exits add | +1.14 (0.50 / 1.77) | 71.5 | +0.95 (2.06 / −0.13) | 63.5 |

BH q 0.10 over the 6 cells (p = 1 − pct; 200 draws, smallest p 0.005): **pass: ES hold, NQ hold, ES entry-30**. The
reusable part is the **breach of the noise band followed to the close**, not the stop. Listed in `plans/MISC_STUDIES.md`
as a candidate.

## Deviations from the prereg

A1 (pre-results): NT8 futures have ~6-week holes inside contracts (DATA_SPEC #24), filled with OANDA CFD minutes scaled
to the futures (ES 277, NQ 268, YM 283, RTY 288 days); US-holiday Globex sessions dropped. No other deviation.

## Descriptive (not part of the verdict)

- **Cost is the ES story.** ES V2 Sharpe: gross 1.03, paper's ~0.4 bp cost 0.90, commission only 0.94, + ½ tick each
  side 0.70, + 1 tick (prereg) 0.47. NQ: 1.42 / 1.32 / 1.36 / 1.30 / 1.23. One ES tick is ~0.6 bp of price; one NQ tick
  ~0.2 bp on a market that moves ~1.5× as much.
- **After publication** (May 2024 → Aug 2026, prereg costs): NQ V2 0.97 Sharpe (+21.7%), V3 0.93 (+35.9%); ES V2
  −0.09 (−1.6%), V3 0.09 (+0.3%); RTY V2 −1.34. The paper's own post-publication SPY record is flat (2025 to Aug +1.0%).
- **Variants** (Sharpe net, ES / NQ): V1 opposite band 0.40 / 1.03; V2 0.47 / 1.23; V3 vol-target 0.44 / 1.15
  (MDD 53% / 30%); V4 VWAP-only 0.59 / 1.18; V5 band-only 0.41 / 1.17; V6 90-day lookback 0.50 / 1.15; V7 band ×1.5
  0.63 / 0.91. The paper's "best" settings do not carry over consistently.
- **Vol regime** (σ_daily terciles, V2): ES 0.14 / 0.32 / 0.76, NQ 1.07 / 1.29 / 1.39 — better in loud regimes, as the
  paper found with VIX.
- **Long vs short** (gross bp/day, V2): ES +1.72 / +1.02, NQ +2.85 / +1.98; both legs earn.
- **YM ≈ 0 and RTY negative** at every cost (RTY V2 gross −0.38). The paper's futures table gave Russell its weakest
  index Sharpe (0.45).
- Trades (round trips, V2): ES 2,342, NQ 2,271 (~0.88/day); hit ratio on traded days 41% / 44%.

## What this changes

- No page or bot may say this rule is validated on index futures. NQ alone looks like the paper's claim (1.23 net,
  both halves, beats the shuffled null, holds after publication), but it was one of two required cells. Next: a
  **frozen NQ-only forward paper record** (pre-registered, V2 1x and V3, NT8 bridge, prereg costs), and a breadth prereg
  on other futures with spread/vol below ES's.
- ES is a cost question: at a passive half-tick fill it would be ~0.70. Execution, not signal, decides it.
- The stop rule (P3) is a risk tool, not a return source; the earning part is breach → hold to the close.
