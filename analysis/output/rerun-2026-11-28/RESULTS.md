# rerun-2026-11-28: results

Re-run of eight banked verdicts after the data faults in `plans/DATA_SPEC.md` §5 #13 (`fetchD1Aligned` BST labels)
and #14 (the copied event bootstrap), plus the FRED user-agent fault (faults-log 2026-11-01). Same preregs, same
seeds, same gates. Run 2026-11-28 on branch `wf2/rerun-a`. Each study's dated re-run section is in its own doc
(listed below), and that doc holds the detail.

## What was fixed

| Fault | Fix used | Studies |
|---|---|---|
| #13 London-midnight D1 bars labelled with the UTC start date (BST a day early, no Fridays, Sunday stubs, no lockbox cut) | the fixed `fetchD1Aligned` (`_mapD1Candles`), already on main; called with `to: '2026-08-21'` | yield-move, nonus ×2, fear-gold, crack, dispersion ×2 |
| #14 `drawBlock` with block = min(block, n) collapsed the event-arm SE | `analysis/lib/eventBootstrap.mjs`, already wired on main | fear-gold, crack, dispersion ×2, mv-vixterm |
| FRED 503 to the default node user-agent | new `analysis/lib/fredCsv.mjs` (named UA, throws on non-200 or empty) | all OANDA+FRED studies |
| outcome_loop scored past the lockbox | `LOCKBOX_TO` slice of the bundle at 2026-08-21 | mv-vixterm |

The net-liquidity (#8/#19), TGA (#23) and feature-store weekend (#9) faults do not touch these eight studies: none
reads net liquidity, TGA or the `px_d1_*` store.

## Verdicts

| Ledger id | Was | Now | Headline | Doc |
|---|---|---|---|---|
| yield-move-fx-range | null | **underpowered** | all 3 pairs clear at 1 and 5 sessions (+0.09 to +0.12); gate fails on early halves; width sits on yield falls | `MD files/YIELD_MOVE_FX_RANGE_PREREG.md` |
| nonus-yield-gap-range | null | **context** | gilts +0.138 [0.021, 0.292], JGBs +0.084 [0.025, 0.149] vs ordinary days; nothing vs a US-led big day (vol clustering) | `MD files/NONUS_YIELDS.md` |
| nonus-yield-gap-direction | null | **null** | 48-51% textbook next session, all hold the coin | `MD files/NONUS_YIELDS.md` |
| fear-gold | null | **underpowered** | +5 excess +0.19% [−0.46, +0.87]; the 20-session "gold lagged" claim withdrawn | `MD files/FOUR_GOLDS.md` |
| crack-blowout-range | null | **underpowered** | WTI +0.126 ATR [−0.085, +0.466] on 26 episodes | `MD files/CRACK_SPREAD.md` |
| dispersion-crowded-week | null | **null** | 5d +0.070 / +0.087, CIs across zero; tail null; 20d real only in the late half | `MD files/DISPERSION.md` (D1) |
| dispersion-reset | validated | **underpowered** | gate 2/4 (20d only); the reset arm vs control clears nowhere | `MD files/DISPERSION.md` (D2) |
| mv-vixterm-range | validated | **underpowered** | 10 firings: SPX +0.337 [+0.001, +0.726], NQ +0.070 [−0.258, +0.450], halves cross zero | `MD files/OUTCOME_LOOP.md` |

## Deviations and limits

- yield-move: the bootstrap was unseeded (`Math.random`). It is now seeded with 20260927, the prereg date, and the
  method is unchanged.
- mv-vixterm: `/api/drill-series` is a rolling six-year bundle, so the replay window moved (2024-02 → 2026-07,
  previously 2023-09 → 2026-08) and the scan code is today's. This is not a like-for-like re-run, and the original
  window can't be rebuilt from the endpoint. The bundle used is saved here.
- Not addressed (design, not data faults): the matched-control notes on mv-vixterm and dispersion-reset (their audit
  rows stay REOPENED), and fear-gold's suggested spike-week gold move.
- Context entries moved by the same fixes but not re-banked here: `which-gold` (neither 45% → 7%) and
  `nonus-yield-gap-label` (JGB-led rise on USD/JPY worst days now ×3.23 [1.71, 4.76]). Both need their entries
  updated. Also `mv-dispersion-range` (8 firings, SPX +0.482 [+0.007, +1.024], NQ +0.530 [−0.070, +1.062]) and
  `mv-dislocation-forward` come from the same outcome_loop run but are left to their own rows.

## Files

`yield_move_fx_range.json`, `nonus_yields.json`, `four_golds.json`, `crack_spread.json`, `dispersion.json`,
`outcome_loop.json`, a `*_log.txt` for each, `drill_series_bundle_2026-11-28.json`, and `results.json`.
