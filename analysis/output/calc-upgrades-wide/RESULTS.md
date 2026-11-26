# calc-upgrades-wide: results

**Setup**
- Prereg: `forge/CALC_UPGRADES_WIDE_PREREG.md` (154e630c). Script: `scripts/calc-upgrades-wide/score.py`. Seed 20261126.
- Gold's arms, using the corrected pre-open feature (`gold-calc-upgrades` A3), on every QLIKE-export instrument:
  18 futures and 40 CFDs.
- Test period: 2020 → 2026-08-21, walk-forward.
- Pooled tests exclude GOLD (the discovery sample).
- Positive control: HARCJ reproduced on all 58 tracks (max relative difference ≤ 2e-15). No run failed.

## Verdicts (pre-registered, as scored)

% change in QLIKE on HL + Close+ + Close− (pooled over instruments), arm vs export calc. Negative means better.

| | Futures (17) [90% CI] | Halves | CFD (39) | Verdict |
|---|---|---|---|---|
| **W1** pre-open hour (N4 FRESH) | **−0.69%** [−1.10, −0.28] | −0.80 / −0.60 | +0.47% [+0.09, +0.84] | **UNDERPOWERED** (CFD replication fails) |
| **W2** all-in (N7) | −0.12% [−1.21, +0.89] | +0.51 / −0.62 | +1.02% [+0.23, +1.70] | **UNDERPOWERED** |

**Controls and other arms**
- Noise control: +0.33% (futures), +0.25% (CFD). Each extra regressor costs about 0.3% from estimation noise alone.
- QLIKE fitting: +0.91% futures (worse, as on gold).
- HARQ, the session split and realized range are all within ±0.3%.

## Why it doesn't carry: the pre-open hour only exists for some markets

- **DE30 and UK100 are closed between 22:00 and 24:00 London**, so the feature can't be built:
  - DE30: no bars at all (0 sessions scored);
  - UK100: scraps, and +30% worse.
  UK100's +30% alone drives most of the CFD pooled failure.
- **Descriptive, post-hoc** (no verdict, prereg amendment A1), without DE30 and UK100:
  - futures FRESH −0.69% [−1.08, −0.30];
  - CFD FRESH −0.05% [−0.31, +0.18].
- **Where it works:** markets that trade actively in that hour.

| FRESH (pre-open hour) by class | Futures, median per instrument | CFD |
|---|---|---|
| Energy (WTI, Brent) | −1.3% (2/2 better) | −1.3% (2/2) |
| US indices (NQ, ES, YM, RTY) | −1.3% | −1.0% |
| Metals | −0.9% | +0.3% |
| FX majors | −0.2% | +0.1% |
| FX crosses | — | +0.0% |

- Energy, metals and US indices pooled (descriptive):
  - futures −1.06% [−1.57, −0.52], both halves about −1.1%;
  - CFD −0.50% [−0.95, −0.07].
- In FX, 22:00–24:00 London is the dead hour after the NY close, and it tells us nothing.
- **Implied vol** helps where it's an oil or metal index:
  - all-in arm: WTI −3.7% (futures) and −3.2% (CFD), SILVER −3.3%, GOLD −4.3%;
  - on the US equity indices it's neutral to worse (US30 +0.8%, US2000 +0.4%, SPX500 +0.2%).
- **Per instrument, futures FRESH** (BH-flagged within the arm marked *):
  - WTI −1.6*, US30 −1.5*, SILVER −1.5*, NQ −1.3*, SPX500 −1.3, GOLD −1.2*, BRENT −1.1*, US2000 −1.0, PLATINUM −0.6*;
  - FX −0.4 to 0.0; COPPER +0.6.

## Answer

Gold's upgrade doesn't carry to every instrument. On the pre-registered test it's UNDERPOWERED: the CFD replication
fails, mostly because the European indices have no pre-open hour.

The pattern is clear, though. **The hour before London opens helps markets that actually trade in it** (oil, metals,
US index futures) by about 1%. **Gold and oil implied vol helps** those markets (gold −4.3% and WTI −3.7% all-in). FX
gains nothing.

**Graded weight:**
- weak-moderate for the pre-open hour on energy, metals and US index futures;
- against it on FX and the European indices;
- against QLIKE fitting everywhere.

**What changes (per the prereg):**
- The shadow pre-open export stays **gold-only**; every other instrument repeats the QLIKE per-line export.
- The candidates for a follow-up prereg on post-lockbox or forward data are WTI, SILVER, NQ, US30, BRENT and
  PLATINUM (pre-open hour, plus implied vol for WTI and SILVER).
