# Pre-registration — Does the IV regime tell Vote Atlas when to fade and when to follow?

Written 2026-09-23 before `forge/run_iv_regime_vote.py` exists. Frozen. Analysis only — no
engine or bot is changed by running it.

## Data

Honest Vote Atlas backtest trades: `analysis/output/level-atlas-vote-trades/{eurusd,gbpusd,
audusd,usdcad,usdchf,usdjpy}-votetrades.json` (schema 4, IS-only book, regenerated
2026-09-15). NQ EXCLUDED (its file predates both look-ahead fixes). R per trade as in
IV_SIZING_FILTER_PREREG.md. IV joined by london22 session of entry (`iv_session_panel.parquet`,
London-date key). `decision` ∈ {fade, follow} is the vote's own choice.

## Regimes (all causal — computed from sessions strictly before the trade's session)

- **LEVEL:** iv30's percentile within its own trailing 252 sessions → low (<1/3) / mid / high (>2/3).
- **VRP:** iv30 − HAR-forecast σ (both annualized %), its sign → rich (IV > HAR) / cheap.
- **STRESS:** the term-structure stress flag (trailing-252 p90 of iv30/iv90 − 1).

## Protocol

Chronological split at the median trade date: FIRST half = discovery, SECOND half = test.
In discovery, for each regime family and each (decision × regime) cell, compute mean R.
Candidate rule per family: **skip every (decision × regime) cell whose discovery mean R < 0**
(a flip-to-the-other-side rule is NOT tested — there is no counterfactual P&L in these files
for the side the vote did not choose). If no cell is negative in discovery, that family has no
rule and is reported as such.

## Pass rule (per family; 3 families tested, so Bonferroni α = 0.05/3)

On the TEST half, the skipped cells' mean R must be < 0 with the date-cluster bootstrap
upper bound (at 1 − 0.05/3 two-sided → 98.3% CI) < 0, AND total test-half R with the rule ≥
without it. Both, or FAIL. A PASS is a candidate for the engine, not a change to it — it would
then need a forward test before anything live is touched.

## Stated up front

Mean R in these files is positive in almost every slice seen so far (stress and calm both
> 0), so the likeliest outcome is that no discovery cell is negative, i.e. "IV regime does not
identify days where the vote's decision loses". That is a legitimate null.

---

## RESULTS (run 2026-09-23) — NULL on all three families

`forge/out_vol_iv/regime_vote.json`. 20,138 honest FX trades matched (98.4%); split 2024-07-11;
baseline mean R discovery +0.057, test +0.062.

- **LEVEL:** one negative discovery cell — follow × mid-IV, −0.013 (n=739). In the test half those
  trades made +0.095 [+0.008, +0.181]; skipping would have cut total R 624 → 495. FAIL.
- **VRP:** no negative cell (fade cheap/rich +0.069/+0.066, follow +0.037/+0.054). No rule.
- **STRESS:** no negative cell (fade calm/stress +0.062/+0.111, follow +0.046/+0.052). No rule.

**Verdict:** the IV regime does not identify days on which the vote's fade/follow choice loses.
Not pre-registered and NOT claimed: fade × high-IV (+0.110) and fade × stress (+0.111) are the
strongest discovery cells; a "size up fades in high IV" idea would need its own pre-registration.
