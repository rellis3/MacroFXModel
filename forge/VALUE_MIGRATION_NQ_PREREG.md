# value-migration-nq — Does volume-profile value migration predict NQ intraday direction beyond price, and do delta and absorption add to it, as a tradeable rule after costs?

**Pre-registered 2026-11-10, before any outcome was computed.**

| | |
|---|---|
| ID / ledger ids | `value-migration-nq-poc` (Q1), `value-migration-nq-va` (Q2), `value-migration-nq-delta-proxy` (Q3), `value-migration-nq-absorption-proxy` (Q4), `value-migration-nq-combo` (Q5), `value-migration-nq-strategy` (24 strategy cells) |
| Branch | `claude/valentini-intraday-research-zyr50t` |
| Register row | `plans/RESEARCH_REGISTER.md` → `value-migration-nq` |
| Data | NQ front-month continuous futures, 1-minute OHLCV (free HuggingFace set `mdelcristo/NQ-F_1min_OHLCV_Parquet`, MIT, sha256 per file in `scripts/value-migration-nq/data_manifest.json`). RTH 09:30–15:59 New York. Window **2015-01-02 → 2025-07-24** (the file ends there; nothing after the 2026-08-21 lockbox is touched). 2,626 sessions kept, 2,606 scored after a 20-session warm-up |
| Seed | `20261110` (one for every script in this study) |
| Uncertainty | circular moving-block bootstrap over sessions, block 20, B = 2000 (500 for regression coefficients) |
| Scripts / outputs | `scripts/value-migration-nq/` → `analysis/output/value-migration-nq/` |
| Harness | own Python module (`vmig/`): the question needs minute-level volume profiles and an event-driven bracket engine that the JS harnesses do not have |

## 1. The claim (required)

Source: Fabio Valentini, professional NASDAQ futures trader (as relayed by the owner, 2026-11-10). Three parts:

- **Value migration.** On volume profiles of successive candles ("boxes"), when the POC, VAH and VAL progressively migrate higher, buyers control the auction; lower, sellers; stationary value is balance and is not traded.
- **Delta, aggression and absorption.** Strong delta with price progress confirms control; strong delta without progress is absorption by the other side. During a bullish auction, selling aggression that fails to push price lower (absorbed selling) supports longs.
- **Directional persistence.** Once value migration and order flow agree, trade repeatedly in that direction: many small 1:1 scalps (re-entering on pullbacks to POC/VAL or on continuation), or one position trailed under successive bullish boxes after moving to break-even after two qualifying boxes.

The owner's framing: "The objective is to discover whether there is a genuine, repeatable microstructure edge here, not to reproduce the trader's claims."

## 2. Why it is not already settled (required)

Nearest Evidence Book entries:

- `orderflow-lead` (NULL, powered, NQ tick-rule imbalance does not lead 5/15 min), `orderflow-lead-aggressor` (NULL, 6E/6J true aggressor) — **flow alone**. This study asks whether **value migration** leads, and whether flow adds **conditional on** a migrating auction. Different conditioning, different question.
- `footprint-absorption` (NULL, 6E/6J; candidate A60 delta divergence +0.09) and `delta-at-line` — absorption on single bars or at forecast lines, not inside a migrating auction.
- `failed-auction-volume` (UNDERPOWERED) — a balance-edge reversal pattern, the opposite of this continuation thesis.
- `live-range-confluence-book` (NULL) — POC / value area as confluence at forecast lines, not as a direction state.

No entry tests POC/VAH/VAL migration as a direction signal, its increment over plain price momentum, or the scalping/trailing management. Not a re-run.

## 3. Definitions, fixed in advance (required)

Code is the definition where the two differ in wording; it is committed (`6f855bf`, placebo gate `64f1ac5`) before this prereg.

**3.1 Data and sessions.** UTC bar-start stamps converted to New York. RTH minutes m = 0 (09:30) … 389 (15:59). Sessions with < 385 RTH minutes are dropped (95 sessions: half days, holiday stubs, the 2025-06-20 contract-switch stub). A missing minute inside a kept session becomes a zero-volume bar at the previous close (forward fill only; 0 occurred). Tick 0.25, $20 per point. Overnight data is never used, so the unadjusted roll gaps (at the Globex open) never enter a feature or outcome.

**3.2 Scales (previous 20 sessions only).** σ1 = RMS of within-session 1-minute close changes; σb = RMS of within-session 15-minute box close-to-close changes; per-box-index median volume and median range; σdr = RMS of box delta ratio.

**3.3 Boxes and profile.** B = 15-minute boxes aligned to 09:30 (k = 0…25). Tier P profile: each minute's volume spread evenly over every tick from its low to its high. POC = tick with most volume (tie → nearest box VWAP, then lower). Value area = 70% of box volume built one tick at a time from the POC, adding the larger neighbour (tie → above). VAH/VAL = its top/bottom. A box is known at the close of its last minute.

**3.4 Features at the close of box k (window = boxes k−K … k, K = 4).**
- Migration: mig_X = (X_k − X_{k−K}) / σb for X ∈ {POC, VAH, VAL}; steps: a transition counts +1 if X moved ≥ +0.10 σb, −1 if ≤ −0.10 σb; cons_X = sum over the K transitions.
- Price move already made: R_K = (C_k − C_{k−K}) / σb.
- Delta (tier P proxy, bulk volume classification): per minute δ = V·(2Φ(Δp/σ1) − 1), Δp = close − previous close (close − open at 09:30). Window delta ratio cd = Σδ / ΣV over boxes k−K+1…k; cd_z = cd / σdr. Delta acceleration = (dr_k − dr_{k−1}) / σdr.
- Absorption against the move (per box j in boxes k−K+1…k). **Bullish (selling absorbed)** if either (a) divergence: dr_j/σdr ≤ −0.25 and C_j ≥ O_j, or (b) effort-vs-result: V_j ≥ median V for that box index and (range_j/median range)/(V_j/median V) ≤ 0.7, with close location (C−L)/(H−L) ≥ 0.5. **Bearish (buying absorbed)**: (a) dr_j/σdr ≥ +0.25 and C_j ≤ O_j, or (b) the same effort test with close location < 0.5. ab_bull / ab_bear = counts in the window. (Thresholds chosen from feature frequencies only, before any outcome: the first draft fired in 1% of windows.)

**3.5 States (θ = 0.5, φ = 0.5).** need = ceil(K/2) = 2.
- **A_POC** (Q1): +1 if mig_POC ≥ θ and cons_POC ≥ need; −1 mirror; else 0 (balanced).
- **A** (Model A, value migration): A_POC and VAH and VAL both migrated ≥ 1 tick the same way over the window.
- **B**: A and cd_z ≥ φ (≤ −φ for shorts). **C**: A and ≥ 1 absorption box against the move (ab_bull for longs). **D**: A and both.
- **Price twins** (the control for "predictive or just price"): TW_POC = the A_POC rule on box closes; TW_A = closes for POC, highs for VAH, lows for VAL.

**3.6 Outcomes (statistics).** Decision at the close of box k; reference price = OPEN of the next minute e = (k+1)·15. y_h = (close[e+h−1] − open[e]) / (σ1·√h), h ∈ {5, 10, 15, 30, 60}. Windows past 15:59 are dropped (counted). Signed outcome = sign(state)·y_h; S = its mean over non-zero states. Consecutive boxes in the same state overlap; the session-block bootstrap carries that dependence (no thinning).

**3.7 Backtest (strategies).** Models A, B, C, D × entries {pullback, continuation} × exits {1R, 2R, trail} = 24 cells, default parameters, one position per cell at a time, re-entry allowed after exit, no new entry after 15:30, flat at the 15:55 open.
- Continuation: at the first minute after box k closes, state +1, box k closed above its POC and POC_k > POC_{k−1}. Stop ref = min(L_k, VAL_k).
- Pullback: state +1 from the last completed box k; after box k, a minute trading down to POC_k arms; a close below VAL_k disarms; an armed setup triggers on a minute closing above its open, with positive delta, back above POC_k. Stop ref = min(lowest low since arming, VAL_k).
- Entry at the next minute's open. Stop = ref − 2 ticks; risk floor 0.25 σb (stop widened), cap 1.5 σb (signal skipped, counted). Shorts mirror.
- Exits: fixed target 1R / 2R (limit, fills only on a print 1 tick through); trail: boxes completed entirely after entry with POC above the previous POC and close above open (long) count; after 2 the stop moves to entry, after each further one it trails to that box's low − 2 ticks.
- Fills: stop and target in the same minute → stop. Gap through stop → the minute's open.
- **Costs (net):** 1 tick slippage per market fill (entry, stop, time exit), USD 4.50 commission + exchange + NFA per round turn; **stress:** 2 ticks. **Gross:** no slippage, no commission, targets on touch.
- Known engine bias (found on synthetic random walks before registering): stop fills assume no overshoot inside the minute, which flatters trailing exits by ~0.03–0.05R on a coarse synthetic path. It is the same for the random-entry control, which is why the gate is relative to that control.

**3.8 Controls.**
- **Price twin** (above) for every statistics question about migration.
- **Session-shift placebo:** states of session d+s on outcomes of session d, s = 1…20.
- **Matched random-entry control** per strategy: each real trade replayed on a random other session of the same half at the same minute, side and risk (σb units), same exit and costs; 20 replicates.
- Long and short reported separately (states are long-heavy, 14.6k vs 11.3k windows, and intraday RTH drift is not zero).

**3.9 Sample split.** In-sample 2015-02-02 → 2019-12-31 (1,227 scored sessions after the 20-session warm-up); out-of-sample 2020-01-02 → 2025-07-24 (1,379 sessions). No parameter is fitted on either half: defaults (B 15, K 4, θ 0.5, φ 0.5, absorption thresholds above) are fixed here. The split is a stability gate.

**3.10 Descriptive layers (no pass/fail weight).** Regressions of y_h on mig_POC, R_K and all features (h = 5, 15, 60). Regimes (Q6): ex-ante volatility tercile (previous-20-session range against its own expanding history) and ex-post day type (efficiency |C−O|/(H−L) terciles: trend / mixed / consolidating) and ex-post volatility (range vs previous 20 sessions, terciles). Ex-post labels are hindsight and cannot be traded. Parameter grid θ {0.25, 0.5, 1} × K {2, 4, 6} × φ {0.25, 0.5, 1} (27 points), walk-forward (each test year 2017–2025 uses the grid point with the best net R over the two prior years), box size B {5, 15, 30}.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| Q1 | Does A_POC predict signed direction at h = 5, 10, 15, 30, 60? | **Null or tiny.** NQ intraday returns are close to unpredictable at these horizons and banked flow nulls point the same way |
| Q1-beyond | Does A_POC beat its price twin (TW_POC) at h = 15? | **No.** A 15-minute POC from 1-minute bars moves with price (corr mig_POC vs R_K = 0.90 on the count pass) |
| Q2 | Does requiring VAH and VAL to migrate too (A) beat A_POC? | **No** (A is 99% of A_POC windows) |
| Q3 | Does delta confirmation (B) beat A? | **No on tier P**: the proxy is built from price |
| Q4 | Does absorption against the move (C) beat A? | **No / underpowered** |
| Q5 | Does D beat A? | **Underpowered** |
| Strategy | Does any of the 24 cells earn net R after costs, beyond random entry? | **No.** Control trades lose ~0.05–0.13R to costs |
| Q6 | Different by regime? | Descriptive; expect larger magnitudes in high-vol / trend days with no sign change |
| **THE GATE (statistics)** | A cell passes if: Holm-adjusted p ≤ 0.05 over the 10 scored cells; estimate ≥ its bar (Q1 raw 0.05 σ_h; every difference cell 0.03 σ_h); bootstrap CI lower bound > 0; same sign in IS, OOS and full; and for raw Q1 cells, above all 20 session-shift placebos (G1) | |
| **THE GATE (strategy)** | A cell passes if: net expectancy ≥ +0.05R; CI lower > 0; Holm p ≤ 0.05 over 24; IS > 0 and OOS > 0; and real minus random-entry control has z ≥ 1.96 | |
| **THE MIRROR** | Migration predicting **reversal**: the same gates with the sign flipped (≤ −bar, CI upper < 0, below all placebos). Reported as CONTEXT, not as a tradeable fade | |

## 5. Power — what this design can and cannot find (required)

From the control run only (`run_study.py --mode power`: states of session d+1 on session d's outcomes; `analysis/output/value-migration-nq/power.json`). MDE = SE × (z_{1−0.05/(2·m)} + z_{0.8}), worst-case Holm (m = 10 statistics cells, 24 strategy cells).

| Cell | n (windows / trades) | SE (control) | MDE | Pass bar | Verdict |
|---|---|---|---|---|---|
| Q1 h5 | 24,807 | 0.0065 | 0.024 | 0.05 | POWERED |
| Q1 h10 | 24,807 | 0.0064 | 0.023 | 0.05 | POWERED |
| Q1 h15 | 24,807 | 0.0060 | 0.022 | 0.05 | POWERED |
| Q1 h30 | 23,685 | 0.0076 | 0.028 | 0.05 | POWERED |
| Q1 h60 | 21,419 | 0.0101 | 0.037 | 0.05 | POWERED |
| Q1-beyond-price (A_POC − TW_POC, h15) | 24,807 | 0.0051 | 0.019 | 0.03 | POWERED |
| Q2 (A − A_POC) | 24,607 | 0.0007 | 0.003 | 0.03 | POWERED (trivially: near-identical sets) |
| Q3 (B − A) | 13,067 | 0.0056 | 0.020 | 0.03 | POWERED |
| Q4 (C − A) | 5,512 | 0.0133 | 0.049 | 0.03 | **UNDERPOWERED** |
| Q5 (D − A) | 3,131 | 0.0184 | 0.067 | 0.03 | **UNDERPOWERED** |

Strategy cells. The no-information baseline is not zero but the control's net expectancy (≈ −0.1R: costs). A cell is POWERED if the MDE of (real − random control) ≤ the lift needed to reach the bar, i.e. bar − control expectancy.

| Cell | trades (control) | control net R | SE | MDE vs random | lift needed | Verdict |
|---|---|---|---|---|---|---|
| A pull 1R | 12,174 | −0.097 | 0.0106 | 0.043 | 0.147 | POWERED |
| A pull 2R | 10,161 | −0.096 | 0.0154 | 0.062 | 0.146 | POWERED |
| A pull trail | 8,274 | −0.079 | 0.0301 | 0.121 | 0.129 | POWERED |
| A cont 1R | 3,645 | −0.078 | 0.0175 | 0.070 | 0.128 | POWERED |
| A cont 2R | 3,263 | −0.049 | 0.0254 | 0.102 | 0.099 | UNDERPOWERED |
| A cont trail | 3,174 | −0.051 | 0.0322 | 0.129 | 0.101 | UNDERPOWERED |
| B pull 1R | 6,750 | −0.107 | 0.0132 | 0.053 | 0.157 | POWERED |
| B pull 2R | 5,871 | −0.121 | 0.0183 | 0.073 | 0.171 | POWERED |
| B pull trail | 5,099 | −0.100 | 0.0344 | 0.138 | 0.150 | POWERED |
| B cont 1R | 1,974 | −0.106 | 0.0225 | 0.090 | 0.156 | POWERED |
| B cont 2R | 1,847 | −0.093 | 0.0305 | 0.122 | 0.143 | POWERED |
| B cont trail | 1,794 | −0.106 | 0.0421 | 0.169 | 0.156 | UNDERPOWERED |
| C pull 1R | 2,741 | −0.094 | 0.0211 | 0.085 | 0.144 | POWERED |
| C pull 2R | 2,395 | −0.098 | 0.0299 | 0.120 | 0.148 | POWERED |
| C pull trail | 2,161 | −0.052 | 0.0557 | 0.224 | 0.102 | UNDERPOWERED |
| C cont 1R | 862 | −0.098 | 0.0349 | 0.140 | 0.148 | POWERED |
| C cont 2R | 798 | −0.037 | 0.0501 | 0.201 | 0.087 | UNDERPOWERED |
| C cont trail | 780 | −0.060 | 0.0584 | 0.235 | 0.110 | UNDERPOWERED |
| D pull 1R | 1,609 | −0.103 | 0.0254 | 0.102 | 0.153 | POWERED |
| D pull 2R | 1,444 | −0.101 | 0.0360 | 0.145 | 0.151 | POWERED |
| D pull trail | 1,334 | −0.057 | 0.0744 | 0.299 | 0.107 | UNDERPOWERED |
| D cont 1R | 501 | −0.116 | 0.0416 | 0.167 | 0.166 | UNDERPOWERED |
| D cont 2R | 479 | −0.091 | 0.0597 | 0.240 | 0.141 | UNDERPOWERED |
| D cont trail | 472 | −0.128 | 0.0714 | 0.287 | 0.178 | UNDERPOWERED |

Positive and null controls on the exact pipeline (`tests/test_vmig.py`, synthetic sessions): planted persistent drift → A_POC S = +0.39 and trend strategies +0.2 to +2.6R gross; pure random walk → S within ±0.03 and 1R brackets +0.003R gross over 8 seeds. Look-ahead tests overwrite all minutes after a cutoff with garbage and require every earlier feature and entry to be bit-identical; a deliberately injected look-ahead (scales without the one-session lag) is caught.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells, statistics family (10):** Q1 h5/h10/h15/h30/h60, Q1-beyond-price, Q2, Q3, Q4, Q5. Holm α = 0.05 (bootstrap SE → normal p, `pFromCI`-style), plus the conjunctive halves and placebo conditions.
- **Scored cells, strategy family (24):** Holm α = 0.05 plus the conjunctive halves and random-control conditions.
- **Disaggregation (BH q = 0.10):** regime slices of S for A_POC, A, B, D at h 15/60 across the three regime labels. A survivor is a candidate for its own prereg, never a result.
- Grid, walk-forward, box size, regressions, long/short, by-year, gross/stress: descriptive.
- Promotion to anything live: |t| ≥ 3 on the scored cell **and** true-aggressor replication (section 7).

## 7. What this does NOT test (required)

- **True order flow.** Tier P delta is a function of price (bulk volume classification). On the one NQ day with per-minute buy/sell volume in the repo (2026-10-30, tick rule), true delta correlates 0.72–0.78 with the bar's own return; at 15-minute boxes the proxy recovers r = 0.10 of the part of true delta that price does not explain (`data_quality.json`). So Q3/Q4 here test **price-derived proxies**. A null on Q3/Q4 does **not** show that real delta or real absorption add nothing; it shows the OHLCV shadow of them adds nothing. Stacked imbalances, large prints, market-by-order and resting-liquidity absorption are not tested at all. The tier-T adapter (`vmig/data.py: trades_to_minutes`) runs the same pipeline on Databento trades with the aggressor flag.
- **A footprint-exact profile.** POC/VAH/VAL from 1-minute bars assume volume spread evenly over each minute's range.
- **Discretion.** The trader's context reading, news avoidance, and sizing are not modelled.
- **Causation, capacity, live execution quality.** Fill model is bar-based.
- **Overnight/ETH sessions, ES or other markets.**

## 8. What each verdict changes (required)

- **Pass (any Q1 cell and Q1-beyond-price):** value migration carries information beyond price → buy NQ true-aggressor history for the tier-T replication (the owner's spend rule: quote first) and pre-register it on that data.
- **Q1 passes but Q1-beyond-price fails:** CONTEXT — migration describes the price move already made; nothing for a page beyond "value follows price".
- **Null:** ledger entries; no page, brief or bot says value migration predicts direction.
- **Strategy pass:** research-only until |t| ≥ 3 and tier-T replication; never live from this tier alone.
- **Underpowered (Q4, Q5, weak strategy cells):** testable only with more sessions or the true-aggressor data; recorded as UNDERPOWERED, never null.

---

## Amendments

*(none yet)*

---

## RESULTS — run <date>

*Written to `analysis/output/value-migration-nq/RESULTS.md`. Nothing above changes after the run.*
