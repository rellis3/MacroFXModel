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

## Findings — run 2026-09-21

Sessions 2010-10 → 2026-09-17 (3,588 with a VIX close; 689 rolling
60-session windows for G2).

**G1 — fear gold.** *Crown is right, and it is worse than he says.* 58 VIX
spikes (+5 points in five sessions). Five sessions on, gold +0.42% against
+0.35% in ordinary windows: excess **+0.07% [−0.42, +0.30]** — no fear bid on
average; gold was higher at +5 in 53% [41–66] of spikes, a coin. Twenty
sessions on, gold +0.01% against +1.20%: excess **−1.19% [−2.30, −0.48]** —
a month after a fear spike gold has *lagged* its ordinary drift, the interval
clear of zero. "Spiked then gave back half by day 20" happened in 24% [15–37]
of spikes; the other three quarters never spiked. The last five: April 2025
+4.0% at five sessions (held), October 2025 −8.4%, November 2025 +2.4%,
March 2026 −1.3% then −7.0%, June 2026 +2.7% then −1.7%. Fear gold is a
story people buy; on this data it is not a trade.

**G2 — how often each gold trades.** Over 16 years: **rates gold 19%** of
windows, **dollar gold 18%**, **both 16%**, **neither 45%**, the wrong sign
3%. By year: 2014 rates 42% (Crown called 2014–15 dollar gold; here 2014 was
rates, 2015 split three ways); 2022 rates 36% + both 16% — the hiking-cycle
year; **2025 neither 96%** — gold rose with no link to real yields or the
dollar for almost the whole year, which is exactly the reserve-gold year he
describes, from the residual alone; 2026 so far dollar 36%, neither 64%. The
latest window (to 10 Sep) is *neither*: t-stats −1.1 on real yields, −0.3 on
the dollar. **No single gold is trading right now**, which is what the chain
says too (both gold links quiet).

**Reserve gold — the feed.** No free machine-readable central-bank purchase
series: the World Gold Council's monthly statistics sit behind a login, IMF
IFS returns 403 to a plain request. The label's *reserve gold* is the
residual (gold up against both textbook drivers) and the card says it
cannot be confirmed from here.

## What goes on the page

- **Which gold** chip on the gold card and the gold chain card: rates /
  dollar / reserve (residual, unconfirmed) / no single gold — from the two
  links' verdicts, with the reason. The fear flag when a VIX spike sits in
  the last five sessions with gold up, carrying G1's base rate.
- G2's shares as the denominator line: "rates gold 19% of the time, dollar
  18%, both 16%, neither 45%".
- Ledger: G1 as null (no fear bid; a month later gold lags, a base rate);
  G2 as context.
