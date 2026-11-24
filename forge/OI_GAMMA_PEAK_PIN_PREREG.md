# oi-gamma-peak-pin — On sessions after 2026-11-23, does the OI Profile's gamma peak, on a PIN day, hold on its first touch more often than the same line moved 0.25–0.5σ? And is it first-touch only?

**Pre-registered 2026-11-24, before any forward session was scored.** Forward only: every session in the score is after the data that produced the candidate.

| | |
|---|---|
| ID / ledger id | `oi-gamma-peak-pin-f1` (primary), `oi-gamma-peak-pin-f2` (first-touch only), `oi-gamma-peak-pin-f3` (held-then-broke → third touch) |
| Branch | `claude/oi-level-reads` |
| Register row | `plans/RESEARCH_REGISTER.md` → `oi-gamma-peak-pin` |
| Data | Our nightly QuikStrike capture `oi_raw_<date>` for London dates **2026-11-24 onward**, replayed through `buildOiProfile` exactly as in `forge/OI_PROFILE_LINES_PREREG.md` §3; σ from `vol_forecast_<date>`; OANDA M1 mid; the same 11 instruments. No session on or before 2026-11-23 enters any scored number. |
| Seed | `20261124` |
| Uncertainty | date-clustered bootstrap, B = 2000 |
| Scripts / outputs | `scripts/oi-profile-lines/` (unchanged pipeline: `pull_kv.mjs`, `fetch_m1.py`, `replay.mjs`, `events.py`; scoring adds a `date >= 2026-11-24` filter) → `analysis/output/oi-gamma-peak-pin/` |
| Method lessons applied | placebo from the same price path (shifted copies), forward-only confirmation of a selected cell, count and report every unresolved touch, date-clustered uncertainty |

## 1. The claim

From `analysis/output/oi-profile-lines/RESULTS.md` (banked 2026-11-23): across all lines the profile is placebo-null, but one atlas cell survived BH: **gamma peak × PIN day × first touch held 70.3% vs 48.5% at its placebos, +21.7pp [13.6, 29.6], 74 touches, 45 dates, both halves, 9/11 instruments above 50%.** It was 1 survivor of ~150 cells against a chance median of 0 (max 4), so it is a selected cell and needs fresh data.

Mechanism: on a PIN day dealers are long gamma at spot; their biggest concentration of gamma is where their hedging (sell rallies, buy dips) is largest, so the first approach should be absorbed. Once the hedge has been worked (or the book re-struck), later approaches have less behind them.

Exploratory follow-ups from 2026-11-24 (`analysis/output/oi-profile-lines/sequence.json`, not pre-registered, ~20 cells): the gamma peak's later touches on PIN days held no better than placebo (touch 2 after a hold 43.5% vs 55.8%, n 23), and across all lines a third touch after held-then-broke held 36.1% vs 47.4% (−11.3pp [−23.4, +0.2], n 122). Those two are F2 and F3.

## 2. Definitions

Unchanged from `forge/OI_PROFILE_LINES_PREREG.md` §3 (session filter: capture saved on D before 12:00 London; window capture → 22:00 London; site merge 0.05 U; placebos ±0.25 U / ±0.5 U dropped within 0.10 U of a real line; arm/touch/race at 0.25 U; touch bar resolves only through; `both`/`unresolved` counted). Regime = the profile's PIN/BREAKOUT at capture. A site "is the gamma peak" if `gamma_peak` is among its types (alone or stacked).

## 3. Tests

| Cell | Estimate | Prediction | Pass (VALIDATED) | NULL | Else |
|---|---|---|---|---|---|
| **F1** primary | E = b(gamma-peak site, PIN, touch 1) − b(its placebos, same cell) | > 0 | E ≥ +10pp **and** 95% CI lower bound > 0 **and** E > 0 in both date halves | CI upper < +10pp | UNDERPOWERED |
| F2 first-touch only | E(gamma peak, PIN, touch ≥ 2) | ≤ 0 | read only if F1 passes: supported if CI upper < F1's point estimate | — | descriptive |
| F3 sequence | E(all real sites, touch 3, path held→broke) | < 0 | CI upper < 0 (Holm with F2 at α = 0.05) | CI lower > −5pp | UNDERPOWERED |

**When it is read**: once F1 has ≥ 150 first touches, or on 2027-06-30, whichever comes first (the in-sample rate was 74 touches in 66 dates, so ~150 needs ~130 forward dates). Power: at n = 150 against ~450 placebo touches the SE of E is ≈ 4.7pp, MDE (80%, two-sided 5%) ≈ 13pp; the in-sample lower bound (13.6pp) sits at the MDE, the point estimate (21.7pp) well above it. A shrunken true effect near +10pp would come back UNDERPOWERED, and the verdict will say so rather than NULL.

An interim look at ≥ 80 touches may be reported as **descriptive only**; it cannot produce a verdict, and the read date does not move because of it.

## 4. Controls

- **Mirror**: the +0.25 U copies of the gamma peak scored as "real" against the other copies; the result is void if the mirror passes F1's bar with the same sign.
- **Concentration**: no single instrument may carry more than 35% of F1's touches or the excess; if one does, also report F1 without it.
- **Regime check**: the same cell on BREAKOUT days is reported (in-sample 44.8% vs 50.7%); a pass on PIN with an equal pass on BREAKOUT would mean it is not a regime effect.

## 5. What it changes

- **VALIDATED**: the S/R zones read (`js/srZones.js` `READ_EVIDENCE.gpPin`) moves from "candidate" to "validated" with the forward rate, and a cost-gated trade version (enter at the touch, stop 0.25σ through, target 0.25σ back, real spreads) gets its own prereg.
- **NULL / UNDERPOWERED**: the ★ read is removed from the S/R zones export and the Pine indicator; every zone reads 50/50.
- The live read already shows the ★ (labelled "candidate") from 2026-11-24. That display is not evidence; it is scored by this file only.

## Amendments

(none)
