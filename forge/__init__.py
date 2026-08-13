"""forge — a strategy-discovery engine: candles in, analysis + a testable
strategy spec out.

The premise, stated plainly so it can be argued with: you cannot hand a model
ten years of M1 candles and have it *understand* markets and invent a system.
What you CAN build is a machine that does the two things a discretionary
researcher does badly and slowly, at scale and without self-deception:

  1. **Enumerate.** Turn raw candles into every structural object a
     price-action trader names (levels: daily open, PDH/PDL, pivots, volume
     profile POC/VAH/VAL, naked POCs, FVGs, order blocks, swing liquidity,
     round numbers, session ranges) and every *interaction* with them
     (tag, n-th touch, sweep-and-reclaim, break-and-close), each carrying a
     causal context vector.
  2. **Falsify.** Score every one of the resulting thousands of conditional
     hypotheses against the real forward M1 path with real costs, then
     survive them through multiple-testing control, a random-level null
     control, and a walk-forward of *the search itself*.

The intelligence is in the vocabulary (layer 1) and the statistics (layer 2),
not in emergent understanding. What comes out the far end is a small, frozen,
human-readable `StrategySpec` — a thing you can read, argue with, and replay
forward on unseen bars.

Layer map (each module is one layer, importable on its own):

    bars.py      causal bar substrate — HTF resample, sessions, ATR, day keys
    levels.py    the level zoo — every named structural price, with birth time
    events.py    interactions with levels → discrete decision points + context
    label.py     forward outcome per event, ATR-scaled barriers, net of cost
    discover.py  conditional edge search + FDR + null controls
    synth.py     surviving cells → a frozen StrategySpec
    validate.py  walk-forward of the whole designer; the only number that counts
    run.py       CLI orchestration

Shared math is imported from `pylego/`, never copied (CLAUDE.md, the Lego
Principle). `pylego.barrier_race` resolves every forward path; `pylego.costs`
owns spread; `pylego.swing_structure` owns pivots/ATR.
"""
