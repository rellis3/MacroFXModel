# oi-profile-gold-history — On 3½ years of gold, do the OI Profile's walls, gamma peak and max pain hold a first touch more often than the same line moved 0.25–0.5σ? And does the gamma-peak PIN candidate replicate?

**Pre-registered 2026-11-26, before any gold history session was scored.** Nothing in this file has been run.

| | |
|---|---|
| ID / ledger ids | `oi-profile-gold-history-g1` (all lines, first touch), `-g2` (per line type), `-g3` (gamma peak × PIN, first touch), `-g4` (third touch after held → broke) |
| Branch | `claude/oi-gold-history` |
| Register row | `plans/RESEARCH_REGISTER.md` → `oi-profile-gold-history` |
| Seed | `20261126` |
| Uncertainty | date-clustered bootstrap, B = 2000 |
| Scripts / outputs | `scripts/oi-profile-gold-history/` → `analysis/output/oi-profile-gold-history/` (`RESULTS.md`, `results.json`) |
| Method lessons applied | placebo from the same price path (shifted copies of the same line, not a strike grid), positive control run before the real outcome, forward-only reading of a selected candidate kept separate (G3 here is an independent-history check, not the forward test), count every unresolved touch, date-clustered uncertainty, point-in-time OI (T-2) and σ |

## 1. Why, and what is new

`oi-profile-lines` (banked 2026-11-23) scored the OI Profile lines on our own 66-day capture: lines held like their placebos, and one atlas cell survived (gamma peak × PIN × first touch, 70% vs 49%). Gold contributed only 154 real first touches and **2** gamma-peak PIN first touches, far too few to say anything about gold on its own.

`oi-monthly-vs-full` (exploratory, 2026-11-26) showed gold is the one instrument where the Databento monthly history rebuilds the same OI Profile lines as the full book: weeklies/dailies are 2% of gold OI, and the call wall, put wall, gamma peak and max pain land within 0.25σ of the full-book line on 96–100% of days. Zero gamma does not (8%), and the PIN/BREAKOUT regime agrees on 84% of days through the net-GEX fallback.

Prior art, and how this differs: `oi_research_book/WALL_PLACEBO_PREREG.md`, `WALL_DTE_STYLE_RESULTS.md` (gold H1 −12.6pp n 169, H2 −3.0pp; UNDERPOWERED/NULL pooled with FX) and `RIPPLE_BOOK_RESULTS.md` scored **strike walls** from the Databento book with a fixed-pip break rule and a ±1–2 strike grid placebo. They did not score the OI Profile's strongest-book lines, the gamma peak or max pain as lines, the σ-scaled race, the shifted-copy placebo, or touch order. `LEVEL_TYPES_PLACEBO_PREREG.md` (2026-10-20) planned other line types but has no banked result. This study runs the exact `oi-profile-lines` detector and placebo on gold's 868-day Databento history.

## 2. Data

- **OI**: Databento CME gold options statistics, `oi_recon/databento_oi/XAU_USD.csv` (OG monthly family only), dates 2022-11-04 .. 2026-04-14, 868 trading days. Per strike/right/expiry: OI, settlement, volume.
- **Point in time**: CME options OI for day D is final only around 15:00–16:00 UTC on D+1 (`project_oi_pipeline_audit`). Session S uses the latest Databento date **D ≤ S − 2 business days** (T-2). T-1 is reported as a sensitivity only.
- **Price**: OANDA XAU_USD M1 mid, `Oanda Parquet Files/xauusd_m1.parquet`. All sessions are before the 2026-08-21 lockbox.
- **Session window**: London date S, **07:00 → 22:00 London** (the same window the capture-based study used: capture ~07:00 to 22:00). Weekends excluded.
- **σ (one day, price units)**: EWMA (λ = 0.94) of NY-close daily log returns built from M1 (`nyCloseDailyBars`, n ≥ 60 bars), using closes up to S − 1 only, × the 07:00 London price. The live study used the forecast σ; σ here only sets the 0.25σ unit, so a point-in-time EWMA is enough. A sensitivity with HAR-RV (same history only) is reported, not gated.

## 3. Build: Databento rows → the live OI Profile code path

For each D the Databento rows are turned into the record the live path expects, then built by the unchanged live code:

1. Futures price F(D, expiry) from put–call parity at the strike where |C − P| settlement is smallest (F = K + C − P, undiscounted; rates are a second-order term over ≤ 90 days and are ignored).
2. Per expiry ATM IV by Black-76 inversion on that strike's settlement; per-strike IV where both settlement and OI > 0 (the smile), else the ATM IV.
3. A QuikStrike-shaped `rawOI` matrix (Strike × expiry C/P, with `N DTE` labels relative to S and the OG series codes, which the 2026-11-26 parser fix now reads), `rawVol` from the volume field, `rawIVTerm` from step 2, spot and basis from step 4. Then `buildOIEntry` → `cmeBookContracts(maxDte 3)` → `hedgingScenario` → `buildOiProfile` (strongest book, ±3σ window), exactly as `scripts/oi-profile-lines/replay.mjs`.
4. Futures → spot: basis = F(front expiry, D) − OANDA XAU_USD mid at the CME gold settlement time (13:30 New York) on D. Every line is shifted by −basis.
5. **Build check before scoring** (mechanics, no outcomes): on 20 random D, the rebuilt matrix sums to the Databento OI per expiry exactly; the profile's call wall / put wall equal the strongest-book max-OI strikes computed directly from the rows; F is within 0.3% of the GC front settle implied by any two parity strikes. A failure stops the study.

Regime: the profile's PIN/BREAKOUT. With a monthly-only book the ≤3-DTE hedging map is empty on most days, so the regime is the net-GEX sign of the strongest book (the profile's own fallback). This is a **proxy** of the live regime (84% agreement on gold in `oi-monthly-vs-full`) and G3 is read with that caveat.

## 4. Definitions (unchanged from `forge/OI_PROFILE_LINES_PREREG.md` §3)

U = one day's σ. Lines scored: **call_wall, put_wall, gamma_peak, max_pain** (the types `oi-monthly-vs-full` showed the history rebuilds). Zero gamma, GEX flip and the vanna/charm flips are not scored (not reproducible from monthlies). Sites merged within 0.05 U; a site carries all its types. Placebos at ±0.25 U and ±0.5 U, dropped within 0.10 U of any real line, inheriting the parent's types, regime and family id. Arm on an M1 close ≥ 0.25 U away; touch = later bar reaching the line; race 0.25 U back vs 0.25 U through, from the bar after the touch (the touch bar can only resolve through); `both` and `unresolved` counted and reported. Bounce rate b = back / (back + through). E = b(real) − b(placebo) in the cell.

## 5. Positive control (run and recorded before the real outcome)

The `oi-profile-lines` harness on Gaussian random walks with the real gold session lengths and real site prices, 10 sub-steps per bar: known-zero E within ±2pp; planted (P = 0.3 forced drift back for 6 bars at real sites) E > +5pp. A failure stops the study.

## 6. Tests

| Cell | Estimate | Prediction | VALIDATED | NULL | Else |
|---|---|---|---|---|---|
| **G1** primary | E(all real sites, touch 1) | ≠ 0 (education: > 0) | \|E\| ≥ 5pp, 95% CI excludes 0, same sign both date halves | CI inside (−5, +5) | UNDERPOWERED |
| G2 per type | E(type, touch 1) for call wall, put wall, gamma peak, max pain | > 0 | E ≥ 8pp, CI lower > 0, both halves, BH q = 0.10 across the 4 | CI upper < 8pp | UNDERPOWERED |
| G3 candidate | E(gamma peak, PIN proxy, touch 1) | > 0 | E ≥ 10pp, CI lower > 0, both halves | CI upper < 10pp | UNDERPOWERED |
| G4 sequence | E(all real sites, touch 3, path held → broke) | < 0 | CI upper < 0 | CI lower > −5pp | UNDERPOWERED |

Halves split by date at the median session. Also reported, not gated: every cell with ±0.5 U placebos only; touch 2 after a hold; retest after a break; G3 on BREAKOUT days; T-1 and HAR-σ sensitivities; per-year E.

**Power** (scaled from gold in the 66-day capture: 154 real / 431 placebo first touches; types 24 / 36 / 14 / 8; gamma peak PIN 2; touch-3 real 39), ×13 for 868 days, design effect 1.3 for date clustering:

| cell | real n (est.) | SE | MDE (80%, 5% two-sided) | bar |
|---|---|---|---|---|
| G1 | ~2,000 | ~1.7pp | ~4.8pp | 5pp — borderline by design |
| G2 call / put wall | ~300 / ~470 | ~4.3 / ~3.5pp | ~12 / ~10pp | 8pp — likely UNDERPOWERED unless large |
| G2 gamma peak / max pain | ~180 / ~100 | ~5.6 / ~7.5pp | ~16 / ~21pp | 8pp — UNDERPOWERED unless large |
| G3 | ~25 (gold PIN is rare under the proxy) | ~13pp | ~36pp | 10pp — **expected UNDERPOWERED**; reported so the number exists |
| G4 | ~150 | ~5pp | ~14pp | — |

The counts depend on how many lines the monthly book draws per day; the actual n replaces these in RESULTS.

## 7. Controls

- **Mirror**: the +0.25 U copies scored as "real" against the other copies. Void rule: the mirror clears G1's bar with G1's sign. A negative mirror with a positive G1 is read as a real effect leaking into the placebos (as in `oi-profile-lines` §Amendments).
- **Concentration**: no single calendar year may carry > 40% of G1's touches or of its excess; if one does, G1 is also reported without it.
- **Build**: §3.5 must pass.

## 8. What it changes

- **G1/G2 NULL**: gold's 3½-year history agrees with the 66-day capture: OI Profile lines on gold are places price may reach, not reaction levels. The S/R zones and OI Profile reads keep 50/50 on gold.
- **G1 or a G2 type VALIDATED**: that type gets a gold-only lean candidate in the read, labelled from this study, and a forward check on our own capture before it is called validated.
- **G3**: whatever the verdict, the ★ stays governed by the forward prereg `oi-gamma-peak-pin` (F1). A G3 effect ≥ 10pp in the right direction is supporting context; a G3 point estimate ≤ 0 is recorded as against the candidate.
- **G4 VALIDATED**: supports F3 in the forward prereg; the "break lean (hint)" stays a hint until F3 reads.

## Amendments

(none)
