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

- **Ken's "Ken BASIC" system**, all of it:
  - $4.85 median-MAE stop;
  - 5R target;
  - $5 rule;
  - 22:00 roll;
  - "last price, no spread";
  - 18 levels;
  - 75-session percentile levels.

  Reviewed only, never adopted.
- **Trailing stops** (Jordan: strip them out).
- **Trading the touch without an entry rule** (F6).
- **QLIKE fitting of the HARCJ features alone** (NULL in `gold-calc-upgrades`).
- **Results without costs.**
- **The first, faulty gold-calc-upgrades numbers** (FRESH −6.9%, all-in −8.8%): lookahead, superseded.

## 8. Standing rules

- Shadow only: never edit live calcs or the live export params.
- PAID APIs: stop on failure.
- C.OG content is never republished.
- Never write to production R2 from a sandbox.
- OANDA `--price M` only.
- Run the `research-protocol` and `data-rules` skills before the study.
