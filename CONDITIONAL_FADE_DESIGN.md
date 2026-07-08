# Conditional-fade design note

**Status:** design + first screen built (this PR). Not a live strategy — a
falsification screen. Read alongside `BOT_DECISION_QUESTIONS.md`.

## Where this came from

The re-run on **recalibrated** bands showed something worth chasing:
- **G1 PASSED** — the forecast median beats a same-distance jittered placebo by
  **+15.4pp** reversal, robust across 5 types. The level placement carries real
  information (I'd predicted ≈ placebo; wrong).
- **G2 = SHORT-GAMMA** — the fade is negatively skewed with brutal tails
  (worst-day hold-to-close losses of hundreds of points).
- **Cost survival still fails on FX** — median net ×1 ≈ −0.94 pips; only indices
  "survive", and those are a trap (~1–2 correlated bets, fattest tails, optimistic
  index cost).

So: **real information, wrong harvest.** The blind median fade is short-gamma and
dies on costs. This note is the honest attempt to harvest the G1 information a
better way — and to say clearly what "it worked" vs "it didn't" looks like.

## The three level sets (and a forecaster finding)

There are three families of forecast level, and the study now analyses all of them:

1. **Open-Close** median & 75th (chart: "Close Med", "Close 75p") — displacement
   from the open. **Finding:** in the current forecaster `oh_median`/`ol_median`
   are set *equal* to `oc_median` (same for the 75th) — so **the Open-Close and
   Open-High/Open-Low levels are the SAME numbers.** The existing median/75th
   study already covers both; they are not independent level sets today.
2. **Open-High / Open-Low** median & 75th ("Proj H/L med", "Proj H/L 75p") — as
   above, currently identical to #1.
3. **Dynamic H-L / L-H range** median & 75th — the opposite extreme projected from
   the **running high/low** by the forecast H-L range (2.17% / 2.72%), and it
   **moves intrabar** as new extremes form. This is the genuinely distinct set,
   the reason the M1 walk matters, and exactly the NAS example: the morning **high**
   anchored a projected **low** a full range below; price hit it later and reverted.

So the screen now compares **five fade lines** net of cost:
1. **Median line** (≡ open-close) — the blind fade. (Fails on FX.)
2. **75th line** — more extended → should revert harder (exhaustion), touched less.
3. **Calm-day median** — median fade on low-tail-risk days only (the filter below).
4. **Dynamic H-L (median)** — fade the projected extreme from the running high/low.
5. **Dynamic H-L (75th)** — same, at the wider 75th range (the most extended level).

The dynamic levels are the most *extended*, so on the exhaustion logic they should
show the strongest reversion — the question the cost screen answers is whether that
reversion is big enough per touch (they're touched less often) to clear costs on FX.

## The tail filter (conditional fade)

The short-gamma tail lives on the **7.8% of trend-expansion days** (195%
completion, 95% miss). The hidden-relationship scan says *when those are more
likely*: high forecast-time **vov**, high annual vol, **post-big-miss** days. So a
"calm" day is defined causally as:

> **calm = forecast-time vov ≤ its trailing median  AND  the prior window did not
> blow through (realized ≤ 118% of forecast).**

Both inputs are known at the open (vov is forecast-time; the prior window is
history) — no lookahead. Fading only on calm days should trim the tail and lift
net-of-cost. Implemented as `touches.conditionalCalm` in the engine; folded into
`costSurvival.byLine.calm`.

## Pre-registered outcome (so a null can't be re-narrated)

The screen tests each of the three lines FX-only (indices discounted), at cost ×2:

- **"It worked"** — the 75th line **or** the calm-day median clears **×2 cost on
  ≥3 FX pairs spanning ≥2 types**, *and* its payoff skew is materially less
  negative than the blind median (the filter actually cut the tail). That earns a
  path-level backtest with real fills.
- **"It didn't"** — none of the three clears ×2 on FX, or the "survivors" are only
  indices. Then the fade family is done: the forecast has information (G1) but it
  is **not harvestable** as a level fade after costs, and the honest move is the
  risk-tool pivot (size/gate an existing edge), not more fade mechanics.

## Honest caveats (kept front-of-mind)

- Even filtered, a fade is structurally **short-gamma** — filtering *reduces* the
  tail, rarely removes it. A calm-day fade that clears ×2 still has a fat left tail
  that a path-level backtest with real slippage must survive.
- The **cost table is an assumption**; the ×2/×3 sensitivity is the guard, and the
  FX-aware verdict ignores the index "survivors".
- With **~6 effective bets** (G3), "N FX pairs clear ×2" is really ~a couple of
  independent votes — treat a bare pass as *worth a backtest*, not proof.
- This is a **screen** (±20-pip symmetric bracket, hold-to-close), **not** a
  path-level backtest. The clean answer still needs real fills and a real
  target/stop from the MFE/MAE distribution.

## Next step if a line survives

Only then does a decision/selector (Phase 3) have something real: fade the
surviving line, on calm days, on the FX pairs that cleared ×2 — A/B'd through the
honest harness (`simulateEntry` + per-pair costs + IS/OOS). If nothing survives,
pivot to the risk-tool question (Move 2 in `BOT_DECISION_QUESTIONS.md`).
