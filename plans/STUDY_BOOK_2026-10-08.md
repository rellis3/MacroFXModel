# Overnight study book — direction at C.OG's lines (7–8 Oct 2026)

**The question:** C.OG's fills sit exactly on his published volatility lines, and he says direction comes from
rates (short-term rate differentials, SOFR vs €STR, "model the residual and build a conditional directional bias").
Can we find the direction rule that turns his line entries into an edge?

**Short answer:** not with the data we hold. Every test came back the same way. The direction signals rank trades in the
right order (with > none > against), and stacked together they rank them in a clean ladder. But none is strong enough to
make a line trade pay, none predicts the day's direction, and the bond-CFD version of his rates residual has no lead at all.
The one input we have never had is the thing on his screen: **short-rate futures** (SR3 vs €STR/Euribor) intraday.

Every study below was pre-registered before it ran (forge/), scored after costs with block bootstraps, and is logged in
the Evidence Book (js/deskEvidence.js).

---

## 1. What we confirmed about his trades

| | |
|---|---|
| His fills vs his published lines (KV `vol_reference_*`, 72 days) | EURUSD 24 Sep fill 1.13600 vs his ↓median 1.13597 (0.3 pip); 11 Sep 4 pips away; NQ 9 Sep 13 pts in front of the line |
| Gold entries | on the London open (3 Sep 4383.9 vs open 4384.8; 28 Sep stop 4258.4 vs open 4260.3) |
| His σ | NOT rebuildable from price: 30-day σ correlates 0.5 (FX/gold) and 0.1 (NQ) with his published vol; level matches CME CVOL. He uses an input we can't see |

So the **locations are real**. The open question was always **direction**.

## 2. The results, in one table

| # | Theory (pre-registered) | Result | What it says |
|---|---|---|---|
| — | His two setups mechanically (fade his median line; London-open retest) | Fade −0.066R; retest −0.201R | Location alone loses after costs |
| — | 20-day trend / prior day as direction | best: fade WITH the 20-day trend −0.047R | Only consistent tilt; too small |
| — | 12 daily US spreads incl. fed funds (192 choices, walk-forward + placebo) | OOS −0.033R = no filter; beats placebo 63% | Daily spreads: noise |
| S1 | Price out of line with its rates path (bond CFDs) catches up in 4h | b −0.001 ± 0.06, well powered | **No lead**, even as a residual. Same-bar only (4th time) |
| S2 | Out of line with EVERYTHING (PCA of 17 other markets) | see §3 | |
| S3 | That rates gap as the direction at his lines | −0.058R vs −0.050R all | Adds nothing |
| S4 | Post-FOMC dollar drift (validated effect) as direction | with − against +0.105R [−0.03, +0.24] | Right way, too few events |
| S5 | US−German 2y, 63-day change (Ang & Chen) | lines +0.029R over all [−0.005, +0.063]; 5-day hold null 2000–26 | Right way, too small; the literature hold doesn't show on EURUSD |
| S6 | **Vote** of all of the above | **monotone ladder** v≥2 −0.019 … v≤−2 −0.082R | Components add up — ranking is real |
| S7 | Does the vote predict the day? / time-exit geometry | day +0.004σ (49% hit); line+time exit +0.022R (gold +0.106R) | Ranking is AT the line, not about the day |

## 3. S2 — "out of line with everything" (PCA)

First run (all 18 markets joined): b +0.35 [−0.08, +0.71], positive in both halves and 5/6 targets — but only 2,790
samples, because the Gilt CFD trades 08:00–16:45 and the join threw away 97% of bars. Logged as a power failure, and the
one allowed variant (Amendment 1) re-ran it on the 14 markets that trade ~23 h: **b −0.056 [−0.21, +0.10], n 13,512,
negative on all six targets, gap trade −0.52 bp.** The promising first number was small-sample noise. A market that has
drifted out of line with everything else does not snap back within 4 hours.

## 4. What this means

1. **Direction information exists but is thin.** Five independent sources all tilt line trades the right way, and they
   add (S6 ladder). The spread between "everything agrees" and "everything disagrees" is ~0.06–0.09R per trade. The line
   trades themselves start at about −0.05R, so the best rung only gets back to roughly flat.
2. **It is not a forecast of the day** (S7a). It is about which side of a line is the less-bad trade. That is useful as a
   veto (never take the v ≤ −2 side, the worst trade on the board), not as an entry signal.
3. **Bond CFDs are the wrong rates instrument.** 2y/10y CFDs move WITH FX/indices in the same bar and carry no lead
   (S1, plus three earlier tests). C.OG's chart is short-rate FUTURES — the front of the policy curve, which re-prices on
   data and Fed-speak before the 2y does. On his two stream days our bond gap said the opposite of his line (NQ ahead of
   rates, not behind). That is the gap between his tools and ours.
4. **His posted trades are winners selected from a discretionary process.** Six trades are consistent with "line +
   rates context", but nothing mechanical we can build from price, daily rates or bond CFDs reproduces an edge.

## 5. What would actually move this forward

1. **Get the short-rate futures** (the one untested input, and the one on his screen):
   - TradingView (paid plan) → Export chart data: CME SR3 front contract and the EU leg he uses (he said the EU ticker is
     "slightly different" on TradingView — ask him which), 15-min, as far back as it allows; or
   - IBKR: `python scratchpad/ibkr_stir_pull.py` with TWS open (15-min, ~6 months).
   Then rerun S1/S3 with SR3 − €STR as the driver: `scripts/rates_residual/study.py` takes any driver series.
2. **Wait for his "plug and play" indicator** ("I'll get some stuff together that is just plug and play"): if he shares the
   SOFR/€STR spread series or the residual, it drops into the same harness and gets the same pre-registered test.
3. **Use the vote as a veto now (no live change until you choose):** on the Daily Plan, show which side of each line the
   components agree with. Paper-track it forward; do not trade it as a signal.

## Files

- Pre-registrations: forge/COG_SETUPS_PREREG.md, COG_SPREAD_DIRECTION_PREREG.md, RATES_RESIDUAL_PREREG.md (+ Amendment 1),
  POLICY_DIRECTION_PREREG.md, DIRECTION_VOTE_PREREG.md, VOTE_DIRECTION_DAY_PREREG.md
- Results: analysis/output/cog_setups/, cog_yield_dir/, policy_direction/, rates_residual/ (RESULTS.md, COG_DAYS.md)
- Data added: OANDA M15 2018-01 → 2026-10-07 for 18 instruments (analysis/output/rates_residual/m15/), Bundesbank 2y daily,
  FRED spread series
