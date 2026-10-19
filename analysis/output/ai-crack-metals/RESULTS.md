# ai-crack-metals — results

Prereg: `forge/AI_CRACK_METALS_PREREG.md` (committed in `12d42ab2`, 2026-10-19 15:16 +0100, pushed before the
harness `scripts/ai-crack-metals/run.mjs` was written). Run 2026-10-19, seed 20261019, B = 2000, block 20.
Branch `main`. Ledger ids: `ai-crack-metals` (gold), `ai-crack-metals-silver` (silver).

## Verdict: NULL (both scored cells)

The registered gate was conjunctive: the 20-session excess over the unconditional control clears zero (lower bound
> 0), is positive in both halves, and the mirror (the AI trade ripping) does not show an excess of the same sign
reaching half its size. **Neither cell cleared the first clause.** Gold after a crack ran **+0.45% [−0.83, +1.89]**
over its ordinary 20-session drift (+1.32% vs +0.87%, n = 60); silver ran **−1.93% [−4.05, +0.16]** (−0.13% vs
+1.80%). Both intervals **exclude the pass bar** (2.0% gold, 3.5% silver), so by the results-and-banking rule these are
nulls, not underpowered cells: the design could have found the effect the claim needs and did not.

Shared spine 2006-04-28 → 2026-08-21, 5,111 sessions; 61 crack setups, 70 mirror setups after 20-session
de-clustering (the prereg's planned counts were 61 and 70).

## Scored cells

| Cell | n (setups vs control) | Estimate (excess, %) | 95% CI | MDE (prereg) | Pass bar | p (from CI) | Holm (α 0.05, 2 cells) | Cell verdict |
|---|---|---|---|---|---|---|---|---|
| GLD 20s | 60 vs 4,874 | +0.449 | [−0.831, +1.888] | 1.8 | 2.0 | 0.517 | not significant | **NULL** |
| SLV 20s | 60 vs 4,874 | −1.928 | [−4.046, +0.159] | 3.4 | 3.5 | 0.072 | not significant | **NULL** |

Gate detail: GLD — clears zero NO, halves positive YES (+0.46 / +0.41), mirror OK YES. SLV — clears zero NO, halves
positive NO (−2.17 / −1.81), mirror OK YES.

## Controls

- **Mirror (RIP, SMH/SPY top decile, n = 70)**: GLD 20s excess −0.68 [−1.69, +0.29]; SLV −0.65 [−2.79, +1.61]. Neither
  arm moves either metal at 20 sessions.
- **Halves** (split 2016-06-24): gold's small positive excess is the same size in both halves and spans zero in both;
  silver's negative excess is the same sign in both halves and spans zero in both.
- **Concentration by year** (crack setups): 2006 1 · 2007 3 · 2008 5 · 2009 2 · 2010 3 · 2011 4 · 2012 4 · 2013 2 ·
  2014 3 · 2015 4 · 2016 3 · 2017 2 · 2018 4 · 2019 3 · 2020 3 · 2021 3 · 2022 4 · 2023 3 · 2024 3 · 2025 2 — no
  single regime carries the sample.
- **Placebo / time shift**: not run; the control is the unconditional return and both arms sit inside its interval,
  so there is no positive result to stress.

## Deviations from the prereg

None. Constants, spine, split date, horizons, seed and gate are as registered. The planned setup counts matched.

## Descriptive (not part of the verdict)

- **60 sessions, crack arm**: GLD +0.19 [−3.14, +4.02]; SLV −2.30 [−7.83, +3.05]. Nothing.
- **60 sessions, mirror arm — the one interval that clears zero, and it points the other way from the clip's logic:**
  after the AI trade **rips** (top decile), **gold lags its ordinary 60-session drift by −3.48% [−5.93, −1.10]**
  (+0.46% vs +3.94%, n = 69); silver −3.49 [−9.02, +1.39]. This is a descriptive cell, one of eight non-scored
  intervals (one clearing by chance is unremarkable), on an arm the prereg registered only as a mirror. It is the
  *converse* of the claim — "gold does worse while the AI trade is winning" — not the claim itself, and it would need
  its own pre-registration on fresh data (or the forward record) before anyone said it on a page. Logged as a
  candidate, not a finding.

## What this changes

- No page says anything about semis and metals today, so nothing changes on a page. The watch register's
  `claim-breadth-narrow` / `claim-semis-tilt` rows do not gain a metals line.
- `CROWN_WATCH.md`: the open-candidate line "AI-crack → metals rotation" is struck with this id; the 2026-10-16
  entry gets a one-line resolution.
- What would reopen it: a pre-registration of the **converse** (AI rip → gold lags over 60 sessions) on data this run
  did not score — the lockbox sessions after 2026-08-21 as they accrue, or `GC=F` back to 2000 with a stated roll
  treatment.
