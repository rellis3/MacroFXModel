# Lookahead, out-of-sample discipline and multiple testing

## The lockbox (`forge/LOCKBOX_PROTOCOL.md`, frozen)

| Block | Dates | Use |
|---|---|---|
| FIT | < 2022-09-05 | fitting |
| CHECK | 2022-09-05 → 2025-09-04 | checking |
| Former test year | 2025-09-05 → 2026-08-21 | scored across ~10 variants, so it **is now research data** |
| **H-A** | every London session **after 2026-08-21** | holdout: no script may score layers 3, 5 or 6 on it |
| **H-B** | shadow sessions from 2026-10-07 | nothing may change because of what the shadow screens show |

The only sanctioned evaluation is `python -m forge.lockbox_check --evaluate`, run once at ≥ 60 sessions (expected late
November 2026). Hashes are in `forge/lockbox_manifest.json`. `forge/LOCKBOX_ADDENDUM_1.md` adds neutral regime buckets
as a reported metric.

**Leak risk:** `loadM1ForPair` always merges the nightly R2 tail, so with R2 credentials any JS research script,
including `data_integrity.mjs` and `ny_close_d1.mjs`, can see H-A sessions. Truncate explicitly. Python `forge` reads
local disk only (cache ends ~2026-08-21).

## Point-in-time macro (`forge/INTRADAY_EXTREME_PATHS_PREREG.md` §2, `forge/iep_features.py`)

- Macro for session d must be strictly before d. CBOE closes dated < d.
- FRED yields: the **first-print** value from ALFRED vintages, usable only if first published before d.
- **Excluded:** GDP, CPI levels, nowcasts and any revisable series without a dated vintage.
- Apply publication lags (WALCL 8d, TGA 2d, RRP 1d, HY 1d).
- Calendar tags after coverage are unknown and excluded, not imputed.

## Robustness (`plans/ROBUSTNESS.md`, `plans/STYLIZED_FACTS.md`)

- Use training years only for design choices.
- Regime metrics use **neutral buckets** (trailing realised range), not one arm's σ. Regime = σ_d ÷ its trailing
  250-session median.
- Run a one-day-delay check and a parameter-plateau check. σ lags regime breaks.
- Don't √time-scale indices or gold to monthly; use the fitted `horizons` widths.
- Index lag-1 reversal of −0.08 to −0.13 may be a 17:00 NY bar artifact.

## Search breadth (`plans/SEARCH_BREADTH.md`)

- Correct for best-of-N (E[max of 4] ≈ 1.03 SE).
- Cross-instrument σ errors correlate 0.47, so there are ~**2.1 independent forecasts a day**, not 28. Treating
  instruments as independent overstates √BR by ~3.7×.
- Use session-block or date-clustered bootstrap.

## Pre-registration and the trial ledger

- Template: `MD files/PREREG_TEMPLATE.md`. Write the minimum detectable effect and the multiplicity correction before
  the run (`js/preregStats.js`). "Every variant tried is logged in its pre-registration's variant table before it is
  run."
- Bank every verdict in the Evidence Book `js/deskEvidence.js`, then regenerate the ledger with
  `node scripts/build_trial_ledger.mjs` → `MD files/TRIAL_LEDGER.md`. **Don't hand-edit the ledger.** As of 2026-10-07:
  115 tests, 35 validated, ~5.8 expected by luck.
- Score each layer against outcomes, not P&L. "Every number is one draw": report intervals.
- New work runs side by side as a shadow. Nothing live changes until the owner chooses.

## Layer contract (`plans/LAYER_INTERFACES.md`)

Layer 1 hands down: M1 OHLC (UTC), NY-close daily bars n ≥ 60, London sessions, realised % of the London open, and an
event tag, with bars closed before the session open. σ_d is a fraction of price. Any change to an output contract needs
a dated amendment in that file first.
