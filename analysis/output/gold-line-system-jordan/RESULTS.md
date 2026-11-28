# gold-line-system-jordan: results

Prereg `forge/GOLD_LINE_SYSTEM_JORDAN_PREREG.md` (pushed e40eb60e before the run). Script
`scripts/gold-line-system-jordan/run.py`, log `analysis/output/gold-line-system-jordan_log.txt`. Seed 20261127.

**Verdict: UNDERPOWERED.** Out of sample is strong and passes every gate except one: in sample (2021–22) is negative.

## Primary: Jordan's 8 lines (HL up / down, Close+, Close−, P75/P90), S2 rolling-MAE stop, VWAP + 0.5σ_v, BE off

| | Value | Gate |
|---|---|---|
| OOS (2023 → 2026-08-21) | **+0.302R** [+0.111, +0.485], n 749, **+226R** | CI > 0 ✓ |
| Before costs | +0.416R; PF 1.40; win 30.7%; target hit 18.4%; median stop $3.40 | |
| Without the best 1% of OOS trades | **+104R** (without the best 5%: −132R) | > 0 ✓ |
| Fake lines (100 same-year shuffles, whole pipeline) | mean −0.004, p95 +0.114; real lines above all 100 | above p95 ✓ |
| One-sided bootstrap p | 0.003 | |
| **IS (2021–22)** | **−0.085R**, n 333, −28R | **> 0 ✗** |

Control: the same code on all 18 lines reproduces `gold-line-system-base` S2 exactly (+0.1058R, n 2,119).

## By year

| 2021 | 2022 | 2023 | 2024 | 2025 | 2026 (to 21 Aug) |
|---|---|---|---|---|---|
| −0.036 (180) | −0.142 (153) | +0.391 (177) | +0.184 (223) | +0.374 (212) | +0.267 (137) |

## By line

| Line | IS avg R (n) | OOS avg R (n) |
|---|---|---|
| Close− P75 (long) | +0.418 (78) | +0.274 (185) |
| Close− P90 (long) | +0.501 (33) | +0.317 (64) |
| HL down P75 (long) | +0.132 (34) | **+0.914** (78) |
| HL down P90 (long) | −0.529 (16) | −0.048 (32) |
| Close+ P75 (short) | −0.268 (93) | +0.188 (205) |
| Close+ P90 (short) | −0.764 (27) | +0.201 (65) |
| HL up P75 (short) | −0.770 (34) | +0.437 (89) |
| HL up P90 (short) | −0.099 (18) | −0.167 (31) |
| **Longs / shorts** | **+0.281 / −0.428** | +0.392 / +0.219 |

- The 2021–22 loss is all shorts (Close+ and HL up). Longs made money in both periods. Gold went sideways in
  2021–22 and rose strongly from 2023, so a long/short split is drift-confounded and is not a rule.
- Close− (long) is positive in both periods, the opposite of the 18-line run, where it was the one losing family.

## Descriptive arms

| Arm | IS R | OOS R [90% CI] | OOS n | OOS total | Without top 1% |
|---|---|---|---|---|---|
| **8 lines, S2, BE off (primary)** | −0.085 | +0.302 [+0.111, +0.485] | 749 | +226R | +104R |
| 8 lines, S2, BE on | −0.241 | +0.224 [+0.064, +0.426] | 754 | +169R | +67R |
| 8 lines, S1 (0.15 × P90 stop) | −0.095 | +0.099 [+0.022, +0.212] | 768 | +76R | +37R |
| 12 lines (adds P50) | −0.030 | +0.111 [+0.013, +0.185] | 1,813 | +201R | −30R |
| All 18 lines (control) | +0.044 | +0.106 [+0.035, +0.158] | 2,119 | +224R | −65R |

- **Dropping P50 is what removes the dependence on the top 1%.** The 8-line set makes the same total from about a
  third of the trades.
- **Break-even makes it worse** (+0.302 → +0.224 OOS, −0.085 → −0.241 IS). Jordan says to keep BE; here it costs.

## Reading

- On 2023–26 this is the strongest version so far, and the real lines are far above fake lines, which average zero.
- But 2023–26 was partly seen when this line set was chosen (the 18-line run's tier and family splits), and 2021–22
  lost. Graded weight: a strong lead, not a validated system.
- **Next:** the clean check is the held-back data after 2026-08-21, used once at the end; a forward paper record from
  now; a tick-data check of the small-stop fills.
- The backtest page `line-system-backtest.html` now shows this version.

## A1 (POST-HOC, descriptive): entry-rule switches, and where the profit comes from

`scripts/gold-line-system-jordan/entry_rules.py`, report `entry_rules_report.txt`. The same 8 lines, target, stop and
costs; 100 shuffles of fake lines with the same permutations for all 4.

| Entry rules | IS R (n) | OOS R [90% CI] | OOS n | OOS total | Without top 1% | Fake lines (real's rank) |
|---|---|---|---|---|---|---|
| Same-candle retouch fills · chase any line (primary) | −0.085 (333) | +0.302 [+0.111, +0.485] | 749 | +226R | +104R | −0.004 (100%) |
| **Same-candle retouch ignored** · chase any line | −0.188 (260) | **+0.032** [−0.134, +0.217] | 620 | +20R | −71R | −0.135 (98%) |
| Fills · chase same line only (PDF) | −0.107 (328) | +0.293 [+0.107, +0.468] | 741 | +217R | +95R | −0.009 (100%) |
| Ignored · chase same line only (PDF) | −0.213 (253) | +0.023 [−0.132, +0.212] | 610 | +14R | −74R | −0.137 (98%) |

- **The PDF's chase (same line only) changes almost nothing.**
- **Ignoring the same-candle retouch removes nearly all the profit.** In the primary, fills in the same minute as the
  poke are 326 of 749 OOS trades at **+0.64R each (+210R)**; fills on a later minute are 423 trades at **+0.04R
  (+17R)**. In IS: same-minute +0.08, later −0.29.
- **Why this matters:** the sim fills in the poking minute only when that minute *closes* back through the line. The
  close comes after the fill, so the sim keeps the same-minute fills that had already moved its way and skips the
  ones that retouched and went back against it (those fill later or not at all). That is a favourable selection that
  M1 bars cannot avoid. With the touch ignored, the fade is about breakeven (+0.03R), though still above fake lines,
  which lose (−0.135).
- **Reading:** the 8-line edge is mostly unverified same-minute rejections. It may be real (fast rejections are what
  Jordan trades, with tick data), but it can't be confirmed on M1 bars. **The tick-data check of the retouch now
  comes first**, before any forward record or the lockbox. The primary verdict (UNDERPOWERED) stands, with weight
  lowered.
