# Pre-registration — does a forecast-ladder line that sits on a GEX level react more than one that doesn't?

**Written 2026-10-15, before any result below was computed. Frozen once committed.**

## Why
A colleague stacks sources into confluence tiers (gamma wall/flip + IV percentile band + forecast percentile low) and treats agreement as the
strongest zone. Already in our record: ladder lines are validated as reach *geometry*; level identity adds no reach information (level engine P2
§2, E-conf −0.01% Brier); OI walls and ripple walls reacted like neighbouring strikes (`WALL_PLACEBO_PREREG.md`, `RIPPLE_BOOK_RESULTS.md`); every
fade/continue book on ladder lines is net-null. **Not tested:** whether the *coincidence* of a ladder line with a GEX level changes what happens
*after the touch*. Level engine P2 explicitly did not study reaction, and registry v1 excluded OI/GEX. IV-percentile and forecast-percentile lines
are both functions of the same σ, so only the GEX level is an independent leg; this tests that leg.

## Data, window
NQ only (the instrument with an OI archive). London sessions 2020-09-04 → 2026-08-20 (lockbox 2026-08-21 untouched). Prices: local OANDA M1
(`forge.iep_build.sessions('NQ')`). Ladder: `analysis/output/forecast_history/NQ.csv` point-in-time `pit_oh_*` / `pit_ol_*` p50/p75/p90 (percent of
the London open) × `pit_sig_daily`. u = open × pit_sig_daily / 100 (price points). OI: `contract_level_ffilled_nas100_usd.parquet` via script 22's gamma
(each contract at its own DTE, IV = trailing rv20, ×20).

## Definitions
- **Lines:** the six ladder lines per session: open × (1 ± pit_o{h,l}_{p50,p75,p90}/100).
- **G (GEX levels for session D, from D−1 OI only):** the 5 strikes with largest |net gamma| across all expiries within ±3% of D−1 close, shifted to
  CFD terms by D−1's futures−CFD basis (put-call parity, nearest expiries, script 24's estimator; forward-filled ≤ 3 days; sessions without a basis
  are dropped and counted).
- **Confluent line:** min |line − g| ≤ 0.10 u over g in G. Others are non-confluent.
- **Touch:** the first M1 bar after the open whose range contains the line.
- **Outcome (reaction), within 120 min after the touch bar:** BOUNCE = price reaches line ∓ 0.25 u (toward the open) before line ± 0.25 u (through).
  Same-bar double hits are excluded and counted; no resolution in 120 min = "neither", counted and reported as a share.

## Test (one comparison)
Δ = P(bounce | confluent) − P(bounce | non-confluent), pooled over lines/sessions. 95% CI by cluster bootstrap over ISO weeks, 2,000 reps.
**Placebo:** shift every g in G by ±0.5 u and ±1 u (4 shifts), recompute the confluent flag, recompute Δ; Δ_placebo = mean of the four. Confluent-flag
frequency per shift is reported (it should be similar to the real one, or the placebo is not comparable).
**PASS (a confluence effect):** Δ ≥ +3 pp with CI excluding 0 **and** Δ − Δ_placebo ≥ +3 pp with CI excluding 0. Anything else = NULL.
Not a licence to re-cut thresholds after seeing the data.

## Reported either way
Touch rate confluent vs not (reach should not change — geometry); n per cell and per year; "neither" share; a variant with G = top-5 strikes by
total open interest (descriptive); by-year sign.

## Harness checks
1. Lockbox: no session after 2026-08-20.
2. No lookahead: OI date ≤ D−1; ladder is the pit column.
3. Injection control: flip a random half of confluent lines' outcomes to bounce at +10 pp and recover it.
4. A cell with < 400 resolved confluent lines is "unjudgeable", not a null.

## Prior
Expect NULL (reach is geometry; walls are placebo). A pass would be checked for detector artefacts (touch definition, rounding clusters) first.
Nothing here changes a live bot, and it says nothing about direction.
