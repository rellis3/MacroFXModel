# Milestone 5 — Does the way price arrives at a forecast level change what it does next?

- **Prereg:** `forge/DAY_RECON_APPROACH_PATH_PREREG.md`, pushed in `ba39a08d` with stage 1 (path measures and frozen
  terciles, no outcomes) **before** any outcome was computed.
- **Scripts:** `scripts/day-reconstruction/m5_features.py` (stage 1) and `m5_analysis.py` (stage 2).
- **Numbers:** `results.json`. **Run log:** `run.log`.
- **Data:** the archive and milestone-3 outputs only. No forecast change, no indicator, lockbox untouched.

## Verdict

**Forecast-specific path information: UNDERPOWERED** (pre-registered rule).
- None of the 12 forecast-minus-placebo differences (Δ) is significant.
- One meets the null bar: its interval is inside ±5pp.
- Eleven have intervals reaching past ±5pp, so they can't be called null.
- The point estimates are small and centred on zero: −2.8 to +5.0pp.

**Path effect at the forecast levels: PRESENT in 5 of 12 cells, all of it market-wide.**
- The same effect appears at the placebo lines, so it describes how price moves, not information in the forecast's
  levels.
- It changes **how much** happens after the touch, not **which way**.

**Economic hurdle: not reached.** It applies only to forecast-specific cells, and there are none. No trading
experiment follows.

## 1. What was measured

- **Path measures**, from minutes before the touch only:
  - **P1, approach time:** minutes since price was last at the previous reference (the open for p50, the inner rung
    for p75 and p90).
  - **P2, approach pullback:** the largest move back against the touch direction during that leg, in σ.
- **Terciles** within instrument × family × rung × hour bucket, fixed before outcomes.
- **Outcome `cont_first`:** the next level is traded through before the previous one, by 22:00 London.
- **D:** top-minus-bottom tercile difference, holding rung, hour and range used fixed (rung × hour fixed effects,
  range used and its square).
- **D_pl:** the same at the curvature-corrected placebo lines (×0.70, ×0.85, ×1.15, ×1.30).
- **Δ = D_fc − D_pl.**
- **Bootstrap:** one weight per calendar date shared by every touch on that date (forecast and placebo together),
  B = 2000.
- **Sample:** 12,304 touches on 1,537 dates in the point-in-time era (2020-08-21 → 2026-08-20); 74 excluded (next
  rung reached in the touch minute). Replication: 8,711 touches, 2016 → 2020-08-20.

## 2. Primary results (point-in-time era, `cont_first`, percentage points)

| Instrument | Family | Measure | D at forecast levels | D at placebo lines | **Δ (forecast − placebo)** | Δ class | D class | 2016–20: D / Δ |
|---|---|---|---|---|---|---|---|---|
| GOLD | Fixed OH/OL | P1 time | −3.9 [−8.6, +0.8] | −4.6 [−8.8, −0.5] | **+0.7 [−3.5, +4.8]** | NULL | underpowered | −1.2 / +1.9 |
| GOLD | Fixed OH/OL | P2 pullback | −0.4 [−5.0, +3.9] | +1.5 [−3.1, +5.5] | **−1.9 [−6.4, +3.0]** | underpowered | underpowered | −3.3 / −3.8 |
| GOLD | Projected H/L | P1 time | −0.3 [−5.7, +5.0] | −5.3 [−10.5, +0.1] | **+5.0 [−1.6, +11.3]** | underpowered | underpowered | +1.3 / −1.2 |
| GOLD | Projected H/L | P2 pullback | +7.2 [+1.7, +12.6] | +4.7 [−0.9, +10.3] | **+2.5 [−4.3, +9.6]** | underpowered | **present** | +6.2 / +1.6 |
| NQ | Fixed OH/OL | P1 time | −4.1 [−8.8, +0.5] | −7.1 [−11.5, −2.4] | **+3.0 [−1.4, +7.1]** | underpowered | underpowered | −5.0 / +1.1 |
| NQ | Fixed OH/OL | P2 pullback | +0.1 [−4.3, +4.5] | −3.9 [−8.0, +0.3] | **+4.0 [−0.8, +8.5]** | underpowered | null | −2.1 / −2.0 |
| NQ | Projected H/L | P1 time | −5.6 [−11.6, −0.1] | −3.5 [−9.2, +2.1] | **−2.1 [−8.0, +3.4]** | underpowered | **present** | −0.4 / −2.7 |
| NQ | Projected H/L | P2 pullback | +0.4 [−5.4, +5.9] | +2.7 [−3.1, +8.7] | **−2.4 [−10.1, +4.8]** | underpowered | underpowered | +9.8 / +1.1 |
| EURUSD | Fixed OH/OL | P1 time | −11.6 [−16.2, −6.9] | −9.9 [−14.2, −5.7] | **−1.7 [−5.9, +2.8]** | underpowered | **present** | −14.4 / −0.7 |
| EURUSD | Fixed OH/OL | P2 pullback | −6.2 [−11.1, −1.4] | −4.6 [−9.1, −0.4] | **−1.6 [−6.3, +3.2]** | underpowered | **present** | −7.8 / +1.1 |
| EURUSD | Projected H/L | P1 time | −9.8 [−16.1, −4.1] | −7.1 [−12.9, −1.1] | **−2.8 [−9.1, +3.5]** | underpowered | **present** | −8.4 / −0.9 |
| EURUSD | Projected H/L | P2 pullback | +2.4 [−3.8, +8.0] | −2.1 [−8.1, +4.1] | **+4.5 [−2.9, +11.5]** | underpowered | underpowered | −1.1 / −3.3 |

Positive D means the top tercile (slow arrival, or deep pullback) continues first more often than the bottom
tercile. Brackets are 95% intervals.

**Pooled across the three instruments** (secondary; instrument × rung × hour fixed effects): Δ for `cont_first` is
- Fixed: +0.6 [−1.9, +3.2] (P1) and +0.1 [−2.7, +3.0] (P2);
- Projected: +0.3 [−3.4, +3.6] (P1) and +1.6 [−2.6, +5.8] (P2).

Pooled, the forecast-specific part is pinned to within about ±3–6pp of zero.

## 3. What the path does (market-wide, the same at placebo lines)

**Slow arrivals resolve less, in both directions.** Where P1 lowers continuation-first, it lowers revert-first too:

| | continuation-first, D | revert-first, D | open revisited, D |
|---|---|---|---|
| Fixed, P1 (GOLD / NQ / EURUSD) | −3.9 / −4.1 / −11.6 | −7.9 / −10.1 / −8.1 | −7.7 / −10.6 / −10.0 |
| Projected, P1 | −0.3 / −5.6 / −9.8 | −27.7 / −25.0 / −21.4 | −28.4 / −30.0 / −25.9 |

- A slow approach is followed by fewer touches reaching **either** neighbouring level by 22:00.
- At projected levels, it is followed by far fewer returns to the open (−20 to −30pp). A slow grind has taken price a
  long way, for a long time, from where it started.
- In none of these secondary outcomes is the forecast-minus-placebo Δ significant.

**One cell leans in a direction:** GOLD Projected P2. A choppy approach gives +7.2pp continuation-first and −22pp
revert-first, and replicates in 2016–20 (+6.2pp). It is equally present at the placebo lines (D_pl +4.7, Δ +2.5
[−4.3, +9.6]), so it is a property of how projected lines are built from the running extreme, not of the forecast.

**Sensitivities:**
- 6 of 144 splits (tagged days, side, rung, year) have a Δ interval excluding zero, against ~7 expected by chance.
  Signs are mixed: 3 of the 6 are single years, 1 is the p90 rung alone, and 2 are one side only.
- NQ Projected P1 counts as "present" on the rule, but its 2016–20 replication is only −0.4pp.
- Dropping untagged days changes no conclusion.

## 4. What this settles, and what it doesn't

**Settled:**
- Time of day, range used (milestone 3) and the approach path (here) all change **how much** price does after a
  touch, at the forecast levels and equally at lines that aren't the forecast's.
- None of them makes the forecast's own levels behave differently from placebo lines.
- The path effect is real market behaviour. It's strongest on EURUSD, and it tells you a level reached slowly is less
  likely to see either its next level or a return to the previous one before the session ends.

**Not settled:**
- Per instrument, the forecast-specific difference can't be ruled out below about 5–11pp. That's why the verdict is
  underpowered, not null.
- Pooled across instruments, it can be ruled out above about 3–6pp.

## 5. Next step

Not started; owner review first. Within the objective, the evidence now points to timing and extent rather than
direction. A slow approach means the move is losing pace. "When is movement becoming less likely" is answerable as
**how likely the next level is still reached, given time left, range used and approach**. That is a calibration
question about reach, not a direction or entry question.
