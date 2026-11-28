# Gold line system: handoff (clean start)

**Written 2026-11-27, at the end of the session that built the gold shadow lines and tested the gold band fade.**
This file is the only context a new session needs. **It supersedes the chat.** If something isn't here or in the files
it links to, it isn't part of the system.

Status page (private artifact): https://claude.ai/artifact/2ECfWcGw7m5xGt2dtaNcxR

## 0. Goal and scope

- **Goal:** a rule-based gold system that trades Jordan's forecast lines and makes money after costs, out of sample.
- **Market:** gold only.
  - Primary: GC futures (NT8 1-minute, unadjusted, `ladder.load_m1("GOLD","F","unadj")`).
  - Replication: OANDA XAU_USD (`"C"`).
- **Next job:** the **target + stop study** (§6). Nothing else.

## 1. Conventions (fixed)

| | |
|---|---|
| Session | 00:00–22:00 London. The open is the first bar at or after 00:00 London. Weekends out. |
| Test window | 2020-01-01 → 2026-08-21, walk-forward by year (each year fitted on earlier years only) |
| Holdout | **Everything after 2026-08-21 is untouched.** Use it once only, at the end, for the single final rule set |
| Costs (always on) | Futures: 1 tick ($0.10) slippage on a stop-order entry, 1 tick on a stop or time exit, $0.12 commission (1 MGC). CFD: $0.40 per round trip. Results with no spread are never the headline |
| Intrabar | Pessimistic fills are primary: the adverse event comes first inside a 1-minute bar. Optimistic is shown as an upper bound |
| Units | R = (P&L − cost) / stop distance. **Public repo: R only, no dollar P&L in committed files** |
| Uncertainty | 63-session block bootstrap, B = 2000, 90% CI, BH q = 0.10 over the arms, both halves (2020–22 / 2023–26), shuffled-lines placebo |
| Verdicts | VALIDATED / NULL / UNDERPOWERED / CONTEXT only. Prereg pushed before any run (`research-protocol` skill) |

## 2. The lines

All lines are % of the session open × a walk-forward width (σ × a fitted multiplier per tier), at Med / 75p / 90p.
The code is `hits_and_gap()` in `scripts/gold-calc-upgrades/score.py`.

| Line | Price | Notes |
|---|---|---|
| Forecast HIGH (OH) | open × (1 + OH width) | sell side |
| Forecast LOW (OL) | open × (1 − OL width) | buy side |
| Close+ | open × (1 + Close+ width) | fitted on up days |
| Close− | open × (1 − Close− width) | fitted on down days |
| HL projection upper / lower | running low + HL width / running high − HL width | moves during the day; known from the previous bar |

**Two calcs**

| Calc | What it is | Where |
|---|---|---|
| **Export (live)** | Futures: HARCJ on every line. CFD: R15 on OH and Close+, HARCJ on the rest | `js/ladderV2QlikeParams.json`, `js/ladderV2QlikeCfdParams.json`. **Never edit these without the owner's OK** |
| **Shadow** | N7_ALL = HARCJ + HARQ + Asia/London/NY RV split + the pre-open hour (RV 22:00–24:00 London, floored at 0.001 × the previous day's RV) + realized range + GVZ implied vol, fitted by QLIKE | `js/ladderPreopen.js`, `js/ladderPreopenParams.json`; parity test `js/ladderPreopen.test.mjs`. Vol Forecast v3 → Export → "⬇ Pre-open ladder", built after 00:00 London |

## 3. What is established (with sources)

| # | Finding | Number | Source |
|---|---|---|---|
| F1 | Each line with its own calc beats one σ for all lines | HL −10% QLIKE; overall −2.4% (futures) | `ladder-qlike-per-line-fut` |
| F2 | The shadow calc forecasts gold better than the export | −4.26% QLIKE [−6.82, −1.91], CFD −2.64%; GVZ alone −2.81%; pre-open hour −1.16% (mostly wild Monday/Asian opens) | `gold-calc-upgrades` (corrected after lookahead fix A3) |
| F3 | The lines are calibrated | Shadow hit rates 50.6 / 23.9 / 8.5%; reach odds p50→p75 ~50%, p75→p90 ~40% | `gold-calc-upgrades`, `line-touch-reach` |
| F4 | A better forecast doesn't change MAE at the lines | MAE60 median 41.9 vs 41.4 ticks; 1R win 49.6 vs 49.4% | `mae_compare.py` (exploratory) |
| F5 | Jordan's MAE method reproduced. Winners' MAE p90 ≈ 60–80% of his stop. In 2025–26 the median adverse move hits his 75-tick (GC) cap | — | `jordan-vwap-band-tp` part E |
| F6 | Trading the touch itself (fade, follow, context, history selection, pre-touch entry) ≈ 0R before costs, the same at placebo levels | — | `level-context-engine`, `jordan-level-history-select`, `level-near-miss-entry` |
| F7 | VWAP / ±1σ VWAP band as the target, **with a first-touch fade entry**: band hit 29%, VWAP 17%, net −0.155 / −0.159R | NULL | `jordan-vwap-band-tp`, `futures-qlike-trades` |
| F8 | The pre-open hour and implied vol help some other markets (oil, silver, US index futures ~1%), not FX | UNDERPOWERED | `calc-upgrades-wide` |

## 4. The gold fade study (`gold-band-fade-stop`, banked 2026-11-27)

**Mechanism** (from the owner's ForecastBandFade.cs PDF, rebuilt; code in `scripts/gold-band-fade-stop/run.py`)
- **Lines:** forecast HIGH / LOW at 75p and 90p.
- **Poke:** price trades past the line by 10% of the stop.
- **Order:** a stop order is armed at the line. It fills when price comes back through. In the arming bar, a fill
  counts only if the bar closes back through the line.
- **Cancel:** if price runs 1.2× the stop past the line before filling.
- **Chase:** if price reaches the further line, the nearer order is cancelled and a new one armed there.
- **Other rules:** one trade at a time, each line once a day, flat at 22:00 London.
- **Exits:** stop = line ± stop distance; target = the session open.
- **Test:** `scripts/gold-band-fade-stop/test_scenarios.py` (the PDF's 4 scenarios plus a stop-out) must pass.

**Results** (futures, pessimistic fills)

| Arm | Mean net R [90% CI] | Verdict |
|---|---|---|
| A1: $7.50 stop, export lines (the PDF as written) | −0.025 [−0.097, +0.040] | NULL |
| **A2: $7.50 stop, shadow lines** | **+0.055 [−0.029, +0.112]**; both halves +; CFD +0.019; above the placebo p95 | UNDERPOWERED |
| A3: stop 0.375 × P90 distance, export lines | −0.030 | NULL |
| A4: stop 0.375 × P90 distance, shadow lines | −0.069 | NULL |

**Decomposed**
- Arm-and-retest beats a raw first-touch fade in every arm (+0.01 to +0.08R).
- The open as target is reached on only 9.5% of trades; 37% time out at 22:00.
- A $7.50 stop gets stopped out 41–47% of the time in 2020–23, 69% in 2025 and 80% in 2026.
- The σ-scaled stop cuts stop-outs to 34%, but wins shrink to about +0.9R.
- Optimistic fills barely change anything.
- Adding P50 lines makes it worse.

## 5. Decisions (keep unless a new prereg says otherwise)

| ID | Decision | Why |
|---|---|---|
| D1 | Use the shadow lines for the system | F2, and A2 was the only arm leaning positive |
| D2 | The entry is arm-then-retest with cancel and chase | It beat the raw fade in every arm |
| D3 | No fixed-dollar stops | Gold's price trebled; stop-outs went 45% → 80% |
| D4 | Lines at 75p and 90p only | P50 lines make it worse |
| D5 | Costs always on, pessimistic fills, placebo every time | §1 |
| D6 | The holdout (after 2026-08-21) is used once, at the end | §1 |

## 6. Next study: target + stop (not yet registered)

- **Entry:** fixed as D2 on the shadow lines.
- **Target candidates**, chosen in the prereg before any run:
  - the owner's fixed-σ VWAP indicator bands: ±1σ, ±0.5σ, and VWAP. Copy the exact indicator definition from
    `forge/JORDAN_VWAP_BAND_TP_PREREG.md`; don't re-derive it;
  - the same-side P50 line;
  - a time exit.
- **Stop candidates:** a fraction of the line σ, sized from winners' MAE (F5). Give 2–3 fixed fractions in the prereg.
- **Break-even at +1R:** a candidate on/off switch. Jordan, 2026-11-27, says to keep BE.
- **Open question:** this entry has only been tested on the OH/OL lines. Jordan's own lines are HL projections and
  Close±. Decide in the prereg whether they're in, as their own arms.
- **Multiplicity:** count the full grid in the prereg and apply BH over all of it. Keep the grid small.

## 7. Excluded (don't bring these in)

- **Ken BASIC:** excluded entirely.
- **Trailing stops** (Jordan: strip them out).
- **Trading the touch without an entry rule** (F6).
- **QLIKE fitting of the HARCJ features alone** (NULL in `gold-calc-upgrades`).
- **Results without costs.**
- **The first, faulty gold-calc-upgrades numbers** (FRESH −6.9%, all-in −8.8%): lookahead, superseded.

## 8. The library: where each piece is documented in full

Each study has a prereg (`forge/`), a results file (`analysis/output/<id>/RESULTS.md`) and an Evidence Book entry
(`js/deskEvidence.js`). Read a study's files only when the next job needs it.

| Piece | Study id | Prereg |
|---|---|---|
| Horse race of calcs per line (futures / CFD) | `ladder-qlike-per-line-fut`, `ladder-qlike-per-line-cfd` | `forge/LADDER_QLIKE_PER_LINE_FUT_PREREG.md`, `forge/LADDER_QLIKE_PER_LINE_CFD_PREREG.md` |
| Lines validated: reach odds | `line-touch-reach` | `forge/LINE_TOUCH_REACH_PREREG.md` |
| Shadow lines (gold calc upgrades) | `gold-calc-upgrades` | `forge/GOLD_CALC_UPGRADES_PREREG.md` |
| Shadow lines on other markets | `calc-upgrades-wide` | `forge/CALC_UPGRADES_WIDE_PREREG.md` |
| Probability of reach / turn, entering before the line (C.OG binary vs probabilistic) | `level-near-miss-entry` | `forge/LEVEL_NEAR_MISS_ENTRY_PREREG.md` |
| Context at the line (time, touch number, approach) | `level-context-engine` | `forge/LEVEL_CONTEXT_ENGINE_PREREG.md` |
| Jordan's MAE table and VWAP band targets | `jordan-vwap-band-tp` | `forge/JORDAN_VWAP_BAND_TP_PREREG.md` |
| Gold fade (arm then retest) | `gold-band-fade-stop` | `forge/GOLD_BAND_FADE_STOP_PREREG.md` |

## 9. Standing rules

- Shadow only: never edit live calcs or the live export params.
- PAID APIs: stop on failure.
- C.OG content is never republished.
- Never write to production R2 from a sandbox.
- OANDA `--price M` only.
- Run the `research-protocol` and `data-rules` skills before the study.

## 10. Audit and update, 2026-11-27 (second session)

**Audit of this file against the source results:** every number in §3–§4 matches its results file, and the A2 arm
was rebuilt from raw data to the identical figure (+0.05479R, 936 trades). Omissions that flatter the system:
- **A2's profit is concentrated in 2026:** 97 trades at +0.303R each are over half its total R. Without 2026, A2 is
  ≈ +0.026R.
- **A4 (σ-scaled stop, shadow lines) is not just NULL:** its CI [−0.113, −0.008] is entirely below 0.
- **The 9.5% target rate and the 41–80% stop-out rates in §4 are A1's,** not A2's (A2: 9.8%, similar stop-outs).
- **F5's "2025–26 median adverse move hits the 75-tick cap"** is not in `jordan-vwap-band-tp/RESULTS.md`: unverified.
- **F3's reach odds** come from `line-touch-reach` (2026-10-05, older Live Range lines), not the shadow lines.

**§6 is done: `gold-line-target-stop` (banked).**
- **Gold:** only the tightest stop (0.15 × P90 distance) is positive (12/12 cells). The best cell, VWAP + 0.5σ_v target
  with BE off, is +0.112R [+0.018, +0.185], but BH fails over 36: UNDERPOWERED. Target choice and BE matter little.
- **Other 16 futures, the same cell unchanged:** pooled −0.063R [−0.081, −0.043], 3/16 positive, the real lines below
  the shuffled lines: **NULL**. All 36 cells are negative pooled.
- **Reading:** the gold lean is gold-specific or best-of-36. The next step is only a forward / post-lockbox record of
  gold, tight stop, VWAP-band target. No more in-sample search on this entry.

## 11. Update, 2026-11-27 (late): the system as the owner describes it, and Jordan's three-way comparison

- **System = 18 shadow lines → Jordan's gold entry (arm then retest, cancel 1.2×, chase) → target VWAP ± 0.5σ_v →
  Jordan's rolling-MAE stop (3 months per line).** `gold-line-system-base`, page `gold-line-system.html`.
  - **GOLD: VALIDATED.** OOS +0.106R [+0.032, +0.160], +224R, above fake lines (96th percentile).
  - **Fragile:** the top 1% of trades carry it, and most profit is on small stops ($1.3–2.9). A tick-data or forward
    check comes before anything else.
  - The 0.15 × P90 stop: +0.040, UNDERPOWERED.
- **The mirror fails:**
  - NQ +0.153R, but fake lines make +0.115: UNDERPOWERED, the mechanism, not the lines.
  - EURUSD −0.089 net, +0.087 before costs: NULL.
  - So the line effect is gold-only. The mechanism (entry + VWAP band + MAE stop) is positive on gold and NQ.
- **Rolling-MAE windows (`gold-rolling-mae-window`, page `gold-rolling-mae.html`):**
  - 1–3 months best on all three (gold and NQ 2 months, EUR 1 month); 1 day to 1 week is noise. Matches Ken's 5–7 weeks.
  - Fill at the first touch loses everywhere. The arm-then-retest entry is what turns it positive. Ken's any-poke
    reading loses everywhere.
- **Jordan vs Ken:** Jordan is the reference; Ken is a colleague interpreting him (his lines are Ken BASIC, his target
  5R). Ken's numbers are comparison only.
- **Next:**
  1. Tick-data or forward check of the gold small-stop fills.
  2. The C.OG probabilistic arming layer (reach / turn odds, the clock) as a removable layer on this base.
  3. Dropping P50 lines (descriptive: P50 −0.03, P75 +0.36, P90 +0.26 on gold), only via a new prereg.
  4. The lockbox, last.

## 12. Correction, 2026-11-27 (night): the system trades Jordan's 8 lines, not 18

- `gold-line-system-base` used all 18 lines by mistake (carried over from the rolling-MAE window test). Per D4 and §6
  the system trades **Jordan's lines: HL projection up / down, Close+, Close−, at P75 and P90 (8 lines)**.
- **`gold-line-system-jordan` (banked): UNDERPOWERED.** OOS +0.302R [+0.111, +0.485], +226R, +104R without the best
  1% of trades; fake lines average −0.004 (real above all 100). IS 2021–22 −0.085 (the shorts lost). BE on is worse.
- **`line-system-backtest.html`** (the standard backtest page: trades, candles, % / R / $ CSVs) shows this version.
- Next: forward record, tick-data fill check, then the lockbox once.


- **2026-11-28:** continuation ideas are parked in `plans/GOLD_CONTINUATION_PARKED.md` (the owner wants the MFE-after-break analysis first, later). Focus is the fade.
