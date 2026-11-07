# jump-next-day-miss — after a jump day, does the next session's range beat its forecast by more than σ allows?

**Pre-registered 2026-11-06, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `jump-next-day-miss` (one scored question, four class cells) |
| Branch | `worktree-agent-a61efe43e11706b8d` (pushed straight to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `jump-next-day-miss` |
| Data | `analysis/output/forecast_history/<INST>.csv` (34 instruments, London 00:00–22:00 sessions, point-in-time `pit_*` forecast), BNS flags `analysis/output/jumps/flags_seasonal.csv`, `features/px_d1_spx500`, `features/vix` (all gitignored; read from the main checkout). Target sessions with `oos == 1`, 2020-08-20/24 → 2026-08-20 (lockbox: nothing after 2026-08-21) |
| Seed | `20261106` |
| Uncertainty | moving-block bootstrap over target-session dates (all instruments of a class on a date move together), block 21 sessions, B = 2000 |
| Scripts / outputs | `scripts/jump-next-day-miss/run.py` → `analysis/output/jump-next-day-miss/` (`RESULTS.md`, `results.json`) |
| Harness | own script (the forecast_history table and BNS flags are Python-side; same loaders/conventions as `scripts/forecast-miss-scan/run.py` and `scripts/forecast_history/jumps.py`) |

## 1. The claim (required)

C.OG treats forecast error as a feedback loop ("the miss tells you what the model is missing") and names jump
intensity as something to research. In jump-diffusion models with self-exciting (Hawkes) jumps, a jump raises the
near-term jump intensity, so a day after a jump should carry more range than a diffusion-only σ forecast allows.
Question: **after a jump day (or a run of jump days) on an instrument, does the next London session's realised H→L
exceed the shipped range forecast's p50 by more than σ already accounts for?** Size only, never direction.

## 2. Why it is not already settled (required)

- `jump-structure` (context, `forge/JUMPS_PREREG.md`, `analysis/output/jumps/RESULTS.md`): jumps ≈ 6.6% of intraday
  variance; ~12% of days are BNS jump days; 25% scheduled; HL p90 passed 17.1% on jump days vs 8.7% — **same day
  only** (the flag is known only at the close). It never asks about the next session. The registered largest-bar k = 5
  rule over-flagged (~96 days/yr); Amendments 1–2 moved to the day-level BNS test at 1%. **This study uses that BNS
  flag** (`jump_bns`, `flags_seasonal.csv`, built by `scripts/forecast_history/jump_flags_seasonal.py`).
- `jump-p90-event-term` (null): a p90 multiplier for *scheduled* releases on the same day. Different question
  (scheduled, same-day, p90 only).
- `forecast-miss-scan` (context) and its three validated cells (`forecast-miss-shock-idx`, `-shock-fx`,
  `-month-end-fx`): 17 pre-open conditions; "forecast-miss streaks" (`recent_miss`, the 5-day mean of past misses)
  was *not discovered*. No jump variable was in the scan. Here the previous day's own miss and the validated stress
  conditions (S&P 5-day fall, VIX 5-day rise, month-end) are **controls**, so the test asks only what the jump adds.
- `jump-diffusion` (context, 2026-09-13, `volatilityExhaustion/`): validated the measurement; "forward payoff null"
  was about using the decomposition to call what the move does next (exhaustion), not a forecast-miss target.
- `meta-label-trust-lines` (null) had yesterday's BNS flag among ~12 features predicting a p75 pass; the model failed
  calibration and no jump-specific effect was reported or tested; `meta-label-yield-spread` used `jumps5` to size a
  different book. Neither answers this.
- `live-range-jump-through` (context): intraday jumps run through the hourly lines; same session, not next day.

Not a re-run of a banked null.

## 3. Definitions, fixed in advance (required)

- **Session pair.** For each instrument, session *t* and the next row *t+1* of the same file, with ≤ 4 calendar days
  between them (weekend allowed, longer gaps dropped). Both sessions complete (last bar ≥ 20:00 London,
  `FORECAST_RECORD_PREREG` Amendment 2). *t+1* has `oos == 1` and date ≤ 2026-08-21.
- **The setup (primary).** `J(t)` = `jump_bns` on session *t* (BNS ratio test, z > 2.326, 1%), known at 22:00 London
  on *t*, before the *t+1* open.
- **Secondary.** `J5(t)` = number of BNS jump days in sessions *t−4..t* (needs 5 complete sessions); its coefficient
  is per extra jump day.
- **The outcome.** `y = ln(r_hl(t+1) ÷ pit_hl_p50(t+1))` (the point-in-time forecast for *t+1*, which already
  contains σ). Secondary outcomes: `r_hl > pit_hl_p75` and `r_hl > pit_hl_p90` on *t+1* (linear probability, pp).
- **Controls (the primary model).** OLS per class:
  `y = instrument FE + β·J + γ·m_prev + σ-tercile dummies + spx5 + vix5 + month_end`, where
  `m_prev = ln(r_hl(t) ÷ pit_hl_p50(t))` (the previous day's own miss); σ tercile of *t+1* = `pit_sig_used(t+1)`
  against the 1/3 and 2/3 quantiles of the instrument's previous 250 sessions (causal, min 120);
  `spx5` = S&P 5-day fall (%), `vix5` = VIX 5-day change, `month_end` = last 2 / first 2 sessions of a month — all
  as `scripts/forecast-miss-scan/run.py`, value known by 00:00 UTC on *t+1*. Missing stress values filled with the
  class mean (expected none).
- **Reported alongside (descriptive):** raw jump-minus-other difference; σ-tercile-matched difference (within-tercile
  differences weighted by jump counts); β with σ tercile only; β with σ tercile + m_prev (no stress) — this pair shows
  whether the jump adds beyond the previous day's miss.
- **Instruments / classes.** 34: `fx_majors` (7), `fx_crosses` (20), `indices` (NQ, SPX500, DOW, US2000, DE30,
  UK100), `gold`. Pooled within class, reported per class.
- **De-clustering.** None needed: one row per instrument-session; cross-instrument dependence handled by resampling
  whole dates; serial dependence by 21-session blocks.
- **Uncertainty.** Moving-block bootstrap of target dates (block 21, B 2000), β refitted per replicate via
  date-weighted normal equations. Two-sided bootstrap p = 2·min(share ≤ 0, share ≥ 0), floor 1/B.
- **Placebo.** Shuffle `J` within instrument × calendar quarter of *t*, 1,000 draws, refit β (FWL on the same
  controls); report the real β's percentile. Same for J5 (rebuilt from the shuffled J).
- **Sample / stability.** Halves split at 2023-08-21 (as forecast-miss-scan): β per half.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | Raw: is next-day y higher after a jump day? | **Yes**, a few % — jump days are big days and the forecast's persistence catches only part of that |
| b | Primary β (all controls) | **Small**: +0–3%; most of (a) is the previous day's miss and stress. Honest prior: NULL on FX, underpowered elsewhere |
| c | p75 / p90 exceedance after controls | +0–2pp |
| d | J5 per extra jump day | ≈ 0 to +1% |
| — | **THE GATE (per class)** | **VALIDATED**: β > 0, Holm-adjusted p < 0.05 (4 classes), point estimate ≥ +3%, real β above the placebo's 97.5th percentile, β > 0 in both halves. **CONTEXT**: Holm p < 0.05 but β < +3% or β < 0 (real but too small to widen lines, or the sign is reversed). **NULL**: none of the above, cell powered (MDE ≤ +5%) and 95% CI upper < +5%. **UNDERPOWERED**: otherwise. |
| — | **Study verdict** | VALIDATED if any class is; else CONTEXT if any class is; else NULL if ≥ 2 classes are NULL and the rest UNDERPOWERED; else UNDERPOWERED |
| — | **THE MIRROR** | A negative β (next day calmer than forecast after a jump: exhaustion/mean reversion of variance) is reported and lands in CONTEXT if significant |

Pass bar = **+5%** on realised ÷ forecast: the validated stress cells move the ratio 6–13%; under 5% a line-widening
input is not worth a state-vector slot.

## 5. Power — what this design can and cannot find (required)

From counts and the controls-only residual SD (regression of y on all controls *without* the jump flag; no outcome
split by the flag). MDE = (z₀.₀₁₂₅ two-sided 2.498 + z₀.₈ 0.842) × SD × √(deff × (1/n₁ + 1/n₀)).
deff = (1 + (co-jumps per jump date − 1) × date ICC of the residual) × (1 + 2·max(lag-1 autocorr, 0)).
Run: `python -I scripts/jump-next-day-miss/run.py --power` (2026-11-06).

| Cell | n jump / other | Resid SD (log) | ICC · co-jumps | deff | **MDE** | Pass bar | Verdict |
|---|---|---|---|---|---|---|---|
| fx_majors | 1,579 / 9,307 | 0.386 | 0.47 · 1.98 | 1.47 | +4.3% | +5% | POWERED |
| fx_crosses | 4,018 / 27,080 | 0.382 | 0.31 · 3.37 | 1.74 | +2.9% | +5% | POWERED |
| indices | 977 / 7,805 | 0.383 | 0.54 · 1.68 | 1.36 | +5.2% | +5% | UNDERPOWERED by design (marginal) |
| gold | 155 / 1,299 | 0.395 | — · 1 | 1.00 | +11.9% | +5% | UNDERPOWERED by design |

Indices and gold are run and described; they can be VALIDATED or CONTEXT only if the effect is large enough to pass
anyway; an empty result there is UNDERPOWERED, never NULL. The analytic deff ignores block structure; the NULL rule
uses the actual bootstrap CI, so an optimistic MDE cannot manufacture a NULL.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells:** the primary β in 4 classes. **Holm** at α = 0.05 on bootstrap p-values.
- Everything else (raw/σ-matched differences, σ-only and σ+prev models, exceedance, J5, halves, per-instrument) is
  descriptive. Per-instrument slices, if looked at, get BH q = 0.10 and are candidates only.
- Promotion bar for any live use: |t| ≥ 3 and a forward shadow; a ledger VALIDATED stays research-only.

## 7. What this does NOT test (required)

Direction (none); which side (OH vs OL) the extra range lands on; tradability; why jumps cluster (news vs liquidity);
intraday timing of the next-day jump; whether a HAR-J model beats the shipped forecast on pinball loss (a pass here
would justify that as the next prereg, not replace it).

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry; "jump intensity" becomes a **shadow candidate** for the vol state vector (a
  line-widening multiplier for the class, forward-recorded side by side; live lines unchanged).
- **CONTEXT** → ledger entry; describe on the jumps card; no line input.
- **NULL** → ledger entry; jump days are priced by the forecast's own persistence; the jumps card and any desk copy
  must not say "expect a wider day after a jump".
- **UNDERPOWERED** → indices/gold need a longer backcast (2016–2020 forecast_history rows, non-OOS) to test; say so.

## Amendments

(none)
