# vix-nasdaq-beta — results

Prereg: `forge/VIX_NASDAQ_BETA_PREREG.md` (committed `39962e36`, 2026-10-23, before any outcome).

- Run 2026-10-23, seed 20261023, 200 shifted-signal placebos.
- Same panel as `vvix-nasdaq-ratio` (4,259 sessions, 2009-09 → 2026-08-21).
- Ledger ids: `vix-beta-change` (VALIDATED), `vix-beta-level` (UNDERPOWERED).
- Files: `results.json`, `robustness.json`, `FEATURES.md`.

## C.OG's dR/dt: a direction result

C.OG's R is the signed % VIX move per % Nasdaq move (the 20-session slope, median −4.9). His dR/dt is that slope's
change over 5 sessions.

**When dR/dt is in its bottom decile, Nasdaq has been higher over the next 5 sessions.** That is when R has just turned
sharply more negative: VIX has started reacting much more strongly against Nasdaq.

| | Effect (5-session Nasdaq return, entry next close) | t | Discover / validate / test | Placebo \|t\| p95 | Gate |
|---|---|---|---|---|---|
| dR/dt bottom decile | +0.211 SD ≈ **+0.57%** | 3.00 | +0.09 / +0.35 / +0.20 | 1.92 | **pass** (Holm 16, all periods, placebo) |

Raw view: on the 410 flagged days Nasdaq's next 5 sessions averaged **+0.76%, up 67% of the time**, against **+0.33%
and 60%** on all days.

**Robustness** (Amendment A1, post-hoc, demote-only; none demoted it):

| Check | Effect | t |
|---|---|---|
| + Nasdaq 5d and 1d return (is it short-term reversal?) | +0.210 SD | 2.99 |
| + VIX 5d and 20d change | +0.235 SD | 3.29 |
| + all of those + the banked unsigned ratio | +0.204 SD | 2.91 |
| Leave one year out (2010…2026) | — | 2.74 … 4.42 |
| Drop the 10 largest flagged moves | +0.239 SD | 3.73 |

It isn't the usual short-term bounce, VIX's own moves, the earlier ratio, one year or a few outliers. With every
control in, t is 2.91, just under the |t| ≥ 3 promotion bar. So it is **VALIDATED for the ledger but research-only**
until a forward record or a costed rule confirms it.

## Everything else (16 cells in `results.json`)

**The R level (signed beta)** adds nothing beyond the unsigned ratio banked earlier today: 0 of 8 cells pass with that
ratio's flags as controls.

- The level's VIX effect (bottom decile → VIX −0.33 SD, t −3.8 without the control) **is** the banked
  `vvix-ratio-range` result. With the control it drops to −0.26 (t −2.86, not significant after the correction).
- The "warning" tail (VIX barely falling as Nasdaq rises): +0.17 / +0.18 SD on Nasdaq, t 1.5–1.7. Not significant.

**dR/dt top decile** (the relationship weakening fast): nothing; one cell is NULL.

## What this changes

- **Context, not a trade yet.** "C.OG's dR/dt is in its bottom decile (VIX has just started reacting much harder
  against Nasdaq): Nasdaq's next 5 sessions have averaged +0.76% vs +0.33% normally."
- **Next:**
  - a costed rule prereg: NQ long 5 sessions from the next close on the flag, with real NQ costs and the overlap
    handled;
  - a forward record of the daily flag;
  - an intraday version on the new VIX and VXN chart legs.
