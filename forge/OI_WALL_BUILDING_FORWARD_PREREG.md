# oi-wall-building-forward — does a wall where open interest is being built bounce price more than a flat wall, on captures the pointer never saw?

**Pre-registered 2026-10-31, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `oi-wall-building-forward` |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `oi-wall-building-forward` |
| Data | the 11 instruments of `oi-level-map`, nightly QuikStrike captures from **2026-10-19** on (the pointer's sample ended 2026-10-16), M1 mid prices from `data/m1_bidask` |
| Seed | 20261031 |
| Uncertainty | bootstrap clustered by session date (instruments on one date share the dollar), 10,000 reps |
| Scripts / outputs | `scripts/oi-level-map/` (replay_levels.mjs and analyze.py, unchanged logic, a forward date filter only) → `analysis/output/oi-wall-building-forward/` |
| Harness | own scripts, the same ones that produced the pointer (so the cell is defined identically) |

## 1. Claim

In `oi-level-map` (exploratory, 35 captures, 2026-07-31 to 2026-10-16) a WALL whose strike gained at least 3% open interest
since the last snapshot ("building") was bounced from 59.4% of touches (n 191) against 51.8% for placebo levels, a
difference of +7.6pp [+1.7, +13.2], the same sign in both halves. It was one cell among about 330 compared. This study
re-scores that one cell, unchanged, on captures taken after the pointer's data ended.

## 2. Why this is not already settled

`oi-level-map` is exploratory and labelled pointers-only; the register notes about six clear cells are expected by luck in
that many comparisons. No fresh-data test exists. Nearest banked work: `wall-placebo` (walls were not special as touch
points), `line-touch-wide-scan` (gross +0.19R, fails net), `line-touch-limit-unseen` (+0.10R gross vs random, loses net),
`range-edges-relative` (a limit fade loses net). This study does not claim a trade; it asks whether the one flagged
difference survives unseen data.

## 3. Definitions (identical to `scripts/oi-level-map/analyze.py`)

Unit: one (session, instrument) with a fresh capture. Level: a wall the OI Profile drew that morning (top-2 distinct per
side of the strongest expiry book, and the per-bucket walls built the same way). Event: first touch after the capture, from
the side price was on at the capture. Outcome: the 0.25-sigma race, BOUNCE (price goes 0.25 sigma back the way it came)
or BREAK (0.25 sigma through), first hit wins, both in one bar ambiguous, unresolved by 22:00 London counted in neither
arm and reported. Sigma = the options' own one-day move. Building = `chgPct >= +3`, flat = between -3 and +3. Control =
placebo levels at +-0.25 and +-0.5 sigma of every real level, dropped within 0.1 sigma of any real level, scored by the same
code on the same day.

## 4. Hypotheses

**THE GATE (one cell, no others can pass the study):** building-wall bounce rate minus placebo bounce rate, date-clustered
bootstrap 95% interval lower bound > 0, point estimate >= +3pp, with at least 150 building-wall touches.
**THE MIRROR:** flat-wall bounce minus placebo must NOT be above +3pp (if flat walls also bounce, it is walls, not building).
Reported, not gated: unwinding walls (expected too few to judge), the same difference at 0.5 sigma race, FX/gold vs index
split, and the net R of fading a building wall after real account costs (`cost_table.json`), which decides whether anything
is tradeable. A bounce-rate edge with a net R at or below zero is a finding about reaction, not a strategy.

## 5. Power

Pointer: 191 building touches over 35 sessions (about 5.5 a session). Detecting +7pp with date-clustered intervals needs
roughly 150-200 touches. From 2026-10-19 the archive adds about 11 instruments a trading day; at the pointer's rate that is
about 5-6 building touches a day, so the gate becomes judgeable around **40 trading sessions after 2026-10-19 (mid-December
2026)**. Before 150 building touches the verdict is UNDERPOWERED by rule, whatever the point estimate.

## 6. Multiplicity

One gated cell, one mirror. Everything else is descriptive and cannot change the verdict.

## 7. What this does NOT test

Direction from positioning (G3: null), a trade rule, stops and targets, the other 12 level types, any DTE split, or
the intraday options-flow filter (needs paid trade data, not held).

## 8. What each verdict changes

VALIDATED: the OI Profile may mark building walls differently, and a limit-fade net-of-cost prereg is allowed on this
sample plus later captures. NULL: the pointer is a chance cell, retire it. UNDERPOWERED: nothing changes, re-judge at the
next 50 touches. CONTEXT: not used.

## Blocker recorded at registration

`data/m1_bidask` ends 2026-10-19/20 and `levels.json` ends 2026-10-16, so the forward sample cannot be scored today. The
price tail must be refreshed (R2 tail or NinjaTrader) before the replay is re-run with the LAST date raised. Until then this
row is REGISTERED, not RUNNING.

## Amendments
