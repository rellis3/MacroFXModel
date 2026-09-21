# The four golds — which gold is trading

*Pre-registered 2026-09-21, before any data was pulled. From a Crown Macro
clip: "there is no such thing as just gold" — there is rates gold (moves on
yields, the opportunity-cost trade; 2022), dollar gold (a currency trade,
gold the mirror of DXY; 2014–15), reserve gold (central banks buying,
gold rises with everything; last year), and fear gold ("trades in days,
not months"; eight days in 2022). Only one drives at a time.*

This desk already judges two of the four every day as chain links —
`real → gold` (rates gold, on the real yield, which is the variable 2022
actually moved on) and `$ → gold` (dollar gold). Reserve gold has no feed
here. Fear gold has never been tested.

## The label (description, no claim)

**Which gold**, from the two links' 20-day verdicts and gold's own 20-day move:

| `real → gold` | `$ → gold` | gold | label |
|---|---|---|---|
| holding | any | moved | **rates gold** (if both hold, rates first: it is the stronger link here) |
| not holding | holding | moved | **dollar gold** |
| broken | broken | up | **reserve gold** — the residual: gold rising against both textbook drivers. No central-bank feed to confirm; said so on the card |
| broken | broken | down | **selling against the textbook** — rare; flagged, not named |
| quiet / mixed | | | **no single gold** — the links are inside their floors |

Fear gold is short-lived by definition, so it is a *flag* on top of the label,
not a label: a VIX spike in the last five sessions with gold up over the
same five. G1 below says how much of that to expect to keep.

## G1 — fear gold, tested (base rate)

**Event:** the first session on which VIX is ≥ +5 points above its close five
sessions earlier (no re-fire inside 20 sessions). **Measured:** gold's move
from the session before the spike to +5 sessions and to +20 sessions, against
the ordinary-window control (block bootstrap, 1000 reps, blocks of 20), and
the share of episodes in which gold was higher at +5 and had given back at
least half of that by +20 (Crown's "eight days"). Data: FRED VIXCLS, OANDA
XAU_USD London-day closes, 2005 →. Reported whatever it says; a base rate.
Real only if the +5 excess move's interval excludes zero.

## G2 — how often each gold trades (description)

Rolling 60-session regressions of gold's daily log return on Δreal yield and
ΔDXY (FRED DFII10, DTWEXBGS): the share of history in which each leg's
t-stat exceeds 2 with the textbook sign, both do, or neither does. Written
as base rates on the card: "rates gold X% of the time, dollar gold Y%, both
Z%, neither W%". No test; it is the denominator the label sits on.

## Reserve gold — the feed

Checked at run time: whether a free, machine-readable central-bank purchase
series exists (World Gold Council, IMF IFS). If one does with a stable URL,
a quarterly context line; if not, the card says the residual cannot be
confirmed from here.

## What goes on the page

- A **which-gold chip** on the gold card and the gold node's chain card,
  with the reason in one line, and the fear flag when it applies.
- G1's base rate on the gold drawer; G2's shares on the same line.
- Nothing directional.

Harness: `analysis/four_golds_study.mjs`. Output: `analysis/output/four_golds.json`.

## Findings

*(to be filled after the run)*
