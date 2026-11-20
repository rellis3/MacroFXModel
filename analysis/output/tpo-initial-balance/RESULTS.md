# tpo-initial-balance — results

Prereg: `forge/TPO_INITIAL_BALANCE_PREREG.md` (committed in `da537a4b`, 2026-11-18). Amendments: A1 adds order flow and candles (`e027c756`, pre-results); A2 adds the positive control, real n and MDEs (`dddbfc2b`, pre-results); A3 replaces the data for the real-flow arm (post-hoc, description only).
Run 2026-11-20, seed 20261118, B = 2000. Pushed straight to `main`. Ledger ids: `tpo-ib-follow`, `tpo-ib-fade`, `tpo-ib-strategy`, `tpo-ib-flow`, `tpo-ib-candle`.

Data:
- CME NQ, ES, YM and RTY continuous front month (NT8 1-minute bars, end-stamp corrected), US cash session, 2016-01-04 → 2026-08-21.
- Scored sessions: NQ 2,603 and ES 2,604. Replication: YM 2,599 and RTY 2,184.
- Real aggressor flow: Databento NQ, 49 sessions, 2026-06-12 → 2026-08-21.

## Verdict: NULL

Steidlmayer's initial-balance rule carries no edge to the close on NQ or ES.
- **Accepted break (two 30-minute closes beyond the IB):** price goes on in the break's direction no more than at the same clock time and in the same direction on other days. NQ +0.026σ [−0.047, +0.095], ES +0.004σ [−0.070, +0.077].
- **Failed poke (traded beyond, closed back inside):** it reverses no more than that either. NQ +0.005σ [−0.054, +0.064], ES +0.017σ [−0.046, +0.081].
- All four intervals exclude the registered +0.15σ bar, and the MDE was 0.115–0.138σ, so these are powered nulls.
- **Order flow and candles at the break don't change this.** Flow is the bulk-volume proxy; candle strength is the 30-minute close location. All 8 slopes are within ±0.06σ per SD, and every interval excludes the +0.15 bar.
- **The trades after costs** are UNDERPOWERED by design (MDE 0.18–0.35R against a 0.05R bar). Both fades lose about 0.14R a trade net [about −0.23, −0.05], which is the same as random entries with the same stop and target (vs placebo: NQ −0.05R, ES +0.03R).
- **YM and RTY replicate the null.**
- The positive control passed: a random walk gave zero in every cell, and a planted +0.20σ came back as +0.215σ.

## Scored cells

Primary family (Holm over 8). The statistic is d = outcome minus the mean of 3 time- and side-matched placebo sessions, in σ1·√h to the 15:59 close.

| Cell | n | Estimate | 95% CI | 2016-20 / 2021-26 | MDE | Bar | Holm p | Verdict |
|---|---|---|---|---|---|---|---|---|
| Q1 NQ follow | 1,038 | +0.026 | [−0.047, +0.095] | −0.026 / +0.072 | 0.128 | 0.15 | 1.00 | NULL |
| Q1 ES follow | 1,068 | +0.004 | [−0.070, +0.077] | −0.037 / +0.037 | 0.138 | 0.15 | 1.00 | NULL |
| Q2 NQ fade | 1,349 | +0.005 | [−0.054, +0.064] | +0.063 / −0.046 | 0.115 | 0.15 | 1.00 | NULL |
| Q2 ES fade | 1,371 | +0.017 | [−0.046, +0.081] | +0.015 / +0.019 | 0.115 | 0.15 | 1.00 | NULL |
| Q3 NQ follow, net R vs placebo | 1,024 | +0.122 | [−0.052, +0.316] | +0.068 / +0.169 | 0.35R | 0.05R | 1.00 | UNDERPOWERED (net +0.051R [−0.111, +0.229]) |
| Q3 ES follow | 1,023 | +0.058 | [−0.130, +0.240] | +0.077 / +0.043 | 0.32R | 0.05R | 1.00 | UNDERPOWERED (net −0.022R [−0.176, +0.133]) |
| Q3 NQ fade | 1,339 | −0.049 | [−0.162, +0.065] | +0.072 / −0.155 | 0.20R | 0.05R | 1.00 | UNDERPOWERED (net **−0.141R** [−0.233, −0.044]) |
| Q3 ES fade | 1,320 | +0.028 | [−0.074, +0.130] | +0.093 / −0.031 | 0.18R | 0.05R | 1.00 | UNDERPOWERED (net **−0.140R** [−0.232, −0.046]) |

Secondary family (A1, Holm over 8): the OLS slope of d on the standardised feature, in σ per SD.

| Cell | n | Slope | 95% CI | 2016-20 / 2021-26 | MDE | Holm p | Verdict |
|---|---|---|---|---|---|---|---|
| Q4 flow, NQ follow | 1,038 | −0.013 | [−0.094, +0.081] | −0.004 / −0.020 | 0.128 | 1.00 | NULL |
| Q4 flow, ES follow | 1,068 | +0.011 | [−0.063, +0.089] | −0.021 / +0.035 | 0.138 | 1.00 | NULL |
| Q4 absorption, NQ fade | 1,349 | −0.022 | [−0.087, +0.042] | −0.088 / +0.017 | 0.115 | 1.00 | NULL |
| Q4 absorption, ES fade | 1,371 | −0.053 | [−0.116, +0.015] | −0.109 / +0.000 | 0.115 | 0.91 | NULL |
| Q5 candle, NQ follow | 1,038 | −0.014 | [−0.095, +0.063] | +0.037 / −0.060 | 0.128 | 1.00 | NULL |
| Q5 candle, ES follow | 1,068 | −0.036 | [−0.108, +0.035] | −0.011 / −0.058 | 0.138 | 1.00 | NULL |
| Q5 rejection candle, NQ fade | 1,349 | +0.003 | [−0.058, +0.071] | +0.037 / −0.023 | 0.115 | 1.00 | NULL |
| Q5 rejection candle, ES fade | 1,371 | +0.043 | [−0.020, +0.109] | +0.083 / +0.006 | 0.115 | 1.00 | NULL |

Absorption at a failed poke leans slightly the wrong way (more buying into a failed upside poke goes with a weaker fade, not a stronger one), but not significantly.

## Controls

- **Placebo:** 3 sessions from the previous 250, same entry minute, same direction and the same h. For trades, the same stop and target distance in points. This removes NQ's upward drift and time-of-day effects. The placebo mean is in every scored number.
- **Positive control** (`positive_control.json`): on the driftless walk, all 8 cells cover 0. The planted +0.20σ was recovered as +0.215 [+0.149, +0.278].
- **Halves:** no cell keeps one sign with any size in both halves.

## Deviations from the prereg

- A1 and A2 are pre-results: flow and candles added, power stated, and the strategy cells declared UNDERPOWERED before scoring.
- A3 is post-hoc. The tick-rule file A1 named held 1 usable session, not ~125 (my reading error). The real-flow arm uses 49 Databento aggressor sessions instead, and it stays descriptive.

## Descriptive (not part of the verdict)

**TPO against order flow.**

| | Real aggressor flow (NQ, 49 sessions) | Flow proxy NQ / ES (2016–26) |
|---|---|---|
| Proxy vs real flow, per 30 minutes | r = 0.50 | — |
| Flow vs the period's own price change | r = 0.43 | r = 0.87 (proxy) |
| Range extension vs flow, extending periods (D1) | r = 0.43; same sign 61% (n 174) | r = 0.63 / 0.59; same sign 76% / 74% |
| Day's CVD agrees with a one-sided IB extension (D3) | 59% (n 37) | 85% [83, 86] / 76% [74, 78] |
| Flow at the break → follow outcome | slope +0.11 (n 14) | −0.013 / +0.011 |
| Absorption at a poke → fade outcome | slope +0.15 (n 29) | −0.022 / −0.053 |

- The proxy is built from price changes, so it agrees with price and with the TPO largely by construction. Real aggressor flow agrees with the TPO's range extension moderately: about 6 times in 10.
- **That link is same-time only.** Neither real nor proxy flow at the break moves the rest of the day in any powered test. This matches `orderflow-lead` and `orderflow-lead-aggressor`.
- The real-flow slopes rest on 14 and 29 events, so they are noise-level, and the proxy and real flow agree only 0.15–0.25 in those windows.

**Day types (mechanical Dalton).**
- NQ: normal variation 45%, trend 12%, neutral extreme 12%, normal 12%, neutral centre 9%, one-sided other 9%.
- ES: normal variation 36%, trend 15%, neutral extreme 15%, neutral centre 14%, one-sided other 13%, normal 7%.
- Trend and neutral-extreme days close 0.85–0.96 IB widths from the TPO POC. Every other type closes 0.16–0.34 widths from it.

**Profiles.**
- The TPO POC and the volume POC sit a median 0.09 (NQ) and 0.11 (ES) IB widths apart, and their value areas overlap 82% and 81%.
- On 1-minute bars the time profile and the volume profile describe nearly the same auction. (The volume profile spreads each minute's volume evenly over its range, so the two share inputs.)

**Candles (D5).**
- A 30-minute bar closing in the top 20% of its range is followed by an up bar 51.9% of the time on NQ (base 52.4%) and 51.8% on ES (base 51.5%).
- A close in the bottom 20% is followed by a down bar 46.9% on NQ (base 47.6%) and 48.8% on ES (base 48.5%).
- Candle closes carry nothing into the next 30 minutes.

**Components (owner's rule, BH q = 0.10): no candidate.**
- After an accepted break, price reaches one more IB width before the close 36.0% of the time against 32.9% for the placebo (NQ) and 45.8% against 42.5% (ES). That is about +3pp in both, but both intervals touch 0.
- Gross R minus placebo: follow +0.12R (NQ) and +0.06R (ES), with intervals across 0.
- Breaks and pokes on **high** volume (top tercile of the period's volume against its 20-session median) were the worse ones on NQ: d −0.06 and −0.07, against +0.06 and +0.07 on low volume. ES shows no such pattern.

**Replication:** YM follow −0.010 [−0.090, +0.068], fade +0.026 [−0.036, +0.092]. RTY follow +0.011 [−0.054, +0.074], fade −0.027 [−0.092, +0.035].

## What this changes

- The IB lines and the TPO view on `footprint.html` stay descriptive. The help text now quotes this null: an accepted IB break has not run further than the clock gives, and a failed poke has not reversed further.
- `MD files/REVERSION_CONTINUATION_CONCEPT.md` §B points here: the mechanical IB taxonomy is no fade/follow selector on index futures.
- No bot, alert or desk line uses an IB rule.
- **What would reopen it:**
  - real aggressor flow and footprint imbalances at the IB edge (the recorder's forward record, from 2026-11-17);
  - a discretionary Market Profile read logged ex ante (lesson #24);
  - an exit other than the close, under a new prereg as a new trial.
- The one faint lead is the +3pp extra reach of one more IB width after acceptance. It is small, not significant, and not a trade, but it is the place to look if this is reopened.
