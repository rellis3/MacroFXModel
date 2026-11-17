# vol-line-touch-layers: do the confirmed vol layers find touches of the vol lines that pay after the spread?

**Pre-registered 2026-11-17, before any outcome was computed.** No trade outcome at a vol-line touch has been computed by this study on either window. §2 lists what other studies have already seen.

| | |
|---|---|
| ID / ledger id | `vol-line-touch-layers-map` (A), `vol-line-touch-layers-meta` (B1), `vol-line-touch-layers-add` (B2). Three scored families. |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-line-touch-layers` |
| Data | M1 bid/ask `data/m1_bidask/<key>_m1.parquet` (34 instruments: 7 USD majors, 20 crosses, GOLD, DE30, DOW, NQ, SPX500, UK100, US2000). Lines and σ: `analysis/output/forecast_history/<SYM>.csv` (`open`, `pit_sig_used`, `pit_oh_p50/p75/p90`, `pit_ol_p50/p75/p90`, `r_hl`, `rv5`, `gap`, `event`). Chosen σ: `analysis/output/line_reaction/chosen_lines.csv` (`sig`, from 2020-08-20). Bursts: setup columns only (`inst, date, slot, kind, ver`) of `analysis/output/jump-after/events.parquet`. **Discovery 2016-10-24 → 2022-12-30. Confirm 2023-01-01 → 2026-08-20, scored once. Lockbox from 2026-08-21, untouched.** |
| Seed | `20261117` |
| Uncertainty | Stationary bootstrap over session dates, mean block 20 sessions, B = 2000. All instruments on a date move together. |
| Scripts / outputs | `scripts/vol-line-touch-layers/build.py` (touch table), `fit.py` (discovery: map selection, models, thresholds, frozen to `analysis/output/vol-line-touch-layers/frozen/`), `score.py` (confirm, once), `proof.py` → `analysis/output/vol-line-touch-layers/`, `RESULTS.md`, `results.json`, `checks.json` |
| Harness | Own script: needs bid/ask M1 paths after each touch. |

## 1. The claim

The owner, 2026-11-17: the six vol layers were built to make something tradeable, or to filter entries. Analyse touches of the vol lines through the day with MFE and MAE for each touch, then use the extra layers to find what is good when.

Stage 4 of the Vol-Layer research (2026-11-16) confirmed, each on its own measure on 2023-26:
- **State (1):** the live σ over-reacts (+0.32σ); the chosen σ's own recent error widens the next range (+0.18σ).
- **Jumps (2):** after a burst, a 0.5σ stop is hit within the hour +19.5pp more often than the vol clock predicts.
- **Feedback (8):** misses persist; a big morning means a big afternoon (0.487).
- **Stops (7):** the vol clock (time left) and the spread carry the stop odds.

**The claim:** at the first touch of a production vol line, these layer states pick out touches where fading or following pays **net of the real bid/ask spread**, either as a fixed condition (A) or through a model (B1). And the layers add to a model that has only the clock, the line and the run-in (B2).

## 2. Why it is not already settled

The plain question (hour × line × side) is answered, and this study does not reopen it:
- `raw-line-touch-clock-hour` (NULL, 2026-11-16): 220 line × 2-hour × direction cells, 139,507 touches, 0 net positive. Fade and follow are mirror images within ±0.011 U at every hour. MFE and MAE by hour equal the placebo's.
- `day-recon-path-book-expectancy` (NULL): all-touch EV within ±0.07R of zero; the rung spacing prices the race fairly.
- `line-touch-limit-unseen` (NULL): a touch selector beats random touches gross (+0.10R) but loses after costs (median spread 0.47R at its stop).
- Vol-Layer stage 3 meta (exploratory, `backtest-data/vol-layer/meta-wide.json`): a side-picking model at a 0.5σ line holds AUC 0.52–0.58 but still loses net (−0.151R vs −0.168R). The only input that added was forecast error, measured then against the wrong σ.
- `meta-label-proper`, `meta-label-trust-lines` (NULL): earlier meta-models on other primaries, without these layer inputs.

**What is new:** the stage 4 layer inputs (over-reaction pull, the σ's own recent range error, bursts and common bursts, the vol-clock share left, the vol-clock ratio so far and the range used) as conditions on the touch. None of those was in any study above.

**What has been seen on the confirm window:** the lines, σ and bursts (setup only) are known; stage 4 scored layer measures there, not trade outcomes at touches. `raw-line-touch-clock` scored touch outcomes on 2019-2026 15-minute bars, unconditioned on layers. That is a known overlap; this study's selections are made on 2016-2022 only.

**Prior expectation:** most likely NULL. The spread at a 0.25σ stop is large, and every unconditioned version loses. The design is powered to see a top-fifth net edge of about +0.04R (§5).

## 3. Definitions, fixed in advance

**Touch.** For each instrument and London session (00:00–22:00 London), the line level is `open × (1 ± p/100)` for `p` = `pit_oh_*` (up) and `pit_ol_*` (down), rungs p50, p75, p90. The touch is the first M1 bar whose mid high (low) reaches the level, kept only if it is at 01:00–18:59 London. Each of the 6 lines is touched at most once per session. Days with fewer than 600 M1 bars or no σ are skipped.

**Entry.** At the close of the touch bar: buy at `ask_c`, sell at `bid_c`. σ in price = `pit_sig_used / 100 × open`.

**Sides.** Fade = trade back toward the open; follow = trade through the line.

**Shapes** (target a, stop b in σ, from the entry fill; time exit 21:00 London at the bid (long) or ask (short) close):
- S1: 1:1, 0.25σ / 0.25σ
- S2: 1:1, 0.5σ / 0.5σ
- S3: 2:1, target 0.5σ / stop 0.25σ

A long's stop is hit when `bid_l ≤ stop` (fill `min(stop, bid_o)`), the target when `bid_h ≥ target` (fill the target). A short uses `ask_h` / `ask_o` / `ask_l` the same way. Both in one bar = stop. **Net R** = signed (exit fill − entry fill) / (b × σ in price). So the spread is paid at entry and exit, and gaps through the stop are charged.

**MFE / MAE** (described, not scored): favourable and adverse excursion from the entry fill, in σ, at 60 minutes and to 21:00, for each side.

**Layer inputs** (point-in-time, known at the touch bar):

| Layer | Input | Definition |
|---|---|---|
| 1 state | `mr5` | ½ log(median rv5 of the previous 252 sessions / mean rv5 of the previous 5), through t−1 (the over-reaction pull) |
| 1 state | `err10` | EWMA (half-life 10) of log(r_hl / pit σ) through t−1, minus its expanding mean through t−1 (≥ 20 sessions) |
| 1 state | `cgap` | log(chosen σ / pit σ); missing before 2020-08-20 |
| 2 jumps | `burst` | 1 if the session's first burst (`kind == "flag"`, `ver == "x"`) ended at or before the touch minute |
| 2 jumps | `common` | 1 if that burst's moment had ≥ 3 instruments |
| 2 jumps | `since` | minutes since that burst (cap 600; 600 if none) |
| 7 stops | `vleft` | share of the session's 5-minute variance profile left from the touch to 21:00 (profile from discovery sessions only) |
| 7 stops | `spread` | (ask_c − bid_c) at entry / σ in price |
| 8 feedback | `vratio` | log(realised 1-min variance since 00:00 / (σ² × profile share since 00:00)) |
| 8 feedback | `used` | (session high − low up to the touch) / σ |
| 8 feedback | `res1` | log(yesterday's r_hl / yesterday's pit σ) |

**Base inputs** (no layers): touch minute, weekday, rung (1/2/3), direction (up/down), instrument class, `spd15` and `spd60` (move over the last 15 and 60 minutes into the touch, in σ, signed with the touch), `ext_opp` (how far the session went the other way first, in σ), |gap| / σ, event day.

**Not used, and why:** dollar-led vs own-led (layer 3) was confirmed to make no difference (`vol-layer-features-confirm-eq`). Sizing (layer 6) is already in the R units. Views (4) has no confirmed input.

**+1 lag:** entry at the close of the bar after the touch bar, same shapes from that fill.

## 4. Hypotheses

**A. Layer-state map (`vol-line-touch-layers-map`).**
Cells: layer input (8: mr5, err10, burst, common, vleft, spread, vratio, used) × state (terciles with cut points from discovery; `burst` and `common` are 0/1) × time block (01–07, 07–13, 13–19 London) × rung (3) × side (2) × shape (3). Cells with fewer than 300 discovery touches are dropped.
- **Discovery (2016–22):** one-sided test of mean net R > 0 per cell, using per-date means (dates as units); BH at q = 0.10 over all eligible cells. **Candidates** are the cells that pass BH and have mean net R ≥ +0.03R.
- **Confirm (2023–26), each candidate once:** VALIDATED if mean net R > 0 with the 95% bootstrap lower bound > 0 after Holm across the candidates; the +1 lag is still > 0; and at least 3 of the 4 confirm years (2023, 2024, 2025, 2026 part-year) are > 0. Lower bound > 0 but a year or lag check failing → CONTEXT. Point > 0 but the interval includes 0, with the MDE above +0.05R → UNDERPOWERED. Otherwise NULL.
- If no cell becomes a candidate, the family is NULL on discovery and there is nothing to confirm (still banked, with the closest cells described).

**B1. Layer meta-model (`vol-line-touch-layers-meta`).** For each side × shape (6 combos): a gradient-boosted regressor (`sklearn` HistGradientBoostingRegressor, fixed settings: max_depth 3, learning_rate 0.05, max_iter 300, min_samples_leaf 200, l2_regularization 1.0, random_state = seed) predicts net R from base + layer inputs, fitted on all discovery touches. The take threshold is the 80th percentile of purged out-of-fold discovery predictions (6 date blocks, embargo 5 sessions). On confirm, the touches at or above the threshold are taken.
- VALIDATED if, for a combo, the taken touches' mean net R has its 95% bootstrap lower bound > 0 after Holm across the 6 combos, the +1 lag mean is > 0, and at least 3 of 4 years are > 0. The same CONTEXT / UNDERPOWERED / NULL ladder as A.

**B2. Do the layers add (`vol-line-touch-layers-add`).** Same 6 combos. A base model (base inputs only, same settings and threshold rule). The difference = taken mean net R (layered) − taken mean net R (base), each at its own threshold, bootstrapped together over dates.
- VALIDATED if the lower bound > 0 after Holm across the 6 and the point is ≥ +0.03R. Lower bound > 0 but the point is below +0.03R → CONTEXT. Also reported, not gating: AUC for net R > 0, layered vs base.

**Described only:** MFE / MAE (median, p25, p75) at 60 min and to 21:00 by block × rung × side, for discovery and confirm, plus per-layer partial dependence of the layered model. The ranking of which layer matters most is described, not tested.

## 5. Power (planned; measured SDs added as a PRE-RESULTS amendment from discovery only)

From the stage 3 meta events (60,211 first touches of a 0.5σ line in discovery, net R per-trade SD about 0.9 at 1:1; design effect about 3.5 from same-day clustering): confirm has about 3.6 years × 34 instruments × about 1.7 touches a session ≈ 50,000 touches per side × shape. A top fifth is ≈ 10,000 touches, ≈ 2,900 effective, SE ≈ 0.017R, **MDE (80%, two-sided 5%) ≈ 0.047R** before Holm. A map cell with ≈ 1,500 confirm touches has an MDE ≈ 0.12R. B2's difference shares most dates, so its SE sits between those.

## 6. Multiplicity

A: BH q = 0.10 on discovery over all eligible cells (selection), Holm over candidates on confirm. B1 and B2: Holm across 6 combos each. The three families are reported separately; no family promotes another.

## 7. What this does NOT test

- Lines other than the production PIT p50/p75/p90 O→H / O→L lines (the chosen-σ lines start in 2020-08 and give too short a discovery window; `cgap` carries the chosen σ as an input).
- Limit entries (adverse selection is banked in `line-touch-limit-unseen`).
- Direction by hour without layers (`raw-line-touch-clock-hour`).
- A portfolio: each verdict is per trade, net of one round-trip spread and gaps.

## 8. What each verdict changes

- **A or B1 VALIDATED:** the first entry that pays net after the spread from the vol layers. It goes to a shadow paper record (no live money), labelled with its cell or threshold, and the System tab's Entry slot is updated. B1 VALIDATED also unblocks meta-labelling (layer 5).
- **B2 VALIDATED but B1 not:** the layers sharpen trade selection, but not enough to beat the spread. Meta-labelling is a filter waiting for a better primary.
- **All NULL:** the vol layers are risk tools only (lines, size, stops, book risk). The money must come from somewhere else, and the Entry slot says so.
- **UNDERPOWERED:** a frozen forward record of the frozen model, with the date when it would be judgeable.

## Amendments

### A1 (2026-11-17, PRE-RESULTS: no touch outcome had been computed or read)

From the owner's review, 2026-11-17. Each item replaces the matching text above where they differ.

1. **Base = the existing meta model's inputs.** The base model uses exactly the stage 3 meta inputs (`scripts/vol-layer-deep/meta.py` FEATS: touch minute, `ext_opp`, `spd15`, `spd60`, `rv_pre`, `regime`, `res1`, |gap| / σ, `spread`, event day, Monday, Friday), plus rung, direction and instrument class (needed because this study has three rungs and 34 instruments). `rv_pre` = log(realised variance since 00:00 / the median of the same quantity at the same minute over the previous 20 sessions, ≥ 10). `regime` = log(pit σ / median pit σ of the previous 250 sessions, ≥ 120). The **layered** model is base + the trusted layer inputs: forecast error `err10`; over-reaction `mr5`, `cgap`; bursts `burst`, `common`, `since`; morning / range so far `vratio`, `used`; vol clock `vleft`. `res1` and `spread` move to the base, because stage 3 had them. B2 is therefore "existing meta model" vs "existing meta model + the trusted inputs", same learner, same settings.
2. **Chronological validation inside discovery.** The take threshold comes from walk-forward out-of-sample predictions: for each test year Y in 2019, 2020, 2021, 2022, fit on sessions before Y minus a 5-session embargo, then predict Y. The threshold is the 80th percentile of the pooled 2019–22 predictions. 2016-10 → 2018 is training only. The final model is fitted on all discovery sessions. Labels resolve within the same session (time exit 21:00), so a 5-session embargo covers every input that looks back (the longest, `rv_pre`, uses 20 sessions of the past, never the future).
3. **No tuning on 2023–26.** Learner settings, input lists, thresholds and map candidates are written to `frozen/` and committed before `score.py` reads one confirm outcome. `score.py` refuses to run if `frozen/` is not in git HEAD.
4. **Clustering.** Every interval is a date-block stationary bootstrap (dates as units, mean block 20 sessions, B = 2000), so the many touches on one date (instruments, rungs, sides) count as one draw. Trade counts, distinct dates and the effective sample (variance ratio) are reported with every interval.
5. **Filtering vs. picking (described, every B1 combo).** Report mean net R for all touches, the taken top fifth and the skipped 80%, each with an interval and counts, plus lift = taken − all. B1 still needs the taken fifth's own net R > 0 (lower bound > 0): a filter that only loses less is not a pass. The RESULTS name which case each combo is: **picks** (taken > 0), **avoids** (taken − all > 0 but taken ≤ 0), or **neither**.
6. **By rung (described).** B1's taken net R, interval and counts by rung (p50, p75, p90) separately, for both the layered and base models. Not gating; no multiplicity correction.
8. **Headline combo and the shared verdict gate (A2 detail, same date, PRE-RESULTS).** One side × shape is fixed on discovery as the headline: the combo with the highest layered walk-forward (2019–22) taken mean net R, written to `frozen/params.json`. The ledger verdicts for B1 and B2 are the headline combo's, from `forge/verdict_gate.py` (minimum effect +0.03R for A, B1 and B2; 95% date-block interval; registered gate parts `lag` and `years_3_of_4`, which can only demote). The other five combos are reported with Holm across all six. A Holm-passing non-headline combo is CONTEXT at most. Map candidates (A) each get a gate entry. If A has no candidate, A is NULL on discovery and the closest cells are described.
9. **Proof pack (headline combo).** Planted effects: add +0.30R (large) and +0.06R (minimum) to the outcomes of the top third of `err10` in both windows, rerun the whole pipeline (walk-forward threshold, final fit, confirm take) and check the taken mean moves by at least half the plant. Shuffle: outcomes permuted across touches within each discovery date, the pipeline rerun, and taken − all on real confirm outcomes must have an interval that includes 0.
7. **Burst inputs before 2017-08-30.** `jump-after` has no flags before its detector's warm-up ends (first flag 2017-08-30). `burst`, `common` and `since` are missing (not 0) before that date. The tree handles missing values natively; map cells on burst states use 2017-08-30 → 2022-12-30 only.
