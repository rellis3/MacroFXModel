# regime-picks-rule — results

Prereg: `forge/REGIME_PICKS_RULE_PREREG.md` (committed in `58830936`, 2026-11-15). Run 2026-11-15 (ranAt
2026-11-15T16:26Z), seed 20261115, B = 2000, block 21, 200 label-block shuffles, 40 full-pipeline plants per family.
Branch `claude/signal-bot-bias-analysis-bwr1qv`. Ledger ids: `regime-picks-rule-atr`, `regime-picks-rule-hmm`,
`regime-picks-rule-chain`. Selftest: `selftest.log` (PASSED: planted interaction C2 +0.051 [+0.038, +0.063]; null
draw z −0.62, 0/20 null draws flagged; forward filter = hmmlearn posterior to 1e-13; filtered labels unchanged by
future returns; smoothed-label leak visible +0.0125 [lower +0.0033]; four hand-made fill paths exact).

## Verdict: NULL (`atr`) · UNDERPOWERED (`hmm`) · NULL (`chain`)

The registered gate needed a regime book that switches between FADE (p50 line), FOLLOW (first 0.10σ move after 07:00)
and BREAK (Asia high/low) to earn ≥ +0.04 R per instrument-session over flat (C1) and over a regime-free picker (C2),
in both halves, above the label-shuffle 97.5th percentile, with the planted control found ≥ 80%. **No regime of any
family ever found a rule that paid in its own training history**, so every quarterly refit (24 of them,
2020-08-24 → 2026-07-01) picked FLAT for every regime: all three books, and the regime-free picker, are exactly 0 R on
20,163 test instrument-sessions (1,554 dates, 13 instruments). C1 and C2 are 0 [0, 0] for every family. The planted
control shows the pipeline would have switched on: a bar-sized regime×rule edge planted in the real rows was found in
100% of plants for C1 (all three families) and for C2-atr, 95% for C2-chain, so those cells are POWERED and NULL. For
C2-hmm the plant was found 0% of the time: the HMM's LOW state covers 62% of test sessions, so the planted LOW→FADE
edge also turns the regime-free picker onto FADE and the regime's *extra* value is only ~0.029 R; that cell cannot
see a bar-sized regime-only edge and is UNDERPOWERED by the registered rule. G5 (HMM vs chain) is 0 [0, 0].

The three rules lose net on bid/ask in every regime: always-FADE −0.048 R per instrument-session [−0.062, −0.034]
(−0.072 per trade), always-FOLLOW −0.064 [−0.113, −0.016], always-BREAK −0.060 [−0.106, −0.015]. Of the 30 regime×rule
cells on the test period, none has a CI above zero; the best are BREAK in the ATR HIGH regime +0.007 [−0.061, +0.086]
and FOLLOW in the HMM MID state −0.013 [−0.099, +0.076].

## Scored cells

| Cell | n rows / dates | Estimate (R per inst-session) | 95% CI | SE used | MDE | Bar | Holm p | H1 / H2 | shuffle 97.5th / real pct | plant detect | Gates failed | Cell verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1-atr | 20,163 / 1,554 | +0.0000 | [+0.0000, +0.0000] | 0.0017 | 0.0058 | +0.04 | 1.000 | +0.0000 / +0.0000 | +0.0000 / 14 | 100% | G2, G3, G4 | **NULL** |
| C2-atr | 20,163 / 1,554 | +0.0000 | [+0.0000, +0.0000] | 0.0017 | 0.0058 | +0.04 | 1.000 | +0.0000 / +0.0000 | +0.0000 / 14 | 100% | G2, G3, G4 | **NULL** |
| C1-hmm | 20,163 / 1,554 | +0.0000 | [+0.0000, +0.0000] | 0.0024 | 0.0085 | +0.04 | 1.000 | +0.0000 / +0.0000 | +0.0000 / 47 | 100% | G2, G3, G4 | **NULL** |
| C2-hmm | 20,163 / 1,554 | +0.0000 | [+0.0000, +0.0000] | 0.0024 | 0.0085 | +0.04 | 1.000 | +0.0000 / +0.0000 | +0.0000 / 47 | 0% | G2, G3, G4, G6, G5 | **UNDERPOWERED** |
| C1-chain | 20,163 / 1,554 | +0.0000 | [+0.0000, +0.0000] | 0.0025 | 0.0087 | +0.04 | 1.000 | +0.0000 / +0.0000 | +0.0000 / 34 | 100% | G2, G3, G4 | **NULL** |
| C2-chain | 20,163 / 1,554 | +0.0000 | [+0.0000, +0.0000] | 0.0025 | 0.0087 | +0.04 | 1.000 | +0.0000 / +0.0000 | +0.0000 / 34 | 95% | G2, G3, G4 | **NULL** |

Family verdicts: `atr` **NULL**, `hmm` **UNDERPOWERED**, `chain` **NULL**

G5 (HMM book − chain book): +0.0000 [+0.0000, +0.0000].

### Always-on rules and the regime-free picker (test period)

| Book | R per inst-session | 95% CI | trade rate | R per trade |
|---|---|---|---|---|
| always FADE | -0.0477 | [-0.0623, -0.0339] | 66% | -0.0721 |
| always FOLLOW | -0.0636 | [-0.1125, -0.0164] | 100% | -0.0638 |
| always BREAK | -0.0600 | [-0.1064, -0.0150] | 98% | -0.0611 |
| regime-free picker | +0.0000 | [+0.0000, +0.0000] | — | picks per refit: FLAT |

### Regime book vs each rule alone (book − always-k)

| Family | − FADE | − FOLLOW | − BREAK | flat share | pick shares |
|---|---|---|---|---|---|
| atr | +0.0477 [+0.0339, +0.0623] | +0.0636 [+0.0164, +0.1125] | +0.0600 [+0.0150, +0.1064] | 100% | FLAT 100%, FADE 0%, FOLLOW 0%, BREAK 0% |
| hmm | +0.0477 [+0.0339, +0.0623] | +0.0636 [+0.0164, +0.1125] | +0.0600 [+0.0150, +0.1064] | 100% | FLAT 100%, FADE 0%, FOLLOW 0%, BREAK 0% |
| chain | +0.0477 [+0.0339, +0.0623] | +0.0636 [+0.0164, +0.1125] | +0.0600 [+0.0150, +0.1064] | 100% | FLAT 100%, FADE 0%, FOLLOW 0%, BREAK 0% |

### Regime × rule, net R per instrument-session on the test period (BH q = 0.10 over each family's cells)

| Family | Regime | test share | n | FADE | FOLLOW | BREAK |
|---|---|---|---|---|---|---|
| atr | HIGH | 31% | 6,215 | -0.042 [-0.064, -0.022] ★ | -0.024 [-0.104, +0.067] | +0.007 [-0.061, +0.086] |
| atr | LOW | 41% | 8,362 | -0.046 [-0.067, -0.022] ★ | -0.071 [-0.141, -0.006] ★ | -0.086 [-0.149, -0.029] ★ |
| atr | MID | 28% | 5,586 | -0.056 [-0.080, -0.031] ★ | -0.096 [-0.173, -0.021] ★ | -0.095 [-0.179, -0.014] ★ |
| hmm | HIGH | 19% | 3,758 | -0.029 [-0.064, -0.001] | -0.106 [-0.199, -0.010] ★ | -0.053 [-0.140, +0.041] |
| hmm | LOW | 62% | 12,408 | -0.059 [-0.076, -0.041] ★ | -0.067 [-0.123, -0.019] ★ | -0.066 [-0.119, -0.021] ★ |
| hmm | MID | 20% | 3,997 | -0.029 [-0.056, -0.002] ★ | -0.013 [-0.099, +0.076] | -0.049 [-0.140, +0.035] |
| chain | DN-HI | 23% | 4,727 | -0.022 [-0.047, +0.004] | -0.047 [-0.127, +0.044] | -0.056 [-0.131, +0.026] |
| chain | DN-LO | 19% | 3,883 | -0.062 [-0.101, -0.025] ★ | -0.089 [-0.184, -0.000] | -0.114 [-0.199, -0.036] ★ |
| chain | UP-HI | 23% | 4,603 | -0.044 [-0.074, -0.017] ★ | -0.058 [-0.125, +0.019] | -0.025 [-0.098, +0.045] |
| chain | UP-LO | 34% | 6,950 | -0.059 [-0.081, -0.039] ★ | -0.064 [-0.137, +0.006] | -0.056 [-0.120, +0.008] |

★ = survives BH q = 0.10 (a candidate, never a result).

### Picks per quarterly refit

- **atr**: from 2020-08-24: HIGH:FLAT / LOW:FLAT / MID:FLAT
- **hmm**: from 2020-08-24: HIGH:FLAT / LOW:FLAT / MID:FLAT
- **chain**: from 2020-08-24: DN-HI:FLAT / DN-LO:FLAT / UP-HI:FLAT / UP-LO:FLAT
- **regime-free**: 2020-08-24: FLAT; 2020-10-01: FLAT; 2021-01-04: FLAT; 2021-04-01: FLAT; 2021-07-01: FLAT; 2021-10-01: FLAT; 2022-01-03: FLAT; 2022-04-01: FLAT; 2022-07-01: FLAT; 2022-10-03: FLAT; 2023-01-02: FLAT; 2023-04-03: FLAT; 2023-07-03: FLAT; 2023-10-02: FLAT; 2024-01-02: FLAT; 2024-04-01: FLAT; 2024-07-01: FLAT; 2024-10-01: FLAT; 2025-01-02: FLAT; 2025-04-01: FLAT; 2025-07-01: FLAT; 2025-10-01: FLAT; 2026-01-02: FLAT; 2026-04-01: FLAT; 2026-07-01: FLAT

### Controls

- **atr** planted (bar-sized regime×rule edge, full re-pick, 40 plants): C1 detected 100% (mean recovered +0.0419), C2 detected 100% (mean recovered +0.0419). Label-block shuffle: C1 mean -0.0006 sd 0.0017; C2 mean -0.0006 sd 0.0017.
- **hmm** planted (bar-sized regime×rule edge, full re-pick, 40 plants): C1 detected 100% (mean recovered +0.0404), C2 detected 0% (mean recovered +0.0286). Label-block shuffle: C1 mean -0.0018 sd 0.0024; C2 mean -0.0018 sd 0.0024.
- **chain** planted (bar-sized regime×rule edge, full re-pick, 40 plants): C1 detected 100% (mean recovered +0.0471), C2 detected 95% (mean recovered +0.0453). Label-block shuffle: C1 mean -0.0014 sd 0.0025; C2 mean -0.0014 sd 0.0025.
- Leak canaries: smoothed HMM labels → C1 +0.0291, C2 +0.0291 (labels agree with filtered 88%); realised-day label → C1 +0.3393, C2 +0.3393.

### Evidence-pack diagnosis labels

- `C1-atr`: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown (pack plant 1× detected 0%; canary +1.3095 vs clean +0.0000)
- `C2-atr`: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown (pack plant 1× detected 0%; canary +1.3095 vs clean +0.0000)
- `C1-hmm`: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown (pack plant 1× detected 0%; canary +0.0291 vs clean +0.0000)
- `C2-hmm`: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown (pack plant 1× detected 0%; canary +0.0291 vs clean +0.0000)
- `C1-chain`: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown (pack plant 1× detected 0%; canary +1.3095 vs clean +0.0000)
- `C2-chain`: UNDERPOWERED: the test cannot reliably see an effect of the useful size, so 'no effect' is not shown (pack plant 1× detected 0%; canary +1.3095 vs clean +0.0000)

### By asset group (C1 / C2)

| Family | group | n | C1 [CI] | C2 [CI] |
|---|---|---|---|---|
| atr | fx | 13,985 | +0.0000 [+0.0000, +0.0000] | +0.0000 [+0.0000, +0.0000] |
| atr | gold | 1,546 | +0.0000 [+0.0000, +0.0000] | +0.0000 [+0.0000, +0.0000] |
| atr | indices | 4,632 | +0.0000 [+0.0000, +0.0000] | +0.0000 [+0.0000, +0.0000] |
| hmm | fx | 13,985 | +0.0000 [+0.0000, +0.0000] | +0.0000 [+0.0000, +0.0000] |
| hmm | gold | 1,546 | +0.0000 [+0.0000, +0.0000] | +0.0000 [+0.0000, +0.0000] |
| hmm | indices | 4,632 | +0.0000 [+0.0000, +0.0000] | +0.0000 [+0.0000, +0.0000] |
| chain | fx | 13,985 | +0.0000 [+0.0000, +0.0000] | +0.0000 [+0.0000, +0.0000] |
| chain | gold | 1,546 | +0.0000 [+0.0000, +0.0000] | +0.0000 [+0.0000, +0.0000] |
| chain | indices | 4,632 | +0.0000 [+0.0000, +0.0000] | +0.0000 [+0.0000, +0.0000] |

### By instrument, always-on rules (R per instrument-session; per trade in brackets)

| inst | FADE | FOLLOW | BREAK |
|---|---|---|---|
| AUDUSD | -0.050 (-0.084) | -0.183 (-0.184) | -0.122 (-0.127) |
| EURJPY | -0.079 (-0.128) | -0.036 (-0.036) | -0.027 (-0.028) |
| EURUSD | -0.086 (-0.116) | -0.067 (-0.067) | -0.104 (-0.105) |
| GBPJPY | -0.035 (-0.054) | -0.110 (-0.111) | -0.044 (-0.045) |
| GBPUSD | -0.052 (-0.068) | -0.047 (-0.048) | -0.085 (-0.086) |
| GOLD | -0.044 (-0.066) | -0.075 (-0.075) | +0.007 (+0.007) |
| NQ | -0.019 (-0.028) | +0.013 (+0.014) | +0.099 (+0.100) |
| NZDUSD | -0.057 (-0.097) | -0.126 (-0.126) | -0.165 (-0.170) |
| SPX500 | -0.016 (-0.026) | -0.021 (-0.021) | -0.048 (-0.048) |
| US30 | +0.014 (+0.020) | -0.009 (-0.009) | -0.034 (-0.035) |
| USDCAD | -0.055 (-0.078) | -0.087 (-0.087) | -0.246 (-0.247) |
| USDCHF | -0.059 (-0.078) | -0.103 (-0.103) | -0.077 (-0.077) |
| USDJPY | -0.083 (-0.144) | +0.025 (+0.025) | +0.068 (+0.071) |

By instrument C2 cells surviving BH q = 0.10: 0 of 39.

### By year (C1 / C2)

| Family | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|
| atr | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 |
| hmm | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 |
| chain | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 | +0.000 / +0.000 |

### Exits / skips on the test period

- FADE: stop 6,658, no_touch 4,557, target 4,202, time 2,496, outside_p50 2,249, both_same_bar 1
- FOLLOW: stop 15,560, time 4,536, no_move 50, both_same_bar 17
- BREAK: stop 14,595, time 5,194, no_break 344, both_same_bar 23, asia_too_narrow 7

### Build

- Open mismatch share (forecast-history open vs first M1 mid open): 0.0000
- Rows dropped for a missing regime label: 0
- Session skips by instrument: EURUSD {'no_0700_bar': 1}; GBPUSD {'no_0700_bar': 1}; USDJPY {'no_0700_bar': 1}; USDCAD {'no_0700_bar': 1}; AUDUSD {'few_bars': 2, 'no_0700_bar': 1}; NZDUSD {'few_bars': 2, 'no_0700_bar': 1}; USDCHF {'few_bars': 3, 'thin_asia': 1, 'no_0700_bar': 1}; EURJPY {'no_0700_bar': 1, 'few_bars': 1}; GBPJPY {'no_0700_bar': 1}; GOLD {'no_0700_bar': 1}; NQ {'short_session': 5, 'few_bars': 3, 'no_0700_bar': 3}; SPX500 {'thin_asia': 2, 'few_bars': 14, 'no_0700_bar': 7, 'short_session': 3}; US30 {'short_session': 4, 'no_0700_bar': 4, 'few_bars': 3}
- HMM K chosen per instrument (across yearly folds): EURUSD [2, 3]; GBPUSD [2, 3]; USDJPY [2, 3]; USDCAD [2, 3]; AUDUSD [2, 3]; NZDUSD [2, 3]; USDCHF [2, 3]; EURJPY [2, 3]; GBPJPY [2, 3]; GOLD [2, 3]; NQ [2, 3]; SPX500 [2, 3]; US30 [2, 3]
- HMM filtered-label daily flip rate: median 0.089 (range 0.002–0.725)

## Why — evidence

1. **The rules lose everywhere, so there is nothing for a regime to pick.** Every regime×rule cell on the test period
   is negative or straddles zero with its centre at or below zero (table above). The picker's "mean > 0" condition was
   never met in training either, in any quarter, for any regime: the books' zero is the registered picker correctly
   standing aside, not a bug. Spread is inside every fill (bid/ask M1). FADE (stop at p75, target the open) hit its
   target on 4,202 of 13,357 traded sessions against 6,658 stops.
2. **The regime does change the payoff shape in the direction C.OG describes, but not enough to cross zero.** BREAK
   goes from −0.086 (ATR LOW) and −0.095 (MID) to +0.007 (HIGH); FADE is flat across ATR regimes (−0.042 to −0.056).
   "Break on high-vol days" is the least-bad pairing, about +0.09 R better than on low-vol days, but its level is
   break-even at best: the regime moves a rule from losing to break-even, not to paying. The cells that survive
   BH q = 0.10 are all *negative* (reliably losing); none is positive.
3. **Forced to trade, the regime picker does no better than always fading** (amendment A1, post-hoc, descriptive;
   `forced-*/evidence/`, `forced_packs.json`). Taking the best training-mean rule per regime even when negative gives
   ATR −0.043 [−0.064, −0.021], HMM −0.063 [−0.091, −0.036], chain −0.058 [−0.090, −0.027] R per instrument-session,
   negative in both halves for all three, against always-FADE −0.048. The forced picks were mostly FADE (the least-bad
   rule) with BREAK in the high-vol regime, and they changed between quarters (ATR 5 distinct pick sets, HMM 7, chain 8
   over 24 refits): what wins in one year's training does not carry into the next.
4. **The test could see a real edge.** Full-pipeline plants on the real rows: C1 detected 100% for all three families
   (mean recovered +0.040 to +0.047 vs bar +0.04); C2 100% (atr), 95% (chain). The noise threshold is small (label-block
   shuffle SD 0.0017–0.0025 R; MDE 0.006–0.009 R), far below the 0.04 bar. The leak canaries jump: the realised-day
   label (the day's own range tercile) turns the picker into +0.339 R per instrument-session, and smoothed HMM labels
   give +0.029 (filtered: 0). So a day-type label known *after* the day would pick rules well; the pre-open regimes
   carry none of that.
5. **No instrument rescues it.** 0 of 39 per-instrument C2 cells survive BH. Always-on BREAK is positive only on NQ
   (+0.100 per trade), USDJPY (+0.071) and gold (+0.007), FOLLOW on NQ and USDJPY; that looks like the index long drift
   and the 2021–24 yen trend, not a regime effect (descriptive, not scored).
6. **Evidence-pack labels.** The six registered packs read "UNDERPOWERED" because the book never traded, so the pack's
   planted R had no traded rows to attach to and its shuffled placebo is identically 0: an artefact, not a power
   finding (the run's own full-pipeline plants are the registered check). The forced packs (A1) also read
   "UNDERPOWERED" for a different artefact: their plant asks whether +0.04 added to a −0.04 to −0.06 book makes the
   CI clear zero, which it cannot. Read them for the estimate, its CI wholly below zero, both halves negative, and
   the canary jumping to +1.31 (realised oracle, atr/chain).

HMM notes (lesson #6): K = 2 or 3 chosen per year on held-out likelihood for every instrument; the filtered-label
daily flip rate has median 0.089 but reaches 0.73 in some folds (early USDCAD, AUDUSD, GBPJPY): there the HMM split on
something other than persistent variance, one reason its states are a noisier regime than the ATR percentile.
Filtered and smoothed labels agree 88% of the time.

## Controls (placebo, time shift, news baseline, concentration)

Listed under "Controls" above: label-block shuffles centred at −0.0006 to −0.0018 (the real 0 sits at the 14th–47th
percentile), full-pipeline plants, two leak canaries. No news baseline (not a volatility claim). Concentration is moot:
the books are flat; the always-on rules lose in both halves.

## Deviations from the prereg

A0 (pre-results, code only: the selftest null panel now has distinct regime-free rule means; `--selftest-passed`
flag because the selftest takes ~25 min on the shared laptop) and A1 (post-hoc, descriptive: forced-picker packs).
Neither changes a cell word.

## What this changes

- **Desk card:** the day-type line should say the regime sets *how big* the day is, not *which rule* to trade. "Low
  vol → fade the line, high vol → trade the Asia break" is not supported on 13 markets with real spreads: fades lose in
  every regime, breaks only reach break-even on high-vol days.
- **HMM vol state:** stays a variance read (memory `project_hmm_variance_not_direction`). It did no better than an
  ATR percentile or the named chain at choosing rules, and its own regime-only value could not be resolved at the bar
  (UNDERPOWERED).
- **C.OG L3:** recorded as tested on these three fixed rules. Where the null points next: the realised-day label is
  worth +0.34 R per instrument-session, so the missing piece is a pre-open forecast of day *shape* (contained vs
  extending), not of day size (the σ forecast already prices size into the line spacing). A rule that is at least
  break-even on its own in one regime (BREAK on high-vol days, NQ / USDJPY) is the only arm worth carrying into such a
  test; exit variants on it need placebo entries first (lesson #27).
- Nothing live changes.
