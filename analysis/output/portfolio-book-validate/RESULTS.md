# portfolio-book-validate — results

Prereg: `forge/PORTFOLIO_BOOK_VALIDATE_PREREG.md` (committed in `44986846`, 2026-10-25; A1 pre-results in `05da6855`; A2
post-hoc, below). Run 2026-10-25, harness seed `0x9e3779b9`, B = 1,000. Branch `main`. Ledger id: `portfolio-book-validate`.

## Verdict: CONTEXT

The parent book survives the checks that test its *construction*: no lookahead, an independent rebuild agrees, NAS100 is
not carrying it, the fill delay doesn't hurt, and a period it never saw is positive. It does **not** survive the checks
that test its *realism*. The vol-premium proxy fails its benchmark (T6), and once financing, the delay, no NAS100 and no
FOMC are applied together, the honest book is **0.74**. The part you can trade on CFDs today is **0.21**.

## Tests

| # | Test | Result | Bar | Outcome |
|---|---|---|---|---|
| T0 | Refactor reproduces the parent | 11/11 cells and the 2,911-trade file identical | identical | ✅ |
| T1 | Future-poisoning, cuts 2012-06-29 / 2017-03-31 / 2022-09-30 | after the A2 fix: **288,873 leg-days, 0 differ**; book returns identical | 100% | ✅ (failed first; see A2) |
| T2 | CFD financing (cash + 2.5%, less dividends; FX +1%) | Sharpe **0.83**, CAGR 9.0%, max DD 22.3% (base 1.10 / 12.2% / 17.5%) | > 0.66 | ✅ |
| T3 | One-day fill delay | Sharpe 1.17, ratio **1.06** | ≥ 0.75 × base | ✅, but see below |
| T4 | No NAS100 (S1g and S2) | Sharpe **1.10**, max DD 20.6% | > 0.66 | ✅ |
| T5 | No FOMC sleeve | Sharpe **0.98** | > 0.66 | ✅ (not blind; carries no weight) |
| T6 | Vol proxy vs Cboe PUT index | correlation **0.58**; proxy Sharpe **1.07** vs PUT excess **0.57**, gap **0.51** | ≥ 0.6 and gap ≤ 0.4 | ❌ |
| T7 | Trend/carry vs published indices | deferred: no free benchmark history | — | — |
| T8 | 2004-05 → 2007-12, unseen | book **0.89** (core beta 0.71, trend −0.01, vol proxy 1.22) | > 0 (sign only; underpowered) | ✅ |
| T9 | Independent rebuild from spec | correlation **0.9975–1.0000** per sleeve, 2014–2026 | ≥ 0.95 | ✅ |

### Honest estimate (T2 + T3 + T4 + T5 together, descriptive)

| Book | Sharpe | CAGR | Max DD | IS / OOS | Years up |
|---|---|---|---|---|---|
| All haircuts, four sleeves | **0.74** | 8.1% | 29.3% | 0.81 / 0.68 | 13/19 |
| All haircuts, CFD-tradeable only (beta, trend, carry) | **0.21** | 1.7% | 41.7% | −0.16 / 0.64 | 12/19 |

Sleeves after all haircuts: core beta **0.41** (it was 0.91; financing does most of the damage), trend **0.00**, carry
**−0.16**, vol proxy **1.12**. Since T6 says the proxy is overstated by about 0.5, the honest book is closer to
**~0.5**, and nearly all of it comes from a sleeve that can't yet be traded as tested.

## Controls and follow-ups

- **T1 failure, diagnosed (A2).** No position, vol estimate or vol-proxy value differed. Every mismatch was the cost on the
  NAS100/SPX500 legs. The harness priced unmeasured instruments off the window's last 250 closes, so the charge moved with
  the window end: 1.41 bp in S1, 3.73 bp when the window was cut at 2012, 2.68 bp in S2. Now fixed to 3.0 bp through a new
  opt-in harness option. Effect on the parent: 1.107 → 1.104.
- **T3 by sleeve:** the delay *helps* the gated vol sleeve (0.89 → 1.12, the same as ungated 1.13) and FOMC (0.95 → 1.06),
  costs gated core beta (0.91 → 0.82), and leaves the ungated vol sleeve unchanged (as it must; it never switches). The VIX
  gate on the vol sleeve exits right after spikes and misses the rebound. It is not protecting the sleeve; it is costing
  it. This matches T6's halves (gated 0.41 vs ungated 0.76 since 2017).
- **T6 halves:** proxy 1.44 vs PUT 0.57 in 2008–2017; 0.76 vs 0.56 since. The overstatement is mostly early, when the
  VIX² strike sat furthest above realised vol.
- **T8:** trend is about 0 there too, consistent with its weak record everywhere in this repo.

## Deviations from the prereg

- A1 (pre-results): T2's cash rate before the 2013 vintages uses the latest published monthly value.
- A2 (post-hoc): T1 diagnosis and the fixed index cost. T2–T5 and T8 were computed once under the old cost rule and are
  superseded; all numbers above use the fix.
- The T3 transform and the T2 financing live in `delay_transform.mjs` (moved out of `validate.mjs` after the run, logic
  unchanged) so the follow-up uses the same code.

## What this changes

- **The parent entry** gains the haircut estimate. The page shows a validation card, and the vol sleeve is marked
  "proxy overstates — not tradeable as tested" (prereg §8, T6).
- **No live plan includes the vol sleeve** until an instrument-true version (XSP/SPX put spreads with option costs) passes
  its own prereg.
- **The CFD-tradeable book (0.21 after haircuts) does not justify live money.** Core beta's edge is mostly eaten by
  financing, and trend and carry contribute nothing. If anything goes to demo, it should be the forward record for
  measuring costs, not a capital allocation.
- **Next, highest value:** the instrument-true vol sleeve. Then, separately, whether core beta is cheaper held as
  futures (MES/MNQ, with no CFD financing markup) than as CFDs.
