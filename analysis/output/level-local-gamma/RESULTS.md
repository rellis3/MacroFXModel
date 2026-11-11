# level-local-gamma: results

Prereg: `forge/LEVEL_LOCAL_GAMMA_PREREG.md` (committed `91827622`, 2026-11-11; amendment A1 power table `f2c2b78a`,
pushed before any outcome was computed). Run 2026-11-11, seed 20261111, B = 2,000 (instrument, ISO-week) cluster
bootstrap. Branch `main`. Ledger ids: `level-local-gamma` (P1), `level-local-gamma-levels` (P2, P3),
`level-local-gamma-gold` (S1), `level-local-gamma-fx` (S2). The prereg named one id for P1-P3 and one (`-fxgold`) for
S1-S2; they are split here per scored question, following the protocol's split rule.

## Verdict: NULL (P1, S2) · UNDERPOWERED (P2, P3, S1)

Dealer gamma repriced at the touch minute does not change whether a price holds or breaks. At random prices on NQ + ES
(P1), the break rate when local gamma is in the bottom tercile (mostly negative) is the same as in the top tercile
(positive). The stratified difference is **−0.2pp [−3.6, +2.8]** (n 3,008 / 3,451, 508 clusters). The CI upper bound is
below the +3pp bar, so by the §5 rule P1 is **NULL**: an effect of the size the literature suggested is ruled out. A 1-2pp
effect is not ruled out. The point estimate also has the wrong sign. FX, the one cell powered by design, says the same
(S2 **NULL**, +0.6pp [−1.3, +2.4], MDE 2.7pp). At real levels (NQ forecast ladder lines plus NQ/ES OI walls), and for the
real-minus-random difference, the intervals are too wide to judge (**UNDERPOWERED**). Gold is underpowered as well.

## Scored cells

D = break rate (bottom LGs tercile) − break rate (top LGs tercile), pp, stratified by approach side × distance bin ×
London block; resolved races only. The prediction was D > 0 (negative local gamma breaks more).

| Cell | n bottom / top | Break % bottom / top | D (95% CI) | Realised MDE | Bar | BH q | Cell verdict |
|---|---|---|---|---|---|---|---|
| **P1** random levels, NQ+ES | 3,008 / 3,451 | 51.5 / 52.0 | **−0.22 [−3.57, +2.82]** | 4.5 | ≥ +3 | 0.82 | **NULL** (CI excludes the bar) |
| … NQ | 1,309 / 1,924 | 50.3 / 51.3 | −0.29 [−5.22, +3.68] | 6.3 | | | |
| … ES | 1,699 / 1,527 | 52.5 / 52.9 | −0.16 [−4.69, +4.12] | 6.5 | | | |
| … halves (early / late) | | | +0.91 [−4.4, +5.3] / −4.74 [−9.5, +1.8] | | | | signs disagree |
| **P2** real levels, NQ+ES | 836 / 1,178 | 52.9 / 54.5 | −1.49 [−6.14, +3.72] | 6.9 | ≥ +3 | 0.82 | **UNDERPOWERED** |
| … ES walls only | 46 / 82 | | not estimable | | | | |
| **P3** real − random (DiD) | | | −1.27 [−5.55, +4.42] | 7.2 | \|·\| ≥ 3 | 0.82 | **UNDERPOWERED** |
| **S1** gold random | 792 / 725 | 48.2 / 51.9 | −2.18 [−8.17, +3.98] | 8.8 | ≥ +3 | 0.58 | **UNDERPOWERED** |
| S1 gold real | 398 / 396 | 49.7 / 55.1 | −0.99 [−10.85, +8.54] | 13.6 | | | UNDERPOWERED |
| **S2** FX random (6 pairs) | 9,332 / 9,103 | 50.2 / 50.3 | **+0.60 [−1.34, +2.42]** | 2.7 | ≥ +3 | 0.58 | **NULL** (powered) |
| … pairs with D > 0 | | | 3 of 6 (only USD/CAD's CI excludes 0: +5.2 [+0.7, +9.6]) | | rule ≥ 4/6 | | fails |
| S2 FX real | 1,381 / 1,559 | 49.4 / 50.7 | +0.60 [−5.53, +5.48] | 7.9 | | | UNDERPOWERED |

No gate passed. P1's gate fails on the bar, the CI, the halves and the both-instruments rule.

## Controls

| Control | P1 (NQ+ES random) | S2 (FX random) |
|---|---|---|
| Neighbour-year book (mirror: shape of a real book, not today's positioning) | +3.03 [−0.94, +6.44]: does not pass, but is *larger* than the real book's −0.22 | −1.52 [−3.21, +0.20] |
| Whole-cluster permutation (2,000) | real D at the 44th percentile (perm sd 1.46pp) | 76th percentile (sd 0.88) |
| Calls/puts swapped | D flips sign exactly (asserted) | same |
| Unresolved counted as hold | +0.36 [−2.85, +3.26] | +1.08 [−0.83, +2.64] |

Outcome shares (all levels): NQ random 49.0% break / 46.0% hold / 4.8% unresolved; ES random 50.7 / 44.1 / 5.1; FX
random 47.5-49.7% break, 3.2-4.1% unresolved; ambiguous ≤ 0.4% everywhere. No cell dropped more than 20%.

## Secondary family (descriptive; BH q = 0.10 within each sample; no survivors)

- **Close window (library: hedging concentrates in the last 30-60 min before the cash close)**: **UNDERPOWERED,
  untestable here.** Only 126 / 93 random NQ+ES touches fall in the last 60 minutes before 16:00 New York (50 / 38 in the
  last 30), so D −9.6pp [−42, +47]. Outside the window, D −0.4 [−3.7, +2.5]. FX last 60 min before the 16:00 London
  fix: +3.7 [−4.0, +12.6] vs +0.4 outside (interaction +3.3 [−4.2, +12.3]). Gold: too few touches.
- **DTE split**: **UNDERPOWERED by construction** on NQ/ES. The CME books are quarterlies, so only 11 scored touches had a
  ≤ 1 DTE contract live and 288 had a 2-5 DTE contract. No stratum reached 10 per arm. The > 5 DTE component alone gives
  −0.47 [−4.1, +2.6] (that is the whole book). FX 2-5 DTE: −0.06 [−7.4, +6.2]; FX ≤ 1 DTE not estimable.
- **Dose**: NQ+ES random bottom-vs-middle −2.6 [−6.2, +0.4], middle-vs-top +2.1 [−1.1, +5.4]. The middle tercile (near
  zero gamma) breaks most (54.4%), and neither end of the gamma range does. FX: −1.2 / +1.2, both CIs include 0.
- **Sign split** (LGs < 0 vs > 0): NQ+ES random +0.08 [−2.65, +2.80]; FX −0.07 [−1.47, +1.35].
- **Local share of gross gamma**: NQ+ES random +2.1 [−0.8, +5.0]; real +3.6 [−1.7, +8.5]; FX real +7.3 [+1.8, +11.6]
  (raw p 0.003, BH q 0.12: does **not** survive; a pointer only, and FX real levels are mostly the EURUSD ladder).
- **Gamma slope just beyond the level**: not estimable within strata on NQ/ES. In a smooth quarterly book the slope's
  sign is set by the approach side (up-approaches see rising gamma), so the strata separate it completely. FX random +2.5
  [−1.9, +8.6].
- **Open-sign control**: the touch-time tercile almost always matches the open-time book sign (with the open book long,
  only 315 random NQ+ES touches are in the bottom tercile), so the touch-time variable has little room to differ from the
  sign that already failed. Within open-long: +0.9 [−12.9, +11.1].
- **Signed σ returns** (×100; + = continuation through the level), bottom − top: NQ+ES random 15 min −0.4 [−2.0, +1.2],
  60 min −1.1 [−4.7, +2.2], 240 min **−5.6 [−10.8, −0.7]** (raw p 0.03, BH q 0.96). This is the opposite of the
  prediction (negative-gamma touches continue *less* at 4 hours), and it does not survive BH.

## Deviations from the prereg

- A1 (PRE-RESULTS) recorded the count-first power table and three clarifications: the stale-book guard, the
  neighbour-year scaling, and gold's book being 97% positive-gamma, so gold's tercile split is a dose test inside long
  gamma. Fewer touches than planned (random level touch rate ~33%, walls 3-8%). P1 was therefore UNDERPOWERED by design
  (MDE 3.9 planned, 4.5 realised), and its NULL rests on the CI excluding the +3pp bar, as the §5 rule says.
- Scoring code fixes made before any number was read. The first scoring run was stopped because the permutation step was
  too slow (rewritten with the same block-permutation logic). The second crashed in the secondary family on a cell with no
  estimable stratum (a guard was added: such cells are reported as not estimable). Outcome arrays were cached between
  runs, and nothing was printed before the final run.
- Ledger ids are split per scored question (above).

## Data caveats

- **CME books only.** The NQ book is ~5% of Nasdaq dealer gamma, and the ES book is a similar small slice of S&P gamma.
  SPX/SPY/QQQ/NDX options and all 0DTE flow are missing. A null here says the *CME* book's local gamma carries nothing. It
  does not say the same of the whole dealer book.
- The NQ/ES books are quarterlies (median nearest expiry ~45 days), so local gamma is a smooth function of price and
  close to the open-time book sign. The test is close to "book sign at the touch" with a dose.
- Sign convention assumed (dealers long calls, short puts). Per-strike IV comes from prior-day settlements. OI lags
  ≥ 1 full day (OI(D) used from D+2).
- Basis: every book price was mapped to CFD space through each expiry's own forward and the CFD price at the CME
  settlement minute (the fix for the wall-placebo audit's missing basis). Inverted FX pairs were run in CME units.
- Ladder lines exist only for NQ, gold and EURUSD (day-reconstruction archive). ES "real" levels are walls only (183
  touches), so P2 is in practice NQ's ladder.
- Window to the 2026-08-21 lockbox; gold to 2026-04-15 (end of the OG pull).

## What this changes

- Pages and the brief should not say that dealer gamma at a price makes a level hold or give way. Local repriced CME
  gamma predicts neither, at random prices or (as far as this data can tell) at walls and forecast lines. The gamma map
  stays a size/vol context (`gex-range-es`).
- No new column, shadow or bot change.
- What would reopen it: the Cboe full-chain archive (SPX/NDX/QQQ/SPY from 2026-10-19), which holds the books that
  dominate dealer gamma and the near-dated strikes where local gamma is actually local. Re-run this design once it has
  ≥ 400 sessions, with the close-window cell as the pre-registered primary (it cannot be powered on CME history: < 250
  touches in the last hour). The FX local-share pointer (+7pp at real levels, q 0.12) would need its own prereg on fresh
  data.
