# value-migration-nq — results

Prereg: `forge/VALUE_MIGRATION_NQ_PREREG.md` (committed in `76ae43b`, 2026-11-10; code `6f855bf`, placebo gate `64f1ac5`). Run 2026-11-10, seed 20261110, B = 2000 (500 for regression coefficients).
Branch `claude/valentini-intraday-research-zyr50t`. Ledger ids: `value-migration-nq-poc`, `value-migration-nq-va`, `value-migration-nq-delta-proxy`, `value-migration-nq-absorption-proxy`, `value-migration-nq-combo`, `value-migration-nq-strategy`.

Data: NQ continuous front month, 1-minute OHLCV (free set, sha256-pinned), RTH only, 2015-02-02 → 2025-07-24, 2,606 scored sessions (in-sample 2015–19: 1,227; out-of-sample 2020–25: 1,379). Delta and absorption are **OHLCV proxies** (tier P). Dashboard: `dashboard.html` in this folder.

## Verdict: NULL (as a trading method); CONTEXT (as a description of momentum)

No scored cell passed its registered gate. Value migration carries a small, statistically real directional lean: +0.019σ at 15 minutes [+0.010, +0.029], Holm p 0.001, above all 20 session-shift placebos, positive in both halves. That is about 0.5 NQ points per signal in 2020–25 against a round-trip cost of about 0.73 points, and it sits below the registered 0.05σ bar, which the interval rules out. Roughly half of it is reproduced by the same rule on box closes (the price twin). The increment of POC over price is +0.009σ [−0.000, +0.018], and its 0.03σ bar is ruled out. Delta confirmation (proxy) adds nothing (−0.002σ), and so does requiring VAH/VAL to migrate (−0.0005σ). Absorption and the full combination are underpowered and point nowhere. None of the 24 strategies passes. The heavily traded models lose 0.05–0.09R per trade net, against a gross near zero, and beat matched random entry by only 0.00–0.03R, while costs take about 0.1R.

| Ledger id | Question | Verdict |
|---|---|---|
| `value-migration-nq-poc` | Q1, POC migration predicts direction (5–60 min) / beyond price | **CONTEXT** (statistical, below the economic bar, mostly price momentum) |
| `value-migration-nq-va` | Q2, VAH/VAL migration adds to POC | **NULL** |
| `value-migration-nq-delta-proxy` | Q3, delta confirmation adds (OHLCV proxy) | **NULL** (proxy only) |
| `value-migration-nq-absorption-proxy` | Q4, absorption against the move adds (proxy) | **UNDERPOWERED** |
| `value-migration-nq-combo` | Q5, migration + delta + absorption beats migration alone | **UNDERPOWERED** |
| `value-migration-nq-strategy` | 24 strategies, net R beyond random entry | **NULL** (14 powered cells fail; 10 underpowered) |

## Scored cells — statistics (signed outcome, σ_h units; Holm over 10)

| Cell | n | Estimate | 95% CI | IS / OOS | MDE | Bar | Holm p | Placebo max | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|
| Q1 h5 | 24,807 | +0.0236 | [+0.012, +0.036] | −0.004 / +0.047 | 0.024 | 0.05 | 0.001 | +0.006 | fails (halves disagree, below bar) |
| Q1 h10 | 24,807 | +0.0151 | [+0.004, +0.026] | −0.005 / +0.032 | 0.023 | 0.05 | 0.051 | +0.009 | fails |
| Q1 h15 | 24,807 | +0.0193 | [+0.010, +0.029] | +0.011 / +0.026 | 0.022 | 0.05 | 0.001 | +0.006 | fails (below bar); statistical |
| Q1 h30 | 23,685 | +0.0155 | [+0.003, +0.029] | +0.009 / +0.021 | 0.028 | 0.05 | 0.150 | +0.008 | fails |
| Q1 h60 | 21,419 | +0.0161 | [−0.002, +0.034] | +0.008 / +0.023 | 0.037 | 0.05 | 0.382 | +0.013 | fails |
| Q1 beyond price (A_POC − TW_POC, h15) | 24,807 | +0.0089 | [−0.000, +0.018] | +0.009 / +0.008 | 0.019 | 0.03 | 0.368 | — | NULL |
| Q2 (A − A_POC) | 24,607 | −0.0005 | [−0.002, +0.001] | +0.001 / −0.001 | 0.003 | 0.03 | 1.0 | — | NULL |
| Q3 (B − A), delta proxy | 13,067 | −0.0016 | [−0.015, +0.011] | −0.006 / +0.002 | 0.020 | 0.03 | 1.0 | — | NULL |
| Q4 (C − A), absorption proxy | 5,512 | −0.0020 | [−0.024, +0.019] | −0.011 / +0.011 | 0.049 | 0.03 | 1.0 | — | UNDERPOWERED |
| Q5 (D − A), combination | 3,131 | −0.0034 | [−0.037, +0.029] | −0.013 / +0.009 | 0.067 | 0.03 | 1.0 | — | UNDERPOWERED |

In points: σ1 averaged 1.5–3.5 NQ points in 2015–19 and 6–12 in 2020–25. +0.019σ at 15 minutes is 0.1–0.3 points per signal before 2020 and 0.5–0.9 after. At 60 minutes, +0.016σ is 0.2–0.4 before 2020 and 0.8–1.5 after. A round trip costs 0.725 points (2 ticks slippage + $4.50).

## Scored cells — strategies (net R per trade; Holm over 24)

| Model | Entry | Exit | Trades | Win | PF | Net R [95% CI] | Gross R | Random | vs random (z) | IS / OOS | Sharpe | Power | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | pullback | 1:1 | 11,793 | 48.4% | 0.92 | −0.084 [−0.107, −0.062] | +0.019 | −0.114 | +0.030 (1.8) | −0.154 / −0.031 | −1.16 | P | NULL |
| A | pullback | 2:1 | 9,672 | 32.8% | 0.93 | −0.086 [−0.117, −0.057] | +0.011 | −0.105 | +0.019 (0.9) | −0.155 / −0.034 | −0.92 | P | NULL |
| A | pullback | trail | 7,338 | 19.9% | 0.93 | −0.078 [−0.132, −0.022] | +0.027 | −0.089 | +0.011 (0.3) | −0.136 / −0.032 | −0.57 | P | NULL |
| A | continuation | 1:1 | 5,247 | 47.6% | 0.91 | −0.083 [−0.112, −0.056] | −0.007 | −0.074 | −0.009 (−0.5) | −0.140 / −0.043 | −0.87 | P | NULL |
| A | continuation | 2:1 | 4,494 | 35.2% | 0.96 | −0.058 [−0.096, −0.018] | +0.014 | −0.065 | +0.007 (0.2) | −0.104 / −0.025 | −0.33 | U | UNDERPOWERED |
| A | continuation | trail | 4,133 | 26.7% | 0.90 | −0.090 [−0.138, −0.043] | −0.019 | −0.069 | −0.020 (−0.6) | −0.138 / −0.054 | −0.66 | U | UNDERPOWERED |
| B | pullback | 1:1 | 6,537 | 48.3% | 0.90 | −0.084 [−0.111, −0.057] | +0.011 | −0.112 | +0.028 (1.6) | −0.143 / −0.037 | −1.00 | P | NULL |
| B | pullback | 2:1 | 5,639 | 32.8% | 0.91 | −0.085 [−0.126, −0.045] | +0.014 | −0.103 | +0.018 (0.6) | −0.151 / −0.032 | −0.87 | P | NULL |
| B | pullback | trail | 4,526 | 19.3% | 0.89 | −0.080 [−0.146, −0.013] | +0.024 | −0.086 | +0.006 (0.1) | −0.119 / −0.048 | −0.67 | P | NULL |
| B | continuation | 1:1 | 3,230 | 48.3% | 0.92 | −0.067 [−0.103, −0.032] | +0.006 | −0.067 | −0.000 (0.0) | −0.143 / −0.015 | −0.63 | P | NULL |
| B | continuation | 2:1 | 2,864 | 35.9% | 0.94 | −0.054 [−0.102, −0.003] | +0.009 | −0.066 | +0.012 (0.3) | −0.116 / −0.010 | −0.40 | P | NULL |
| B | continuation | trail | 2,642 | 26.6% | 0.90 | −0.065 [−0.124, −0.004] | −0.002 | −0.060 | −0.006 (−0.1) | −0.137 / −0.013 | −0.55 | U | UNDERPOWERED |
| C | pullback | 1:1 | 2,798 | 48.6% | 0.95 | −0.085 [−0.122, −0.045] | +0.031 | −0.111 | +0.026 (0.8) | −0.154 / −0.019 | −0.31 | P | NULL |
| C | pullback | 2:1 | 2,406 | 33.1% | 0.93 | −0.090 [−0.147, −0.033] | +0.014 | −0.105 | +0.015 (0.4) | −0.170 / −0.012 | −0.45 | P | NULL |
| C | pullback | trail | 2,008 | 20.4% | 1.03 | −0.035 [−0.134, +0.065] | +0.084 | −0.104 | +0.070 (0.9) | −0.121 / +0.054 | +0.11 | U | UNDERPOWERED |
| C | continuation | 1:1 | 1,472 | 48.4% | 0.91 | −0.072 [−0.122, −0.022] | +0.002 | −0.072 | −0.000 (0.0) | −0.123 / −0.030 | −0.49 | P | NULL |
| C | continuation | 2:1 | 1,311 | 37.8% | 1.08 | +0.013 [−0.062, +0.087] | +0.080 | −0.060 | +0.073 (1.3) | −0.033 / +0.053 | +0.34 | U | UNDERPOWERED |
| C | continuation | trail | 1,199 | 27.7% | 0.98 | −0.054 [−0.138, +0.035] | +0.030 | −0.074 | +0.020 (0.3) | −0.114 / +0.000 | −0.05 | U | UNDERPOWERED |
| D | pullback | 1:1 | 1,646 | 49.3% | 0.97 | −0.068 [−0.115, −0.018] | +0.042 | −0.111 | +0.043 (1.4) | −0.132 / −0.007 | −0.15 | P | NULL |
| D | pullback | 2:1 | 1,454 | 34.3% | 0.94 | −0.052 [−0.125, +0.023] | +0.045 | −0.123 | +0.071 (1.3) | −0.100 / −0.005 | −0.29 | P | NULL |
| D | pullback | trail | 1,255 | 21.3% | 1.05 | +0.044 [−0.084, +0.174] | +0.167 | −0.086 | +0.130 (1.3) | +0.040 / +0.047 | +0.16 | U | UNDERPOWERED |
| D | continuation | 1:1 | 959 | 49.7% | 0.93 | −0.042 [−0.106, +0.023] | +0.030 | −0.074 | +0.032 (0.7) | −0.095 / −0.002 | −0.29 | U | UNDERPOWERED |
| D | continuation | 2:1 | 875 | 38.7% | 1.12 | +0.038 [−0.051, +0.129] | +0.107 | −0.053 | +0.091 (1.5) | −0.021 / +0.085 | +0.38 | U | UNDERPOWERED |
| D | continuation | trail | 804 | 28.1% | 1.08 | +0.000 [−0.107, +0.111] | +0.072 | −0.049 | +0.049 (0.6) | −0.104 / +0.087 | +0.22 | U | UNDERPOWERED |

P = powered (MDE vs random ≤ the lift needed to reach +0.05R from the control's cost-only expectancy), U = underpowered. Every powered cell's interval excludes +0.05R. Full per-cell metrics (average winner and loser in $ and R, Sortino, max drawdown in $ and R, mean/median MAE and MFE, long vs short, exits, hold time, by year, by regime, 2-tick stress) are in `results.json` → `strategies` and on the dashboard.

## Controls

- **Session-shift placebo** (states of session d+s on outcomes of session d, s = 1…20): mean −0.002 to +0.000 at 15 and 60 minutes. Real A_POC and A sit above all 20 shifts (100th percentile); B 100th; C 90–95th; D 90–95th.
- **Price twin:** the same state rule on box closes earns +0.0105σ at 15 minutes and +0.017σ at 60 minutes. At 60 minutes the twin matches POC migration (+0.016), so nothing there is specific to value.
- **Random-entry control:** 20 replays per strategy at the same minute, side and risk on random other sessions of the same half. With no information, these brackets lose 0.05–0.12R per trade net. That is the cost of trading 1:1 scalps at a structural NQ stop.
- **Synthetic controls** (`tests/test_vmig.py`): a planted drift is found (S +0.39), a random walk gives S within ±0.03 and 1:1 brackets +0.003R gross over 8 seeds. Look-ahead tests overwrite the future with garbage and require bit-identical features and entries; an injected look-ahead is caught.
- **Concentration:** Q1 at 15 minutes is positive in 10 of 11 calendar years (2025 is the exception: −0.013, partial year). The effect is larger in points after 2020 because NQ's volatility tripled, but it is similar in σ units.

## Deviations from the prereg

None. The amendments section is empty. `results.json` gained protocol fields (`id`, `verdict`, `cells`) after the run; no number changed.

## Decomposition of the null (owner's rule, 2026-10-27; descriptive)

| Part | Against its own null | Reading |
|---|---|---|
| POC migration state, 15 min | +0.019σ, beats all 20 placebos, both halves positive, Holm p 0.001 | **Reusable candidate (small):** a short-term continuation lean after an hour of one-way value migration |
| …beyond the price twin | +0.009σ [−0.000, +0.018] | Not established. In regression with the price move controlled, POC keeps +0.016 per σb at 15 min [+0.003, +0.027] but nothing at 60 min (−0.000). R² of every feature together: 0.05–0.09% |
| VAH/VAL legs | −0.0005σ | Redundant with the POC on 1-minute profiles |
| Delta (proxy) | −0.002σ; in the full regression cd_z carries a negative sign (−0.013 to −0.022) | Adds nothing; if anything, heavy one-sided volume-weighted flow fades slightly |
| Absorption (proxy) | −0.002σ; abs_net +0.005 in regression | Nothing visible on the proxy |
| Entry: pullback vs continuation | Pullback beats random by +0.01–0.03R on A/B; continuation by −0.02–+0.01R | Pullback reloads time entries slightly better than random. Not enough to pay costs |
| Exit: 1:1 vs 2:1 vs trail | Gross R +0.019 / +0.011 / +0.027 (A pullback) | Exit choice moves the gross by about ±0.01R. No exit converts the lean into net profit |
| Costs | Median structural risk is 0.6 σb (pullback) to 0.9 σb (continuation), i.e. 4–9 points before 2020 and 15–26 after. The fixed 0.725-point round trip is a median 0.07R, more on tight stops; with stop-slippage asymmetry the net drag measured against gross is ≈0.10R | **Costs are the binding constraint.** Gross results are near zero everywhere; net is negative, worst in 2015–19 when stops were 4–8 points |

## Q6 — regimes (descriptive, BH q 0.10 over 72 slices; 44 survive)

| A_POC, signed outcome | 15 min | 60 min |
|---|---|---|
| Ex-ante vol, low / mid / high tercile | +0.029 / +0.020 / +0.016 | +0.020 / +0.017 / +0.015 |
| **Ex-post** day type, consolidating / mixed / trend | −0.043 / +0.005 / **+0.090** | −0.103 / −0.012 / **+0.152** |
| **Ex-post** volatility, low / mid / high | −0.076 / −0.010 / **+0.112** | −0.110 / −0.044 / **+0.157** |

The signal behaves very differently by the session's **finished** character. It is a continuation bet, so it wins on trend days and loses on rotational days, but that label is known only after the close. The tradeable label (volatility known before the open) shows no difference: all three terciles sit at +0.015 to +0.029σ with overlapping intervals. The 44 BH survivors are almost all ex-post slices and restate this tautology. They are not candidates.

## Robustness (descriptive; `grid.json`)

- **Grid (27 points):** A_POC at 15 minutes ranges from +0.0105 to +0.0207σ across θ, K and φ, so the lean is not a parameter artefact. It also never approaches the 0.05σ bar.
- **Box size:** 5-minute boxes give −0.001 to +0.014σ, 30-minute boxes +0.003 to +0.029σ. The registered 15-minute box happens to be the best at short horizons, so the lean is fragile in its exact form.
- **Walk-forward** (best grid point on the two prior years, traded the next year, 2017–2025): it does not beat the fixed default on A or B (for example A pullback 1:1: walk-forward −0.063R, default −0.063R). On C/D continuation cells, the share of grid points positive out-of-sample is high (C continuation 2:1 27/27, D continuation 2:1 24/27), but the in-sample → out-of-sample rank correlation is negative (−0.68, −0.75). Out-of-sample winners were in-sample losers, so selection cannot find them in advance, and these are the underpowered cells. 2020–25 was kinder to every continuation rule than 2015–19.

## What OHLCV can and cannot reconstruct

On the only NQ session in the repo with per-minute buy/sell volume (2026-10-30, NT8 tick rule; the tick rule matches the exchange aggressor flag at r = 0.91 on NQ per `footprint-absorption`):

| | 1 min | 5 min | 15 min |
|---|---|---|---|
| True delta vs the bar's own return | 0.72 | 0.78 | 0.75 |
| Bulk-volume proxy vs true delta | 0.71 | 0.72 | 0.60 |
| Proxy vs true, on the part price does not explain (absorption signal) | 0.35 | 0.25 | **0.10** |

A null on Q3 and Q4 here therefore says the OHLCV shadow of delta and absorption adds nothing. It does **not** say that real aggressor delta or real absorption add nothing. Footprint-exact profiles, stacked imbalances, big prints and order-book absorption are untested.

## What this changes

- No page, bot or brief should say value migration predicts NQ direction or that the Valentini method is an edge. On free 1-minute data, after costs, it is a cost-losing continuation scalp.
- The one reusable fact: an hour of one-way POC migration is followed by about +0.02σ of continuation over 5–30 minutes, roughly half of it plain price momentum. That is too small to trade alone at NQ costs. It can serve as a conditioner input under its own prereg.
- **The open question is true order flow.** Testing Q3, Q4 and Q5 properly needs NQ trades with the aggressor flag (Databento GLBX.MDP3 `trades`; the tier-T adapter `vmig/data.py: trades_to_minutes` runs this exact pipeline on it). Under the owner's spend rule: get a free cost quote first. Given these results, the prior for a profitable outcome is low. Q4 needs about 2.5× the windows here, and the repo's banked 6E/6J aggressor nulls point the same way.
- Reopen the strategy only with a cheaper execution model (passive entries, wider structural stops so costs fall below 0.05R) **and** a fresh prereg. Do not re-cut these 24 cells.
