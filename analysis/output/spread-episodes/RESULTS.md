# spread-episodes — results

Prereg: `forge/SPREAD_EPISODES_PREREG.md` (committed in `00d2e680`, 2026-10-20; Amendments A1–A3 the same day, all
demote-only or implementation fixes, listed below).

- Run 2026-10-20, seed 20261020.
- 200 shifted-spread placebos and 200 constant-link draws; the price-only interval uses a 2000-draw cluster bootstrap.
- Branch `main`. Ledger ids: `spread-episodes-nq` (Case 1, NULL) and `spread-episodes-eurusd` (Case 2, NULL on follow, revert side underpowered).
- Full tables: `TABLES.md`. Machine-readable: `results_case1.json`, `results_case2.json`, `cells_case1.csv`,
  `cells_case2.csv`. Data checks: `DATA_CHECKS.md`.

The two cases are separate studies and are reported separately. Nothing is pooled.

## Verdicts

| | Case 1: SOFR Sep26 − Euribor Mar27 vs NAS100, 15 min | Case 2: US (2Y+10Y)/2 vs EURUSD, daily |
|---|---|---|
| **Ledger verdict** | **NULL** (powered) | **NULL** on follow (marginal); the revert side is underpowered |
| Q1 Episodes exist beyond chance? | **Partly.** How strongly the two move together varies far more from session to session than chance or a constant link allows (overdispersion 4.2 / 3.5 / 3.6 vs constant-link p95 2.9 / 1.8 / 3.2). But whether a coupled session is followed by another fails the registered bar in Validate (AC1 0.113 vs shifted p95 0.124). Most of the persistence is rates volatility clustering | **Partly.** Same shape at monthly scale: overdispersion 2.8 / 1.9 / 2.2 beats both nulls; persistence 0.554 / 0.237 / 0.243 misses the constant-link p95 in Validate (0.242) and Final (0.360) |
| Q2 Recognisable as they start? | **No.** Top trailing-coupling tercile vs all turns at 4 h: +0.042σ (t 0.6) in Validate; strong-link C2: +0.003σ (t 0.1) | **No.** Coupling top tercile +0.001σ, C2 −0.013σ in Validate |
| Q3 Turn → confirm → price follows? | **No.** Primary (k 0.75, 4 h): −0.008 / +0.046 / +0.008σ (t −0.5 / +1.7 / +0.3), n 1458 / 724 / 809. Final SE 0.024, so MDE 0.06σ < 0.10 bar | **No, but only just ruled out.** Primary (AVG, k 0.75, 5 d): −0.038 / −0.112 / −0.058σ (t −0.9 / −2.1 / −0.7), n 397 / 213 / 198. Final SE 0.078 (MDE 0.19σ), but the 95% interval [−0.213, +0.097] excludes the +0.10σ follow bar, so the registered rule records NULL. A −0.10σ *revert* is still inside the interval (underpowered) |
| Grid (all variants) | 864 cells per period. 0 pass Discover-BH. Selection-aware count 0 vs placebo mean 0.01 | 4320 cells per period. 0 pass Discover-BH. Count 0 vs placebo mean 0.10 |
| Over the price-only model (c) | Adding the spread direction to a price-only model changes the IC by −0.003..+0.002 at every horizon (all intervals inside ±0.01) | 1 d Final +0.053 [+0.002, +0.104], not in Validate (+0.014 [−0.04, +0.07]); every other horizon straddles 0 |
| What survives out of sample | Nothing on direction. The same-bar link (+0.14 / +0.05 / +0.23) and the session-to-session variation in it | Nothing on direction. The same-day link (−0.09 / −0.14 / −0.25: US yields up, EURUSD down) and its month-to-month variation |

## The registered gate

Each case passes Q3 only if four things hold in Final:

- the primary cell, or a grid cell that passed Discover-BH and Validate, keeps its sign with one-sided p < 0.05 and
  |mean| ≥ 0.10σ;
- it beats the matched random bars (control a);
- it beats the shifted-spread placebo p95 (control b);
- it adds over the price-only model (control c).

No cell reached the Final stage in either case, because no grid cell passed Discover-BH. The pre-named primary cells
and their mirrors fail Final on every gate:

| Case 1 final | mean | ctrl (a) | ctrl (a) diff t | placebo 5–95% |
|---|---|---|---|---|
| primary 4 h | +0.008σ | +0.017σ | −0.35 | −0.04 … +0.05 |

| Case 2 final | mean | ctrl (a) | ctrl (a) diff t | placebo 5–95% |
|---|---|---|---|---|
| primary 5 d | −0.058σ | +0.013σ | −1.01 | −0.10 … +0.11 |

The power rule decides the words:

- **Case 1 is NULL.** Its Final MDE of 0.06σ is below the 0.10σ bar, so the test could have found the effect.
- **Case 2:** the power table predicted UNDERPOWERED. The prereg's rule, "UNDERPOWERED unless the realised intervals exclude 0.10σ", applies, and the Final interval tops out at +0.097σ. So following of ≥ 0.10σ is ruled out, narrowly, and the ledger verdict is **NULL**. The opposite effect, a revert of 0.10σ, is not ruled out.

## What price does after a confirmed spread turn (descriptive, all periods)

**Case 1, at 4 h, by period (Discover / Validate / Final):**

- follow 26% / 28% / 30%;
- revert 27% / 25% / 27%;
- nothing 47% / 47% / 43%.

**The race to ±1σ_4h:**

- After a spread turn, price reaches the follow side first 47 / 45 / 50% of the time and the revert side 47 / 45 / 46%.
  The median time is 18 bars (4.5 h).
- After price's *own* confirmed turns: 49 / 49 / 50% follow-first, at 14–16 bars. Price's own turns are no worse, and
  slightly quicker.

**Case 2, at 5 d:**

- follow 31 / 28 / 27%, revert 32 / 35 / 30%;
- race: follow first 47 / 41 / 45%, revert first 46 / 48 / 46%, median 6 days.

Every episode type, in every period, is in `TABLES.md`:

- **Case 1:** 9 types × 4 horizons. No type keeps its sign across all three periods at |t| > 2.
- **Case 2:** 9 types × 5 horizons, the same.

## Controls

**(a) Matched random bars** (same period, hour or weekday, and volatility tercile; direction is what the spread said
at that moment). The control means sit near 0, e.g. Case 1 primary +0.001 / +0.046 / +0.017σ. Real minus control is
never significant on the primary cells.

**(b) Shifted spread** (200 draws, whole sessions or rows). The placebo cell means centre on 0, and their 5–95% bands
are printed per cell. Both selection-aware survivor counts are 0.

**(c) Price only.**

- In Case 1, price follows its own confirmed turn a little: +0.06 to +0.09σ at 1–4 h, t up to 2.3. That is momentum
  that needs no spread.
- The price-only model's IC at spread-turn times is negative (−0.06 to −0.24). Price tends to give back the move it
  made between the spread's turn and its confirmation. The spread adds nothing to that.

**E1 nulls.** Overdispersion and persistence are tested against the shifted spread and the constant-link null
(Amendment A1). The constant-link null alone produces persistence of 0.35 (Case 1 Discover) and 0.45 (Case 1 Final).
Without it, "episodes persist" would have been claimed wrongly.

**Positive control.** The same-bar link is present in both cases (table above), so the pipeline sees real
relationships.

**Entry one bar later** (Case 1 sensitivity): −0.024 / +0.060 / +0.009σ. Nothing changes.

## Deviations from the prereg

- **A1 (POST-HOC, demote-only):** a constant-link null for E1. It demoted the persistence half of Q1 in Validate.
- **A2 (implementation fix):** Case 1 trailing windows now count sessions, not calendar days, as registered.
- **A3 (implementation fix):** pandas-3 microsecond timestamps had emptied the Case 1 release tag.
- **Disclosed:** a 2-draw smoke run on the A1/A2/A3-unfixed code was seen before the final run. Nothing in the grid,
  gates or periods changed after it.
- **Disclosed:** every period here has been used by earlier studies on these series under other rules, so "Final" is
  final for these rules only (prereg §2).

## Exploratory only (not validated; registered nowhere; each needs the data stated)

**Case 1, prior leg aligned, in the 2026 period only.**

- What it shows: in Final, turns where price had followed the spread's previous leg went on to follow by +0.12σ at
  1 h (t 2.8) and +0.08σ at 24 h (t 3.3).
- What argues against it: the top coupling tercile is also positive only in Final (+0.14σ at 1 h, t 2.7). Discover
  (−0.00..−0.04) and Validate (+0.04) don't show either. The 2026 same-bar link was ~5× stronger than in 2025
  (+0.23 vs +0.05).
- Reading: if real, it's a regime effect, "the follow works only while the link is strong".
- **Data needed:** the forward record of tagged turns (live monitor, from 2026-10-20). Judge at ≥ 300 scored turns
  (~3 months at ~5 a day) on the two pre-named cells (prior_aligned 1 h and 24 h), and only while the trailing
  20-session link is above its median.

**Case 2, price reverts after confirmed yield turns, most near top-tier releases.**

- What it shows: the primary cell is negative in all three periods (−0.04 / −0.11 / −0.06σ). Turns with an FOMC, NFP
  or CPI in the next five days are more negative: −0.10 / −0.24 / −0.10σ at 5 d (Validate t −2.9). This is the same
  sign as `cog-dynamic-lead`'s post-hoc "fade" note.
- **Data needed:** more independent turns. Options are intraday yields (ZN/ZT futures 1-min from IBKR, or OANDA
  USB02Y/USB10Y bond CFDs) to time the turn against the release, and the same rule on other USD pairs as one
  date-clustered family. Daily data alone would need ~25 more years to reach an MDE of 0.10σ.

**Case 2, 1-day IC gain over price-only in Final only** (+0.053 [+0.002, +0.104]). It doesn't replicate in Validate.
**Data needed:** the forward record.

## What this changes

- **The live page (`spread-episodes.html`) and job (`spreadEpisodes`)** show the confirmed turns, the pending
  confirmation level, the trailing link and coupling tercile, and each turn's realised outcome. They say it is
  **context, not a signal**.
- **Telegram (tgMaster.spreadEpisodes):** Case 1 only on the full sequence (price already moving + strong link + top
  coupling tercile); Case 2 on each confirmed turn. Each alert carries the measured base rates above.
- **The forward record (KV `spread_episodes_v1`)** is the only clean test left, judged at the registered counts.
- **Reopen** only on the forward record or with the intraday-yield data above. No new rates→price direction test on
  the 2024–2026 or 1999–2026 history.
- **Live caveat:** SR3U6 is inside its reference quarter from 16 Sep 2026, so its rate is partly fixed and the live
  spread moves mostly with the Euribor leg. The cog-chart legs config rolls on 15 Dec.
