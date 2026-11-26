# hlproj-p90-morning-follow: does the HL-projection P90 continue in the London morning on instruments it wasn't found on?

**Pre-registered 2026-11-26, before the replication sample was examined for this cell.**

| | |
|---|---|
| ID / ledger id | `hlproj-p90-morning-follow` |
| Branch | `jvphone` (pushed to main through the sparse worktree) |
| Register row | `plans/RESEARCH_REGISTER.md` → `hlproj-p90-morning-follow` |
| Source | **Owner, 2026-11-26:** time-of-day level behaviour (price continuing at extreme levels in the morning, reversing or stalling later). **Discovery (exploratory, 2026-11-26)** on the 25 NT8 futures, `level-context-engine` events, 2020 → 2026-08-21: Jordan's HL moving projection at P90 (running low + HL p90 / running high − HL p90), inside touch, 07:00–10:00 London:<br>• line: continuation 61.3% / rejection 36.1%, follow gross +0.25R, net +0.10R, n = 380;<br>• placebo: 45.6 / 49.3%, gross −0.04R.<br>That cell was found among many (3 families × 3 tiers × 5 time blocks), so it is a **post-hoc** candidate |
| Replication sample | 22 OANDA CFDs whose price paths are **not** in the futures set: AUDCAD, AUDCHF, AUDJPY, AUDNZD, CADCHF, CADJPY, CHFJPY, EURAUD, EURCAD, EURCHF, EURGBP, EURJPY, EURNZD, GBPAUD, GBPCAD, GBPCHF, GBPJPY, GBPNZD, NZDCAD, NZDJPY, PALLADIUM, UK100. Events from `analysis/output/level-context-engine/events/C_*.parquet`, 2020-01-02 → 2026-08-21 (lockbox respected). This cell was computed inside `matrix_C.csv` (pooled over all 40 CFDs) but never viewed or reported; the 22-instrument subset has not been computed |
| Seed | `20261126` |
| Uncertainty | date-clustered bootstrap, B = 1000, 90% CI |
| Scripts / outputs | `scripts/hlproj-p90-morning-follow/` → `analysis/output/hlproj-p90-morning-follow/` |

## 1. Claim

When price touches the HL-projection P90 from inside between 07:00 and 10:00 London, it continues more often than it
rejects, and more than at a placebo projection. Following the touch earns positive gross R.

## 2. Definitions

These are unchanged from `level-context-engine`:
- **Touch:** an inside touch (approach `in`), every touch, re-armed at 0.1 line-σ.
- **Outcome:** the ±0.25 line-σ race. The through side counts from the touch bar, the back side from the next bar,
  with a 120-minute cap.
- **Follow R:** `R_cont`.
- **Placebo:** the same projection with HL scaled 0.75–0.90 / 1.10–1.25 (one draw per session per line per tier; a
  single-line comparison, so the A2 caveat doesn't apply).

## 3. Hypotheses (replication sample, CFDs gross; CFD costs are unknown)

- **R1:** P(continuation) − P(rejection), line minus placebo > 0.
- **R2:** follow gross R per trade > 0.
- **R3:** follow gross R, line minus placebo > 0.

**Gates:**
- **VALIDATED** if the 90% CI is above 0, it survives BH q = 0.10 over the three, and the halves (2020–22 vs 2023–26)
  agree in sign.
- **NULL** if the upper CI is below +1 pp (R1) or below +0.02R (R2, R3).
- Otherwise **UNDERPOWERED**.

**Descriptive:**
- the same cell for 10:00–13:00, and for 07:00–13:00 combined;
- per-instrument counts;
- an approximate net figure using a typical OANDA spread of 1.5 pips for crosses (an assumption, labelled as such);
- the futures discovery cell repeated, for reference.

## 4. Power

Futures gave 380 events over 25 contracts in 6.6 years, so the 22 CFDs should give roughly 300–400. With a per-trade
SD of about 1R, the SE is about 0.06R, so the MDE is about 0.15R. The futures effect is about +0.25R gross, so this is
borderline powered.

## 5. What each verdict changes

- **VALIDATED:** a shadow "HL P90 morning continuation" flag on the futures levels page, plus a forward log from
  2026-11-27, pre-registered for a forward score on futures before anything live.
- **NULL:** the futures cell is treated as a search artefact.
- **UNDERPOWERED:** forward log only.

## Amendments

(none yet)

## RESULTS

Verdicts and numbers: `analysis/output/hlproj-p90-morning-follow/RESULTS.md` (banked 2026-11-26). R1-R3 UNDERPOWERED; R1/R3 estimates point the wrong way.
