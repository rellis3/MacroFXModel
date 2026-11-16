# vol-layer-features-confirm: does the dollar / own split of the USD majors hold on unseen 2023-26 data, on its own measure?

**Pre-registered 2026-11-16, before any outcome was computed.** No share, correlation, event or tail statistic of this layer has been computed on any session from 2023-01-01 onward. The power table below uses the discovery window (2016-10-24 → 2022-12-30) only.

| | |
|---|---|
| ID / ledger id | `vol-layer-features-confirm-tod`, `-sig`, `-fr`, `-eq` (four scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vol-layer-features-confirm` |
| Data | **Instruments (7, reported separately and pooled):** EURUSD, GBPUSD, AUDUSD, NZDUSD, USDCAD, USDCHF, USDJPY. **Prices:** M1 bid/ask from `data/m1_bidask/<sym>_m1.parquet`, log mid of the bid/ask close, London 00:00–22:00, filled forward at most 30 minutes (the stage 2 grid rule in `scripts/vol-layer-deep/features.py`). **σ:** `analysis/output/forecast_history/<SYM>.csv`, `live_sig_used` (known at the open). **Score window:** London dates 2023-01-02 → 2026-08-20 (949 weekdays, about 930 complete sessions). The lockbox (2026-08-21 onward) is untouched. **Warm-up only:** the last 60 sessions of 2022 feed β, the big-move threshold and the first window of the absorption ratio; no 2022 outcome is scored. **Discovery (reproduction and power only):** 2016-10-24 → 2022-12-30. |
| Seed | `20261116` (one for every script in this study) |
| Uncertainty | Stationary date-block bootstrap over sessions, block 20, B = 2000, weights built in the script with the study seed. Every statistic pools the 7 pairs inside a session, so a session is the resampling unit. |
| Scripts / outputs | `scripts/vol-layer-features-confirm/run.py` → `analysis/output/vol-layer-features-confirm/{discovery,confirm}/` plus `RESULTS.md`, `results.json`. The price grid cache goes in `analysis/output/vol-layer-features-confirm/grid/` and is not committed. |
| Harness | Own script. The cells need a 1-minute bid/ask grid, a leave-own-out dollar factor and a point-in-time β, which the harnesses don't build. |

## 1. The claim

C.OG: "An example of a layer is an engineering feature such as splitting correlation from variance." Layer 3 of the Vol-Layer research does this for the USD majors. Each pair's 5-minute move is split into β × the dollar (the mean of the other six majors, signed so + = dollar up) and the pair's own part.

Stage 3 (`scripts/vol-layer-deep/features_wide.py`, discovery only) found four things worth confirming:

- **(a) The dollar share depends on the hour.** It peaks in the 13:00–16:00 London overlap (EURUSD 0.62) and is lowest in Asia (USDJPY 0.12). USDCAD runs the other way: its own data lands at 13:30.
- **(b1) The dollar share rises with σ.** The high-σ third takes about 12 points more of the variance than the low third (pooled over the 7 pairs).
- **(b2) But loud days are not dollar takeovers.** Raw correlation rises from 0.40 to about 0.52 on loud days. That is far less than the 0.87 a rise in the dollar's variance alone would give. With the Forbes-Rigobon correction ρ/√(1+δ(1−ρ²)) the correlation falls on loud days.
- **(c) Dollar-led and own-led big moves trade the same.** The 1-hour follow-through difference is −0.001σ against a 0.037σ round trip.

**The claim:** each of these holds on unseen 2023-26 data, judged by its own measure (C.OG L03: validate each layer by its own factor). The measures are share of variance, correlation and follow-through in σ. No base system's P&L is used.

## 2. Why it is not already settled

- **Stage 4 was redesigned on 2026-11-16 (owner approved).** The first stage 4 test judged layer 3 through a dollar cap on Rule A's book. That test (`vol-layer-rule-a-confirm-k1`) is UNDERPOWERED. Its Sharpe-change MDEs were 0.25–0.31, and the cap was no better than skipping the same number of trades at random. It asked whether a cap helps one system. This asks whether the split itself replicates.
- **The 2023-26 window has been used once,** only for Rule A's overlay trades (2026-11-15). That scored Rule A's net R per trade under four overlays. It computed no dollar share, correlation, big-move event or joint tail. It is a different question on a different sample (Rule A's 0.2σ break trades, not all sessions).
- **One partial contact.** `vol-layer-reaction` (2026-11-07, CONTEXT) used a 60-minute common / own split as a feature at chosen-line touches, walk-forward 2021-2026. It asked whether that feature changes the reject / break odds at a line. The dollar-share group did not clear Holm. This study's cell (c) uses all big 15-minute moves at any time, not line touches, and scores follow-through in σ. Its outcomes have not been computed. That earlier read leans the same way as the expectation here, and that is stated rather than hidden.
- **Banked nulls next door are about trading the residual.** These are `residual-pca-wide10` and the residual-PCA family, `hedge-residual-mr` / `-mom`, and `residual-reversion-fx`. All are NULL or UNDERPOWERED. This study does not trade the own part. It confirms where the variance comes from, plus one equivalence.
- **Stage 1–3 panels are descriptive and not banked.** Stage 3 tested 614 cells and 189 passed BH at q = 0.10. Passing BH inside a sweep makes a cell a candidate, not a result. This prereg turns the strongest few candidates into scored cells.

**Discovery reproduction (before scoring).** A scratch script rebuilt the cells from the stage 2 grid. It used the discovery window only, seed 20261116 and B = 1000:

| Cell | Discovery value | Bootstrap SE (discovery) |
|---|---|---|
| TOD: overlap minus Asia, sign-adjusted, mean of 7 | +0.163 | 0.017 |
| SIG: high minus low σ third, mean of 7 | +0.118 | 0.032 |
| FR: corrected ρ, top 3 minus bottom 3 same-day vol deciles | −0.100 | 0.029 |
| EQ 1h: dollar-led minus own-led follow | −0.0006σ | 0.0031 |
| EQ rest: same, to 22:00 | −0.0101σ | 0.0067 |

The EQ rows come from the stage 3 `results.json` (B = 2000). The run script must reproduce all five on discovery to 3 decimals before it opens 2023 (§3, step 0).

**Method lessons applied** (`education/RESEARCH_METHOD_LESSONS.md`):
- #1, a positive control with a planted answer before the real run.
- #3, a PC1 loading-stability diagnostic next to the absorption ratio.
- #7, Forbes-Rigobon correction and joint worst-day counts against shuffles.
- #10, share reported on two proxy specs (5- and 15-minute returns).
- #25, the full σ ladder shown, not only top minus bottom.

## 3. Definitions, fixed in advance

**Step 0, gates before any 2023 outcome:**
1. **Reproduce discovery.** Run the exact confirm code on 2016-10-24 → 2022-12-30. Each §2 value must match to 3 decimals. If one does not, stop and fix the code. A change here is a PRE-RESULTS amendment.
2. **Positive control.** Simulate 7 pairs from a known one-factor model: planted β, factor variance and own variance, an hourly profile in the factor's variance, and 10% of days where only the factor variance is scaled by 3. The pipeline must recover:
   - the planted share by bucket within ±0.02;
   - the planted TOD and SIG statistics within ±0.02;
   - the closed-form Forbes-Rigobon prediction: the corrected correlation on factor-only loud days equals the calm correlation, within ±0.02.

   For EQ, plant no difference between dollar-led and own-led moves. Then check that the 90% interval covers 0 in at least 85 of 100 seeded draws. If any part fails, stop.

**The split (all cells).**
- **Grid.** 1-minute log mid per London session, as in `features.py` `load()`.
- **Complete session:** all 7 majors have at least 900 raw M1 bars in 00:00–22:00.
- **Signed level** u_i = sign_i × log mid. EURUSD, GBPUSD, AUDUSD and NZDUSD are −1; USDCAD, USDCHF and USDJPY are +1. So + always means the dollar is stronger.
- **Leave-own-out dollar** D_−i = the mean of the other six u_j. The pair is never inside its own factor.
- **5-minute returns** x, d on bars ending at minutes 5, 10, … 1315.
- **β** for session t = Σx·d ÷ Σd² over sessions t−20 … t−1 (at least 10). This is point in time.
- **Share** of a set of bars = Σ(2β·x·d − β²·d²) ÷ Σx², pooled over sessions. This is an out-of-sample R², so it can be below 0.

**Cell TOD (a).**
- **Buckets** by bar start: Asia 00:00–07:00 and overlap 13:00–16:00 London.
- T = mean over the 7 pairs of s_i × (share_overlap − share_Asia). s_i = +1, except USDCAD where s_i = −1, as found in discovery.
- **Neighbours:** β window 10 and 40 sessions; bucket edges moved one hour earlier (overlap 12–15, Asia 00–06) and one hour later (overlap 14–17, Asia 00–08).
- **+1 lag:** β from sessions t−21 … t−2.

**Cell SIG (b1).**
- **Thirds** of σ known at the open (`live_sig_used`), cut per pair over the window's complete sessions.
- S = mean over the 7 pairs of (share in the high third − share in the low third), with full-session bars.
- **Neighbours:** quartiles and quintiles (top minus bottom); β window 10 and 40.
- **+1 lag:** σ from the previous session and β one session staler.
- **Descriptive:** the full ladder (thirds, quintiles), and a version ranked against σ's own trailing 252 sessions. That version is point in time; the window cut is a sort, not a forecast.

**Cell FR (b2).**
- **Bars:** 5-minute bars where all 7 majors exist.
- **Per session:** the 7×7 second-moment matrix and activity = its trace ÷ 7 ÷ bars. Sessions need at least 200 such bars.
- **Deciles** of activity within each calendar year. 2026 runs January to August only.
- **Pooling:** pool the matrices over the top three deciles (8–10) and over the bottom three (1–3).
- **Correction:** ρ_ij from each pool. δ_ij = the mean of the two pairs' variance ratios (top ÷ bottom) − 1. ρ*_ij = ρ_ij ÷ √(1 + δ_ij(1 − ρ_ij²)).
- **Statistic:** F = mean ρ*_top − mean ρ_bottom over the 21 pairs of pairs.
- **Reading:** F < 0 means loud days are less correlated than a dollar-only variance rise would make them. This is the same test as "observed ρ below the forward map ρ_c√(1+δ)/√(1+δρ_c²)", because the map is monotone.
- **Reported beside it:** raw ρ_top − ρ_bottom and the forward map.
- **Neighbours:** top 2 vs bottom 2 deciles; top 4 vs bottom 4.
- **+1 lag:** deciles of the previous session's activity. In discovery this was −0.075 (SE 0.040), so it may not clear on its own.

**Cell EQ (c).** An equivalence test, as built in `features_wide.py` `events()`.
- **Formation:** 15 minutes, at boundaries t = 15, 30, …
- **Big move:** |x| ÷ σ at or above the mean of the previous 60 sessions' daily 90th percentile of that ratio, from prior sessions only.
- **Split** of the move: c = β·Δd and e = x − c. Share = c² ÷ (c² + e²).
- **Dollar-led:** share ≥ 0.7 and c has the same sign as x. **Own-led:** share ≤ 0.3.
- **Outcome:** entry at t+1 on the mid. Follow = the sign of the move × (mid at exit − mid at entry) ÷ σ. Exits at t+1+60 (1h) and at 21:59 (rest).
- **Statistic:** Δ_h = event mean (dollar-led) − event mean (own-led). The bootstrap resamples sessions.
- **Equivalence margins:** ±0.018σ at 1h and ±0.042σ to the end of the session. Each is half the discovery round-trip spread (0.037σ and 0.085σ). A difference below half a round trip cannot make the label pay as a trade filter.
- **Neighbours:** the 26 other settings of the stage 3 grid: formation 5 / 15 / 30 minutes × percentile 80 / 90 / 95 × cut 0.6 / 0.7 / 0.8.
- **+1 lag:** β, σ and the threshold all one session later.
- **Descriptive:** the fade stop-through difference at 0.25σ. Discovery: 58.4% vs 58.5%.

**Descriptive only (no pass or fail).**
- **(d) Joint worst days (C.OG L06).**
  - The open-to-22:00 move is split into β·D and own, in σ.
  - Count the days where both parts are in the top q by size (abs), and where both are in the same-direction tail. Use q = 5% and 10%.
  - Benchmark: 2,000 seeded shuffles of the own part across sessions.
  - Expected to stand out: USDCAD abs (discovery 12 vs 3.8) and GBPUSD same-direction (7 vs 1.8).
  - BH at q = 0.10 over the 28 counts, with `chanceBaseline`.
- **(e) Absorption ratio.**
  - The top-1 PC share of the 7×7 correlation and the participation ratio N_PR = (Σλ)² ÷ Σλ², over rolling 63 sessions ending at t−1.
  - Benchmark: the same windows with each pair's sessions shuffled.
  - Also the principal angle between PC1 in back-to-back 63-session windows (loading stability).
- **Proxy spec.** The share by pair, bucket and year on 15-minute returns.
- **By year:** 2023, 2024, 2025 and 2026 (January–August).

**Sample.** 2023-01-02 → 2026-08-20, opened once after step 0 passes. The year check splits it four ways. The four scored cells answer different questions and are not variants of one.

## 4. Hypotheses

| Cell | Question | Expectation (from discovery) | Pass bar |
|---|---|---|---|
| TOD | Is the dollar share higher in the overlap than in Asia (USDCAD reversed)? | **Yes**, about +0.16 | +0.10 share |
| SIG | Is the dollar share higher when σ at the open is high? | **Yes**, about +0.12 | +0.10 share |
| FR | Is the Forbes-Rigobon-corrected correlation on loud days below that of quiet days? | **Yes**, about −0.10 | −0.05 correlation |
| EQ | Do dollar-led and own-led big moves follow through the same, within the margins? | **Yes (equivalent)**, 1h about 0, rest about −0.01σ | ±0.018σ at 1h, ±0.042σ at rest, both horizons |

**THE GATE (VALIDATED) for TOD, SIG and FR**, all of these:
- the Holm-adjusted p < 0.05 over the four cells (two-sided bootstrap p);
- the effect has the predicted sign, and the point estimate is at or beyond the pass bar;
- **plateau:** every neighbour has the same sign and at least half the base size;
- **+1 lag:** the same sign and at least half the size;
- the same sign in at least 3 of the 4 years;
- per pair: TOD has the predicted sign in at least 6 of 7 pairs, and SIG is positive in at least 5 of 7.

**THE GATE (VALIDATED) for EQ:**
- **TOST.** For each horizon, p_eq = the larger of the two one-sided bootstrap p-values against ±margin. The cell's p = the larger of the two horizons (intersection-union, no extra correction). Holm-adjusted p < 0.05.
- **Plateau:** all 26 neighbouring settings have 1-hour points inside ±0.018σ.
- **+1 lag:** both horizons' points are inside their margins.
- In at least 3 of the 4 years, both points are inside the margins.

**THE MIRROR.**
- TOD: the wrong-day factor (β applied to another session's dollar path). Both forms are reported: the in-sample r² (discovery 0.005) and the out-of-sample share (discovery −0.2 to −0.6). See §8 notes.
- SIG: the low third.
- FR: the forward map, which is what a dollar-only rise would give.
- EQ: the all-big-moves pool.

**Other verdicts**, in this order:
- **NULL.** For TOD, SIG and FR: the 95% CI lies wholly on the near side of the bar (the effect is ruled smaller than matters), or the effect is significant with the wrong sign. For EQ: the 95% CI of Δ at either horizon lies wholly outside its margin. That means the labels do trade differently, and the difference becomes a candidate for its own prereg.
- **CONTEXT.** The Holm test passes in the predicted direction, but the bar, plateau, lag, year or per-pair check fails.
- **UNDERPOWERED.** Anything else: the interval spans both 0 and the bar, or for EQ it crosses a margin edge.

## 5. Power

The SEs come from the discovery bootstrap (§2), scaled to about 925 complete confirm sessions: × √(1584 ÷ 925) = 1.31. The MDE uses `mdeFromCI` at 80% power, two-sided, α = 0.0125 (Holm's first step for four cells). For EQ, the smallest margin TOST can confirm with 80% power when the true difference is 0 is (z₁₋α + z₀.₉) × SE, with one-sided α = 0.0125.

| Cell | Planned n | SE (confirm, scaled) | MDE (α 0.0125) | MDE (α 0.05) | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| TOD | ~925 sessions × 7 pairs | 0.022 | 0.074 | 0.062 | 0.10 | **POWERED** |
| SIG | ~925 sessions × 7 pairs | 0.042 | 0.139 | 0.116 | 0.10 | **UNDERPOWERED by design** |
| FR | ~925 sessions (21 pairs of pairs) | 0.039 | 0.129 | 0.108 | 0.05 | **UNDERPOWERED by design** |
| EQ 1h | ~17,500 dollar-led and ~29,000 own-led events (discovery 29,897 / 49,556 × 925/1584) | 0.0041σ | min margin 0.0145σ | 0.0120σ | margin 0.018σ | **POWERED** |
| EQ rest | same | 0.0087σ | min margin 0.031σ | 0.026σ | margin 0.042σ | **POWERED** |
| (d) joint worst, per pair, 5% tail | ~925 days, λ₀ ≈ 2.3 | Poisson | 3.4× shuffled (unadjusted), 4.4× at α 0.05/7 | — | 2× | UNDERPOWERED by design; descriptive. At 10% the MDE is about 2.1–2.3× |

- **Pass bars.**
  - 0.10 share is about the year-to-year SD of a pair's share in discovery (EURUSD 0.49–0.61, GBPUSD 0.19–0.56). An hourly or σ effect smaller than that drift would not earn its own budget rule.
  - 0.05 correlation moves a 7-leg book's effective bets N/(1+(N−1)ρ) from 1.89 to 1.75 near ρ = 0.45, about 8% of the book's diversification. Below that, a loud-day cluster rule would not be worth having.
- **SIG and FR are underpowered by design.** A value near discovery (+0.12, −0.10) would clear p but might not clear the bar. A miss reads UNDERPOWERED, never NULL. The design can't be lengthened: the window is fixed and the lockbox is closed.
- **The SE comes from the same date-block bootstrap the run will use.** Each session pools 7 pairs, so cross-pair correlation is inside the session unit (no extra design effect). No planted-signal check exists yet for the shrinkage-free ratio estimators; step 0's positive control fills that before the run.

## 6. Multiplicity

- **Scored cells:** TOD, SIG, FR, EQ. Holm at α = 0.05 over the four. EQ's two horizons form a conjunctive (intersection-union) gate, so they need no further correction.
- **Bootstrap to p:** the two-sided share of replicates on the far side of 0 (`line_reaction._p_from_reps`). For EQ, the one-sided share beyond each margin. `pFromCI` is the cross-check.
- **Disaggregation:** per-pair, per-bucket, per-year, per-tercile and the 15-minute spec. BH at q = 0.10 with `chanceBaseline`. A slice that survives is a candidate, never a result.
- **Descriptive:** (d) and (e) have their own BH (28 counts) and carry no pass weight.
- **Promotion:** nothing here sizes a live position. A TOD or SIG pass used for a live budget would need |t| ≥ 3. The live book is never edited; a budget rule would run as a shadow beside it.

## 7. What this does NOT test

- **Direction or a trade.** No cell is an entry. EQ confirms only that the label adds nothing to follow-through. Fading or following big moves loses one spread in discovery either way.
- **Trading the own part (residual reversion).** Banked NULL or UNDERPOWERED elsewhere and not reopened.
- **Crosses, gold and indices.** Crosses are exact combinations of the majors and have no split of their own. Gold and indices against the dollar were stage 2 descriptions only.
- **Regime.** Discovery had only 2 turbulent episodes. The confirm window is not expected to add enough episodes, so regime is not scored.
- **Cause.** For example, that the 13:30 US data creates the overlap peak. A scheduled-news baseline would be its own prereg.
- **A dollar-cluster cap or any sizing rule.** That was K1 on Rule A, which was UNDERPOWERED.
- **The absorption ratio as a forecast** of the next window's dollar share. That is a new question and needs its own prereg.
- **The lockbox (2026-08-21 onward).**

## 8. What each verdict changes

- **TOD VALIDATED.** The "Book risk" slot (`js/volLayerResearch.js` ASSEMBLY) may say the dollar share by hour is confirmed out of sample. An hourly dollar-cluster budget can be proposed as a shadow arm beside the live book.
  - **NULL:** the page stops saying "the dollar share peaks 13–16".
  - **UNDERPOWERED:** it stays a discovery description.
- **SIG VALIDATED.** "The dollar share rises with σ" goes beside the σ forecast as a book-risk note.
  - **NULL:** the line is dropped.
  - **UNDERPOWERED:** expected by design; the line stays labelled "discovery only".
- **FR VALIDATED.** "Loud days are own-move days, not dollar takeovers" is confirmed. A cluster cap need not tighten on loud days.
  - **NULL:** the Forbes-Rigobon note is withdrawn from the page.
  - **UNDERPOWERED:** stays a description.
- **EQ VALIDATED.** "Dollar-led and own-led trade the same" is banked. The dollar / own label is closed as an entry, stop or filter input for this geometry.
  - **NULL:** the difference becomes a candidate, with its own prereg on the lockbox or a forward record.
- **All four results** update the layer 3 row of WHATS_LEFT and the stage 4 note.
- **Notes found while drafting, to fix on the page; neither changes a number above.**
  - The stage 3 panel says "wrong-day dollar < 0.01". That figure is stage 2's in-sample shuffled r² (0.005). The stage 3 `wrong_day` field is the out-of-sample share with a shuffled factor, which is −0.2 to −0.6.
  - The stage 1 summary pairs "rises with vol" (share by σ third) with "correlation 0.40 → 0.52". The second is a same-day vol sort whose corrected value falls. Cells SIG and FR keep these apart.

---

## Amendments

*(none)*
