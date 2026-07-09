# Conditional-fade design note

**Status:** design + first screen built (this PR). Not a live strategy — a
falsification screen. Read alongside `BOT_DECISION_QUESTIONS.md`.

## Where this came from

The re-run on **recalibrated** bands showed something worth chasing:
- **G1 PASSED** — the forecast median beats a same-distance jittered placebo by
  **+15.4pp** reversal, robust across 5 types. The level placement carries real
  information (I'd predicted ≈ placebo; wrong).
- **G2 = SHORT-GAMMA** — the fade is negatively skewed with brutal tails
  (worst-day hold-to-close losses of hundreds of points).
- **Cost survival still fails on FX** — median net ×1 ≈ −0.94 pips; only indices
  "survive", and those are a trap (~1–2 correlated bets, fattest tails, optimistic
  index cost).

So: **real information, wrong harvest.** The blind median fade is short-gamma and
dies on costs. This note is the honest attempt to harvest the G1 information a
better way — and to say clearly what "it worked" vs "it didn't" looks like.

## The three level sets (and a forecaster finding)

There are three families of forecast level, and the study now analyses all of them:

1. **Open-Close** median & 75th (chart: "Close Med", "Close 75p") — symmetric
   displacement from the open (`oc_median`/`oc_75`).
2. **Open-High / Open-Low** median & 75th ("Proj H/L med / 75p") — the
   **drift-adjusted, asymmetric** levels the forecaster exports (GOLD: +1.13% up
   vs −1.44% down). **Correction:** the touch study *was* reading the flat
   `oh_median`/`ol_median` fields, which `computeForecast` aliases to `oc_median`
   — collapsing O-H, O-L and O-C into one line. It now reads the **`oh_v2_*` /
   `ol_v2_*`** drifted-BM fields (daily), so O-H ≠ O-L ≠ O-C — no duplicated lines.
   (Weekly/20d have no v2 field, so their O-H/O-L stay flat ≡ O-C — noted.)
3. **Dynamic H-L / L-H range** median & 75th — the opposite extreme projected from
   the **running high/low** by the forecast H-L range (2.17% / 2.72%), and it
   **moves intrabar** as new extremes form. The genuinely distinct set, the reason
   the M1 walk matters, and exactly the NAS example: the morning **high** anchored
   a projected **low** a full range below; price hit it later and reverted.

So the screen now compares **seven fade lines** net of cost:
1. **Open-Close** — symmetric displacement fade.
2. **Open-High/Open-Low (drift-adjusted)** — the real asymmetric extremes.
3. **75th O-H/O-L** — more extended → should revert harder (exhaustion), touched less.
4. **Calm-day O-H/O-L median** — the fade on low-tail-risk days only (filter below).
5. **Dynamic H-L (median)** — fade the projected extreme from the running high/low.
6. **Dynamic H-L (75th, Feller)** — same, at the wider Feller 75th range (fixed 1.303× the median).
7. **Dynamic H-L (75th, empirical ratio_yz)** — same running-extreme fade, but the
   75th band is the **band-calc A/B winner**: the *empirical* 75th percentile of
   realized÷forecast H-L (causal, prior windows), not the theoretical Feller p75/p50.

### Why the ratio_yz line is only a **75th** re-test

The band-calc A/B (`bandCalcAB.js`) found `ratio_yz = σ × trailing_quantile(realized÷σ)`
the best-calibrated range calc (exceed-median 50.2% / exceed-75 25.9%, keeping the
vol-forecast's sharpness). But the touch study's **recalibrated dynamic median**
band already *is* `ratio_yz.med`: the recal factor is `median(realized÷forecast H-L)`
and `forecast H-L = BM_P50 × corr × σ`, so the constant cancels and
`forecast × recalF ≡ σ × median(realized÷σ)`. The only band that was **not**
properly calibrated was the dynamic 75th — it multiplied the *median* recal factor
onto the Feller-75 line, i.e. a fixed `BM_P75/BM_P50 = 1.303×` the median. Line 7
replaces that with the genuine empirical p75 factor, so it is the one material
re-test of the fade on ratio_yz bands.

The dynamic levels are the most *extended*, so on the exhaustion logic they should
show the strongest reversion — the question the cost screen answers is whether that
reversion is big enough per touch (they're touched less often) to clear costs on FX.

### Level DISTANCE sweep — where does the fade clear cost, and where does COG sit?

The σ A/B showed the dynamic *median* doesn't clear ×2 in any σ, while the *75th*
(more extended) clears ×2 on 2 pairs — consistent with exhaustion needing DISTANCE.
And COG's median runs **wider** than ours (gold +7%, NQ +12%; ~20–40% of the way
from our median to our 75th on the instruments the user actually trades), which is
plausibly *why* COG's "median" is tradeable: it is a more-extended level.

So the sweep pushes the dynamic median distance out `×1.0 … ×1.4` (median → past the
Feller 75th) and reports net-of-cost at each distance, **both FX-only and
all-instrument (indices/gold INCLUDED, un-discounted)** — because the wide-COG
instruments (NQ, US30, DE30, gold) are exactly the ×2 survivors, and the FX-aware
verdict was hiding them. `touches.dynSweep{100..140}Extension` per multiplier;
`costSurvival.costSweep` folds them; the sweep table renders on
`cross-pair-research.html`. **Reads:** if net-of-cost peaks *between* median and 75th
(where COG sits) on ≥3 instruments, that distance is the tradeable exhaustion zone
and COG's level is explained; if it only peaks at the far 75th, COG's "median" is
just our 75th relabelled.

### σ half-life A/B — do responsive bands exhaust better? (level-set #3c)

The COG-gap diagnostic (`COG_GAP_FINDINGS.md`) found the production primary
**Yang-Zhang(30) is the stickiest estimator we have** — the daily forecast barely
moves while realized vol changes. That raises the exhaustion question directly: if
the band is built from a **shorter half-life** σ (EWMA λ0.94 / λ0.90) so it widens
and narrows with recent vol, does price **exhaust** (revert) at it more reliably —
or just fly through? Two extra dynamic-median lines answer it:

- `dynE94Extension` — dynamic H-L median from **EWMA λ0.94** σ (~11-day half-life).
- `dynE90Extension` — dynamic H-L median from **EWMA λ0.90** σ (~6.6-day half-life).

Each is **self-recalibrated to realized** (its own trailing `median(realized ÷ σ-HL)`),
so the A/B isolates *responsiveness*, not calibration — both land at the same
average width; only their day-to-day movement differs. Compared head-to-head with
the sticky YZ30 dynamic median (`dynExtension`) on the SAME exhaustion metrics
(reversion rate + cost survival). **Pre-registered:** a shorter σ "wins" only if it
clears cost on **≥3 FX pairs across ≥2 types at ×2** *and* beats the YZ30 dyn line's
reversion — otherwise price flies through the more-responsive band and there is **no
case to change the engine's estimator.** Folded into `costSurvival.byLine.dynE94 /
dynE90`; visible in the cost-line picker on `cross-pair-research.html`.

## The tail filter (conditional fade)

The short-gamma tail lives on the **7.8% of trend-expansion days** (195%
completion, 95% miss). The hidden-relationship scan says *when those are more
likely*: high forecast-time **vov**, high annual vol, **post-big-miss** days. So a
"calm" day is defined causally as:

> **calm = forecast-time vov ≤ its trailing median  AND  the prior window did not
> blow through (realized ≤ 118% of forecast).**

Both inputs are known at the open (vov is forecast-time; the prior window is
history) — no lookahead. Fading only on calm days should trim the tail and lift
net-of-cost. Implemented as `touches.conditionalCalm` in the engine; folded into
`costSurvival.byLine.calm`.

## Live result (2026-07-09 re-run, recalibrated ×0.84)

Cost survival, FX-only (indices discounted), median net ×1 per line:
- Open-Close −1.03 · O-H/O-L (drift) −1.04 · O-H/O-L 75th −0.54 · calm-day −1.20
- **Dynamic H-L (median) −0.08 (≈breakeven)** · **Dynamic H-L (75th) +0.28, 2 FX pairs clear ×2**

**The dynamic (running-extreme) levels are dramatically better than the static
open-anchored ones** — the static fades are all ≈ −1 pip; the dynamic 75th is the
only line with a positive FX net and the only one where any FX pair clears ×2.
That validates the M1-walk thesis and the user's NAS example. **But it does NOT
clear the pre-registered bar** (≥3 FX pairs across ≥2 types at ×2 — we got 2),
+0.28 pips is inside the cost-assumption noise, and it's still short-gamma. Verdict:
**best of the family, first non-null, "worth a proper look" — not proven edge.**

## Pre-registered outcome (so a null can't be re-narrated)

The screen tests each of the three lines FX-only (indices discounted), at cost ×2:

- **"It worked"** — the 75th line **or** the calm-day median clears **×2 cost on
  ≥3 FX pairs spanning ≥2 types**, *and* its payoff skew is materially less
  negative than the blind median (the filter actually cut the tail). That earns a
  path-level backtest with real fills.
- **"It didn't"** — none of the three clears ×2 on FX, or the "survivors" are only
  indices. Then the fade family is done: the forecast has information (G1) but it
  is **not harvestable** as a level fade after costs, and the honest move is the
  risk-tool pivot (size/gate an existing edge), not more fade mechanics.

## Honest caveats (kept front-of-mind)

- Even filtered, a fade is structurally **short-gamma** — filtering *reduces* the
  tail, rarely removes it. A calm-day fade that clears ×2 still has a fat left tail
  that a path-level backtest with real slippage must survive.
- The **cost table is an assumption**; the ×2/×3 sensitivity is the guard, and the
  FX-aware verdict ignores the index "survivors".
- With **~6 effective bets** (G3), "N FX pairs clear ×2" is really ~a couple of
  independent votes — treat a bare pass as *worth a backtest*, not proof.
- This is a **screen** (±20-pip symmetric bracket, hold-to-close), **not** a
  path-level backtest. The clean answer still needs real fills and a real
  target/stop from the MFE/MAE distribution.

## Next step if a line survives

Only then does a decision/selector (Phase 3) have something real: fade the
surviving line, on calm days, on the FX pairs that cleared ×2 — A/B'd through the
honest harness (`simulateEntry` + per-pair costs + IS/OOS). If nothing survives,
pivot to the risk-tool question (Move 2 in `BOT_DECISION_QUESTIONS.md`).
