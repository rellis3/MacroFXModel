# Vol-level lessons — what the forecast lines are (and aren't) for trading

Capstone of the 2026-06→07 investigation into whether the daily vol-forecast
lines (median / 75th / dynamic H-L) can drive a level-trading bot. It ties
together `CONDITIONAL_FADE_DESIGN.md`, `BOT_DECISION_QUESTIONS.md`,
`COG_GAP_FINDINGS.md` and the cross-pair research. **Read this before proposing
a level-fade strategy — most of the obvious ones are already falsified here.**

## The headline

**The forecast median is NOT a mechanical exhaustion/fade edge.** Price reaches
it (~88% of days) and reacts to it (the placement carries real information — G1
beats a placebo by +15pp), but converting that reaction into net-of-cost P&L
failed **every exit we tested**. The lines are **context / confluence, not
mechanical triggers.**

## What was tested and FALSIFIED (don't re-run these)

| Idea | Result |
|---|---|
| Median fade, ±20-pip symmetric bracket | Net ≈ 0; **0 FX pairs clear ×2** |
| Median fade, hold-to-close (revert-to-open) | Negative on FX/gold |
| Median fade, tight-stop scalps (10/20, 15/30, 20/40, 15/15) | **Every config negative** median FX net after cost; the *asymmetric* (exhaustion) configs were the WORST |
| COG's forecaster is better-placed than ours | Null — paired A/B over 20 days: COG ≈ ours (width 1.00× EURUSD, 0.97× NQ, 1.13× gold); no consistent edge to COG |
| COG gap is a feed difference (CFD vs futures) | Null — spot ≈ futures |
| Shorter-half-life σ makes the band exhaust better | Null — no config clears ×2; EWMA λ0.90 worse (whipsaw) |
| Empirical ratio_yz **75th** rescues the fade | Null — ≈ Feller 75th (both 2 FX pairs) |

## The mechanism that kills the median fade — the OVERSHOOT

Post-touch **MFE ≈ 38 / MAE ≈ 37 pips** — near symmetric. Price runs **~36 pips
PAST** the level before it reverts. So:
- a **tight stop** (10–15 pips) is tagged by the overshoot *right before the turn*
  — you're stopped out of the exact trade you'd have won (why the tight-stop
  scalp configs were worst);
- a **stop wide enough** to survive the overshoot (>36 pips) hands you the
  **short-gamma tail** (the −400 to −3000-pip blow-through days — G2).
Plus cost (1.5–3 pips) is a heavy drag on a ~15-pip scalp. The clean reverts the
eye remembers are real; the tape also has the overshoot-stopouts, the cost, and
the occasional blow-through — and they average to a small loss.

## What SURVIVED (thin, not proven — needs a path-level backtest before live)

- **The more-EXTENDED line (75th / dynamic ×1.30), on INDICES.** The only cells
  that clear ×2 in the cost screen: **US30 +7.6, DE30 +4.3, NQ +4.1** net/touch.
  Consistent with exhaustion needing DISTANCE (price must run far to be
  exhausted). But: only **2 FX pairs** clear ×2 (below the pre-registered ≥3 bar),
  it's short-gamma, and indices are ≈1–2 correlated bets. **Candidate, not edge.**
- **The forecaster itself is well-placed.** It is as well-calibrated as COG
  (no need to chase COG). `ratio_yz` (σ × trailing quantile of realized÷σ) is the
  best-calibrated range calc (exceed-median 50.3%, sharpness 0.434) and
  self-calibrates per pair — the clean way to fix width (esp. gold, +13% vs COG)
  without manual per-class tweaking.

## Implications for the VOLATILITY BOT (the point of this doc)

1. **Do NOT wire a mechanical median fade.** It loses on every tested exit. If the
   bot uses the median at all, use it as **context / confluence** (a "where is
   price vs the expected day" input), never a standalone "fade every touch" rule.
2. **The only mechanical exhaustion candidate is the 75th / extended line on
   INDICES** — and it must earn a **path-level backtest with real fills** before
   any live sizing. Do not deploy it off the ±20 screen.
3. **An at-the-level limit fade is the wrong entry** because of the overshoot. If
   the exhaustion idea is pursued, the only entry the data motivates is a
   **confirmation entry** (enter after price tags the level, overshoots, and turns
   back), which is a momentum-reversal strategy — new, untested, tail still to be
   managed.
4. **Calibration / single source of truth.** The forecaster page (`volForecast.js`,
   fx corr 1.04, too wide) and the bot/backtest (`volBacktestEngine.js`, corr
   0.820, too tight) drift. If/when tightening: adopt `ratio_yz` (self-calibrating)
   rather than hand-set factors, and derive **everything** (bot plan, page, all vol
   systems) from ONE source (the validated backtest math) so live == validated.
5. **Costs and the tail are non-negotiable.** Fading is short-gamma (selling
   insurance); any level strategy must pay for the −400…−3000-pip tail. On FX the
   edge isn't there; on indices it's thin.

## One-line summary
The vol-forecast lines are a good **map of the expected day** (well-calibrated,
informative) — trade them as **context**, not as mechanical median-fade triggers.
The only mechanical candidate worth a real backtest is the **75th on indices**.
