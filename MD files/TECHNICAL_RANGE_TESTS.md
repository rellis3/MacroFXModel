# Technical range tests — three price-only claims, pre-registered together

> **Status: PRE-REGISTERED 2026-09-18, before any of the three was run.** Same
> harness discipline as `MARKET_SENSE_TESTS.md`: paired controls, week-block
> bootstrap, population audit, range first, direction only as a base rate with an
> interval. Results appended below the line after the run.

## Data

The local M1 archive (`VolRangeForecaster/data/m1`, via `loadM1ForPair`), bucketed
into **London calendar sessions** (the same session definition as the vol
forecaster and the squeeze study). Instruments: EUR/USD, GBP/USD, USD/JPY, AUD/USD,
USD/CAD, gold (XAU/USD), NAS100, SPX500 — the eight the page trades most and the
ones with the deepest M1 history. Daily OHLC is built from the M1 sessions
(open = first bar, close = last). ATR14 from those sessions. Sessions with fewer
than 300 M1 bars are dropped (holidays, feed gaps) and counted in the audit.

## Shared method

Setup day → one paired control (same instrument, different ISO week, same
ATR-percentile quintile over the trailing 250 sessions, same 20-session trend
tercile, not itself a setup). Paired mean difference, ISO-week block bootstrap,
1,000 reps, 95% CI. Fewer than 40 paired days = reported, not scored. Pass bar
for a range claim: ≥ +0.10 ATR with the CI clear of zero; a *narrower* result
with the CI clear of zero is reported as "calmer". Robustness: R1 = 2022-01-01
onward. Per-session-band splits (Asia / London / New York) are reported where
the claim is about a band.

## The three tests

**T1 — Inside day / narrow-range day → expansion.**
The oldest range claim in technical analysis: a day whose range sits inside the
prior day's (inside day), or the narrowest of the last seven (NR7), is followed by
a wider day. Setups: (a) inside day (high ≤ prior high AND low ≥ prior low);
(b) NR7 (range ≤ min of the prior six). Outcome: next session's range / ATR14,
and the next-5-session range. Control as above. Direction reported only as the
base rate of the next day's close vs open (expected ~50%).

**T2 — The first hour as a fraction of the day.**
A base-rate study, no pass bar: what fraction of the session's eventual range
had been travelled by the end of the first hour after the London open (07:00 UK)
and after the New York open (13:30 UK), by instrument, with p25/p50/p75; split
by whether a high-impact release for the instrument's currencies falls in the
session (calendar from the surprise store's dates where available, else
none-marked). The number the vol forecaster could use directly: "by 08:00 the day
has typically used X% of its range". Also: the share of sessions whose first-hour
high or low held as the session extreme.

**T3 — Trend-day recognition from early range expansion.**
Claim: when the first two hours after the London open have already travelled
≥ 60% of ATR14, the day tends to become a trend day — closing near its extreme
with a range well above ATR. Setup: first-2h range ≥ 0.6 ATR14 (and ≥ 0.8 as R2).
Outcomes: (i) full-session range / ATR14 vs matched control (range claim, pass bar
as above); (ii) "trend-day" base rate — close within the top or bottom 20% of the
session's range — on setup days vs control days, with intervals; (iii) the
continuation base rate: does the session close on the same side of the open as the
2-hour move, vs control. (ii) and (iii) are base rates: a difference of ≥ 15
percentage points with the interval clear of zero is reported as a finding,
anything less as "no different from an ordinary day". The obvious trap is stated:
a big first two hours mechanically raises the full-session range, so (i) is
compared against a control matched on the same trailing ATR quintile AND the
remaining-session range (open+2h → close) is reported separately — that is the
honest version of "the day keeps going".

## What a pass changes on the page

A validated T1 or T3 range effect earns a ✓ chip on the day tier, worded as range
in the instrument's units (the same `expect` block the Desk Watch uses). T2 feeds
the range-used chip's tooltip with the measured fraction for that hour. Any
direction base rate goes in the book as a base rate and nowhere else.

---

## Results

*(appended after the run)*
