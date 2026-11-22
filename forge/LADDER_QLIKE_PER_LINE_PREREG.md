# ladder-qlike-per-line — the best σ model for each of HL, OH and OL on futures, chosen on QLIKE

**Pre-registered 2026-11-22, before any QLIKE-chosen per-line ladder was scored.**

| | |
|---|---|
| ID / ledger ids | `ladder-qlike-per-line` (Part A), `ladder-qlike-vs-pinball` (Part B) |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-qlike-per-line` |
| Source | Owner 2026-11-22, following Jordan (a C.OG group member, not C.OG), Discord DM 2026-11-21: "Find the best HL, OH and OL forecast. Each could end up using a different model", scored with "scores like QLIKE". Owner: "use QLIKE to track the best for volatility"; futures data; NQ, gold, EURUSD, USDJPY |
| Instruments | Futures only (NT8 M1): **NQ, GC (GOLD), 6E (EURUSD), 6J (USDJPY, inverted to USD/JPY as in the rollout)** |
| Window | Sessions 2016 → **2026-08-21** (lockbox untouched). Lines are walk-forward from 2018. Choosing needs at least one out-of-sample year, so the scored test years are **2019 → 2026-08** |
| Seed | `20261122`. B = 2000, 63-session blocks |
| Harness | Rows: NQ / GOLD / EURUSD from `analysis/output/ladder-per-line/build/<sym>/rows_F.parquet` (current harness); USDJPY from `analysis/output/ladder-v2-usdjpy/rows_F.parquet` (rollout). Lines: `ladder.walk_forward` at τ 10/25/50/75/90, every arm in `arms_for(sym)`. Scoring: `scripts/ladder-qlike-per-line/score.py` |

## 1. Question

Jordan's method: for each line type separately (HL, OH, OL), find the σ model that forecasts *that line's* size best,
judged by QLIKE, the standard loss for ranking volatility forecasts (Patton 2011: robust to the noise in the realised
proxy). Each line type may end up on a different model.

**Part A.** Does choosing a separate model per line type on its own QLIKE beat choosing one model for all three lines
on their summed QLIKE?

**Part B.** Does the QLIKE-chosen ladder beat the ladder we use now (one model chosen on pinball, `ladder-per-line` S1)
and the live estimator (A0), on QLIKE and without losing hit-rate calibration?

## 2. The KPI: QLIKE for each line

For arm a, line q ∈ {hl, oh, ol}, session d:
- realised x = q's size in % of the London-midnight open (as the ladder)
- forecast of x²: **h = c(a, q, Y) × σ_a²**, where c is the mean of x²/σ_a² over training sessions (2018 … Y−1). This
  turns each arm's daily σ into a forecast of that line's squared size, fitted walk-forward, so every arm is put on the
  line's own scale fairly
- **QLIKE = x²/h − ln(x²/h) − 1** (≥ 0, 0 is perfect), sessions with x > 0 (the same sessions for every arm)

Reported alongside: QLIKE on the τ = 50 line itself (`ladder-per-line` §3 form), and pinball.

## 3. Strategies (re-chosen each test year Y on 2018 … Y−1 only)

- **Q1, one model:** the arm with the lowest mean QLIKE summed over hl + oh + ol
- **QL, per line:** for each of hl, oh, ol, the arm with the lowest mean QLIKE on that line
- **P1 (reported, current):** the arm with the lowest summed pinball (`ladder-per-line` S1)
- **A0 (reported):** the live estimator
- The chosen arm's lines (τ 10–90 from `walk_forward`) are the ladder that strategy draws.

## 4. Part A rule

Loss C = QLIKE(hl) + QLIKE(oh) + QLIKE(ol) per session. Δ = C(QL)/C(Q1) − 1, per instrument, then the **equal-weight
mean over the four instruments**. Each bootstrap draw resamples 63-session blocks within each instrument. 90% CI.
- **VALIDATED:** CI upper < 0 overall and in both halves (2019–22, 2023–26), and QL's 30-cell regime miss (5 σ-fifths
  × hl/oh/ol × p75/p90, fifths on the live σ) ≤ Q1's + 0.5pp
- **NULL:** point Δ ≥ 0 and CI lower > −0.5%
- **UNDERPOWERED:** otherwise

## 5. Part B rule

Δ_B = C(QL)/C(P1) − 1, same bootstrap.
- **VALIDATED:** CI upper < 0 overall and in both halves, and QL's regime miss ≤ P1's + 0.5pp
- **NULL / UNDERPOWERED:** as Part A
- Reported: Δ vs A0, and every strategy's regime miss and hit rates at p50/p75/p90

## 6. Reported (no verdict)

- The **QLIKE leaderboard**: every arm's out-of-sample QLIKE per line per instrument (2019–2026-08) with its rank, and the
  per-year picks of Q1 and QL (how stable they are)
- Per line and per instrument Δ with CIs
- Graded weight for each part (Strong / Leaning / Faint / Untested-properly / Against), alongside the verdict word

## 7. Positive control (run first; nothing is scored if it fails)

**PC:** plant arm ORACLE with OH σ_O = √(A0 × OH_realised / m) (m = median OH_realised/A0, full sample) and its other
quantities' σ = A0 × 1.3. QL must pick ORACLE for oh in ≥ 7 of 8 test years on every instrument, and Δ (QL vs Q1) CI
upper < 0. ORACLE is then removed.

## 8. Multiplicity and lessons applied

Two pre-specified verdicts, each on its own rule. Lessons applied: choose on prior out-of-sample years only and report
pick stability (`ladder-mix-2020s`); equal-weight pooling across instruments with different scales (`ladder-per-line` A1);
a winner is never chosen on its test year; calibration guard so a QLIKE pick can't trade away honest hit rates.

## 9. What it changes

- **A VALIDATED:** futures ladders take per-line σ models chosen on QLIKE (shadow export first).
- **B VALIDATED:** QLIKE replaces pinball as the selection KPI for futures ladders.
- Otherwise: the leaderboard still names the QLIKE-best model per line, kept as a graded candidate.

## Amendments
