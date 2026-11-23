# oi-profile-lines — Do the OI Profile's lines (walls, gamma peak, zero gamma, flips, volume, nodes, expected-move edges) hold or break differently from shifted placebo lines, and does that depend on the dealer-gamma regime, the touch number, or how many lines stack at the price?

**Pre-registered 2026-11-23, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `oi-profile-lines-s1` (lines vs placebo), `oi-profile-lines-s2` (regime), `oi-profile-lines-s3` (touch order), `oi-profile-lines-s4` (confluence); atlas cells descriptive, not banked as results |
| Branch | `claude/oi-profile-lines` |
| Register row | `plans/RESEARCH_REGISTER.md` → `oi-profile-lines` |
| Data | Our own nightly QuikStrike capture (`oi_raw_<date>`, KV, 2026-08-20 → 2026-11-23, 96 keys), replayed through `js/oiProfile.js` exactly as `/api/oi-profile/export` builds it live; day σ from `vol_forecast_<date>` (computed the evening before each session). Prices: OANDA M1 mid, 11 instruments (EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, GOLD, NQ, SPX500, US30, US2000). **Window is entirely after 2026-08-21.** This study does not touch lockbox layers 3/5/6 (`forge/LOCKBOX_PROTOCOL.md` guards those only); there is no OI-profile history before 2026-08-20, so there is no other sample. |
| Seed | `20261123` |
| Uncertainty | date-clustered bootstrap (resample London session dates, all instruments of a date together), B = 2000 |
| Scripts / outputs | `scripts/oi-profile-lines/` (`pull_kv.mjs`, `fetch_m1.py`, `replay.mjs`, `events.py`, `score.py`) → `analysis/output/oi-profile-lines/` |
| Harness | own scripts: the line set must be the live indicator's own build (`buildOiProfile`), which no harness replays |

## 1. The claim

From the owner, 2026-11-23, with two OI Lab 2 screenshots (NQ, EURUSD) showing clean reactions at the profile lines: *"do we get strong moves on first touch, second touch, third touch … is it where the gamma is above a certain amount and the volume is not there, or where we've got multiple confluences … put walls always bounce, gamma lines go through on the first hit and then bounce off the second … on strong volatility days we expect price to just blow through these lines."*

Mechanism: the profile lines mark where dealer hedging changes (walls and gamma peak = concentrations of gamma; zero gamma / GEX flip = sign change of dealer gamma; vanna/charm flips = sign change of vol/time hedging flows; nodes = local long/short gamma). When dealers are long gamma (PIN) their hedging sells rallies and buys dips, which should hold price at concentrations; when short gamma (BREAKOUT) hedging chases, which should carry price through. Edge source, if any: structural hedging flow (the dealer is on the other side and must hedge), not a forecast.

## 2. Why it is not already settled

- `WALL_PLACEBO_PREREG.md` (2026-09-23) and `RIPPLE_BOOK_RESULTS.md`: walls react like neighbouring strikes — **monthly/quarterly Databento book, walls only, T-1 lagged, 2-pip break rule**. This study uses the profile's own near-dated strongest book from our capture (weeklies/dailies included), every line type the indicator draws, a σ-scaled race outcome, and the regime / order / confluence interactions. None of those cells exist in the ledger.
- `LEVEL_TYPES_PLACEBO_PREREG.md` (2026-10-20, registered, never run) and `OI_TOUCH_ORDER_PREREG.md` (2026-11-18, registered, Arm A not run): their data is the Databento book. This study is the "own nightly capture" arm both point to, built on the live profile replay instead of the old level code. It does not score their hypotheses and does not stop them being run.
- `GEX_LADDER_CONFLUENCE_RESULTS.md`: confluence of a forecast line with a gamma level, UNJUDGEABLE (308 lines). Different line set (forecast lines), different question (S4 here is OI-line stacking).
- Forecast-line studies (`reversal-zones`, `turn-at-lines`, `raw-level-revert-continue`, `line-touch-mae-futures`): vol-forecast lines, not OI lines. Their method (shifted-copy placebo, σ-scaled race) is reused here.

## 3. Definitions, fixed in advance

- **Session**: London date D, Mon–Fri. Used only if that morning's capture was saved on D (London) before 12:00 London (drops weekend keys, the stale 2026-11-19 copy and late captures). Window: from the first minute after the capture's `savedAtMs` to 22:00 London.
- **Lines**: every level `buildOiProfile` returns (default strongest-DTE book, ±3σ window) with that day's `dayMove` and hedging map, as in `server.js` `/api/oi-profile/export` (no reach odds; they do not move a line). Replay fidelity (checked before registering): spot vs OANDA mid at capture median 0.00σ on all 11; against the live frozen `forward/hedging_plan_oi` records, regime agrees 217/228 and wall prices 320/351 within 0.05σ where the book matches; the regime misses are the late-capture days where live still held the previous day's book.
- **Type**: `vanna_flip` and `charm_flip` are always the same price in this build → one type `vanna_flip`. 12 types: put_wall, call_wall, gamma_peak, zero_gamma, gex_flip, max_pain, vanna_flip, oi_volume, short_gamma_node, long_gamma_node, exp_hi, exp_lo.
- **Unit U** = the day's forecast σ in price units (`spot × ladder.sigma_daily_pct / 100`).
- **Site**: lines within 0.05 U are one site (the indicator's "×2" label). A site carries every type in it. **Confluence** `conf_types` = number of distinct types at the site plus any other site within 0.10 U.
- **Placebo**: for every real site, copies at ±0.25 U and ±0.5 U, dropped if within 0.10 U of any real line; each inherits the parent's types, regime and attributes. Identical detector.
- **Touch**: per site per session, M1 bars. A site is armed once an M1 close is ≥ 0.25 U away from it; a touch is the first later bar whose high (armed below) or low (armed above) reaches the line exactly. After a touch the site must be re-armed by a fresh close ≥ 0.25 U away (either side). `n` = touch number within the session. `side` = approach direction.
- **Outcome (race)**: after a touch, which barrier is hit first: **back** = 0.25 U back on the approach side, **through** = 0.25 U beyond the line. Checked from the bar after the touch; the touch bar itself can only resolve *through*. A bar hitting both = `both`; none by 22:00 London = `unresolved`. **Bounce rate b** = back / (back + through). `both` and `unresolved` are counted and reported, never silently dropped.
- **Excess E** = b(real) − b(placebo) in the same cell.
- **Regime**: the profile's `regime` (PIN = dealers long gamma at spot on the re-priced hedging map, BREAKOUT = short), known at the capture.
- **Halves**: the first 33 and last 33 usable session dates.
- **Positive control (from outside the pipeline)**: on a driftless random walk the ±0.25 U race from a line is 50/50 (gambler's ruin, symmetric barriers), whatever the line. The detector is run on Gaussian random-walk paths with the real session lengths and real site prices: (a) known-zero case: real and placebo b within 1 pp of 50% and E within ±2 pp; (b) planted: at real sites only, a crossing increment is reflected with probability 0.3 → E must come out clearly positive (> +5 pp) while placebo b stays at 50%. Run and recorded before the real run; a failure stops the study.

## 4. Hypotheses, expectation first

| # | Question | Expectation |
|---|---|---|
| S1 | E at first touches (n = 1), all lines pooled | Small; sign unknown. Lines in the screenshots look respected, but most touches of anything look respected on a 5-minute chart. |
| S2 | E(PIN) − E(BREAKOUT) at first touches | Positive if the hedging mechanism is real (lines hold better relative to placebo when dealers are long gamma). |
| S3 | E(n ≥ 2) − E(n = 1) | Unknown sign; the owner's idea is "through on the first, hold on the second". |
| S4 | E(conf_types ≥ 2) − E(conf_types = 1) at first touches | Positive if stacked lines matter more. |
| THE GATE (each S) | \|effect\| ≥ bar (S1 5 pp, S2 8 pp, S3 5 pp, S4 5 pp), 95% bootstrap CI excludes 0, same sign in both halves, Holm α = 0.05 across S1–S4 | all |
| THE MIRROR | the +0.25 U placebo copies scored as "real" against the −0.25/±0.5 U copies (S1 statistic) | inside its own 95% CI of 0; if the mirror clears the S1 gate the design is biased and S1–S4 are void |

Verdicts: VALIDATED = gate met. NULL = CI lies inside (−bar, +bar). UNDERPOWERED = anything else (CI spans a bar). The atlas is CONTEXT.

## 5. Power — what this design can and cannot find

Counted from touches only (no outcome read), MC with coin-flip outcomes plus a date random effect (sd 0.10), date-cluster bootstrap:

| cell | real touches | placebo | SE | MDE (80%) | bar | by design |
|---|---|---|---|---|---|---|
| S1 all, n = 1 | 1,784 | 4,914 | 2.0 pp | 5.5 pp | 5 pp | borderline |
| S2 PIN − BREAKOUT | 754 / 1,030 | 2,010 / 2,904 | 3.9 pp | ~11 pp | 8 pp | UNDERPOWERED unless the effect is ≥ ~11 pp |
| S3 n ≥ 2 − n = 1 | 2,006 / 1,784 | 5,902 / 4,914 | 2.8 pp | ~7.7 pp | 5 pp | UNDERPOWERED unless ≥ ~8 pp |
| S4 stacked − single | 821 / 963 | 2,321 / 2,593 | 3.9 pp | ~11 pp | 5 pp | UNDERPOWERED unless ≥ ~11 pp |
| one line type, n = 1 | 58–393 | 148–1,133 | 4.1–10.3 pp | 11.5–29 pp | — | atlas only |

707 instrument-sessions, 66 dates. The claims in the owner's message ("put walls *always* bounce") are large-effect claims; this sample can see those, not subtle ones. The capture grows by ~11 sessions a weekday: **re-score once at ≥ 132 usable dates** (about March 2027) with these scripts unchanged; that run is the confirmation, this one the discovery.

## 6. Multiplicity

- Scored: 4 cells (S1–S4), Holm α = 0.05.
- Atlas (descriptive, BH q = 0.10, `chanceBaseline` = the count of BH passes in 20 sign-flipped placebo runs, i.e. the same atlas with real/placebo labels permuted within site families): E by type (12), type × regime (24), type × order bucket 1/2/3+ (36), type × side (24), confluence 1/2/3+ (3), gamma-at-line tercile × volume-at-line tercile (9), London hour block 00-07/07-12/12-17/17-22 (4), forecast vol_pct tercile (3), event day yes/no (2), retest after a through (1). Every cell reported, including empty ones. A BH survivor is a candidate for its own prereg, never a result.
- Also reported, not tested: raw b(real) and b(placebo) by regime, vol tercile and event day (the "blow through on volatile days" question is first a vol question that placebo lines share); 60-minute excursion back/through in U; bars to resolution.

## 7. What this does NOT test

Trading P&L, costs, entries or stops (a line that holds more often is not yet a trade); the all-books (hidden lines) view; the TradingView P(touch) calibration; next-day effects; lines from the Databento book (that is `LEVEL_TYPES_PLACEBO` / `OI_TOUCH_ORDER` Arm A).

## 8. What each verdict changes

- S1 VALIDATED (lines hold > placebo): the profile becomes a reaction map with numbers per line on OI Lab 2; next step is the cost-gated trade test. NULL: the lines are a picture of the book, not reaction points; the OI Lab 2 labels lose "Break/Hold" wording and keep the atlas as context.
- S2 VALIDATED: regime-conditioned line reads (PIN → fade, BREAKOUT → follow) get a prereg on the trade; the hedging-plan forward record's mode switch is supported. NULL/UNDERPOWERED: the switch stays untested.
- S3 / S4 VALIDATED: touch count and stack count shown on the indicator as a strength input. Otherwise shown as context only.
- Any outcome: the atlas goes on OI Lab 2 as a page and is re-scored at 132 dates.

## Amendments

### A1 — 2026-11-23 — PRE-RESULTS
The positive control as first written could not work, so it is rebuilt before any real outcome was computed. (1) The planted case reflected the crossing step, so the synthetic price never reached the line and no detector could see the bounce (planted E came out −1.1 pp). Now: at a real site, with probability P a touch is followed by 30 bars of forced drift back; known answer E ≈ +0.5·P (planted touches all resolve *back*, the rest 50/50), so P = 0.3 → ≈ +15 pp. (2) A one-step-per-bar walk overshoots the line on the touch bar, which tilts the race toward *through* (known-zero b came out 48.8%, E +1.8 pp). Now 10 sub-steps per bar with OHLC from the sub-path; with a continuous walk the reflection principle gives b = 50%. Pass rule unchanged: known-zero b within 1 pp of 50% and E within ±2 pp; planted E > +5 pp with placebo b near 50%.

### A2 — 2026-11-23 — PRE-RESULTS (positive control run; no real outcome computed)
- Known-zero (P = 0, 708 sessions): E = +1.25 pp [−1.77, +4.29], mirror +0.25 pp, atlas BH passes 0. **Passes on E.** b(real) 48.1%, b(placebo) 46.9%: 1–3 pp under 50%. Traced to discretisation, not the detector: the same `scan()` on pure random walks gives b = 46.5 / 47.6 / 49.0% at 1 / 10 / 100 sub-steps per bar, converging on the closed-form 50% (overshoot at the touch and between monitored points). Real M1 highs/lows include every tick (close to the continuous case), and the tilt is shared by real and placebo lines. The "b within 1 pp of 50%" rule is replaced by "b → 50% as sub-steps → ∞", shown above.
- Planted (P = 0.3, drift back 6 bars ≈ 0.4 U; first try with 30 bars ≈ 2 U pushed price through every other line and was a bad plant): E = +10.9 pp [9.3, 12.8]. **Passes (> +5 pp).** But b(placebo) fell to 40%: a real bounce carries price through the ±0.25 U placebo copies behind the line, so **with a real effect, E overstates it and the mirror reads negative** (−6.7 pp [−9.4, −3.9]). A zero effect still reads zero. Added before the real run: (i) every scored cell is also reported with the ±0.5 U placebo copies only (less exposed to a neighbour's reaction) as a sensitivity, not a second gate; (ii) a negative mirror is read as contamination by a real effect, a positive one as design bias; the void rule stays "mirror clears the S1 gate with the same sign as S1".
- The atlas chance baseline (label permutation within site families) also rises under a real effect (75 of 75 under the plant), so it is conservative.

### A3 — 2026-11-23 — POST-HOC (results seen)
The atlas chance baseline was broken in the first scoring pass: `events.py` did not write each placebo's parent line, so all placebos of a session fell into one family and the real lines were never relabelled; all 20 permutations reproduced the real atlas (1 BH pass each). Fixed by writing the parent through (outcomes byte-identical, checked) and drawing the permuted "real" slot from all five slots of a family. Baseline is now median 0, max 4. No scored number changed. Post-hoc: it can only demote, and the single atlas survivor (gamma peak × PIN) stays a candidate.

## RESULTS

Run 2026-11-23 → `analysis/output/oi-profile-lines/RESULTS.md`. S1 NULL (+0.16pp [−2.67, +3.12]), S2 NULL (+0.65pp [−5.78, +7.23]), S3 NULL (−0.15pp [−4.57, +4.13]), S4 UNDERPOWERED (−4.15pp [−9.63, +1.27]). Mirror −1.04pp. Atlas: 1 BH survivor (gamma peak on PIN days, +21.7pp [13.6, 29.6], n 74) vs chance median 0 / max 4: candidate only.
