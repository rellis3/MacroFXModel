# Vote Atlas v4 — EURUSD Stage 1 pre-registration (context features)

Committed 2026-09-29 before any Stage 1 number was computed.

## Question
EURUSD, every first touch of every export line (js/voteAtlasV4Lines.js) over the
last 6 years. Unconditioned, fade loses ≈−0.049R/trade and follow ≈−0.034R net of
cost (±0.5σ symmetric barriers — Stage 0 geometry). **Does any context known at the
touch move a subset to a positive net edge that holds out of sample?**

## Split — fixed
- **Train (discovery): 2020-09-29 → 2024-09-28** (4 years)
- **Test (untouched until the end): 2024-09-29 → 2026-09-28** (2 years)

## Causality
Every feature is computed from COMPLETED bars before the touch bar (bars[0..k−1]),
prior days, or data published before the day's open. `candleReject` is excluded
(it reads the touch bar's own post-touch wick — part of the outcome). The builder
self-checks: for a sample of touches, all features are recomputed with every bar
from the touch onward replaced by a different random walk (HTF context rebuilt), and
must match exactly or the run aborts.

## Features (bucketed; bucket edges fixed here, not tuned)
Time: session (Asia/London/NY by UTC hour), hour, weekday, month.
Line: line name, side.
Day state: range used before touch ÷ H-L p50 (<0.5, 0.5–0.8, 0.8–1.0, >1.0); minutes
since open (terciles 0–480/480–960/960+); other side's same-family line already
touched today (y/n); number of lines touched earlier today (0, 1–2, 3+); event tag.
Momentum into the line: 60-bar move in σ oriented to the touch direction
(< 0, 0–0.3, 0.3–0.6, > 0.6); approachER, approachVel, wtState, volClimax (existing
bricks, read at bar k−1).
Higher timeframe / trend: previous NY day's return oriented (against / flat / with,
±0.3σ); daily close vs 20-day SMA oriented (below/above); wtMtf, wtSlow, momAdx,
htfTrend (existing bricks, last HTF bar closed before the touch).
Structure: roundNum; vwapSide; confluence (pivots, prior day H/L, volume profile
VAH/VAL/POC, swing S/R — js/rangeLineAnalyser.js sessionConfluenceLevels, prior days only).

## Selection rule (train only)
A (feature, bucket, direction) is SELECTED if on train: n ≥ 150, mean net R > 0,
and t ≥ 2.5.

## Tests (reported, in this order)
1. Chance benchmark: the same selection run 20× on train with outcomes shuffled
   across touches — how many buckets pass by luck alone.
2. Each selected bucket on TEST: n, win %, net R, t.
3. Combined rule on TEST: trade a touch if it matches ≥1 selected bucket for one
   direction and none for the other; report trades, win %, net R, return at 0.5%
   risk/trade.

**Pass:** the combined rule is net-positive on TEST with t ≥ 2, AND more buckets
were selected than the chance benchmark's 95th percentile. Anything else = no
tradeable context found in this feature set.
