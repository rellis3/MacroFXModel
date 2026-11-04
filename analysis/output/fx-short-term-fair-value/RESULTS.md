# fx-short-term-fair-value — results

Prereg: `forge/FX_SHORT_TERM_FAIR_VALUE_PREREG.md` (committed in `a269540`, 2026-11-04). Run 2026-11-04, seed 20261104,
B = 2000 (block 63 sessions), Monte-Carlo null 400 draws. Branch `worktree-agent-a1c659cb9484c89a4`.
Ledger id: `fx-short-term-fair-value`. Scored once (`node scripts/fx-short-term-fair-value/run.mjs --mode score`);
`results.json` holds every number below.

## Verdict: UNDERPOWERED

By the registered rule (prereg §4c): no horizon passes the gate; h = 10 and h = 20 are clean nulls (their intervals
exclude the bar), and h = 5 is UNDERPOWERED by a hair (its realised Holm-level MDE 0.0287 is above the 0.0285 bar and
its interval reaches 0.0294), so the study word is UNDERPOWERED, not NULL. In plain terms: **price does not close the
gap to this short-term fair value at any useful pace.** Over 20 days it closes +0.6% of the gap [−4.7%, +6.3%]
against a bar of 10.9%; over 10 days +1.1% [−1.9%, +4.5%] against 5.6%; over 5 days +1.0% [−0.6%, +2.9%] against
2.85%. None beats the naive price anchor (the price's distance from its own 250-day mean), none is significant on the
bootstrap or the Monte-Carlo null, and the first half (1999-2014) is flat or negative at every horizon.

## Scored cells

Closure share β_h = slope of the pair's log return from t+1 to t+1+h on −gap_t, pooled over EURUSD, GBPUSD, USDJPY,
AUDUSD, USDCAD (29,099-29,174 pair-days, ~6,670 date clusters, signals 1999-12-30 → 2026-08, no signal or outcome
after 2026-08-21).

| Cell | n (rows / dates) | β | 95% CI | MDE (Holm, realised) | Pass bar | boot p (Holm) | MC-null p | Halves (≤ / > 2014-12) | β − naive [95%] | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| h = 5  | 29,174 / 6,675 | +0.0104 | [−0.0057, +0.0294] | 0.0287 | 0.0285 | 0.24 (0.73) | 0.19 | +0.002 / +0.026 | +0.009 [−0.004, +0.023] | underpowered |
| h = 10 | 29,149 / 6,670 | +0.0110 | [−0.0193, +0.0452] | 0.0546 | 0.0561 | 0.51 (1.00) | 0.44 | −0.004 / +0.038 | +0.010 [−0.013, +0.036] | null |
| h = 20 | 29,099 / 6,660 | +0.0064 | [−0.0466, +0.0628] | 0.0906 | 0.1091 | 0.80 (1.00) | 0.83 | −0.014 / +0.042 | +0.006 [−0.032, +0.049] | null |

Gate items (per horizon): Holm on both p's — fail at all three; at the bar — fail at all three; both halves positive —
only h = 5 (+0.002 and +0.026); beats the naive anchor — fail at all three. The mirror (a significant negative
closure, price running from the model) did not occur either.

## Controls

- **Monte-Carlo null** (400 synthetic correlated random-walk outcomes on the real gaps): mean ~0 at every horizon (−0.00002,
  +0.00002, +0.00016), sd 0.0076 / 0.0147 / 0.0280; the real β sits inside it (two-sided p 0.19 / 0.44 / 0.83).
- **Shift placebo** (100 circular shifts of the gap against its outcomes, 250-2,725 days): mean +0.0007 / +0.0014 /
  +0.0035; the real β is at the 95th / 75th / 57th percentile. The placebo's spread (sd 0.006 / 0.012 / 0.023) is
  narrower than the bootstrap's, so the 95th percentile at h = 5 is not read as a pass (the registered tests are the
  bootstrap and the MC null; both say p ≈ 0.2).
- **Naive anchor**: β_naive +0.001 / +0.001 / +0.000, all intervals around 0: plain price mean-reversion is absent
  too, and the fair value adds nothing measurable beyond it.
- **Extreme gaps** (|z| ≥ 2, 4,495 pair-days, descriptive): β +0.009 / +0.003 / −0.010 — big gaps close no faster.

## Disaggregation (per pair, BH q = 0.10; descriptive)

| Pair | h = 5 | h = 10 | h = 20 |
|---|---|---|---|
| EURUSD | −0.003 [−0.025, +0.025] | −0.015 [−0.057, +0.038] | −0.039 [−0.116, +0.055] |
| GBPUSD | +0.017 [−0.008, +0.050] | +0.017 [−0.036, +0.077] | +0.006 [−0.089, +0.106] |
| USDJPY | +0.009 [−0.018, +0.040] | +0.012 [−0.041, +0.074] | +0.031 [−0.062, +0.148] |
| AUDUSD (2014 →) | +0.011 [−0.022, +0.057] | +0.007 [−0.052, +0.089] | −0.025 [−0.121, +0.091] |
| USDCAD | +0.034 [+0.006, +0.067] p 0.016 | +0.064 [+0.012, +0.123] p 0.013 | +0.096 [+0.002, +0.202] p 0.046 |

0 of 15 survive BH at q = 0.10 (0.75 expected at p < 0.05 by chance alone; USDCAD's three are one pair at three
overlapping horizons). USDCAD is the only pair whose gap leans toward closing; it is a pointer for a prereg on fresh
(post-lockbox) data at most, not a result.

## Descriptive (not part of the verdict)

- **The gap itself fades fast, but not because price moves.** An AR(1) on each pair's out-of-sample gap series gives a
  half-life of 9-16 trading days (EURUSD 14.2 [12.3, 18.4], GBPUSD 16.4, USDJPY 16.2, AUDUSD 9.3, USDCAD 10.9; Dickey-Fuller
  t −10.6 to −14.0). With a 14-day half-life, about 63% of a gap is gone in 20 days; price closes ~1% of it. So almost all
  of the "convergence" is the fair value moving to price: the 250-day refit and the yields catch up with the pair. That
  is the reason the page must not present the half-life as "time for price to get back to fair value".
- **R² of the rolling fit** (median, 10th-90th percentile of the daily refits): EURUSD 0.69 (0.27-0.87), GBPUSD 0.57
  (0.25-0.86), USDJPY 0.65 (0.29-0.90), AUDUSD 0.56 (0.26-0.84), USDCAD 0.71 (0.36-0.91). A level regression on trending
  series: these describe how well rates and risk track where the pair has been, not forecast power.
- Power and planted controls (`power.json`, before the run): the pipeline finds a true fair value whose gap has a
  ~20-day half-life (6/6 at every horizon) and cannot see 60- or 120-day ones (the refit absorbs them).

## Deviations from the prereg

None. Data as registered (FRED H.10 noon NY rates, issuer yields, VIXCLS), fetched 2026-11-04
(`data/fx-short-term-fair-value/manifest.json`, sha256 per file; the data folder is gitignored, re-fetch with
`node scripts/fx-short-term-fair-value/fetch.mjs`; FRED and the issuers revise rarely, so a re-fetch may differ in a
handful of prints).

## What this changes

- `/api/fx-fair-value` and the terminal's Pair and Macro tabs show the model as **DESCRIPTION ONLY, labelled
  UNDERPOWERED** (the Evidence Book word), with the line "rates and risk describe where the pair has been; the gap has
  not told us where it goes". Nothing feeds the desk, the briefs or the analysts as an impact.
- The page shows the half-life as the gap's own half-life, with the note that it fades because the model moves.
- The live page logs one row a day (`fx_fair_value_log_v1`) from deploy, so a forward record on OANDA closes exists if
  anyone wants to reopen it. Reopen only with a new prereg (e.g. USDCAD alone, or a slower model) on data after
  2026-08-21.
