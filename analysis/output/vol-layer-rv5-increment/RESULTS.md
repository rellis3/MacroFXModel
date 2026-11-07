# vol-layer-rv5-increment: results

Prereg: `forge/VOL_LAYER_RV5_INCREMENT_PREREG.md`. Prereg committed in `445b581b`, 2026-11-07. Run 2026-11-07, seed 20261006, B = 2000. Ledger id `vol-layer-rv5-increment`. Pinball over 12 rungs ÷ plain σ, walk-forward 2020-08 → 2026-08, date-block 95%.

**Verdict: VALIDATED**

| board | rows | ratio [95%] | HL p75 regime miss new / old | worst class | gate |
|---|---|---|---|---|---|
| All 34: S+RV vs S | 52,486 | 0.9884 [0.9856, 0.9910] | 1.6 / 2.4 pp | 0.9918 | PASS |
| IV-13: SI+RV vs SI | 18,283 | 0.9901 [0.9869, 0.9931] | 1.7 / 1.9 pp | 0.9953 | PASS |

By fold (all 34): 0: 0.9877, 1: 0.9862, 2: 0.9858, 3: 0.9910, 4: 0.9885, 5: 0.9912

By fold (IV-13): 0: 0.9841, 1: 0.9848, 2: 0.9919, 3: 0.9919, 4: 0.9894, 5: 0.9956

By class (all 34): fx_crosses 0.9908, fx_majors 0.9918, gold 0.9898, indices 0.9758

By instrument (all 34): AUDCAD 0.995, AUDCHF 0.989, AUDJPY 0.983, AUDNZD 1.000, AUDUSD 0.992, CADCHF 0.996, CADJPY 0.988, CHFJPY 0.990, DE30 0.986, DOW 0.972, EURAUD 0.989, EURCAD 0.992, EURCHF 0.994, EURGBP 0.986, EURJPY 0.987, EURNZD 0.990, EURUSD 0.993, GBPAUD 0.998, GBPCAD 0.990, GBPCHF 0.989, GBPJPY 0.986, GBPNZD 0.993, GBPUSD 0.987, GOLD 0.990, NQ 0.969, NZDCAD 1.000, NZDJPY 0.988, NZDUSD 0.999, SPX500 0.968, UK100 0.986, US2000 0.975, USDCAD 0.992, USDCHF 0.995, USDJPY 0.987

## What this changes

Nothing live. It reopens the forecaster comparison (`vol-layer-l1-sigma`) under its own prereg. The gain is about 1.2%, so it is a small accuracy gain and says nothing about whether price reacts at a line. Largest on indices (2.4%).

## Proof checks (forge/verdict_gate.py, `checks.json`)

Passed. Planted edges recovered; a shuffled feature adds nothing.
