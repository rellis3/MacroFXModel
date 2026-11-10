# bounce-confirmation — RESULTS (run 2026-11-09)

**Verdict: UNDERPOWERED** (by the rule fixed in the PRE-RESULTS amendment of
`forge/BOUNCE_CONFIRMATION_PREREG.md`: no scored cell clears its gate, and the MDE at the
actual arm counts sits above every registered bar). The point estimates give the claim no
support at all: confirmed bounces did slightly *worse* over five sessions, and unconfirmed
bounces did not fade.

| | |
|---|---|
| Prereg | `forge/BOUNCE_CONFIRMATION_PREREG.md`, commit 24bb5870 (before the harness); amendments 4beaa910, 49ad8b55 (before the run) |
| Harness | `scripts/bounce-confirmation/score.mjs`, one real run, `results.json` beside this file |
| Data | Yahoo adjusted closes `^NDX`, `SMH`, `RSP`, `HYG`, `LQD`, `^GSPC`; 4,873 joint sessions 2007-04-11 → 2026-08-21 (lockbox respected, truncated before the join); FRED HY OAS unavailable (error page), sensitivity leg skipped |
| Episodes | 177 bounces of ≥ 1.5 % within 3 sessions of a 10-session `^NDX` low, de-clustered 10 sessions; halves 87 / 90 |
| Arms | CONFIRMED (HY/IG not widening **and** SMH/RSP up, low → bounce day) **102**; UNCONFIRMED (HY/IG widening) **44**; MIXED 31 (reported only) |
| Seed / bootstrap | 20261109; episode block bootstrap, block 3, B 2000; label-shuffle placebo B 2000 |
| Control SD | 5-session 3.26 %, 10-session 4.43 % (post-low windows) |

## Scored cells (Holm α 0.05 over 3; leverage-controlled residuals of `Y_h` on drop depth and bounce size)

| Cell | n | Estimate | 95 % interval | Raw (no control) | Bar | MDE | p | Holm | Halves | Shuffle p95 / SD | Shifted-window | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| H1 h = 5: confirmed − unconfirmed | 102 / 44 | **−0.27 pp** | [−1.56, +1.05] | −0.27 | +1.5 | 1.65 | 0.70 | no | +0.60 / −0.99 | 1.06 / 0.63 | −0.30 [−1.89, 1.05] | fail (sign) |
| H1 h = 10: confirmed − unconfirmed | 102 / 44 | **+0.50 pp** | [−0.95, +1.83] | +0.46 | +2.0 | 2.24 | 0.49 | no | +2.10 / −0.84 | 1.32 / 0.80 | −0.34 [−2.06, 1.26] | fail (size, interval, halves, placebo) |
| H2 h = 5: unconfirmed mean (fade) | 44 | **+0.11 pp** | [−0.86, +0.99] | — | ≤ −1.0 | 1.38 | 0.80 | no | −0.55 / +0.71 | — | — | fail (sign) |

Holm-adjusted p: 1.00, 1.00, 1.00. Nothing is near a bar; the shifted-window placebo
(confirmation measured over the ten sessions *into* the low) sits in the same place as the
real labels, which is what a label with no information looks like.

## Mirror and descriptive (BH q 0.10 over the four leg cells: 0 of 4 pass)

| | h = 5 | h = 10 |
|---|---|---|
| D1 credit leg alone (C ≥ 0 minus C < 0, residual) | −0.22 [−1.49, +1.02], p 0.73 | +0.43 [−1.00, +1.70], p 0.53 |
| D1 semis leg alone (M > 0 minus M ≤ 0, residual) | +0.00 [−1.24, +1.35], p 1.00 | +0.49 [−0.97, +2.08], p 0.51 |

| Arm | mean `Y_5` | hit rate `Y_5 > 0` | mean `Y_10` | mean `Y_20` | give-back (close < low within 10) | `^GSPC` 5 / 10 |
|---|---|---|---|---|---|---|
| CONFIRMED (102) | −0.17 % | **53.9 %** | +0.37 % | +0.97 % | 46.1 % | −0.13 / +0.40 |
| UNCONFIRMED (44) | +0.11 % | **65.9 %** | −0.09 % | +1.02 % | 45.5 % | −0.06 / −0.26 |
| MIXED (31) | −0.03 % | 51.6 % | −0.05 % | −0.31 % | 51.6 % | +0.04 / −0.27 |

Scale: the unconditional 5-session return after these bounces is −0.07 %, against +0.35 % over
the ten sessions after any 10-session low. The bounce day itself is not a good entry on
average; the labels do not change that.

- **Credit widened in only a quarter of bounces** (44 / 177). The clip treats a widening
  during the bounce as the common tell; on this proxy it is the uncommon case, and when it
  happened the bounce held as often as not (hit rate 66 %, give-back 45 %).
- **Robustness (descriptive):** ex-2008/2020 H1 h5 −0.12, h10 +0.51; last three years
  (2023-08-22 →) h5 −1.31, h10 −0.23, i.e. confirmed bounces have recently done worse. By
  year the h5 difference flips sign nine times in twenty years (2008 −2.96, 2010 +4.95,
  2016 +7.51, 2022 −3.25, 2024 −3.72).
- **Planted controls (prereg amendment 2):** +1.5 pp planted on confirmed `Y_5` came back
  +1.23 [−0.07, +2.55] (interval touched zero, as an MDE of 1.65 predicts); +3.0 pp came back
  +2.72 [1.43, 4.04], p 0.001, every gate leg true. The pipeline recovers what it can see.

## What this means

- The verdict word is UNDERPOWERED because the design cannot exclude a true difference of up
  to about 1.6 pp at five sessions or 2.2 pp at ten. But the estimate is wrong-signed at
  five sessions and the unconfirmed arm did not fade, so the claim as stated ("fade a
  bounce credit does not confirm") has no support here: the gap between "unproven" and
  "disproven" is one of power, not of sign.
- The HY/IG ETF ratio from 2007 is the longest keyless high-yield proxy; a longer HY OAS
  series (FRED, from 1996) or a pooled multi-index design would roughly double the
  unconfirmed arm and is the only way to lower the MDE under a new prereg.
- Not tested (prereg §7): intraday confirmation, a bounce defined on breadth, options skew,
  or any discretionary "significant reason" exception.

## Register and bank

Register row `bounce-confirmation` → RESULTS → BANKED as `bounce-confirmation` (domain
`price`, verdict `underpowered`) in `js/deskEvidence.js`, with a POWER row carrying the arm
counts; `credit-leads-equities` `use` gains a cross-reference. CLIP_WATCH entry 2026-11-09.
