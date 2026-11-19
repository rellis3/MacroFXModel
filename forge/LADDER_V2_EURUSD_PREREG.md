# ladder-v2-eurusd — which σ makes EURUSD's daily reach ladder right in every vol regime, CFD and futures?

**Pre-registered 2026-11-19, before any EURUSD outcome was computed.**

| | |
|---|---|
| ID / ledger id | `ladder-v2-eurusd` (C), `ladder-v2-eurusd-fut` (F), `ladder-v2-eurusd-cvf` (C vs F), `ladder-v2-eurusd-iv` (IV race, C) |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` (pushed to main) |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-v2-eurusd` |
| Data | **C:** OANDA EUR/USD M1 (`portfolioBacktest/cache/eurusd_m1.parquet`, from 2016-01). **F:** CME 6E M1 from NT8 (`analysis/output/nt8/continuous/6E_1m_{unadj,ratio}.parquet`, re-pulled with the gapfill and stitched 2026-11-19; end-stamped, −1 min). London sessions 2016-01 → **2026-08-21** (lockbox after) |
| IV | 30-day ATM implied vol inverted from CME 6E option settlements (`oi_research_book/data/iv_daily_eur_usd.parquet`, `iv30`, 2020-09-08 →), as-of the prior close |
| GARCH fit history | OANDA EUR_USD NY-close daily bars before 2016 (`scripts/ladder-v2/fetch_d1_long.py`), as gold A3 |
| Seed / uncertainty | `20261118` (the ladder-v2 harness seed); session block bootstrap, block 63, B = 2000 |
| Harness | `scripts/ladder-v2/ladder.py` (reproduces NQ to 0.0; gold run 2026-11-19) → `analysis/output/ladder-v2-eurusd/` |
| Data screens | `forge/data_screens.py EURUSD` → `analysis/output/data_screens/EURUSD/` |

Runbook Phase 1, third instrument and first FX pair: one index (NQ), one metal (gold) and one FX pair are piloted
before rolling to more instruments. Design, definitions and pass rules are those of `forge/LADDER_V2_GOLD_PREREG.md`
(incl. A1–A3). Only the differences are written here.

## 1. Claim

Among a fixed list of σ inputs, one keeps EURUSD's daily ladder hit rates on target in every σ quintile, walk-forward,
separately for the CFD and 6E futures. A second race asks the same question over 2021–2026 with the options-implied
candidates included.

## 2. Prior art

- `ladder-v2-nq` (VALIDATED): har_rv_log on daily ranges won; intraday-RV HAR failed GUARD (too narrow).
- `ladder-v2-gold` (VALIDATED): intraday-RV HAR won (HAR-CJ C, HAR-RV 5-min F); GARCH family mid-pack; futures ranges
  2–6% wider than the CFD.
- `iv-ladder` (VALIDATED, 2026-09-23): a ladder with σ from 30-day ATM IV (CME settlements) beat the realised ladder on
  H-L pinball for EUR (−4.1%), calibration inside the guard. Pinball and an unconditional guard only; no regime test.
- `iv-forecast` (VALIDATED): HAR + IV beats HAR at 21 days and next-bar range on 7/7 instruments.
- `forge/LADDER_CALIBRATION_PREREG.md` (pooled, 2026-10-05): HAR-800 had the lowest pooled regime miss.
- EURUSD's live estimator is yz_10 (`js/forecastLadderIvAdjParams.js`).

## 3. Arms

**Main race (2018 → 2026-08, both tracks):** the 17 non-IV arms of the gold race: A0 yz_10; ewma_094, ewma_090,
yz_20, yz_30, naive, har_rv_log; HAR-800; HAR-RV 5/15-min; SHAR; HAR-CJ; GARCH, GARCH-t, GJR, EGARCH; HAR + GARCH-t
50/50. The IV arms cannot enter: the settlement IV starts 2020-09, and every arm must be scored on the same sessions.

**IV race (`ladder-v2-eurusd-iv`, C only, test years 2021 → 2026-08):** the same 17 arms plus V3 (IV-adjusted:
σ_A0 · exp(k(ln(IV/σ_A0) − μ)), k, μ fitted on train rows with IV), V4 (pure IV30/√252) and HAR + IV 50/50. Train rows
for the IV-dependent fits start 2020-09-08. Halves for this race are 2021–22 and 2023–26.

## 4. Pass rules

As gold §4 for each race: the winner is the lowest PRIMARY among GUARD passers, with the tie rule. VALIDATED needs
the 90% CI of (winner re-selected per draw − A0) below 0 in all of these:

- overall
- both halves
- each left-out window: the four market episodes, and EURUSD's own four highest-range quarters
- data-fault days out

NULL if the CI excludes any improvement ≥ 0.3pp; UNDERPOWERED otherwise. H3 C vs F as NQ (ratios in [0.97, 1.03],
CI inside [0.95, 1.05]). In the IV race, also reported: whether an IV arm wins, and IV-arm − best non-IV arm with its CI.

## 5. Power

Main race: about 2,230 test sessions per track, as NQ and gold; MDE ≈ 0.6pp. IV race: about 1,450 sessions; MDE ≈
0.8pp, so a small IV gain may come out UNDERPOWERED there. That is acceptable: the main race sets the shadow σ, and the
IV race decides only whether an IV arm should replace it.

## 6. What this does NOT test

Exhaustion (own prereg on the exhaustion harness); event multipliers; other FX pairs (they follow once the three pilots
are reviewed); sessions after 2026-08-21.

## 7. What each verdict changes

- **Main VALIDATED:** the winner becomes EURUSD's shadow σ (C; F per H3) on the side-by-side export with a forward
  record.
- **IV race VALIDATED with an IV arm winning:** that arm replaces the main winner for 2021+ on the shadow, since the
  live IV feed exists from 2020.
- **NULL:** yz_10 stays.
- **UNDERPOWERED:** decided by the FX class pool (EUR, GBP, JPY, AUD, CAD, CHF) once those are run.
- Nothing live changes without owner sign-off.

## Variant log

| # | Variant | Added | Status |
|---|---|---|---|
| 1 | Main race (17 arms) + IV race (20 arms, 2021+) | 2026-11-19 | registered |

## Amendments

(none)
