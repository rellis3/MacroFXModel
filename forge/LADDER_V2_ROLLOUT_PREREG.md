# ladder-v2-rollout — the σ race and the exhaustion race for every instrument with data, CFD and futures

**Pre-registered 2026-11-20, before any rollout instrument was built or scored.**

| | |
|---|---|
| ID / ledger ids | `ladder-v2-<sym>` / `-fut` / `-cvf` and `exhaustion-v2-<sym>` / `-fut` per instrument (lower-case symbol) |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-v2-rollout` |
| Template | The three pilots, unchanged: `forge/LADDER_V2_GOLD_PREREG.md` (incl. A1–A3) for the σ race; `forge/EXHAUSTION_V2_NQ_PREREG.md` §3–§9 with `forge/EXHAUSTION_V2_GOLD_PREREG.md` A1–A2 (60 substeps, clustered floor) for exhaustion. Same harness (`scripts/ladder-v2/ladder.py`, `scripts/exhaustion-v2/`), seeds (20261118 race, 20261119 exhaustion), 63-session blocks, B = 2000, window 2016 → **2026-08-21**, test years 2018+ (race) and 2019+ (exhaustion) |
| Owner | 2026-11-20: "for CFD do that across the asset pile, and for futures every single future we have data on" |

## 1. Instruments

| Class | CFD (OANDA) | Futures (NT8) | Notes |
|---|---|---|---|
| FX majors | GBPUSD, AUDUSD, NZDUSD, USDJPY, USDCAD, USDCHF | 6B, 6A, 6N, 6J, 6C, 6S | 6J / 6C / 6S are quoted inverted. The harness inverts them, so the ladder reads as USDJPY / USDCAD / USDCHF. The first inverted root is checked by hand before the rest run |
| FX crosses | AUDCAD, AUDCHF, AUDJPY, AUDNZD, CADCHF, CADJPY, CHFJPY, EURAUD, EURCAD, EURCHF, EURGBP, EURJPY, EURNZD, GBPAUD, GBPCAD, GBPCHF, GBPJPY, GBPNZD, NZDCAD, NZDJPY | — | CFD only (owner 2026-11-18) |
| Indices | SPX500, US30, US2000, DE30, UK100 | ES, YM, RTY, FDAX, — | UK100 futures need paid ICE data |
| Metals | SILVER, COPPER, PLATINUM, PALLADIUM | SI, HG, PL, — | PA futures excluded: 67% thin days |
| Energy | WTI, BRENT, NATGAS | CL, BZ, NG | |
| Ags | SOYBEAN, WHEAT, CORN, SUGAR | —, ZW, ZC, — | ZS excluded (12.7% missing days); sugar is ICE (paid) |
| Rates | — | ZN, ZB, ZT, ZF | Futures only. ZQ excluded (97% thin days) |

Commodity CFDs need their OANDA M1 history first. It's fetched read-only with `--price M`. Any instrument whose data
fails the 0.1 inventory bar (more than 6% missing weekday sessions, or more than 15% thin) is reported and skipped,
never forced through.

## 2. Arms

These are the gold race arms:
- the instrument's live estimator (A0; yz_10 where `js/forecastLadderIvAdjParams.js` has no entry)
- the other forge estimators
- HAR-800
- HAR-RV 5/15-min, SHAR, HAR-CJ
- the GARCH family and HAR + GARCH-t
- IV arms where a full-history CBOE index exists:

| Instrument | IV index |
|---|---|
| SPX500 / ES | VIX |
| US30 / YM | VXD |
| US2000 / RTY | RVX |
| SILVER / SI | VXSLV |
| WTI / CL | OVX |

The settlement IV for the FX majors starts 2020-09, so it stays out of the main race, as for EURUSD.

**GARCH long history:**
- CFDs: OANDA NY-close bars before 2016, as gold A3.
- Futures with no CFD twin (rates): their own NT8 history from 2015.

## 3. Rules (unchanged from the template)

- **σ race:** VALIDATED / NULL / UNDERPOWERED per instrument and track. The rules are the same as gold §4:
  - 30-cell regime miss
  - GUARD
  - winner re-selected per draw
  - both halves, four market episodes plus the instrument's four highest-range quarters
  - fault days out
- **H3 C vs F:** "same" → the futures reuse the CFD spec; "different" → they keep their own.
- **Exhaustion:** the NQ / gold rules per instrument and track. Lines come from that instrument's banked winner (H3
  decides the futures arm). The release-to-come countries follow the instrument's currencies.
- **Multiplicity across about 45 instrument-tracks:**
  - Each verdict stands on its own pre-registered rule.
  - The rollout summary also reports how many VALIDATED verdicts 45 independent tries would produce by chance under
    the 90% CI rule (about 2–3).
  - A BH q = 0.10 pass over the instruments' bootstrap p-values (winner minus A0) is reported alongside.
- **Not done here:**
  - event multipliers
  - lockbox (one shot per instrument class, later)
  - IV races for the FX majors

## 4. What each verdict changes

The VALIDATED instruments go onto the shadow export (forecast and exhaustion, CFD and futures pastes) and the
forecast-reversion page, as the pilots did. NULL and UNDERPOWERED instruments keep the live ladder.

## Amendments

### A1 — 2026-11-20, PRE-RESULTS for US2000 F exhaustion (not yet scored; other instruments unaffected)

The exhaustion walk-forward now scores a test year only when at least one earlier year of touches exists to fit on.
RTY's NT8 history starts 2017-07, so its first ladder test year is 2019 and its touches start in 2019. With nothing
before 2019 the plain-ladder baseline X0 was undefined and the fitted candidates were fitted on no rows, and the scorer
stopped with an error. RTY F's exhaustion is therefore scored on **2020+**. A check over every touches file written so
far found no other instrument-track whose touches start after 2018, so no other result changes.

### A2 — 2026-11-20, POST-HOC (results seen; demote-only): the inventory bar for the commodity CFDs

§1 says an instrument failing the 0.1 inventory bar is reported and skipped. The commodity CFDs were downloaded for this
study, and the queue never ran that screen on them. That was an omission in the run, found when sugar produced zero
sessions and corn produced 646. The screen was applied afterwards with the harness's own session floor (600 London
bars; shorter sessions are dropped before scoring). The shares of present London weekday sessions (2016-01 → 2026-08)
below that floor:
- NATGAS 22.3%
- SOYBEAN 22.7%
- WHEAT 34.5%
- CORN 75.9%
- SUGAR 100% (OANDA quotes sugar about 6½ hours a day)

Their scored sessions are therefore the busy days only. The CFD verdicts for NATGAS, SOYBEAN and WHEAT (sigma and
exhaustion) and CORN (sigma) are **demoted to UNDERPOWERED**. They stay off the exports. SUGAR and CORN CFD exhaustion
are not scored. Their futures (NG, ZW, ZC) passed the 0.1 screen and stand. With the CFD side excluded, ZC's exhaustion
uses its own F lines and an F-clock positive control.

Read literally, 0.1's futures threshold (1,000 of 1,320 bars) would also flag the SPX500, DE30, SILVER, PLATINUM and
PALLADIUM CFDs. These are flagged because those CFDs quote fewer minutes overnight, not because their data is
incomplete. Under the harness floor they drop at most 2% of sessions, so they stand. RESULTS.md reports them. This
amendment can only demote, so it changes no other verdict.
