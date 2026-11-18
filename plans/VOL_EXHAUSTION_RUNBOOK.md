# Vol forecast + exhaustion runbook: CFD and futures

Started 2026-11-18. This is the one tick list for getting from today's export to a per-instrument daily
**reach ladder** (p50/75/90 OH/OL/HL/OC) **plus an exhaustion read** for every instrument. It runs on two
tracks, and every step names the track it applies to:

- **C**: CFD / spot (OANDA M1, as the live export uses today)
- **F**: futures (NT8 M1 per contract → `analysis/output/nt8/continuous/`)

The output format stays the export format, so `pine/cog_volatility_v3_sessions.pine` keeps working. Futures blocks
get their own header (for example `GOLD FUT`), so a chart can ask for the futures ladder explicitly.

**Why this exists:**
- On 2026-11-18 a rival trader's levels sat closer to the turn than ours on 6 of 9 screenshot days. The pattern was
  ours being too narrow when vol is quiet and too wide when it's loud.
- That is our own known conditional miss ([forge/run_ladder_candidates.py](../forge/run_ladder_candidates.py), regime
  miss 2.86pp live vs 1.41pp HAR-800).
- The per-instrument horse race in [forge/vol.py](../forge/vol.py) `design_vol` already picks an estimator per
  instrument, but it scores only on pinball (average sharpness). That rewards fast estimators that are wrong by
  regime, and no instrument picked HAR.

Rules that apply throughout:
- `data-rules` and `research-protocol` skills.
- Lockbox: sessions after 2026-08-21 are not scored until the single lockbox step.
- Shadow-only until owner sign-off: live calcs untouched.

Tick boxes: `[ ]` todo · `[~]` in progress · `[x]` done (add date + commit).

---

## Phase 0: Data

### 0.1 Inventory  `[x]` 2026-11-18

Coverage of the futures M1 on disk, by root. Sessions are London weekdays 00:00–22:00. "Full" means ≥1000 of 1320
bars; "thin" means 60–999 bars.

| Export instrument | Futures root | First | Last | Sessions | Full | Thin | State |
|---|---|---|---|---|---|---|---|
| EURUSD | 6E | 2015-12 | 2026-10-08 | 2472 | 2431 | 24 | ~330 days missing vs ES (holes) |
| GBPUSD | 6B | 2015-12 | 2026-10-08 | 2469 | 2359 | 93 | holes |
| USDJPY | 6J (inverted) | 2015-12 | 2026-10-08 | 2470 | 2406 | 46 | holes |
| AUDUSD | 6A | 2015-12 | 2026-10-08 | 2471 | 2377 | 75 | holes |
| NZDUSD | 6N | 2015-12 | 2026-10-08 | 2467 | 2107 | 333 | holes + illiquid minutes |
| USDCAD | 6C (inverted) | 2015-12 | 2026-10-08 | 2363 | 2217 | 127 | holes |
| USDCHF | 6S (inverted) | 2015-12 | 2026-10-08 | 2465 | 1930 | 512 | holes + illiquid minutes |
| NQ | NQ | 2015-12 | 2026-11-13 | 2799 | 2767 | 20 | good (gapfilled) |
| SPX500 | ES | 2015-12 | 2026-11-13 | 2799 | 2776 | 11 | good (gapfilled) |
| US30 | YM | 2015-12 | 2026-11-13 | 2794 | 2764 | 19 | good (gapfilled) |
| US2000 | RTY | 2017-07 | 2026-11-13 | 2385 | 2226 | 151 | good (gapfilled) |
| DE30 | FDAX | 2015-12 | 2026-10-08 | 1896 | 0 | 1896 | Eurex hours only (structural); ~900 days missing |
| GOLD | GC | 2015-11 | 2026-10-08 | 2292 | 2029 | 90 | **~500 days missing**, worst hole |
| SILVER | SI | 2015-12 | 2026-10-09 | 2471 | 2197 | 98 | holes |
| COPPER | HG | 2015-12 | 2026-10-09 | 2475 | 2223 | 100 | holes |
| PLATINUM | PL | 2015-10 | 2026-10-05 | 2738 | 1722 | 684 | illiquid minutes |
| WTI | CL | 2015-10 | 2026-10-08 | 2834 | 2826 | 5 | good |
| BRENT | BZ (CME) | 2016-07 | 2026-10-09 | 2616 | 601 | 2011 | CME BZ illiquid; real Brent is ICE `B` |
| NATGAS | NG | 2015-10 | 2026-10-09 | 2826 | 2521 | 302 | ok |
| SOYBEAN | ZS | 2015-10 | 2026-10-09 | 2141 | 249 | 1820 | grain hours (structural) |
| WHEAT | ZW | 2015-12 | 2026-10-09 | 2378 | 27 | 2194 | grain hours (structural) |
| CORN | ZC | 2015-12 | 2026-10-09 | 2389 | 85 | 2218 | grain hours (structural) |

**Totals against the export's 51 instruments:**
- **22 have futures M1 on disk.** 4 are clean: NQ, ES, YM and CL. The rest need gapfill.
- **5 can be pulled on NT8 but haven't been:** PALLADIUM (PA), BTCUSD (BTC/MBT), and the euro crosses EURGBP/EURJPY/EURCHF (RP/RY/RF), which are thin.
- **2 trade on ICE, which the NT8 feed doesn't serve:** UK100 (`Z`) and SUGAR (`SB`). They need a paid source or stay CFD-only. Real Brent (ICE `B`) would be an upgrade over the illiquid CME BZ we have.
- **22 have no tradeable future:** 18 FX crosses and 4 Scandi pairs. Their futures track is either "n/a" or a synthetic built from the legs (e.g. GBPJPY = 6B ÷ 6J).
- 22 + 5 + 2 + 22 = 51.

IBKR is **not** needed for M1. NT8 history already reaches 2015, while IBKR expired-contract history is short.

### 0.2 Repair futures M1  (F)  `[~]` started 2026-11-18
Runner (in order): backfill missing/new contract files on all roots → gapfill liquid roots at MIN_BARS 5000 → PL/BZ/PA at
2500 → grains/FDAX at 2000 (their exchange hours cap a normal week below 5000) → indices to today → stitch.
- [~] Run `nt8_bridge/nt8_gapfill.py` on every non-index root (6A 6B 6C 6E 6J 6N 6S GC SI HG PL CL BZ NG ZS ZW ZC FDAX), then `nt8_stitch.py`. The gapfill has only been run on the index roots so far (DATA_SPEC #24).
- [ ] Extend all roots to today (NT8 must be connected).
- [ ] Re-run the 0.1 table. Acceptance: missing weekday sessions vs the CME calendar < 2% per root, outside known holidays.

### 0.3 Pull missing roots  (F)
- [~] PA (from 2015), BTC (from 2017), MBT (from 2021) added to `nt8_backfill.py` ROOTS 2026-11-18. A test week
  (2026-11-09) returned 5,336 / 6,820 / 9,645 bars.
- [x] RP/RY/RF: NT8 says "unknown instrument". **Not available.**
- [x] SEK/NOK 12-26: 0 bars in a live-feed week. **No trading on CME, not tradeable.**

### 0.4 Owner decisions  (C+F)
- [x] ICE three (UK100, SUGAR, Brent): **NEEDS PAID DATA, deferred** (owner 2026-11-18). CFD-only until bought.
  Ask first and get a quote before any pull.
- [x] FX crosses + Scandies: **CFD-only** (2026-11-18). These can't be traded as a future on NT8/Lucid:
  - RP/RY/RF are unknown in NT8.
  - SEK/NOK have no trades.
  - The other crosses have no listed future.

  The owner's rule was "if we can trade them, build the legs". They can't be traded, so no synthetic ladder.

### 0.5 Refresh the CFD M1  (C)
- [ ] Extend the OANDA M1 research cache past 2026-08-20 (`--price M`, never BAM, read-only).

### 0.6 Define the futures session and σ inputs  (F)
- [ ] Levels: same London 00:00–22:00 window and London-midnight open as C, so the indicator stays identical.
- [ ] σ: ratio-adjusted continuous series (returns/vol). Levels use unadjusted per-contract prices. Roll days are flagged from `*_rolls.csv`.
- [ ] Choose and write down the daily bar used for σ: CME settlement-to-settlement (17:00 CT) vs NY 17:00. Do the per-root 1h maintenance break and grain/FDAX exchange hours need a different window?
- [ ] Inverted roots (6J 6S 6C): build the ladder on the inverted price so it reads as USDJPY/USDCHF/USDCAD, or keep it native and let the indicator swap (it already does). Pick one and write it here.

### 0.7 Integrity  (C+F)
- [ ] `node scripts/data_integrity.mjs`, extended to the NT8 continuous files; the report is linked here.

---

### 0.8 Data-quality layer (Lesson 5 standards)  (C+F)  `[~]` agreed 2026-11-18
Lean version agreed with the owner: no separate site page; the signature plot waits for Phase 2.
- [x] Frozen copies of the exact inputs of every banked study, hashes tracked (`analysis/output/ladder-v2-nq/frozen/`).
- [ ] `forge/data_screens.py`: flag-never-alter screens per instrument and track (jumps, stale/gaps, missing sessions,
      timestamps, rolls + round trip, CFD vs futures per day). Flags go to `analysis/output/data_screens/<SYM>/`.
      Flagged days stay in; every study reports with and without them.
- [ ] Input SHA-256 written into every study's `results.json` automatically.
- [ ] NQ robustness (prereg amendment A2, post-hoc, demote-only): 3-month blocks, leave-one-episode-out, flags out.
- [ ] Per-instrument template harness (config per symbol; screens, hashes, 3-month blocks, episode drops, class
      fallback built in). Then gold, ES/YM/RTY, FX.
- [ ] Phase 2 prerequisite: signature plot (vol at 1/2/5/10/15/30 min, 1h, 1d) per instrument.

---

## Phase 1: Reach ladder (vol forecast), per instrument

### 1.1 Register + prereg  (C+F)
- [ ] Register row and `forge/LADDER_V2_PREREG.md`, committed before any run.
- [ ] Candidates:
  - the 7 in `forge/vol.py` `ESTIMATORS`
  - HAR-800 (production path)
  - IV-adjusted and pure IV, where CME-settlement IV exists (7 FX + NQ)
  - futures only: realised vol from 5-minute futures returns
- [ ] **Selection score:** pinball loss + a regime-quintile calibration guard (HL>p75 / >p90 within ±3pp in every σ quintile). Pinball alone is what picked the regime-blind winners.
- [ ] Per instrument, walk-forward. If the per-instrument winner isn't distinguishable from the class winner (block bootstrap), use the class winner.

### 1.2 Run C  `[~]`
- [x] NQ 2026-11-18 (`ladder-v2-nq`, VALIDATED): har_rv_log, regime miss 2.40 → 1.49pp, within the noise floor.
### 1.3 Run F  `[~]`
- [x] NQ 2026-11-18 (`ladder-v2-nq-fut`, VALIDATED): har_rv_log, 2.50 → 1.82pp.

### 1.4 C vs F per underlying  `[~]`
- [x] NQ: same distribution (ratios 0.994–1.007), so F reuses the C spec (`ladder-v2-nq-cvf`).
- [ ] Same London session: are OH/OL/HL/OC % distributions and σ the same within noise? If yes, F reuses the C spec. If no, F keeps its own spec.

### 1.5 Event multipliers  (C+F)  `[ ]`
- [ ] Re-fit NFP/CPI/FOMC multipliers per instrument and check them by quintile. Gold on the NFP day 2026-11-06 suggests ours is too small: rival Close median 1.17% vs ours 0.79%.

### 1.6 Lockbox, one shot  `[ ]`

### 1.7 Shadow export  `[ ]`
- [ ] C and F ladders published side by side with the live one, in the same text format. F blocks are headed `<SYM> FUT`.
- [ ] Indicator: an input to choose CFD or FUT blocks.

### 1.8 Forward scoring  `[ ]`
- [ ] Daily scorecard: shadow vs live, both tracks.
- [ ] Re-score the 9 rival screenshot days.
- [ ] Score rival daily values if obtained.

### 1.9 Owner sign-off, then switch live  `[ ]`

---

## Phase 2: Exhaustion read (same distribution, conditioned)

The reach ladder and exhaustion are one distribution read two ways. P(further ≥ δ | at X) =
P(extreme ≥ X+δ) ÷ P(extreme ≥ X). Prior evidence:
- Distance alone doesn't mark exhaustion: P(final extreme) is flat from 0.5σ to 2.5σ.
- Time of day does (15% before 11:00 London, 64% after 20:00).
- The Asia range already used cuts the remaining travel (T7).

### 2.1 Prereg  (C+F)  `[ ]`
- [ ] P(further ≥ δ | touched rung, London time bucket, range used so far) per instrument.
- [ ] Baselines: the unconditional ladder ratio, plus a placebo ladder with matched distances.

### 2.2 Futures-only conditioners  (F)  `[ ]`
- [ ] Distance from session VWAP, and volume at the touch.
- [ ] Prior art: `futures-exhaustion-vwap` was UNDERPOWERED as a fade trade. This step is a conditioner on the probability, not a trade.

### 2.3 Build walk-forward, validate OOS, lockbox  `[ ]`

### 2.4 Export + indicator  `[ ]`
- [ ] Each rung carries an exhaustion figure for the current time bucket, e.g. `OL p75 … · exhaust 62% after 14:00`.
- [ ] The indicator parses and labels it, with older exports still working.

### 2.5 Shadow forward test, owner sign-off, live  `[ ]`

---

## Phase 3: Operations  `[ ]`
- [ ] Nightly: refresh both tracks' data, compute both ladders, publish both exports, score yesterday.
- [ ] Health checks: stale data per root, missing sessions, roll days flagged.
