# gold-line-continuation-explore: results (exploratory, not pre-registered)

Script `scripts/gold-line-continuation-explore/run.py`, full tables in `report.txt` /
`analysis/output/gold-line-continuation-explore_log.txt`. No rule or backtest change. Seed 20261127.

## A. Does the VWAP fade fail when price hasn't stretched far from VWAP?

z = the entry's distance from VWAP at the fill, in σ_v (the band width of the VWAP indicator). Avg net R (trades):

| z at the fill | Fill rule, IS | Fill rule, OOS | Same-candle ignored, IS | Same-candle ignored, OOS |
|---|---|---|---|---|
| under 2σ | −0.80 (37) | −0.08 (119) | −0.70 (40) | −0.10 (112) |
| 2–2.5σ | +0.23 (52) | +0.34 (135) | −0.01 (39) | +0.12 (113) |
| over 2.5σ | −0.05 (244) | +0.39 (495) | −0.11 (181) | +0.05 (395) |

- **Yes, in the direction the owner expected:** fades taken less than 2σ from VWAP lose in both periods and with both
  entry rules (stopped out 70–85% of the time). Small samples (about 40 IS, about 115 OOS).
- Most trades are already over 2.5σ from VWAP (P75/P90 lines are far out), so a 2σ filter would remove about 15%
  of trades.
- Partly mechanical: nearer VWAP, the target is nearer, so wins are smaller, but the under-2σ rows are negative before
  costs as well.

## B. Can anything at the line pick out continuations?

Every first poke of Jordan's 8 lines; a 1-stop continuation trade (+1 stop further through vs −1 stop back, pessimistic
when both are in one bar). Mean gross R = 2 × win% − 1. Costs about 0.13–0.20R. Fake lines = 20 shuffles.

| Signal | Real IS | Real OOS | Fake IS | Fake OOS |
|---|---|---|---|---|
| All pokes | −0.02 (695) | −0.06 (990) | −0.07 | −0.05 |
| Poke candle closed beyond the line | −0.04 | −0.05 | −0.09 | −0.07 |
| **Accepted 5 min** (closed beyond, no retouch for 5 minutes) | −0.03 (113) | **+0.13 (157), net +0.02** | −0.01 | −0.02 |
| Poke at 12:00–16:00 London | +0.06 | +0.03 | +0.01 | −0.03 |
| VWAP stretch 1.5–2.5σ | +0.06 to +0.11 | +0.01 to +0.05 | mixed | mixed |

- **No continuation edge at these lines.** Every signal is about breakeven before costs and negative after, and
  the real lines look like fake lines.
- The only positive cell (accepted 5 min, OOS) is +0.02R after costs, negative in IS, and fake lines don't have it:
  not a lead worth a prereg on its own.
- "Day range used" was uninformative as built: by the time a P75/P90 line is poked, 75%+ of the forecast HL P50 range
  is always used.

## Reading

- The VWAP-stretch result (A) is the useful one: a "fade only when 2σ+ from VWAP" filter is a candidate layer for
  a prereg, judged on fresh data (lockbox / forward), as a removable add-on.
- Continuation (B): the lines don't separate breaks that run from breaks that fail, by any of these signals, on M1.
